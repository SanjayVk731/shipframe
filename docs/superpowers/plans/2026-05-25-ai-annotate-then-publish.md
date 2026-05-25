# AI Annotate-then-Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's one-shot AI Draft + post-create label-pin flow with a two-step "AI Draft writes a rich pin → user reviews → Publish" flow that also (1) sends the frame screenshot to the LLM (vision), (2) embeds the screenshot inline in Notion/Azure ticket bodies, and (3) fixes the root cause of the "pins never appear on the canvas" bug.

**Architecture:** Three threads of work that land together: (a) sandbox annotations gets a new write/append/clear API plus a fixed ownership regex that supports rich multi-line pins and a removed fake-categoryId write; (b) all four AI adapters (Anthropic, OpenAI, Azure OpenAI, Ollama) gain image content + a `pinMarkdown` output key; (c) the two providers (Notion, Azure) gain an `inlineImage` parameter on `createTicket` that uploads via their existing attachment endpoints and embeds the upload URL in the description body. The plugin UI gets a renamed CTA, a "Discard draft pin" action, and a state-driven submit label.

**Tech Stack:** TypeScript (strict + noUncheckedIndexedAccess), React + happy-dom + RTL, Vitest, Vite (two-bundle build), Figma Plugin API (QuickJS sandbox + UI iframe), DOMPurify, marked. AI providers: Anthropic Messages API, OpenAI Chat Completions, Azure OpenAI, Ollama Chat. Spec: `docs/superpowers/specs/2026-05-21-ai-annotate-then-publish-design.md`.

**File map:**

- Create: `src/ui/ai/downscale.ts`, `tests/ui/ai/downscale.test.ts`
- Modify: `src/shared/types.ts` (SelectionState + TicketInput), `src/messages/protocol.ts` (three new UI→sandbox messages), `src/sandbox/annotations.ts` (rewrite), `src/sandbox/selection.ts` (hasDraftPin), `src/sandbox/main.ts` (three new cases), `src/ui/ai/types.ts` (pinMarkdown), `src/ui/ai/prompt.ts` (vision prompt + pinMarkdown), `src/ui/ai/parseResponse.ts` (truncate + preserve), `src/ui/ai/draft.ts` (image bytes + fallback), `src/ui/ai/anthropic.ts`, `src/ui/ai/openai.ts`, `src/ui/ai/azureOpenAI.ts`, `src/ui/ai/ollama.ts` (each gets image content), `src/ui/composeDescription.ts` (img allow-list), `src/providers/azureDevops.ts` (inlineImage path), `src/providers/notion.ts` (inlineImage path), `src/ui/App.tsx` (draftPin branching), `src/ui/views/CreateView.tsx` (button rename + discard + state label), `src/ui/views/LinkedView.tsx` (pinFailed copy), `tests/helpers/figmaMock.ts` (mutable annotations + setPluginData), `SECURITY.md`, `README.md`

---

## Task 1: Extend SelectionState with hasDraftPin

**Files:**
- Modify: `src/shared/types.ts:26-33` (SelectionState.single)
- Modify: `src/sandbox/selection.ts:17-25`
- Test: `tests/sandbox/selection.test.ts`

Without this field every downstream UI branch has to do an extra round-trip to check for the draft-pin flag.

- [ ] **Step 1: Read existing selection.test.ts to find the right place to add new cases**

Run: `ls tests/sandbox/`

Expected: `selection.test.ts` exists (created in the earlier auto-pin work). If it doesn't, create it with the imports shown in step 2.

- [ ] **Step 2: Write the failing test**

Append to `tests/sandbox/selection.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { installFigmaMock } from '../helpers/figmaMock'
import { classifySelection } from '../../src/sandbox/selection'

describe('classifySelection hasDraftPin', () => {
  beforeEach(() => installFigmaMock())

  it('reports hasDraftPin=true when aiDraftPin pluginData is "1"', () => {
    const pluginData = new Map<string, string>()
    pluginData.set('aiDraftPin', '1')
    const node = {
      id: '1:1',
      type: 'FRAME',
      name: 'Frame',
      visible: true,
      width: 100,
      height: 100,
      children: [],
      annotations: [],
      getPluginData: (k: string) => pluginData.get(k) ?? '',
      setPluginData: (k: string, v: string) => {
        if (v) pluginData.set(k, v)
        else pluginData.delete(k)
      },
    } as unknown as SceneNode
    const result = classifySelection([node])
    expect(result.kind).toBe('single')
    if (result.kind === 'single') expect(result.hasDraftPin).toBe(true)
  })

  it('reports hasDraftPin=false when the flag is missing', () => {
    const node = {
      id: '1:1',
      type: 'FRAME',
      name: 'Frame',
      visible: true,
      width: 100,
      height: 100,
      children: [],
      annotations: [],
      getPluginData: () => '',
      setPluginData: () => {},
    } as unknown as SceneNode
    const result = classifySelection([node])
    expect(result.kind).toBe('single')
    if (result.kind === 'single') expect(result.hasDraftPin).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/sandbox/selection.test.ts -t "hasDraftPin"`

Expected: FAIL — `hasDraftPin` does not exist on SelectionState.

- [ ] **Step 4: Add hasDraftPin to the SelectionState type**

Edit `src/shared/types.ts`, replace the `single` variant:

```ts
  | {
      kind: 'single'
      nodeId: string
      nodeName: string
      link: TicketLink | null
      annotationsCount: number
      textLayersCount: number
      hasDraftPin: boolean
    }
```

- [ ] **Step 5: Set hasDraftPin in classifySelection**

Edit `src/sandbox/selection.ts`, replace the return at line 17-25:

```ts
  return {
    kind: 'single',
    nodeId: node.id,
    nodeName: node.name,
    link: readLink(node),
    annotationsCount: countAnnotations(node),
    textLayersCount: countTextLayers(node),
    hasDraftPin: node.getPluginData('aiDraftPin') === '1',
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/selection.test.ts -t "hasDraftPin"`

Expected: PASS (both new cases).

- [ ] **Step 7: Run full test suite + typecheck**

Run: `npm run typecheck && npm test`

Expected: typecheck clean, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/sandbox/selection.ts tests/sandbox/selection.test.ts
git commit -m "feat(selection): expose hasDraftPin on SelectionState"
```

---

## Task 2: Rewrite annotations.ts ownership model + drop fake categoryId

**Files:**
- Modify: `src/sandbox/annotations.ts` (rewrite — replaces `isOursLabel`, adds new write/append/clear funcs)
- Modify: `tests/helpers/figmaMock.ts` (settable per-node pluginData on `MockNode`)
- Test: `tests/sandbox/annotations.test.ts` (extend)

This is the bug-fix nucleus: removing `categoryId: 'azure' | 'notion'` lets Figma actually persist the pin, and the new tail regex supports both manual short labels (today's format) and multi-line AI-Draft pins.

- [ ] **Step 1: Extend figmaMock to support per-node pluginData**

Edit `tests/helpers/figmaMock.ts`, replace `MockNode`:

```ts
export interface MockNode {
  id: string
  type: string
  name: string
  children: MockNode[]
  characters?: string
  visible: boolean
  annotations?: MockAnnotation[]
  pluginData: Map<string, string>
  getPluginData: (k: string) => string
  setPluginData: (k: string, v: string) => void
}
```

And update `makeNode` to wire those:

```ts
  function makeNode(
    id: string,
    type: string,
    name: string,
    opts: {
      characters?: string
      visible?: boolean
      children?: MockNode[]
      supportsAnnotations?: boolean
    } = {},
  ): MockNode {
    const pluginData = new Map<string, string>()
    const node: MockNode = {
      id,
      type,
      name,
      children: opts.children ?? [],
      characters: opts.characters,
      visible: opts.visible ?? true,
      annotations: opts.supportsAnnotations === false ? undefined : [],
      pluginData,
      getPluginData: (k: string) => pluginData.get(k) ?? '',
      setPluginData: (k: string, v: string) => {
        if (v === '') pluginData.delete(k)
        else pluginData.set(k, v)
      },
    }
    nodes.set(id, node)
    return node
  }
```

Also relax `MockAnnotation`:

```ts
export interface MockAnnotation {
  label?: string
  labelMarkdown?: string
  categoryId?: string
}
```

- [ ] **Step 2: Run existing annotation tests to confirm the mock change didn't break them**

Run: `npm test -- tests/sandbox/annotations.test.ts`

Expected: All existing tests still pass.

- [ ] **Step 3: Write the failing tests for the new ownership regex + write/append/clear**

Append to `tests/sandbox/annotations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { installFigmaMock } from '../helpers/figmaMock'
import {
  isOursTail,
  writeAiAnnotation,
  appendTicketIdToAnnotation,
  clearAiAnnotation,
} from '../../src/sandbox/annotations'

describe('isOursTail', () => {
  it('matches bare AZURE label (manual-create form)', () => {
    expect(isOursTail('AZURE-12345')).toBe(true)
  })

  it('matches bare Notion label (manual-create form)', () => {
    expect(isOursTail('Notion · My ticket · #a1b2c3d4')).toBe(true)
  })

  it('matches em-dash suffix on multi-line AI-Draft label (Azure)', () => {
    expect(isOursTail('Spec body here\n\n— AZURE-99')).toBe(true)
  })

  it('matches em-dash suffix on multi-line AI-Draft label (Notion)', () => {
    expect(isOursTail('Spec body\n— Notion #deadbeef')).toBe(true)
  })

  it('does not match unrelated labels', () => {
    expect(isOursTail('manual designer note')).toBe(false)
    expect(isOursTail('JIRA-123')).toBe(false)
  })
})

describe('writeAiAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })

  it('writes labelMarkdown without a categoryId and sets aiDraftPin', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    const r = await writeAiAnnotation('1:1', 'Hello\n**bold**')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'Hello\n**bold**' }])
    expect(node.getPluginData('aiDraftPin')).toBe('1')
  })

  it('preserves manual non-ours annotations', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ label: 'manual note' }]
    const r = await writeAiAnnotation('1:1', 'AI body')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([
      { label: 'manual note' },
      { labelMarkdown: 'AI body' },
    ])
  })

  it('replaces an existing ours-pin (does not stack)', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'old AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await writeAiAnnotation('1:1', 'new AI body')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'new AI body' }])
  })

  it('returns unsupported-node for SECTION-like nodes', async () => {
    mock.makeNode('1:1', 'SECTION', 'Section', { supportsAnnotations: false })
    const r = await writeAiAnnotation('1:1', 'body')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unsupported-node')
  })
})

describe('appendTicketIdToAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })

  it('appends — AZURE-<id> on a new line and clears aiDraftPin', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await appendTicketIdToAnnotation('1:1', 'azure', '42')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([
      { labelMarkdown: 'AI body\n— AZURE-42' },
    ])
    expect(node.getPluginData('aiDraftPin')).toBe('')
  })

  it('appends — Notion #<short> using last 8 hex chars of the id', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body' }]
    node.setPluginData('aiDraftPin', '1')
    const r = await appendTicketIdToAnnotation(
      '1:1',
      'notion',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeedead',
    )
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([
      { labelMarkdown: 'AI body\n— Notion #eeeedead' },
    ])
  })

  it('self-heals when no draft pin exists (writes suffix-only label)', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    const r = await appendTicketIdToAnnotation('1:1', 'azure', '7')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ labelMarkdown: 'AZURE-7' }])
  })

  it('preserves manual non-ours annotations', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [
      { label: 'manual' },
      { labelMarkdown: 'AI body' },
    ]
    node.setPluginData('aiDraftPin', '1')
    await appendTicketIdToAnnotation('1:1', 'azure', '9')
    expect(node.annotations).toEqual([
      { label: 'manual' },
      { labelMarkdown: 'AI body\n— AZURE-9' },
    ])
  })
})

describe('clearAiAnnotation', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })

  it('removes ours-pin and clears the flag, preserving manual notes', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [
      { label: 'manual' },
      { labelMarkdown: 'AI body' },
    ]
    node.setPluginData('aiDraftPin', '1')
    const r = await clearAiAnnotation('1:1')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([{ label: 'manual' }])
    expect(node.getPluginData('aiDraftPin')).toBe('')
  })

  it('also removes post-publish suffix labels', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    node.annotations = [{ labelMarkdown: 'AI body\n— AZURE-1' }]
    const r = await clearAiAnnotation('1:1')
    expect(r.ok).toBe(true)
    expect(node.annotations).toEqual([])
  })
})

describe('annotation writes never include categoryId (regression)', () => {
  let mock: ReturnType<typeof installFigmaMock>
  beforeEach(() => {
    mock = installFigmaMock()
  })

  it('writeAiAnnotation entry has no categoryId key', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    await writeAiAnnotation('1:1', 'body')
    expect(node.annotations?.[0]).not.toHaveProperty('categoryId')
  })

  it('appendTicketIdToAnnotation self-heal entry has no categoryId key', async () => {
    const node = mock.makeNode('1:1', 'FRAME', 'Frame')
    await appendTicketIdToAnnotation('1:1', 'azure', '1')
    expect(node.annotations?.[0]).not.toHaveProperty('categoryId')
  })
})
```

- [ ] **Step 4: Run failing tests**

Run: `npm test -- tests/sandbox/annotations.test.ts`

Expected: New tests fail (functions don't exist), existing tests still pass.

- [ ] **Step 5: Rewrite annotations.ts**

Replace `src/sandbox/annotations.ts` entirely:

```ts
import type { ProviderId } from '../shared/types'

interface AnnotationEntry {
  label?: string
  labelMarkdown?: string
}

// Matches both formats:
//   - Manual short labels: "AZURE-123" or "Notion · title · #abc12345"
//   - AI-Draft suffix on the last line: "...\n— AZURE-123" or "...\n— Notion #abc12345"
// Single source of truth for pin ownership. See spec.
const OURS_TAIL_RE =
  /(?:^|\n)(?:— )?(?:AZURE-\d+|Notion (?:· .+ · )?#[0-9a-f]{8})$/

export function isOursTail(label: string): boolean {
  return OURS_TAIL_RE.test(label)
}

const MAX_TITLE_LEN = 60

export interface BuildLabelInput {
  providerId: ProviderId
  ticketId: string
  title: string
}

export function buildLabel(input: BuildLabelInput): string {
  if (input.providerId === 'azure') {
    return `AZURE-${input.ticketId}`
  }
  const cleaned = input.ticketId.replace(/-/g, '').toLowerCase()
  const shortId = cleaned.slice(-8).padStart(8, '0')
  const safeTitle =
    input.title.length > MAX_TITLE_LEN
      ? input.title.slice(0, MAX_TITLE_LEN - 1) + '…'
      : input.title
  return `Notion · ${safeTitle} · #${shortId}`
}

function shortSuffix(providerId: ProviderId, ticketId: string): string {
  if (providerId === 'azure') return `AZURE-${ticketId}`
  const cleaned = ticketId.replace(/-/g, '').toLowerCase()
  const shortId = cleaned.slice(-8).padStart(8, '0')
  return `Notion #${shortId}`
}

export type SyncReason = 'node-missing' | 'api-unavailable' | 'unsupported-node'
export type SyncResult = { ok: true } | { ok: false; reason: SyncReason }

const AI_DRAFT_FLAG_KEY = 'aiDraftPin'

function annotationsApiAvailable(): boolean {
  return typeof (figma as unknown as { annotations?: unknown }).annotations !== 'undefined'
}

function supportsAnnotations(
  node: SceneNode,
): node is SceneNode & { annotations: AnnotationEntry[] } {
  return 'annotations' in node && Array.isArray((node as { annotations?: unknown }).annotations)
}

async function findSupported(nodeId: string): Promise<
  | { ok: true; node: SceneNode & { annotations: AnnotationEntry[] } }
  | { ok: false; reason: SyncReason }
> {
  if (!annotationsApiAvailable()) return { ok: false, reason: 'api-unavailable' }
  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null
  if (!node) return { ok: false, reason: 'node-missing' }
  if (!supportsAnnotations(node)) return { ok: false, reason: 'unsupported-node' }
  return { ok: true, node }
}

function isOursEntry(node: SceneNode, entry: AnnotationEntry): boolean {
  if (entry.labelMarkdown && isOursTail(entry.labelMarkdown)) return true
  if (entry.label && isOursTail(entry.label)) return true
  if (node.getPluginData(AI_DRAFT_FLAG_KEY) === '1' && entry.labelMarkdown) return true
  return false
}

export async function clearAnnotation(nodeId: string): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  r.node.annotations = (r.node.annotations ?? []).filter((a) => !isOursEntry(r.node, a))
  return { ok: true }
}

// Used by the manual-create path. Idempotent — does NOT clobber an existing
// ours-pin that already carries a valid suffix or AI body. Only writes when
// there is no ours-pin at all (self-heal after the designer deleted it).
export async function syncAnnotation(
  nodeId: string,
  input: BuildLabelInput,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const target = buildLabel(input)
  const current = r.node.annotations ?? []
  const ours = current.filter((a) => isOursEntry(r.node, a))
  if (ours.length === 1) return { ok: true }
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  r.node.annotations = [...manual, { label: target }]
  return { ok: true }
}

export async function writeAiAnnotation(
  nodeId: string,
  markdown: string,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const current = r.node.annotations ?? []
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  r.node.annotations = [...manual, { labelMarkdown: markdown }]
  r.node.setPluginData(AI_DRAFT_FLAG_KEY, '1')
  return { ok: true }
}

export async function appendTicketIdToAnnotation(
  nodeId: string,
  providerId: ProviderId,
  ticketId: string,
): Promise<SyncResult> {
  const r = await findSupported(nodeId)
  if (!r.ok) return r
  const suffix = shortSuffix(providerId, ticketId)
  const current = r.node.annotations ?? []
  const manual = current.filter((a) => !isOursEntry(r.node, a))
  const ours = current.find((a) => isOursEntry(r.node, a))
  const existingBody = ours?.labelMarkdown ?? ours?.label
  const nextMarkdown =
    existingBody && existingBody.length > 0
      ? `${existingBody}\n— ${suffix}`
      : suffix
  r.node.annotations = [...manual, { labelMarkdown: nextMarkdown }]
  r.node.setPluginData(AI_DRAFT_FLAG_KEY, '')
  return { ok: true }
}

export async function clearAiAnnotation(nodeId: string): Promise<SyncResult> {
  const r = await clearAnnotation(nodeId)
  if (!r.ok) return r
  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null
  if (node) node.setPluginData(AI_DRAFT_FLAG_KEY, '')
  return { ok: true }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/annotations.test.ts`

Expected: PASS (new tests + existing tests).

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/sandbox/annotations.ts tests/sandbox/annotations.test.ts tests/helpers/figmaMock.ts
git commit -m "fix(annotations): drop fake categoryId; new ownership regex + write/append/clear"
```

---

## Task 3: Wire new sandbox messages

**Files:**
- Modify: `src/messages/protocol.ts`
- Modify: `src/sandbox/main.ts`
- Test: `tests/messages/protocol.test.ts` (extend if exists; otherwise inline in sandbox tests)

- [ ] **Step 1: Write the failing protocol test**

If `tests/messages/protocol.test.ts` does not exist, create it with:

```ts
import { describe, it, expect } from 'vitest'
import { isUiToSandbox } from '../../src/messages/protocol'

describe('isUiToSandbox new types', () => {
  it('accepts write-ai-annotation', () => {
    expect(
      isUiToSandbox({
        type: 'write-ai-annotation',
        nodeId: '1:1',
        markdown: 'body',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('accepts append-ticket-id-to-annotation', () => {
    expect(
      isUiToSandbox({
        type: 'append-ticket-id-to-annotation',
        nodeId: '1:1',
        providerId: 'azure',
        ticketId: '42',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('accepts clear-ai-annotation', () => {
    expect(
      isUiToSandbox({
        type: 'clear-ai-annotation',
        nodeId: '1:1',
        requestId: 'r1',
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/messages/protocol.test.ts`

Expected: FAIL — the three new types are not in UI_TYPES yet.

- [ ] **Step 3: Extend UiToSandbox union and UI_TYPES**

Edit `src/messages/protocol.ts`. Add to the `UiToSandbox` union:

```ts
  | {
      type: 'write-ai-annotation'
      nodeId: string
      markdown: string
      requestId: string
    }
  | {
      type: 'append-ticket-id-to-annotation'
      nodeId: string
      providerId: ProviderId
      ticketId: string
      requestId: string
    }
  | { type: 'clear-ai-annotation'; nodeId: string; requestId: string }
```

And add to the `UI_TYPES` set:

```ts
  'write-ai-annotation',
  'append-ticket-id-to-annotation',
  'clear-ai-annotation',
```

- [ ] **Step 4: Run protocol test**

Run: `npm test -- tests/messages/protocol.test.ts`

Expected: PASS.

- [ ] **Step 5: Add sandbox handlers**

Edit `src/sandbox/main.ts`. Add the import:

```ts
import {
  syncAnnotation,
  clearAnnotation,
  writeAiAnnotation,
  appendTicketIdToAnnotation,
  clearAiAnnotation,
} from './annotations'
```

Add three switch cases right after the existing `clear-annotation` case (before `get-frame-context`):

```ts
      case 'write-ai-annotation': {
        const result = await writeAiAnnotation(msg.nodeId, msg.markdown)
        if (result.ok) post({ type: 'ack', requestId: msg.requestId })
        else post({ type: 'error', reason: result.reason, requestId: msg.requestId })
        return
      }
      case 'append-ticket-id-to-annotation': {
        const result = await appendTicketIdToAnnotation(
          msg.nodeId,
          msg.providerId,
          msg.ticketId,
        )
        if (result.ok) post({ type: 'ack', requestId: msg.requestId })
        else post({ type: 'error', reason: result.reason, requestId: msg.requestId })
        return
      }
      case 'clear-ai-annotation': {
        const result = await clearAiAnnotation(msg.nodeId)
        if (result.ok) post({ type: 'ack', requestId: msg.requestId })
        else post({ type: 'error', reason: result.reason, requestId: msg.requestId })
        return
      }
```

- [ ] **Step 6: Run typecheck (validates the exhaustiveness assertion in main.ts)**

Run: `npm run typecheck`

Expected: clean — `_exhaustive: never` proves all message types are handled.

- [ ] **Step 7: Run full test suite**

Run: `npm test`

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/messages/protocol.ts src/sandbox/main.ts tests/messages/protocol.test.ts
git commit -m "feat(messages): write/append/clear ai-annotation message types + handlers"
```

---

## Task 4: Add pinMarkdown to DraftOutput + parser truncation

**Files:**
- Modify: `src/ui/ai/types.ts`
- Modify: `src/ui/ai/parseResponse.ts`
- Test: `tests/ui/ai/parseResponse.test.ts` (create if missing)

- [ ] **Step 1: Write the failing parser tests**

Create or extend `tests/ui/ai/parseResponse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseDraftResponse } from '../../../src/ui/ai/parseResponse'

describe('parseDraftResponse pinMarkdown', () => {
  it('preserves pinMarkdown regardless of WIT', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', pinMarkdown: 'pin' })
    for (const wit of ['Bug', 'User Story', 'Task', 'Feature', 'Epic', undefined]) {
      const r = parseDraftResponse(raw, wit)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.pinMarkdown).toBe('pin')
    }
  })

  it('truncates pinMarkdown at 280 chars with ellipsis', () => {
    const long = 'x'.repeat(500)
    const r = parseDraftResponse(JSON.stringify({ pinMarkdown: long }), 'Bug')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.pinMarkdown).toBeDefined()
      expect(r.value.pinMarkdown!.length).toBe(280)
      expect(r.value.pinMarkdown!.endsWith('…')).toBe(true)
    }
  })

  it('omits pinMarkdown when absent', () => {
    const r = parseDraftResponse(JSON.stringify({ title: 'T' }), 'Bug')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.pinMarkdown).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/ui/ai/parseResponse.test.ts`

Expected: FAIL — `pinMarkdown` not on type / not preserved.

- [ ] **Step 3: Add pinMarkdown to types.ts**

Replace `src/ui/ai/types.ts`:

```ts
import type { AiProvider } from '../../storage/aiConfig'

export type { AiProvider }

export interface DraftOutput {
  title?: string
  main?: string
  reproSteps?: string
  expected?: string
  actual?: string
  acceptanceCriteria?: string
  outOfScope?: string
  pinMarkdown?: string
}

export const DRAFT_KEYS: Array<keyof DraftOutput> = [
  'title',
  'main',
  'reproSteps',
  'expected',
  'actual',
  'acceptanceCriteria',
  'outOfScope',
  'pinMarkdown',
]

export const PIN_MARKDOWN_MAX = 280
```

- [ ] **Step 4: Add WIT-agnostic preservation + truncation in parser**

Edit `src/ui/ai/parseResponse.ts`. Replace the `keysFor` function and the main loop:

```ts
import { DRAFT_KEYS, PIN_MARKDOWN_MAX, type DraftOutput } from './types'

export type ParseResult =
  | { ok: true; value: DraftOutput }
  | { ok: false; reason: 'malformed' }

function keysFor(wit: string | undefined): Array<keyof DraftOutput> {
  const w = wit ?? 'User Story'
  switch (w) {
    case 'Bug':
      return ['title', 'main', 'reproSteps', 'expected', 'actual', 'pinMarkdown']
    case 'Task':
    case 'Epic':
      return ['title', 'main', 'acceptanceCriteria', 'pinMarkdown']
    case 'User Story':
    case 'Feature':
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope', 'pinMarkdown']
    default:
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope', 'pinMarkdown']
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m && m[1] !== undefined ? m[1] : trimmed
}

function coerce(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function truncatePin(s: string): string {
  if (s.length <= PIN_MARKDOWN_MAX) return s
  return s.slice(0, PIN_MARKDOWN_MAX - 1) + '…'
}

export function parseDraftResponse(
  raw: string,
  wit: string | undefined,
): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' }
  }
  const allowed = new Set<keyof DraftOutput>(keysFor(wit))
  const value: DraftOutput = {}
  for (const key of DRAFT_KEYS) {
    if (!allowed.has(key)) continue
    const rawValue = (parsed as Record<string, unknown>)[key]
    if (rawValue === undefined) continue
    const s = coerce(rawValue)
    if (s === undefined) continue
    value[key] = key === 'pinMarkdown' ? truncatePin(s) : s
  }
  return { ok: true, value }
}
```

- [ ] **Step 5: Run parser tests**

Run: `npm test -- tests/ui/ai/parseResponse.test.ts`

Expected: PASS.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all pass (existing parseResponse tests still pass — the WIT key lists only gained `pinMarkdown`, which existing tests don't assert).

- [ ] **Step 7: Commit**

```bash
git add src/ui/ai/types.ts src/ui/ai/parseResponse.ts tests/ui/ai/parseResponse.test.ts
git commit -m "feat(ai): pinMarkdown output key + 280-char truncation"
```

---

## Task 5: Vision prompt + system prompt update

**Files:**
- Modify: `src/ui/ai/prompt.ts`
- Test: `tests/ui/ai/prompt.test.ts` (create if missing)

- [ ] **Step 1: Write the failing prompt tests**

Create `tests/ui/ai/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserPrompt } from '../../../src/ui/ai/prompt'
import { DRAFT_KEYS } from '../../../src/ui/ai/types'

describe('buildSystemPrompt', () => {
  it('includes the screenshot-is-primary instruction', () => {
    const s = buildSystemPrompt()
    expect(s.toLowerCase()).toContain('screenshot')
  })

  it('mentions pinMarkdown and its 280-char cap', () => {
    const s = buildSystemPrompt()
    expect(s).toContain('pinMarkdown')
    expect(s).toMatch(/280/)
  })

  it('lists all DRAFT_KEYS', () => {
    const s = buildSystemPrompt()
    for (const k of DRAFT_KEYS) expect(s).toContain(k)
  })
})

describe('buildUserPrompt', () => {
  it('still includes frame name and text layers', () => {
    const u = buildUserPrompt({
      frameName: 'Frame X',
      workItemType: 'Bug',
      annotations: ['note'],
      textLayers: ['Hello'],
    })
    expect(u).toContain('Frame X')
    expect(u).toContain('Bug')
    expect(u).toContain('Hello')
    expect(u).toContain('note')
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/ui/ai/prompt.test.ts`

Expected: FAIL — system prompt doesn't mention `screenshot` or `pinMarkdown`.

- [ ] **Step 3: Update prompt.ts**

Replace `src/ui/ai/prompt.ts`:

```ts
import type { FrameContext } from '../../shared/types'
import { DRAFT_KEYS } from './types'

export function buildSystemPrompt(): string {
  return [
    'You draft software tickets from a Figma frame.',
    'You will receive a screenshot of the frame. Use it as the primary signal for what is on screen; the text-layer list is incomplete (icons, vectors, and rasterized text will not appear there).',
    'Return ONLY a JSON object — no prose, no markdown fences.',
    `Allowed keys (omit any that do not apply): ${DRAFT_KEYS.join(', ')}.`,
    'Each value is plain text (markdown allowed for "main"). Lists in',
    '"reproSteps", "acceptanceCriteria", "outOfScope" should be newline-separated;',
    'do not include leading bullet markers — the caller adds them.',
    '"pinMarkdown" is a 1–3 line markdown summary placed as a Figma annotation visible on the canvas. Keep it under 280 characters.',
  ].join('\n')
}

export function buildUserPrompt(ctx: FrameContext): string {
  const wit = ctx.workItemType ?? 'User Story'
  const annotations = ctx.annotations.length
    ? ctx.annotations.map((a) => ` • ${a}`).join('\n')
    : ' (none)'
  const textLayers = ctx.textLayers.length
    ? ctx.textLayers.map((t) => ` • ${t}`).join('\n')
    : ' (none)'
  return [
    `Frame: "${ctx.frameName}"`,
    `Work item type: ${wit}`,
    '',
    'Native Figma annotations on the frame (designer\'s own words — strongest signal):',
    annotations,
    '',
    'Visible text layers from the layer tree (partial — cross-reference against the screenshot):',
    textLayers,
    '',
    'Draft a ticket as JSON.',
  ].join('\n')
}
```

- [ ] **Step 4: Run prompt tests**

Run: `npm test -- tests/ui/ai/prompt.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ai/prompt.ts tests/ui/ai/prompt.test.ts
git commit -m "feat(ai): vision-aware system prompt + pinMarkdown instruction"
```

---

## Task 6: downscaleForVision helper

**Files:**
- Create: `src/ui/ai/downscale.ts`
- Create: `tests/ui/ai/downscale.test.ts`

OffscreenCanvas is DOM-only (UI iframe). Happy-dom does not implement it, so the unit test uses a guard + skip-with-note pattern; we'll exercise the real path manually per the QA checklist.

- [ ] **Step 1: Write the test**

Create `tests/ui/ai/downscale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { downscaleForVision, MAX_VISION_EDGE } from '../../../src/ui/ai/downscale'

describe('downscaleForVision', () => {
  it('exports MAX_VISION_EDGE = 1024 for the spec contract', () => {
    expect(MAX_VISION_EDGE).toBe(1024)
  })

  it('returns input unchanged when OffscreenCanvas is unavailable', async () => {
    // happy-dom doesn't ship OffscreenCanvas; downscale must degrade gracefully.
    const original = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas
    ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = undefined
    try {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      const out = await downscaleForVision(bytes)
      expect(out).toBe(bytes)
    } finally {
      ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = original
    }
  })
})
```

- [ ] **Step 2: Run test (expect file-not-found)**

Run: `npm test -- tests/ui/ai/downscale.test.ts`

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create downscale.ts**

Create `src/ui/ai/downscale.ts`:

```ts
export const MAX_VISION_EDGE = 1024

// Downscales a PNG so its longest edge is at most MAX_VISION_EDGE pixels,
// using OffscreenCanvas (available in the Figma UI iframe). Returns the input
// unchanged if OffscreenCanvas is unavailable (e.g., in unit-test environments)
// or if the image is already within bounds.
export async function downscaleForVision(bytes: Uint8Array): Promise<Uint8Array> {
  const OC = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas })
    .OffscreenCanvas
  if (typeof OC === 'undefined') return bytes
  if (typeof createImageBitmap === 'undefined') return bytes

  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= MAX_VISION_EDGE) return bytes
    const scale = MAX_VISION_EDGE / longest
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = new OC(w, h)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
    if (!ctx) return bytes
    ctx.drawImage(bitmap, 0, 0, w, h)
    const outBlob = await canvas.convertToBlob({ type: 'image/png' })
    const buf = await outBlob.arrayBuffer()
    return new Uint8Array(buf)
  } finally {
    bitmap.close()
  }
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/ui/ai/downscale.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ai/downscale.ts tests/ui/ai/downscale.test.ts
git commit -m "feat(ai): downscaleForVision helper (1024px, OffscreenCanvas)"
```

---

## Task 7: Vision request payloads in all four adapters

**Files:**
- Modify: `src/ui/ai/anthropic.ts`, `src/ui/ai/openai.ts`, `src/ui/ai/azureOpenAI.ts`, `src/ui/ai/ollama.ts`
- Test: `tests/ui/ai/anthropic.test.ts`, `tests/ui/ai/openai.test.ts`, `tests/ui/ai/azureOpenAI.test.ts`, `tests/ui/ai/ollama.test.ts` (extend each)

Each adapter gains a required `imageBytes: Uint8Array` parameter.

- [ ] **Step 1: Add a tiny base64 helper (used by all four adapters)**

Add to the top of `src/ui/ai/downscale.ts` (keeping it near the only other binary helper):

```ts
export function bytesToBase64(bytes: Uint8Array): string {
  // btoa is DOM/iframe-available. Chunked to avoid call-stack issues on big PNGs.
  const CHUNK = 0x8000
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}
```

- [ ] **Step 2: Write failing test for Anthropic image content**

Edit `tests/ui/ai/anthropic.test.ts` and add:

```ts
import { describe, it, expect } from 'vitest'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'
import { callAnthropic } from '../../../src/ui/ai/anthropic'

describe('callAnthropic image content', () => {
  it('sends an image block before the text block', async () => {
    let captured: string | null = null
    installFetch([
      {
        matches: (req) => req.url.includes('api.anthropic.com'),
        response: (req) => {
          captured = req.body as string
          return jsonResponse(200, {
            content: [{ type: 'text', text: '{}' }],
          })
        },
      },
    ])
    const bytes = new Uint8Array([1, 2, 3, 4])
    await callAnthropic({
      apiKey: 'k',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      imageBytes: bytes,
    })
    expect(captured).not.toBeNull()
    const body = JSON.parse(captured!) as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>
    }
    const content = body.messages[0].content
    expect(content[0].type).toBe('image')
    expect(content[0].source?.media_type).toBe('image/png')
    expect(content[1].type).toBe('text')
  })
})
```

(If your existing fetchMock helper has a different shape, adapt the request-capture pattern to match. `tests/helpers/fetchMock.ts` is the canonical reference — read it and align if needed.)

- [ ] **Step 3: Run failing test**

Run: `npm test -- tests/ui/ai/anthropic.test.ts -t "image content"`

Expected: FAIL — `imageBytes` is not in the type signature.

- [ ] **Step 4: Update anthropic.ts**

Replace `src/ui/ai/anthropic.ts`:

```ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'
import { bytesToBase64 } from './downscale'

export interface AnthropicCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
  imageBytes: Uint8Array
}

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048

export async function callAnthropic(
  input: AnthropicCallInput,
): Promise<Result<string>> {
  const b64 = bytesToBase64(input.imageBytes)
  return tryRequest<string>(
    () =>
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: input.systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: b64 },
                },
                { type: 'text', text: input.userPrompt },
              ],
            },
          ],
        }),
      }),
    async (res) => {
      const body = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>
      }
      const text = body.content?.find((c) => c.type === 'text')?.text
      if (typeof text !== 'string') throw new Error('no_text_block')
      return text
    },
  )
}
```

- [ ] **Step 5: Run Anthropic test**

Run: `npm test -- tests/ui/ai/anthropic.test.ts`

Expected: PASS (new test + any existing).

- [ ] **Step 6: Write failing OpenAI test**

Add to `tests/ui/ai/openai.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'
import { callOpenAI } from '../../../src/ui/ai/openai'

describe('callOpenAI image content', () => {
  it('sends an image_url block in the user message content array', async () => {
    let captured: string | null = null
    installFetch([
      {
        matches: (req) => req.url.includes('api.openai.com'),
        response: (req) => {
          captured = req.body as string
          return jsonResponse(200, {
            choices: [{ message: { content: '{}' } }],
          })
        },
      },
    ])
    await callOpenAI({
      apiKey: 'k',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      imageBytes: new Uint8Array([1, 2, 3]),
    })
    const body = JSON.parse(captured!) as {
      messages: Array<{
        role: string
        content: string | Array<{ type: string; image_url?: { url: string } }>
      }>
    }
    const userMsg = body.messages.find((m) => m.role === 'user')!
    expect(Array.isArray(userMsg.content)).toBe(true)
    const arr = userMsg.content as Array<{ type: string; image_url?: { url: string } }>
    const img = arr.find((c) => c.type === 'image_url')
    expect(img?.image_url?.url.startsWith('data:image/png;base64,')).toBe(true)
  })
})
```

- [ ] **Step 7: Run failing OpenAI test**

Run: `npm test -- tests/ui/ai/openai.test.ts -t "image content"`

Expected: FAIL.

- [ ] **Step 8: Update openai.ts**

Replace `src/ui/ai/openai.ts`:

```ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'
import { bytesToBase64 } from './downscale'

export interface OpenAiCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
  imageBytes: Uint8Array
}

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const MAX_TOKENS = 2048

export async function callOpenAI(
  input: OpenAiCallInput,
): Promise<Result<string>> {
  const dataUrl = `data:image/png;base64,${bytesToBase64(input.imageBytes)}`
  return tryRequest<string>(
    () =>
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: input.userPrompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
      }),
    async (res) => {
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = body.choices?.[0]?.message?.content
      if (typeof text !== 'string') throw new Error('no_text_block')
      return text
    },
  )
}
```

- [ ] **Step 9: Run OpenAI test**

Run: `npm test -- tests/ui/ai/openai.test.ts`

Expected: PASS.

- [ ] **Step 10: Update azureOpenAI.ts the same way**

Read `src/ui/ai/azureOpenAI.ts` to confirm its existing shape, then mirror the OpenAI change: add `imageBytes` to the input interface and replace the `messages: [{role:'user', content: input.userPrompt}]` line with the same `[{type:'text', text: input.userPrompt}, {type:'image_url', image_url:{url:dataUrl}}]` array shape. Update its test (`tests/ui/ai/azureOpenAI.test.ts`) with the same assertion as the OpenAI test above (filter on the Azure endpoint domain instead of `api.openai.com`).

- [ ] **Step 11: Update ollama.ts**

Read `src/ui/ai/ollama.ts` for the current shape. Ollama's chat API takes images as a sibling field, NOT inside `content`. The shape per the spec:

```json
{
  "messages": [
    { "role": "user", "content": "<userPrompt>", "images": ["<base64 png>"] }
  ]
}
```

Add `imageBytes: Uint8Array` to the input interface and put `images: [bytesToBase64(input.imageBytes)]` as a sibling of `content` in the user message. Extend `tests/ui/ai/ollama.test.ts` to assert the user message has an `images` array containing one base64 string.

- [ ] **Step 12: Run all adapter tests**

Run: `npm test -- tests/ui/ai/`

Expected: all pass.

- [ ] **Step 13: Commit**

```bash
git add src/ui/ai/anthropic.ts src/ui/ai/openai.ts src/ui/ai/azureOpenAI.ts src/ui/ai/ollama.ts src/ui/ai/downscale.ts tests/ui/ai/
git commit -m "feat(ai): vision request payloads in all four adapters + bytesToBase64 helper"
```

---

## Task 8: Thread image bytes through draft.ts + client-side pinMarkdown fallback

**Files:**
- Modify: `src/ui/ai/draft.ts`
- Test: `tests/ui/ai/draft.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/ai/draft.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'
import { draftFromContext } from '../../../src/ui/ai/draft'

describe('draftFromContext image + pin fallback', () => {
  it('downscales then forwards bytes to the adapter', async () => {
    const calls: string[] = []
    installFetch([
      {
        matches: (req) => req.url.includes('api.anthropic.com'),
        response: (req) => {
          calls.push(req.body as string)
          return jsonResponse(200, {
            content: [
              { type: 'text', text: JSON.stringify({ title: 'T', main: 'M', pinMarkdown: 'P' }) },
            ],
          })
        },
      },
    ])
    const r = await draftFromContext(
      {
        frameName: 'F',
        workItemType: 'Bug',
        annotations: [],
        textLayers: ['Hello'],
      },
      { provider: 'anthropic', key: 'k' },
      new Uint8Array([1, 2, 3]),
    )
    expect(r.ok).toBe(true)
    expect(calls.length).toBe(1)
    // Body must include an image block (Anthropic shape).
    expect(calls[0]).toContain('"type":"image"')
  })

  it('synthesizes pinMarkdown when the LLM omits it', async () => {
    installFetch([
      {
        matches: (req) => req.url.includes('api.anthropic.com'),
        response: () =>
          jsonResponse(200, {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ title: 'Login broken', main: 'Submit fails on enter.\nMore detail.' }),
              },
            ],
          }),
      },
    ])
    const r = await draftFromContext(
      {
        frameName: 'F',
        workItemType: 'Bug',
        annotations: [],
        textLayers: [],
      },
      { provider: 'anthropic', key: 'k' },
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.pinMarkdown).toBeDefined()
      // Fallback shape: title + first line of main.
      expect(r.value.pinMarkdown).toContain('Login broken')
      expect(r.value.pinMarkdown).toContain('Submit fails on enter.')
      expect(r.value.pinMarkdown).not.toContain('More detail.')
    }
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/ui/ai/draft.test.ts -t "image \\+ pin fallback"`

Expected: FAIL — `draftFromContext` doesn't accept image bytes.

- [ ] **Step 3: Update draft.ts**

Replace `src/ui/ai/draft.ts`:

```ts
import type { FrameContext } from '../../shared/types'
import type { Result } from '../../providers/types'
import type { AiConfig } from '../../storage/aiConfig'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { parseDraftResponse } from './parseResponse'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import { callAzureOpenAI } from './azureOpenAI'
import { callOllama } from './ollama'
import { downscaleForVision } from './downscale'
import { PIN_MARKDOWN_MAX, type DraftOutput } from './types'

const OLLAMA_DEFAULT_MODEL = 'gpt-oss-20b'

async function callOnce(
  ai: AiConfig,
  systemPrompt: string,
  userPrompt: string,
  imageBytes: Uint8Array,
): Promise<Result<string>> {
  if (ai.provider === 'anthropic') {
    return callAnthropic({ apiKey: ai.key, systemPrompt, userPrompt, imageBytes })
  }
  if (ai.provider === 'azure-openai') {
    if (!ai.endpoint) return { ok: false, reason: 'auth_failed', status: 0 }
    return callAzureOpenAI({
      apiKey: ai.key,
      endpoint: ai.endpoint,
      systemPrompt,
      userPrompt,
      imageBytes,
    })
  }
  if (ai.provider === 'ollama') {
    return callOllama({
      apiKey: ai.key,
      model: ai.model && ai.model.length > 0 ? ai.model : OLLAMA_DEFAULT_MODEL,
      systemPrompt,
      userPrompt,
      imageBytes,
    })
  }
  return callOpenAI({ apiKey: ai.key, systemPrompt, userPrompt, imageBytes })
}

function synthesizePin(value: DraftOutput): string | undefined {
  const title = value.title?.trim() ?? ''
  const main = value.main?.trim() ?? ''
  const firstLine = main.split('\n')[0] ?? ''
  const combined = [title, firstLine].filter((s) => s.length > 0).join('\n')
  if (combined.length === 0) return undefined
  return combined.length <= PIN_MARKDOWN_MAX
    ? combined
    : combined.slice(0, PIN_MARKDOWN_MAX - 1) + '…'
}

export async function draftFromContext(
  ctx: FrameContext,
  ai: AiConfig,
  imageBytes: Uint8Array,
): Promise<Result<DraftOutput>> {
  const downscaled = await downscaleForVision(imageBytes)
  const system = buildSystemPrompt()
  const user = buildUserPrompt(ctx)

  const first = await callOnce(ai, system, user, downscaled)
  if (!first.ok) return first

  const parsed = parseDraftResponse(first.value, ctx.workItemType)
  if (parsed.ok) {
    const v = parsed.value
    if (!v.pinMarkdown) v.pinMarkdown = synthesizePin(v)
    return { ok: true, value: v, status: first.status }
  }

  const stricter =
    user + '\n\nReturn ONLY a valid JSON object. No prose, no markdown fences.'
  const second = await callOnce(ai, system, stricter, downscaled)
  if (!second.ok) return second

  const parsed2 = parseDraftResponse(second.value, ctx.workItemType)
  if (parsed2.ok) {
    const v = parsed2.value
    if (!v.pinMarkdown) v.pinMarkdown = synthesizePin(v)
    return { ok: true, value: v, status: second.status }
  }

  return { ok: false, reason: 'unknown', status: second.status }
}
```

- [ ] **Step 4: Run draft tests**

Run: `npm test -- tests/ui/ai/draft.test.ts`

Expected: PASS (new tests + existing). The existing tests may need their `draftFromContext` calls updated to pass a third arg `new Uint8Array([])` — fix them inline.

- [ ] **Step 5: Run typecheck + full test suite**

Run: `npm run typecheck && npm test`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ai/draft.ts tests/ui/ai/draft.test.ts
git commit -m "feat(ai): draftFromContext takes image bytes + synthesizes pinMarkdown fallback"
```

---

## Task 9: Allow img in composeDescription sanitizer

**Files:**
- Modify: `src/ui/composeDescription.ts`
- Test: `tests/ui/composeDescription.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/composeDescription.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { composeDescription } from '../../src/ui/composeDescription'

describe('composeDescription <img> handling', () => {
  it('preserves <img src="…" alt="…"/> in main when allowed by the sanitizer', () => {
    const r = composeDescription({
      main: '<img src="https://example.com/x.png" alt="frame"/>',
    })
    expect(r.description).toContain('<img')
    expect(r.description).toContain('src="https://example.com/x.png"')
    expect(r.description).toContain('alt="frame"')
  })

  it('strips img event handlers', () => {
    const r = composeDescription({
      main: '<img src="x" alt="y" onerror="alert(1)"/>',
    })
    expect(r.description).not.toContain('onerror')
    expect(r.description).not.toContain('alert(1)')
  })

  it('still forbids script/style/iframe', () => {
    const r = composeDescription({
      main: '<script>1</script><style>x</style><iframe></iframe>',
    })
    expect(r.description).not.toContain('<script')
    expect(r.description).not.toContain('<style')
    expect(r.description).not.toContain('<iframe')
  })
})
```

(If `composeDescription`'s call signature differs from this — read it and align. The intent is the same: feed `main` as markdown/HTML, assert the sanitized output.)

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/ui/composeDescription.test.ts -t "img"`

Expected: FAIL — `<img>` is stripped today.

- [ ] **Step 3: Add img to ALLOWED_TAGS / ALLOWED_ATTR**

Read `src/ui/composeDescription.ts` to find the DOMPurify config block. Modify it so `ALLOWED_TAGS` includes `'img'` and `ALLOWED_ATTR` includes `'src'` and `'alt'`. Leave `FORBID_TAGS` unchanged (`script`, `style`, `iframe`).

- [ ] **Step 4: Run sanitizer tests**

Run: `npm test -- tests/ui/composeDescription.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/composeDescription.ts tests/ui/composeDescription.test.ts
git commit -m "feat(compose): allow <img src alt> in description (no event handlers)"
```

---

## Task 10: TicketInput.inlineImage + Azure provider integration

**Files:**
- Modify: `src/shared/types.ts` (TicketInput.inlineImage)
- Modify: `src/providers/azureDevops.ts`
- Test: `tests/providers/azureDevops.test.ts`

- [ ] **Step 1: Add inlineImage to TicketInput**

Edit `src/shared/types.ts`, append to `TicketInput`:

```ts
  /**
   * Optional inline image to embed in the description body. The provider
   * uploads this via its attachment endpoint and prepends an <img> referencing
   * the upload URL to the description (Azure) or appends an image block (Notion).
   */
  inlineImage?: { bytes: Uint8Array; filename: string }
```

- [ ] **Step 2: Write the failing Azure test**

Add to `tests/providers/azureDevops.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { installFetch, jsonResponse } from '../helpers/fetchMock'
import { azureProvider } from '../../src/providers/azureDevops'

describe('azureProvider.createTicket with inlineImage', () => {
  it('uploads the image, then prepends an <img> tag referencing the upload URL to Description', async () => {
    let createdBody: string | null = null
    installFetch([
      {
        matches: (req) => req.url.includes('/_apis/wit/attachments'),
        response: () =>
          jsonResponse(201, { url: 'https://dev.azure.com/o/_apis/wit/attachments/abc' }),
      },
      {
        matches: (req) => req.url.includes('/_apis/wit/workitems/$Bug'),
        response: (req) => {
          createdBody = req.body as string
          return jsonResponse(200, {
            id: 42,
            _links: { html: { href: 'https://dev.azure.com/o/p/_workitems/edit/42' } },
          })
        },
      },
    ])
    const r = await azureProvider.createTicket('org|tok', 'org|p|Bug', {
      title: 'T',
      description: '<p>body</p>',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/x',
      inlineImage: { bytes: new Uint8Array([1, 2, 3]), filename: 'frame.png' },
    })
    expect(r.ok).toBe(true)
    expect(createdBody).not.toBeNull()
    const ops = JSON.parse(createdBody!) as Array<{ path: string; value: unknown }>
    const desc = ops.find((o) => o.path === '/fields/System.Description')
    expect(desc).toBeDefined()
    expect(String(desc!.value)).toContain('<img')
    expect(String(desc!.value)).toContain('https://dev.azure.com/o/_apis/wit/attachments/abc')
    // Existing body remains.
    expect(String(desc!.value)).toContain('<p>body</p>')
  })

  it('falls back to plain description when upload fails', async () => {
    let createdBody: string | null = null
    installFetch([
      {
        matches: (req) => req.url.includes('/_apis/wit/attachments'),
        response: () => jsonResponse(500, { message: 'boom' }),
      },
      {
        matches: (req) => req.url.includes('/_apis/wit/workitems/$Bug'),
        response: (req) => {
          createdBody = req.body as string
          return jsonResponse(200, {
            id: 1,
            _links: { html: { href: 'https://x' } },
          })
        },
      },
    ])
    const r = await azureProvider.createTicket('org|tok', 'org|p|Bug', {
      title: 'T',
      description: '<p>body</p>',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/x',
      inlineImage: { bytes: new Uint8Array([1]), filename: 'frame.png' },
    })
    expect(r.ok).toBe(true)
    const ops = JSON.parse(createdBody!) as Array<{ path: string; value: unknown }>
    const desc = ops.find((o) => o.path === '/fields/System.Description')!
    expect(String(desc.value)).toContain('<p>body</p>')
    expect(String(desc.value)).not.toContain('<img')
  })
})
```

- [ ] **Step 3: Run failing tests**

Run: `npm test -- tests/providers/azureDevops.test.ts -t "inlineImage"`

Expected: FAIL — inlineImage isn't handled.

- [ ] **Step 4: Implement inlineImage in azureProvider.createTicket**

Edit `src/providers/azureDevops.ts`. At the top of `createTicket`, after the `ops` array is initialised but **before** the `if (ticket.description)` block, insert the inline-image upload-and-prepend:

```ts
    let descriptionBody = ticket.description ?? ''
    if (ticket.inlineImage) {
      const { token: tk } = parsePat(combined)
      const blob = new Blob([new Uint8Array(ticket.inlineImage.bytes)], { type: 'image/png' })
      const up = await tryRequest<{ url: string }>(() =>
        fetch(
          `https://dev.azure.com/${org}/_apis/wit/attachments?fileName=${encodeURIComponent(ticket.inlineImage!.filename)}&${API_VERSION}`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader(tk),
              'Content-Type': 'application/octet-stream',
            },
            body: blob,
          },
        ),
      )
      if (up.ok) {
        const imgTag = `<img src="${up.value.url}" alt="Frame screenshot"/>`
        descriptionBody = `${imgTag}\n${descriptionBody}`
      }
    }
```

Then change the description push to use `descriptionBody`:

```ts
    if (descriptionBody && descriptionBody.length > 0) {
      ops.push({
        op: 'add',
        path: '/fields/System.Description',
        value: descriptionBody,
      })
    }
```

(Remove the old `if (ticket.description)` block that pushed `ticket.description` directly.)

- [ ] **Step 5: Run Azure tests**

Run: `npm test -- tests/providers/azureDevops.test.ts`

Expected: PASS (new + existing).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/providers/azureDevops.ts tests/providers/azureDevops.test.ts
git commit -m "feat(azure): inlineImage uploads + prepends <img> to System.Description"
```

---

## Task 11: Notion inline image block

**Files:**
- Modify: `src/providers/notion.ts`
- Test: `tests/providers/notion.test.ts`

Notion's file_upload API requires a three-step flow (create upload, upload content, attach as block). We'll implement just enough to embed a single image in the page's children. Endpoint reference: `POST /v1/file_uploads` (single-part) per Notion's File Upload API.

- [ ] **Step 1: Write the failing Notion test**

Add to `tests/providers/notion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { installFetch, jsonResponse } from '../helpers/fetchMock'
import { notionProvider } from '../../src/providers/notion'

describe('notionProvider.createTicket with inlineImage', () => {
  const dbSchema = {
    properties: {
      Name: { type: 'title' },
    },
  }

  it('uploads the file, attaches it, and includes an image block referencing the upload', async () => {
    let pageBody: string | null = null
    installFetch([
      {
        matches: (req) => req.url.endsWith('/v1/databases/db1'),
        response: () => jsonResponse(200, dbSchema),
      },
      {
        matches: (req) => req.url.endsWith('/v1/file_uploads'),
        response: () => jsonResponse(200, { id: 'upload-1' }),
      },
      {
        matches: (req) => req.url.endsWith('/v1/file_uploads/upload-1/send'),
        response: () => jsonResponse(200, { id: 'upload-1', status: 'uploaded' }),
      },
      {
        matches: (req) => req.url.endsWith('/v1/pages'),
        response: (req) => {
          pageBody = req.body as string
          return jsonResponse(200, { id: 'page-1', url: 'https://notion.so/page-1' })
        },
      },
    ])
    const r = await notionProvider.createTicket('secret', 'db1', {
      title: 'T',
      description: 'desc',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/x',
      inlineImage: { bytes: new Uint8Array([1, 2]), filename: 'frame.png' },
    })
    expect(r.ok).toBe(true)
    expect(pageBody).not.toBeNull()
    const body = JSON.parse(pageBody!) as { children: Array<{ type: string }> }
    expect(body.children.some((c) => c.type === 'image')).toBe(true)
  })

  it('still creates the page when file upload fails', async () => {
    let pageBody: string | null = null
    installFetch([
      {
        matches: (req) => req.url.endsWith('/v1/databases/db1'),
        response: () => jsonResponse(200, dbSchema),
      },
      {
        matches: (req) => req.url.endsWith('/v1/file_uploads'),
        response: () => jsonResponse(500, { message: 'boom' }),
      },
      {
        matches: (req) => req.url.endsWith('/v1/pages'),
        response: (req) => {
          pageBody = req.body as string
          return jsonResponse(200, { id: 'page-1', url: 'https://notion.so/page-1' })
        },
      },
    ])
    const r = await notionProvider.createTicket('secret', 'db1', {
      title: 'T',
      description: 'desc',
      type: null,
      priority: null,
      assigneeId: null,
      labelIds: [],
      figmaDeepLink: 'https://figma.com/x',
      inlineImage: { bytes: new Uint8Array([1]), filename: 'frame.png' },
    })
    expect(r.ok).toBe(true)
    const body = JSON.parse(pageBody!) as { children: Array<{ type: string }> }
    expect(body.children.some((c) => c.type === 'image')).toBe(false)
  })
})
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -- tests/providers/notion.test.ts -t "inlineImage"`

Expected: FAIL — no inline-image block exists.

- [ ] **Step 3: Add file-upload helper + image block to createTicket**

Edit `src/providers/notion.ts`. Before the `notionProvider` const, add:

```ts
async function uploadFileForBlock(
  pat: string,
  bytes: Uint8Array,
  filename: string,
): Promise<{ ok: true; uploadId: string } | { ok: false }> {
  const create = await tryRequest<{ id: string }>(() =>
    fetch(`${API}/file_uploads`, {
      method: 'POST',
      headers: headers(pat),
      body: JSON.stringify({ filename, content_type: 'image/png' }),
    }),
  )
  if (!create.ok) return { ok: false }
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    filename,
  )
  const send = await tryRequest<unknown>(() =>
    fetch(`${API}/file_uploads/${create.value.id}/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Notion-Version': VERSION,
      },
      body: form,
    }),
  )
  if (!send.ok) return { ok: false }
  return { ok: true, uploadId: create.value.id }
}
```

In `createTicket`, after `children` is initialised with the callout but **before** the page POST, insert:

```ts
    if (ticket.inlineImage) {
      const up = await uploadFileForBlock(
        pat,
        ticket.inlineImage.bytes,
        ticket.inlineImage.filename,
      )
      if (up.ok) {
        children.push({
          object: 'block',
          type: 'image',
          image: {
            type: 'file_upload',
            file_upload: { id: up.uploadId },
          },
        })
      }
    }
```

- [ ] **Step 4: Run Notion tests**

Run: `npm test -- tests/providers/notion.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/notion.ts tests/providers/notion.test.ts
git commit -m "feat(notion): inlineImage uploads via file_uploads API + appends image block"
```

---

## Task 12: Wire UI — App.tsx branches on hasDraftPin, CreateView renames + discard button

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/views/CreateView.tsx`
- Modify: `src/ui/views/LinkedView.tsx`
- Test: `tests/ui/App.test.tsx` if exists (extend); else cover via CreateView tests.

This task has multiple sub-changes — keep them in one commit because they're tightly coupled to the new state-machine branches.

- [ ] **Step 1: Read existing CreateView**

Run: `wc -l src/ui/views/CreateView.tsx`

Then `Read` it to find:
- The current "AI Draft" button JSX and its onClick handler.
- The form submit handler (the one that calls the `onCreate` prop passed from App.tsx).
- The thumbnail-oversized banner if any.

You'll edit those exact spots.

- [ ] **Step 2: Rename the AI Draft button + invoke writeAiAnnotation after draft**

In `CreateView.tsx`:
- Change the button label from `"AI Draft"` to `"AI Draft → pin"`.
- The draft onClick handler currently calls `draftFromContext(ctx, aiConfig)` (or similar) — change it to also pass `thumbnail` (the prop passed from App.tsx) as the third arg: `draftFromContext(ctx, aiConfig, thumbnail)`. Skip the draft if `thumbnail === null` (e.g., oversized export) and show a banner: *"AI Draft is unavailable for this frame because the screenshot couldn't be exported."*
- After a successful draft and form prefill, dispatch a new sandbox call: `sandbox.request({ type: 'write-ai-annotation', nodeId, markdown: draftValue.pinMarkdown ?? '' })`. CreateView doesn't have a `sandbox` prop today — add `writeAiAnnotation` / `clearAiAnnotation` callbacks to CreateView's props and wire them in App.tsx (next step).
- Show inline banner based on the response: *"Draft pin added to frame. Edit it in Figma if you'd like, then publish."* on ack, or *"Couldn't add pin to frame: {reason}. You can still publish."* on error.

- [ ] **Step 3: Add Discard draft pin link + Publish/Create state-driven label**

Add a new prop `hasDraftPin: boolean` to CreateView. When true:
- Primary submit button label: `"Publish"` (otherwise `"Create"`).
- Render a secondary text-button below the form: `"Discard draft pin"`. On click, call the new `clearAiAnnotation` callback prop and show a brief banner *"Draft pin removed."* Form state is preserved.

- [ ] **Step 4: Wire props in App.tsx**

In `src/ui/App.tsx`:
- In the `<CreateView ... />` render block, add `hasDraftPin={sandbox.selection.kind === 'single' ? sandbox.selection.hasDraftPin : false}`.
- Add two callbacks:

```tsx
writeAiAnnotation={async (nodeId, markdown) => {
  const r = await sandbox.request({
    type: 'write-ai-annotation',
    nodeId,
    markdown,
  })
  await sandbox.request({ type: 'get-selection-state' })
  return r
}}
clearAiAnnotation={async (nodeId) => {
  const r = await sandbox.request({ type: 'clear-ai-annotation', nodeId })
  await sandbox.request({ type: 'get-selection-state' })
  return r
}}
```

The `get-selection-state` refresh is needed because pluginData writes don't fire `selectionchange` (same pattern documented at App.tsx:214).

- [ ] **Step 5: Branch onCreate to use append-ticket-id-to-annotation when hasDraftPin was set**

In `App.tsx`'s `onCreate` (line 233), capture `hasDraftPin` at the top of the function:

```ts
const hadDraftPin =
  sandbox.selection.kind === 'single' && sandbox.selection.hasDraftPin
```

After `write-ticket-link` succeeds (existing line ~265), branch the annotation call:

```ts
const annotationRes = hadDraftPin
  ? await sandbox.request({
      type: 'append-ticket-id-to-annotation',
      nodeId: sandbox.selection.nodeId,
      providerId: fileConfig.providerId,
      ticketId: link.id,
    })
  : await sandbox.request({
      type: 'sync-annotation',
      nodeId: sandbox.selection.nodeId,
      providerId: fileConfig.providerId,
      ticketId: link.id,
      title: input.title,
    })
const pinFailed =
  annotationRes.type === 'error' && annotationRes.reason !== 'unsupported-node'
```

- [ ] **Step 6: Pass inlineImage to provider.createTicket in onCreate**

In `onCreate`, build the `input` for `provider.createTicket` so that, when `thumb && !thumbOversized`, it includes:

```ts
const inputWithImage: TicketInput = {
  ...input,
  inlineImage:
    thumb && !thumbOversized
      ? { bytes: thumb, filename: 'thumbnail.png' }
      : undefined,
}
const created = await provider.createTicket(pat, fileConfig.boardId, inputWithImage)
```

Skip the redundant `uploadAttachment` call when `inlineImage` was passed (Azure already attaches via the inline path; Notion's per-page attachment is unsupported anyway). Concretely, gate the existing `if (sandbox.selection.kind === 'single' && thumb)` upload block to also require `!inputWithImage.inlineImage`.

- [ ] **Step 7: Update LinkedView pinFailed copy**

In `src/ui/views/LinkedView.tsx`, find the `pinFailed` banner and replace its copy with:

*"Couldn't add the linked-pin marker. Your draft pin is still on the frame but doesn't have the ticket ID appended. The ticket itself was created successfully."*

- [ ] **Step 8: Run typecheck + full test suite**

Run: `npm run typecheck && npm test`

Expected: clean. Fix any prop-shape compile errors that surface in tests.

- [ ] **Step 9: Build both bundles to make sure nothing leaked to the sandbox**

Run: `npm run build`

Expected: clean build. Inspect the diff in `dist/code.js` size if you want — but the new code only adds UI-iframe modules.

- [ ] **Step 10: Commit**

```bash
git add src/ui/App.tsx src/ui/views/CreateView.tsx src/ui/views/LinkedView.tsx
git commit -m "feat(ui): AI Draft → pin button, Publish flow, Discard draft pin"
```

---

## Task 13: SECURITY.md + README QA + manifest sanity-check

**Files:**
- Modify: `SECURITY.md`
- Modify: `README.md`
- Read-only check: `manifest.json` (no changes expected — confirm)

- [ ] **Step 1: Add the two new SECURITY.md bullets**

Edit `SECURITY.md`. Under the existing AI Draft / data-sent section, add:

```md
- On AI Draft → pin click, a downscaled (≤1024px longest edge) PNG of the
  selected frame is sent to the configured AI provider as part of the request
  body, in addition to text layers and annotations.
- On Publish click, the original frame screenshot is uploaded to the user's
  Notion workspace or Azure DevOps project as an attachment, and embedded inline
  in the ticket description body. Same destination as the existing per-ticket
  attachment. No third-party image host involved.
```

- [ ] **Step 2: Add manual QA items to README**

Edit `README.md`. In the **Manual QA checklist** section, add:

```md
- AI Draft → pin: rich pin appears on the frame with the AI-written summary;
  form prefills with structured fields.
- Edit the pin text in Figma, then Publish: the ticket gets the form's content
  (not the edited pin); the pin on the canvas keeps its edited text and gains
  `— AZURE-<id>` (or `— Notion #<short>`) on a new line. **Form and pin diverge
  intentionally — designers may want a shorter on-canvas summary than the
  ticket body.**
- Discard draft pin: pin disappears from the frame; form state preserved.
- Publish without AI Draft (manual form): short-label pin still appears on
  the frame after create (regression check).
- AI Draft against each of anthropic / openai / azure-openai / ollama using a
  vision-capable model.
- Select a SECTION node: AI Draft → pin button is disabled (annotations API
  unsupported); manual Create flow still works.
- Oversized frame (>5 MB PNG): AI Draft → pin is disabled (no screenshot to
  send); manual Publish still works without inline image; existing Figma
  callout / hyperlink relation remains.
```

- [ ] **Step 3: Confirm manifest.json is unchanged**

Run: `git diff manifest.json`

Expected: no diff. The spec promised no new `networkAccess.allowedDomains`. If a diff appears, revert it.

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md README.md
git commit -m "docs: AI Draft → pin + inline screenshot disclosures and QA"
```

---

## Task 14: Final verification + cleanup

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: clean.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: green.

- [ ] **Step 3: Build both bundles**

Run: `npm run build`

Expected: clean. Verify `dist/code.js` (sandbox) and `dist/index.html` (UI) exist and are non-empty.

- [ ] **Step 4: Sanity-check sandbox bundle size**

Run: `ls -la dist/code.js`

Expected: roughly the same size as before this branch (within ~5 KB) — the new sandbox code is three thin annotation helpers and three message handlers. A large jump suggests UI dependencies leaked into the sandbox.

- [ ] **Step 5: Run lint if the project has one (skip if not)**

Run: `npm run lint 2>/dev/null || echo "no lint script"`

Expected: clean or `no lint script`.

- [ ] **Step 6: Quick git log review**

Run: `git log --oneline main..HEAD`

Expected: 13 commits, all on the topic, each one focused.

- [ ] **Step 7: Hand off to manual QA**

Per `README.md` Manual QA checklist, exercise the new flow in the Figma desktop app against a real Notion workspace and a real Azure DevOps org. This is the last gate before merging.

---

## Self-review notes

**Spec coverage:**
- Pin-placement bug (fake categoryId) — Task 2.
- New annotate-then-publish flow — Tasks 2, 3, 12.
- Vision LLM (all four adapters + downscale) — Tasks 6, 7, 8.
- `pinMarkdown` output key + truncation + fallback — Tasks 4, 8.
- Inline screenshot in Azure description — Task 10.
- Inline screenshot in Notion page — Task 11.
- DOMPurify `<img>` allow-list — Task 9.
- `hasDraftPin` on SelectionState — Task 1.
- Three new messages — Task 3.
- UI changes (button rename, discard, state-driven submit label, banners, LinkedView copy) — Task 12.
- SECURITY.md + README QA — Task 13.
- Verification — Task 14.

**No placeholders.** All steps either show exact code or describe a concrete edit anchored to file+region.

**Type consistency.** `writeAiAnnotation`, `appendTicketIdToAnnotation`, `clearAiAnnotation` are defined in Task 2 and imported/used in Tasks 3 and 12. `imageBytes` is added to all four AI adapter input interfaces in Task 7 and called with that name from Task 8's `callOnce`. `TicketInput.inlineImage` is added in Task 10 and consumed by Tasks 10 (Azure), 11 (Notion), and 12 (App.tsx). `hasDraftPin` is added to `SelectionState.single` in Task 1 and read in Task 12. `pinMarkdown` added to `DraftOutput` in Task 4 and read in Tasks 8 + 12. Consistent across.

**Scope.** Single PR, no feature flag (per spec). 14 tasks, each commit-sized.
