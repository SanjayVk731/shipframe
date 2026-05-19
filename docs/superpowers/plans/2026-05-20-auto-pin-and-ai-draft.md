# Auto-pin on Frame & AI Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) a native Figma annotation that's placed on the frame at ticket-creation time and reconciled on plugin open, and (2) a text-only AI draft button in CreateView that fills the structured ticket fields from the frame's annotations + visible text layers, using a BYO-key call to Anthropic or OpenAI.

**Architecture:** Sandbox owns annotation reads/writes and frame-context collection (no network). UI iframe owns the LLM call (BYO key in `clientStorage`). Existing `Result<T>` and message-protocol patterns reused — no new error-shape system. `nodeLink.ts` stays single-link for v1.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), React 18, Figma plugin API (`figma.annotations`, `figma.clientStorage`), Vitest + happy-dom + RTL, fetch direct to `api.anthropic.com` / `api.openai.com`.

**Spec:** `docs/superpowers/specs/2026-05-20-auto-pin-and-ai-draft-design.md`

---

## File map

**New files (sandbox):**
- `src/sandbox/annotations.ts` — `syncAnnotation`, `clearAnnotation`, ownership regex
- `src/sandbox/frameContext.ts` — `collectFrameContext` with bounded traversal

**New files (UI):**
- `src/ui/ai/types.ts` — `AiProvider`, `AiConfig`, `DraftOutput`
- `src/ui/ai/prompt.ts` — `buildSystemPrompt`, `buildUserPrompt`
- `src/ui/ai/parseResponse.ts` — JSON shape validator + WIT-key filter
- `src/ui/ai/anthropic.ts` — `callAnthropic`
- `src/ui/ai/openai.ts` — `callOpenAI`
- `src/ui/ai/draft.ts` — `draftFromContext` orchestrator

**New files (storage):**
- `src/storage/aiConfig.ts` — read/write/clear `ai:provider` + `ai:key`

**New files (shared):**
- (Extension only) `src/shared/types.ts` gets `FrameContext` type

**Modified:**
- `src/messages/protocol.ts` — 3 new UI→sandbox types, 1 new sandbox→UI response, sets + guards updated
- `src/sandbox/main.ts` — handle 3 new messages, exhaustiveness check extended
- `src/ui/views/CreateView.tsx` — Draft button + handler
- `src/ui/views/SettingsView.tsx` — AI provider/key section
- `src/ui/App.tsx` — call `sync-annotation` post-create; call reconcile on selecting a linked frame
- `manifest.json` — add `api.anthropic.com` + `api.openai.com`
- `SECURITY.md` — opt-in AI paragraph
- `tests/helpers/figmaMock.ts` — extend with per-node `annotations` array + `figma.annotations` shape

**Test files (mirror src/):**
- `tests/sandbox/annotations.test.ts`
- `tests/sandbox/frameContext.test.ts`
- `tests/storage/aiConfig.test.ts`
- `tests/ui/ai/prompt.test.ts`
- `tests/ui/ai/parseResponse.test.ts`
- `tests/ui/ai/draft.test.ts`
- `tests/messages/protocol.test.ts` — extended

---

## Conventions used in this plan

- **TDD, micro-steps.** Each task: write failing test → run it red → minimal impl → run green → commit.
- **Sandbox responses use existing `ack`/`error` envelope** for sync/clear actions. Only `get-frame-context` adds a new typed response (`frame-context`) because it carries data.
- **AI errors reuse `NormalizedReason`** from `src/providers/types.ts`. No new error-shape system.
- **Commits per task** with conventional-commit prefixes matching repo style (`feat`, `test`, `refactor`, `docs`, `chore`).
- **Run `npm test -- <path>` to scope each test.** Full suite via `npm test`. Typecheck via `npm run typecheck`.

---

## Task 1: Extend `figmaMock` helper with annotation support

**Files:**
- Modify: `tests/helpers/figmaMock.ts`

- [ ] **Step 1: Write the failing test**

Add `tests/helpers/figmaMock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { installFigmaMock } from './figmaMock'

describe('figmaMock annotations', () => {
  it('exposes figma.annotations.categories as an empty array by default', () => {
    installFigmaMock()
    expect((globalThis as any).figma.annotations.categories).toEqual([])
  })

  it('per-node annotations array starts empty and is writable', () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Hello')
    expect(node.annotations).toEqual([])
    node.annotations = [{ label: 'A', categoryId: 'azure' }]
    expect(node.annotations).toEqual([{ label: 'A', categoryId: 'azure' }])
  })

  it('getNodeByIdAsync returns nodes created via makeNode', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Hello')
    const found = await (globalThis as any).figma.getNodeByIdAsync('1:2')
    expect(found).toBe(node)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/helpers/figmaMock.test.ts`
Expected: FAIL — `makeNode` not exported, `figma.annotations` undefined, `figma.getNodeByIdAsync` undefined.

- [ ] **Step 3: Extend the helper**

Replace `tests/helpers/figmaMock.ts` with:

```ts
import { vi } from 'vitest'

export interface MockAnnotation {
  label: string
  categoryId: string
}

export interface MockNode {
  id: string
  type: string
  name: string
  children: MockNode[]
  characters?: string
  visible: boolean
  annotations: MockAnnotation[]
}

export function installFigmaMock() {
  const store = new Map<string, unknown>()
  const rootData = new Map<string, string>()
  const nodes = new Map<string, MockNode>()
  const nodePluginData = new Map<string, Map<string, string>>()

  function makeNode(
    id: string,
    type: string,
    name: string,
    opts: { characters?: string; visible?: boolean; children?: MockNode[] } = {},
  ): MockNode {
    const node: MockNode = {
      id,
      type,
      name,
      children: opts.children ?? [],
      characters: opts.characters,
      visible: opts.visible ?? true,
      annotations: [],
    }
    nodes.set(id, node)
    nodePluginData.set(id, new Map())
    return node
  }

  const figma = {
    clientStorage: {
      getAsync: vi.fn(async (k: string) => store.get(k) ?? undefined),
      setAsync: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v)
      }),
      deleteAsync: vi.fn(async (k: string) => {
        store.delete(k)
      }),
    },
    root: {
      getPluginData: vi.fn((k: string) => rootData.get(k) ?? ''),
      setPluginData: vi.fn((k: string, v: string) => {
        rootData.set(k, v)
      }),
    },
    annotations: {
      categories: [] as Array<{ id: string; label: string; color: string }>,
    },
    getNodeByIdAsync: vi.fn(async (id: string) => nodes.get(id) ?? null),
  }
  ;(globalThis as unknown as { figma: typeof figma }).figma = figma
  return { store, rootData, nodes, nodePluginData, figma, makeNode }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/helpers/figmaMock.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Run full test suite to confirm no regression**

Run: `npm test`
Expected: all existing tests still pass (the helper extension is additive).

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/figmaMock.ts tests/helpers/figmaMock.test.ts
git commit -m "test(helpers): extend figmaMock with annotations, nodes, getNodeByIdAsync"
```

---

## Task 2: Pin ownership detection — `isOursLabel` regex

**Files:**
- Create: `src/sandbox/annotations.ts`
- Test: `tests/sandbox/annotations.test.ts`

This isolates the ownership-regex decision from the rest of `syncAnnotation`. Pure function, easy to test exhaustively.

- [ ] **Step 1: Write the failing test**

```ts
// tests/sandbox/annotations.test.ts
import { describe, expect, it } from 'vitest'
import { isOursLabel } from '../../src/sandbox/annotations'

describe('isOursLabel', () => {
  it('matches Azure ticket labels', () => {
    expect(isOursLabel('AZURE-1234')).toBe(true)
    expect(isOursLabel('AZURE-1')).toBe(true)
  })

  it('matches Notion labels with short-id suffix', () => {
    expect(isOursLabel('Notion · Login bug · #a1b2c3d4')).toBe(true)
    expect(isOursLabel('Notion · Anything goes here · #00000000')).toBe(true)
  })

  it('rejects manual annotations that look similar but do not match', () => {
    expect(isOursLabel('AZURE-')).toBe(false)
    expect(isOursLabel('AZURE-abc')).toBe(false)
    expect(isOursLabel('Notion · no suffix')).toBe(false)
    expect(isOursLabel('Notion · short id · #1234')).toBe(false)
    expect(isOursLabel('arbitrary user annotation')).toBe(false)
    expect(isOursLabel('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module with minimal implementation**

```ts
// src/sandbox/annotations.ts
const AZURE_LABEL_RE = /^AZURE-\d+$/
const NOTION_LABEL_RE = /^Notion · .+ · #[0-9a-f]{8}$/

export function isOursLabel(label: string): boolean {
  return AZURE_LABEL_RE.test(label) || NOTION_LABEL_RE.test(label)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/annotations.ts tests/sandbox/annotations.test.ts
git commit -m "feat(sandbox): add isOursLabel ownership regex for pin annotations"
```

---

## Task 3: Build canonical pin labels — `buildLabel`

**Files:**
- Modify: `src/sandbox/annotations.ts`
- Modify: `tests/sandbox/annotations.test.ts`

Producer side of the same shape `isOursLabel` validates. Adds the title-truncation rule.

- [ ] **Step 1: Add the failing test**

Append to `tests/sandbox/annotations.test.ts`:

```ts
import { buildLabel } from '../../src/sandbox/annotations'

describe('buildLabel', () => {
  it('builds Azure label from numeric id', () => {
    expect(
      buildLabel({ providerId: 'azure', ticketId: '1234', title: 'Anything' }),
    ).toBe('AZURE-1234')
  })

  it('builds Notion label with title and 8-char short id', () => {
    expect(
      buildLabel({
        providerId: 'notion',
        ticketId: 'abcd1234-ef56-7890-abcd-ef1234567890',
        title: 'Login bug',
      }),
    ).toBe('Notion · Login bug · #67890')
  })

  it('truncates long titles at 60 chars with ellipsis', () => {
    const longTitle = 'a'.repeat(80)
    const label = buildLabel({
      providerId: 'notion',
      ticketId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0000',
      title: longTitle,
    })
    expect(label.startsWith('Notion · ' + 'a'.repeat(59) + '…')).toBe(true)
    expect(label.endsWith(' · #eee0000')).toBe(false) // length checked next
    expect(label).toMatch(/^Notion · a{59}… · #[0-9a-f]{8}$/)
  })

  it('round-trips: any label produced by buildLabel is recognised by isOursLabel', () => {
    expect(
      isOursLabel(
        buildLabel({ providerId: 'azure', ticketId: '42', title: 'x' }),
      ),
    ).toBe(true)
    expect(
      isOursLabel(
        buildLabel({
          providerId: 'notion',
          ticketId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff',
          title: 'x',
        }),
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: FAIL — `buildLabel` not exported.

- [ ] **Step 3: Implement `buildLabel`**

Add to `src/sandbox/annotations.ts`:

```ts
import type { ProviderId } from '../shared/types'

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
  // Notion: derive 8-char short id from end of the UUID/page-id, lowercase hex
  const cleaned = input.ticketId.replace(/-/g, '').toLowerCase()
  const shortId = cleaned.slice(-8).padStart(8, '0')
  const safeTitle =
    input.title.length > MAX_TITLE_LEN
      ? input.title.slice(0, MAX_TITLE_LEN - 1) + '…'
      : input.title
  return `Notion · ${safeTitle} · #${shortId}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: PASS, all sub-tests including round-trip.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/annotations.ts tests/sandbox/annotations.test.ts
git commit -m "feat(sandbox): add buildLabel producer for pin labels"
```

---

## Task 4: `syncAnnotation` — happy paths

**Files:**
- Modify: `src/sandbox/annotations.ts`
- Modify: `tests/sandbox/annotations.test.ts`

Covers: create when none of ours, noop when matching, update on drift, preserve manual annotations.

- [ ] **Step 1: Add failing tests**

Append:

```ts
import { syncAnnotation } from '../../src/sandbox/annotations'
import { installFigmaMock } from '../helpers/figmaMock'

describe('syncAnnotation', () => {
  it('creates annotation when none of ours exist', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })

  it('is a noop when matching annotation already exists', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [{ label: 'AZURE-1234', categoryId: 'azure' }]
    const before = node.annotations
    const result = await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
    // identity-equal: didn't reassign
    expect(node.annotations).toBe(before)
  })

  it('updates label when ours exists with drifted label (same ticket id, manual edit)', async () => {
    // Drift scenario: manual edit produced a label that no longer matches our format.
    // Reconcile should remove the broken one and place the canonical label.
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'AZURE-9999', categoryId: 'azure' }, // ours, but wrong ticket id
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    // Old ours-pin is removed because it didn't match the target label;
    // new pin is created with the target.
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })

  it('preserves manual annotations (non-ours)', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note: align padding', categoryId: 'general' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([
      { label: 'Designer note: align padding', categoryId: 'general' },
      { label: 'AZURE-1234', categoryId: 'azure' },
    ])
  })

  it('removes duplicate ours-pins, keeps first match of target label', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'AZURE-5555', categoryId: 'azure' },
    ]
    await syncAnnotation('1:2', {
      providerId: 'azure',
      ticketId: '1234',
      title: 'irrelevant',
    })
    expect(node.annotations).toEqual([{ label: 'AZURE-1234', categoryId: 'azure' }])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: FAIL — `syncAnnotation` not exported.

- [ ] **Step 3: Implement `syncAnnotation` happy-path logic**

Add to `src/sandbox/annotations.ts`:

```ts
export type SyncReason = 'node-missing' | 'api-unavailable'

export type SyncResult = { ok: true } | { ok: false; reason: SyncReason }

function categoryForProvider(providerId: ProviderId): string {
  // Stable per-provider categoryId. Real categories are created by the user
  // in Figma; we just use a deterministic string so all our pins of a kind
  // share grouping if categories exist.
  return providerId === 'azure' ? 'azure' : 'notion'
}

export async function syncAnnotation(
  nodeId: string,
  input: BuildLabelInput,
): Promise<SyncResult> {
  if (typeof (figma as any).annotations === 'undefined') {
    return { ok: false, reason: 'api-unavailable' }
  }
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & { annotations: MockLikeAnnotation[] })
    | null
  if (!node) return { ok: false, reason: 'node-missing' }

  const target = buildLabel(input)
  const targetCategory = categoryForProvider(input.providerId)
  const current = node.annotations ?? []

  // Partition: ours-but-not-target, manual, target-match.
  const manual = current.filter((a) => !isOursLabel(a.label))
  const oursTargetMatches = current.filter((a) => a.label === target)

  if (oursTargetMatches.length === 1 && manual.length + 1 === current.length) {
    // Exactly one match, no extra ours-pins → noop.
    return { ok: true }
  }

  // Otherwise: rebuild with manuals + exactly one target pin.
  node.annotations = [...manual, { label: target, categoryId: targetCategory }]
  return { ok: true }
}

interface MockLikeAnnotation {
  label: string
  categoryId: string
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: PASS, all sub-tests under `syncAnnotation`.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/annotations.ts tests/sandbox/annotations.test.ts
git commit -m "feat(sandbox): syncAnnotation create/noop/update/dedup logic"
```

---

## Task 5: `syncAnnotation` — error paths

**Files:**
- Modify: `tests/sandbox/annotations.test.ts`

Covers: node missing, API unavailable. The implementation in Task 4 already handles these — we're just locking the behavior with tests.

- [ ] **Step 1: Add failing tests**

Append to the same describe block:

```ts
it('returns node-missing when getNodeByIdAsync resolves null', async () => {
  installFigmaMock() // empty: no nodes registered
  const result = await syncAnnotation('99:99', {
    providerId: 'azure',
    ticketId: '1',
    title: 't',
  })
  expect(result).toEqual({ ok: false, reason: 'node-missing' })
})

it('returns api-unavailable when figma.annotations is undefined', async () => {
  const { makeNode, figma } = installFigmaMock()
  makeNode('1:2', 'FRAME', 'Login')
  // Simulate older Figma without annotations API
  delete (figma as any).annotations
  const result = await syncAnnotation('1:2', {
    providerId: 'azure',
    ticketId: '1',
    title: 't',
  })
  expect(result).toEqual({ ok: false, reason: 'api-unavailable' })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: PASS — implementation from Task 4 already handles these.

- [ ] **Step 3: Commit**

```bash
git add tests/sandbox/annotations.test.ts
git commit -m "test(sandbox): lock syncAnnotation error paths (node-missing, api-unavailable)"
```

---

## Task 6: `clearAnnotation` — used by future unlink hook

**Files:**
- Modify: `src/sandbox/annotations.ts`
- Modify: `tests/sandbox/annotations.test.ts`

Per spec Section 4 "two things we are deliberately not handling": pins persist after unlink. But `clearAnnotation` is still exported so a future "delete pin" UI action has a target. Single-responsibility, simple to add now.

- [ ] **Step 1: Add failing tests**

```ts
import { clearAnnotation } from '../../src/sandbox/annotations'

describe('clearAnnotation', () => {
  it('removes all ours-pins, preserves manuals', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:2', 'FRAME', 'Login')
    node.annotations = [
      { label: 'Designer note', categoryId: 'general' },
      { label: 'AZURE-1234', categoryId: 'azure' },
      { label: 'Notion · X · #aabbccdd', categoryId: 'notion' },
    ]
    const result = await clearAnnotation('1:2')
    expect(result).toEqual({ ok: true })
    expect(node.annotations).toEqual([
      { label: 'Designer note', categoryId: 'general' },
    ])
  })

  it('returns node-missing when node is gone', async () => {
    installFigmaMock()
    const result = await clearAnnotation('99:99')
    expect(result).toEqual({ ok: false, reason: 'node-missing' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: FAIL — `clearAnnotation` not exported.

- [ ] **Step 3: Implement `clearAnnotation`**

Append to `src/sandbox/annotations.ts`:

```ts
export async function clearAnnotation(nodeId: string): Promise<SyncResult> {
  if (typeof (figma as any).annotations === 'undefined') {
    return { ok: false, reason: 'api-unavailable' }
  }
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & { annotations: MockLikeAnnotation[] })
    | null
  if (!node) return { ok: false, reason: 'node-missing' }
  node.annotations = (node.annotations ?? []).filter((a) => !isOursLabel(a.label))
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/annotations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/annotations.ts tests/sandbox/annotations.test.ts
git commit -m "feat(sandbox): add clearAnnotation for future unlink hook"
```

---

## Task 7: Add `FrameContext` type to `shared/types.ts`

**Files:**
- Modify: `src/shared/types.ts`
- Test: `tests/shared/types.test.ts` (already exists)

Pure type addition. Verified by typecheck rather than runtime test — but we still add a small structural test.

- [ ] **Step 1: Add a test that imports the type**

Append to `tests/shared/types.test.ts`:

```ts
import type { FrameContext } from '../../src/shared/types'

it('FrameContext shape compiles', () => {
  const ctx: FrameContext = {
    frameName: 'Login',
    workItemType: 'Bug',
    annotations: ['Submit broken'],
    textLayers: ['Sign in', 'Email'],
  }
  expect(ctx.frameName).toBe('Login')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/types.test.ts`
Expected: FAIL — `FrameContext` not exported.

- [ ] **Step 3: Add the type**

Append to `src/shared/types.ts`:

```ts
export interface FrameContext {
  frameName: string
  workItemType: string | undefined
  /** Native Figma annotation labels on the frame. */
  annotations: string[]
  /** Visible TEXT.characters from descendants, bounded — see frameContext.ts. */
  textLayers: string[]
}
```

- [ ] **Step 4: Verify passing + typecheck**

Run: `npm test -- tests/shared/types.test.ts && npm run typecheck`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/shared/types.test.ts
git commit -m "feat(shared): add FrameContext type"
```

---

## Task 8: `frameContext.ts` — depth + node-count limits

**Files:**
- Create: `src/sandbox/frameContext.ts`
- Test: `tests/sandbox/frameContext.test.ts`

Spec limits: depth 5, 50 text nodes max, 300 chars per node, 20 annotations max, 8000 total chars cap. Tests drive each.

- [ ] **Step 1: Write the failing test (depth + node-count)**

```ts
// tests/sandbox/frameContext.test.ts
import { describe, expect, it } from 'vitest'
import { collectFrameContext, FRAME_CONTEXT_LIMITS } from '../../src/sandbox/frameContext'
import { installFigmaMock, type MockNode } from '../helpers/figmaMock'

function text(id: string, characters: string, visible = true): MockNode {
  return {
    id,
    type: 'TEXT',
    name: 'text',
    children: [],
    characters,
    visible,
    annotations: [],
  }
}

describe('collectFrameContext', () => {
  it('returns frameName and empty arrays on an empty frame', async () => {
    const { makeNode } = installFigmaMock()
    makeNode('1:0', 'FRAME', 'Login')
    const ctx = await collectFrameContext('1:0', 'Bug')
    expect(ctx.ok).toBe(true)
    if (!ctx.ok) return
    expect(ctx.value).toEqual({
      frameName: 'Login',
      workItemType: 'Bug',
      annotations: [],
      textLayers: [],
    })
  })

  it('collects TEXT.characters from direct children, top-down', async () => {
    const { makeNode } = installFigmaMock()
    const node = makeNode('1:0', 'FRAME', 'Login', {
      children: [text('1:1', 'Sign in'), text('1:2', 'Email'), text('1:3', 'Password')],
    })
    void node
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.textLayers).toEqual(['Sign in', 'Email', 'Password'])
  })

  it('recurses into nested frames up to depth cap (5)', async () => {
    const { makeNode } = installFigmaMock()
    // depth 1..6 → frames at depth 1..6 contain a TEXT child each; depth 6 should be skipped
    function deepChild(d: number): MockNode {
      const child = text(`t:${d}`, `level-${d}`)
      if (d >= 6) {
        return {
          id: `f:${d}`,
          type: 'FRAME',
          name: `f${d}`,
          children: [child],
          visible: true,
          annotations: [],
        }
      }
      return {
        id: `f:${d}`,
        type: 'FRAME',
        name: `f${d}`,
        children: [child, deepChild(d + 1)],
        visible: true,
        annotations: [],
      }
    }
    makeNode('1:0', 'FRAME', 'root', { children: [deepChild(1)] })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(ctx.ok && ctx.value.textLayers).toEqual([
      'level-1',
      'level-2',
      'level-3',
      'level-4',
      'level-5',
    ])
  })

  it('stops collecting at FRAME_CONTEXT_LIMITS.maxTextNodes (50)', async () => {
    const { makeNode } = installFigmaMock()
    const children: MockNode[] = []
    for (let i = 0; i < 60; i++) children.push(text(`t:${i}`, `n${i}`))
    makeNode('1:0', 'FRAME', 'root', { children })
    const ctx = await collectFrameContext('1:0', undefined)
    expect(FRAME_CONTEXT_LIMITS.maxTextNodes).toBe(50)
    expect(ctx.ok && ctx.value.textLayers.length).toBe(51) // 50 + 1 summary line
    expect(ctx.ok && ctx.value.textLayers[50]).toBe('…and 10 more text nodes truncated')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/sandbox/frameContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
// src/sandbox/frameContext.ts
import type { FrameContext } from '../shared/types'

export const FRAME_CONTEXT_LIMITS = {
  maxDepth: 5,
  maxTextNodes: 50,
  maxCharsPerNode: 300,
  maxAnnotations: 20,
  maxTotalChars: 8000,
} as const

export type CollectResult =
  | { ok: true; value: FrameContext }
  | { ok: false; reason: 'node-missing' }

interface MinNode {
  id: string
  type: string
  name: string
  characters?: string
  visible: boolean
  children: MinNode[]
  annotations: { label: string }[]
}

export async function collectFrameContext(
  nodeId: string,
  workItemType: string | undefined,
): Promise<CollectResult> {
  const root = (await figma.getNodeByIdAsync(nodeId)) as MinNode | null
  if (!root) return { ok: false, reason: 'node-missing' }

  const textLayers: string[] = []
  let truncatedTextCount = 0

  function walk(node: MinNode, depth: number) {
    if (depth > FRAME_CONTEXT_LIMITS.maxDepth) return
    if (!node.visible) return
    if (node.type === 'TEXT') {
      if (textLayers.length >= FRAME_CONTEXT_LIMITS.maxTextNodes) {
        truncatedTextCount += 1
        return
      }
      const chars = node.characters ?? ''
      const truncated =
        chars.length > FRAME_CONTEXT_LIMITS.maxCharsPerNode
          ? chars.slice(0, FRAME_CONTEXT_LIMITS.maxCharsPerNode - 1) + '…'
          : chars
      textLayers.push(truncated)
      return
    }
    for (const child of node.children) walk(child, depth + 1)
  }

  for (const child of root.children) walk(child, 1)

  if (truncatedTextCount > 0) {
    textLayers.push(`…and ${truncatedTextCount} more text nodes truncated`)
  }

  const annotations = (root.annotations ?? []).slice(
    0,
    FRAME_CONTEXT_LIMITS.maxAnnotations,
  ).map((a) => a.label)
  // (Total-char cap applied in Task 9.)

  return {
    ok: true,
    value: {
      frameName: root.name,
      workItemType,
      annotations,
      textLayers,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/frameContext.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/frameContext.ts tests/sandbox/frameContext.test.ts
git commit -m "feat(sandbox): collectFrameContext with depth + node-count limits"
```

---

## Task 9: `frameContext.ts` — char limits, annotations cap, total cap

**Files:**
- Modify: `src/sandbox/frameContext.ts`
- Modify: `tests/sandbox/frameContext.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/sandbox/frameContext.test.ts`:

```ts
it('truncates a single text node at maxCharsPerNode (300)', async () => {
  const { makeNode } = installFigmaMock()
  const long = 'a'.repeat(500)
  makeNode('1:0', 'FRAME', 'root', { children: [text('1:1', long)] })
  const ctx = await collectFrameContext('1:0', undefined)
  expect(ctx.ok).toBe(true)
  if (!ctx.ok) return
  expect(ctx.value.textLayers[0]?.length).toBe(300)
  expect(ctx.value.textLayers[0]?.endsWith('…')).toBe(true)
})

it('caps annotations at maxAnnotations (20)', async () => {
  const { makeNode } = installFigmaMock()
  const root = makeNode('1:0', 'FRAME', 'root')
  root.annotations = Array.from({ length: 30 }, (_, i) => ({
    label: `a${i}`,
    categoryId: 'c',
  }))
  const ctx = await collectFrameContext('1:0', undefined)
  expect(ctx.ok && ctx.value.annotations.length).toBe(20)
  expect(ctx.ok && ctx.value.annotations[0]).toBe('a0')
})

it('returns node-missing when node is gone', async () => {
  installFigmaMock()
  const ctx = await collectFrameContext('99:99', undefined)
  expect(ctx).toEqual({ ok: false, reason: 'node-missing' })
})

it('skips invisible nodes', async () => {
  const { makeNode } = installFigmaMock()
  makeNode('1:0', 'FRAME', 'root', {
    children: [text('t:1', 'visible'), text('t:2', 'hidden', false)],
  })
  const ctx = await collectFrameContext('1:0', undefined)
  expect(ctx.ok && ctx.value.textLayers).toEqual(['visible'])
})

it('applies maxTotalChars cap across text layers', async () => {
  const { makeNode } = installFigmaMock()
  // 30 text nodes of 300 chars each = 9000 chars > 8000 cap
  const children: MockNode[] = []
  for (let i = 0; i < 30; i++) children.push(text(`t:${i}`, 'a'.repeat(300)))
  makeNode('1:0', 'FRAME', 'root', { children })
  const ctx = await collectFrameContext('1:0', undefined)
  expect(ctx.ok).toBe(true)
  if (!ctx.ok) return
  const total = ctx.value.textLayers
    .filter((l) => !l.startsWith('…and '))
    .reduce((sum, l) => sum + l.length, 0)
  expect(total).toBeLessThanOrEqual(FRAME_CONTEXT_LIMITS.maxTotalChars)
  expect(ctx.value.textLayers.at(-1)).toMatch(/^…and \d+ more (text nodes|chars) truncated$/)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/sandbox/frameContext.test.ts`
Expected: 3 pass (char-per-node truncate, annotations cap, node-missing already work from Task 8 implementation; the visible-skip should also pass). The total-cap test should FAIL.

- [ ] **Step 3: Add the total-char cap**

In `src/sandbox/frameContext.ts`, replace the section after `walk(...)` and before the `return` with:

```ts
  // Total-char cap across collected text layers.
  let totalChars = 0
  let cappedTextLayers: string[] = []
  let droppedChars = 0
  for (const layer of textLayers) {
    if (layer.startsWith('…and ')) {
      cappedTextLayers.push(layer)
      continue
    }
    if (totalChars + layer.length > FRAME_CONTEXT_LIMITS.maxTotalChars) {
      droppedChars += layer.length
      continue
    }
    cappedTextLayers.push(layer)
    totalChars += layer.length
  }
  if (droppedChars > 0) {
    cappedTextLayers = cappedTextLayers.filter((l) => !l.startsWith('…and '))
    cappedTextLayers.push(`…and ${droppedChars} more chars truncated`)
  }
```

And update the returned `textLayers` to use `cappedTextLayers`:

```ts
  return {
    ok: true,
    value: {
      frameName: root.name,
      workItemType,
      annotations,
      textLayers: cappedTextLayers,
    },
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sandbox/frameContext.test.ts`
Expected: PASS, all sub-tests.

- [ ] **Step 5: Commit**

```bash
git add src/sandbox/frameContext.ts tests/sandbox/frameContext.test.ts
git commit -m "feat(sandbox): apply per-node, annotation, and total-char caps in frameContext"
```

---

## Task 10: Extend message protocol — sync, clear, get-frame-context

**Files:**
- Modify: `src/messages/protocol.ts`
- Modify: `tests/messages/protocol.test.ts`

Adds three UI→sandbox types and one new sandbox→UI response (`frame-context`). Sync/clear reuse existing `ack`/`error`.

- [ ] **Step 1: Add failing tests**

Append to `tests/messages/protocol.test.ts`:

```ts
import { isUiToSandbox, isSandboxToUi } from '../../src/messages/protocol'

describe('protocol — annotation + frame-context messages', () => {
  it('recognises sync-annotation UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'sync-annotation',
        nodeId: '1:2',
        providerId: 'azure',
        ticketId: '1234',
        title: 'x',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises clear-annotation UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'clear-annotation',
        nodeId: '1:2',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises get-frame-context UI→sandbox', () => {
    expect(
      isUiToSandbox({
        type: 'get-frame-context',
        nodeId: '1:2',
        workItemType: 'Bug',
        requestId: 'r1',
      }),
    ).toBe(true)
  })

  it('recognises frame-context sandbox→UI response', () => {
    expect(
      isSandboxToUi({
        type: 'frame-context',
        context: {
          frameName: 'Login',
          workItemType: 'Bug',
          annotations: [],
          textLayers: [],
        },
        requestId: 'r1',
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/messages/protocol.test.ts`
Expected: FAIL on all 4 — guards reject unknown types.

- [ ] **Step 3: Extend `protocol.ts`**

In `src/messages/protocol.ts`:

```ts
import type {
  SelectionState,
  TicketLink,
  FileConfig,
  ProviderId,
  FrameContext,
} from '../shared/types'

export type UiToSandbox =
  | { type: 'get-selection-state'; requestId: string }
  | { type: 'export-thumbnail'; nodeId: string; requestId: string }
  | {
      type: 'write-ticket-link'
      nodeId: string
      link: TicketLink
      requestId: string
    }
  | { type: 'clear-ticket-link'; nodeId: string; requestId: string }
  | { type: 'get-file-config'; requestId: string }
  | { type: 'set-file-config'; config: FileConfig; requestId: string }
  | { type: 'get-pat'; providerId: ProviderId; requestId: string }
  | { type: 'set-pat'; providerId: ProviderId; pat: string; requestId: string }
  | { type: 'focus-node'; nodeId: string; requestId: string }
  | { type: 'open-external'; url: string }
  | {
      type: 'sync-annotation'
      nodeId: string
      providerId: ProviderId
      ticketId: string
      title: string
      requestId: string
    }
  | { type: 'clear-annotation'; nodeId: string; requestId: string }
  | {
      type: 'get-frame-context'
      nodeId: string
      workItemType: string | undefined
      requestId: string
    }

export type SandboxToUi =
  | { type: 'selection-state'; state: SelectionState; requestId: string }
  | {
      type: 'thumbnail'
      nodeId: string
      image: Uint8Array | null
      oversized: boolean
      requestId: string
    }
  | { type: 'file-config'; config: FileConfig | null; requestId: string }
  | { type: 'pat'; providerId: ProviderId; pat: string | null; requestId: string }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; reason: string; requestId: string }
  | { type: 'selection-changed'; state: SelectionState }
  | { type: 'frame-context'; context: FrameContext; requestId: string }

const UI_TYPES = new Set<UiToSandbox['type']>([
  'get-selection-state',
  'export-thumbnail',
  'write-ticket-link',
  'clear-ticket-link',
  'get-file-config',
  'set-file-config',
  'get-pat',
  'set-pat',
  'focus-node',
  'open-external',
  'sync-annotation',
  'clear-annotation',
  'get-frame-context',
])

const SANDBOX_TYPES = new Set<SandboxToUi['type']>([
  'selection-state',
  'thumbnail',
  'file-config',
  'pat',
  'ack',
  'error',
  'selection-changed',
  'frame-context',
])

// isUiToSandbox / isSandboxToUi guards remain unchanged below
```

(Keep the existing two guard functions as-is — they reference the sets above.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/messages/protocol.test.ts && npm run typecheck`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/messages/protocol.ts tests/messages/protocol.test.ts
git commit -m "feat(messages): add sync-annotation, clear-annotation, get-frame-context, frame-context"
```

---

## Task 11: Wire new messages into `sandbox/main.ts`

**Files:**
- Modify: `src/sandbox/main.ts`

No new test file — these are integration glue; behavior is covered by the unit tests of the underlying modules. The sandbox switch's exhaustiveness check will catch missing cases at typecheck time.

- [ ] **Step 1: Add handlers**

Inside `src/sandbox/main.ts`, after the existing imports, add:

```ts
import { syncAnnotation, clearAnnotation } from './annotations'
import { collectFrameContext } from './frameContext'
```

Inside the `switch (msg.type)` block, before the `default` case, add:

```ts
case 'sync-annotation': {
  const result = await syncAnnotation(msg.nodeId, {
    providerId: msg.providerId,
    ticketId: msg.ticketId,
    title: msg.title,
  })
  if (result.ok) {
    post({ type: 'ack', requestId: msg.requestId })
  } else {
    post({ type: 'error', reason: result.reason, requestId: msg.requestId })
  }
  return
}
case 'clear-annotation': {
  const result = await clearAnnotation(msg.nodeId)
  if (result.ok) {
    post({ type: 'ack', requestId: msg.requestId })
  } else {
    post({ type: 'error', reason: result.reason, requestId: msg.requestId })
  }
  return
}
case 'get-frame-context': {
  const result = await collectFrameContext(msg.nodeId, msg.workItemType)
  if (result.ok) {
    post({ type: 'frame-context', context: result.value, requestId: msg.requestId })
  } else {
    post({ type: 'error', reason: result.reason, requestId: msg.requestId })
  }
  return
}
```

- [ ] **Step 2: Run typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS — typecheck verifies switch exhaustiveness, existing tests all green.

- [ ] **Step 3: Commit**

```bash
git add src/sandbox/main.ts
git commit -m "feat(sandbox): handle sync-annotation, clear-annotation, get-frame-context"
```

---

## Task 12: `storage/aiConfig.ts` — read/write/clear

**Files:**
- Create: `src/storage/aiConfig.ts`
- Test: `tests/storage/aiConfig.test.ts`

Mirror the shape of `src/storage/credentials.ts`. Partial-state guard: returns `undefined` unless both `provider` and `key` are set.

- [ ] **Step 1: Write failing tests**

```ts
// tests/storage/aiConfig.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAiConfig,
  setAiConfig,
  clearAiConfig,
} from '../../src/storage/aiConfig'
import { installFigmaMock } from '../helpers/figmaMock'

describe('aiConfig', () => {
  beforeEach(() => {
    installFigmaMock()
  })

  it('returns undefined when nothing is stored', async () => {
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when provider stored but key missing', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'anthropic')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('returns undefined when key stored but provider missing', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:key', 'sk-xyz')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('round-trips an anthropic config', async () => {
    await setAiConfig({ provider: 'anthropic', key: 'sk-ant-xyz' })
    expect(await getAiConfig()).toEqual({ provider: 'anthropic', key: 'sk-ant-xyz' })
  })

  it('round-trips an openai config', async () => {
    await setAiConfig({ provider: 'openai', key: 'sk-oai-xyz' })
    expect(await getAiConfig()).toEqual({ provider: 'openai', key: 'sk-oai-xyz' })
  })

  it('clear removes both keys atomically', async () => {
    await setAiConfig({ provider: 'anthropic', key: 'k' })
    await clearAiConfig()
    expect(await getAiConfig()).toBeUndefined()
    const { figma } = installFigmaMock as unknown as { figma: any }
    void figma // not used here; presence-check is via getAiConfig
  })

  it('rejects invalid provider on read (defensive)', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'wat')
    await figma.clientStorage.setAsync('ai:key', 'k')
    expect(await getAiConfig()).toBeUndefined()
  })

  it('rejects empty key on read', async () => {
    const { figma } = installFigmaMock()
    await figma.clientStorage.setAsync('ai:provider', 'anthropic')
    await figma.clientStorage.setAsync('ai:key', '')
    expect(await getAiConfig()).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/storage/aiConfig.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
// src/storage/aiConfig.ts
export type AiProvider = 'anthropic' | 'openai'

export interface AiConfig {
  provider: AiProvider
  key: string
}

const PROVIDER_KEY = 'ai:provider'
const KEY_KEY = 'ai:key'

function isAiProvider(v: unknown): v is AiProvider {
  return v === 'anthropic' || v === 'openai'
}

export async function getAiConfig(): Promise<AiConfig | undefined> {
  const provider = await figma.clientStorage.getAsync(PROVIDER_KEY)
  const key = await figma.clientStorage.getAsync(KEY_KEY)
  if (!isAiProvider(provider)) return undefined
  if (typeof key !== 'string' || key.length === 0) return undefined
  return { provider, key }
}

export async function setAiConfig(cfg: AiConfig): Promise<void> {
  await figma.clientStorage.setAsync(PROVIDER_KEY, cfg.provider)
  await figma.clientStorage.setAsync(KEY_KEY, cfg.key)
}

export async function clearAiConfig(): Promise<void> {
  await figma.clientStorage.deleteAsync(PROVIDER_KEY)
  await figma.clientStorage.deleteAsync(KEY_KEY)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/storage/aiConfig.test.ts`
Expected: PASS, all sub-tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage/aiConfig.ts tests/storage/aiConfig.test.ts
git commit -m "feat(storage): aiConfig read/write/clear with partial-state guard"
```

---

## Task 13: `ai/types.ts` and `ai/prompt.ts`

**Files:**
- Create: `src/ui/ai/types.ts`
- Create: `src/ui/ai/prompt.ts`
- Test: `tests/ui/ai/prompt.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/ai/prompt.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  buildUserPrompt,
} from '../../../src/ui/ai/prompt'
import type { FrameContext } from '../../../src/shared/types'

describe('buildSystemPrompt', () => {
  it('mentions returning JSON and the allowed keys', () => {
    const sys = buildSystemPrompt()
    expect(sys).toContain('JSON')
    for (const key of [
      'title',
      'main',
      'reproSteps',
      'expected',
      'actual',
      'acceptanceCriteria',
      'outOfScope',
    ]) {
      expect(sys).toContain(key)
    }
  })

  it('is deterministic (no timestamps/randomness)', () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt())
  })
})

describe('buildUserPrompt', () => {
  const ctx: FrameContext = {
    frameName: 'Login — error',
    workItemType: 'Bug',
    annotations: ['Submit button does not disable', 'Toast disappears too fast'],
    textLayers: ['Sign in', 'Email', 'Password', 'Something went wrong'],
  }

  it('includes frame name, WIT, annotations and text layers', () => {
    const out = buildUserPrompt(ctx)
    expect(out).toContain('Login — error')
    expect(out).toContain('Bug')
    expect(out).toContain('Submit button does not disable')
    expect(out).toContain('Something went wrong')
  })

  it('marks unknown WIT as "User Story" fallback', () => {
    const out = buildUserPrompt({ ...ctx, workItemType: undefined })
    expect(out).toContain('User Story')
  })

  it('handles empty arrays without throwing', () => {
    const out = buildUserPrompt({
      frameName: 'Empty',
      workItemType: undefined,
      annotations: [],
      textLayers: [],
    })
    expect(typeof out).toBe('string')
  })

  it('is deterministic for identical input', () => {
    const a = buildUserPrompt(ctx)
    const b = buildUserPrompt(ctx)
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/ui/ai/prompt.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `types.ts`**

```ts
// src/ui/ai/types.ts
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
}

export const DRAFT_KEYS: Array<keyof DraftOutput> = [
  'title',
  'main',
  'reproSteps',
  'expected',
  'actual',
  'acceptanceCriteria',
  'outOfScope',
]
```

- [ ] **Step 4: Create `prompt.ts`**

```ts
// src/ui/ai/prompt.ts
import type { FrameContext } from '../../shared/types'
import { DRAFT_KEYS } from './types'

export function buildSystemPrompt(): string {
  return [
    'You draft software tickets from a Figma frame.',
    'Return ONLY a JSON object — no prose, no markdown fences.',
    `Allowed keys (omit any that do not apply): ${DRAFT_KEYS.join(', ')}.`,
    'Each value is plain text (markdown allowed for "main"). Lists in',
    '"reproSteps", "acceptanceCriteria", "outOfScope" should be newline-separated;',
    'do not include leading bullet markers — the caller adds them.',
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
    'Visible text layers (screen copy):',
    textLayers,
    '',
    'Draft a ticket as JSON.',
  ].join('\n')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/ui/ai/prompt.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ai/types.ts src/ui/ai/prompt.ts tests/ui/ai/prompt.test.ts
git commit -m "feat(ai): types and deterministic prompt builders"
```

---

## Task 14: `ai/parseResponse.ts` — JSON validator + WIT filter

**Files:**
- Create: `src/ui/ai/parseResponse.ts`
- Test: `tests/ui/ai/parseResponse.test.ts`

WIT filter mirrors `sectionSetFor()` in CreateView (spec, Section 1 reference). We codify the same mapping here so the AI output never includes irrelevant fields.

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/ai/parseResponse.test.ts
import { describe, expect, it } from 'vitest'
import { parseDraftResponse } from '../../../src/ui/ai/parseResponse'

describe('parseDraftResponse', () => {
  it('returns ok for a valid JSON with all keys', () => {
    const raw = JSON.stringify({
      title: 'T',
      main: 'M',
      reproSteps: 'R',
      expected: 'E',
      actual: 'A',
      acceptanceCriteria: 'AC',
      outOfScope: 'OOS',
    })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Bug → main + reproSteps + expected + actual ; AC + outOfScope dropped
    expect(r.value).toEqual({
      title: 'T',
      main: 'M',
      reproSteps: 'R',
      expected: 'E',
      actual: 'A',
    })
  })

  it('keeps acceptanceCriteria + outOfScope for User Story', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', acceptanceCriteria: 'AC', outOfScope: 'OOS' })
    const r = parseDraftResponse(raw, 'User Story')
    expect(r.ok && r.value).toEqual({
      title: 'T',
      main: 'M',
      acceptanceCriteria: 'AC',
      outOfScope: 'OOS',
    })
  })

  it('keeps only acceptanceCriteria for Task / Epic', () => {
    const raw = JSON.stringify({ title: 'T', main: 'M', acceptanceCriteria: 'AC', outOfScope: 'OOS', reproSteps: 'R' })
    const taskR = parseDraftResponse(raw, 'Task')
    expect(taskR.ok && taskR.value).toEqual({ title: 'T', main: 'M', acceptanceCriteria: 'AC' })
    const epicR = parseDraftResponse(raw, 'Epic')
    expect(epicR.ok && epicR.value).toEqual({ title: 'T', main: 'M', acceptanceCriteria: 'AC' })
  })

  it('treats unknown WIT as User Story', () => {
    const raw = JSON.stringify({ acceptanceCriteria: 'AC', outOfScope: 'OOS' })
    const r = parseDraftResponse(raw, undefined)
    expect(r.ok && r.value).toEqual({ acceptanceCriteria: 'AC', outOfScope: 'OOS' })
  })

  it('strips JSON fences from response', () => {
    const raw = '```json\n{"title":"T"}\n```'
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T' })
  })

  it('ignores extra unknown keys', () => {
    const raw = JSON.stringify({ title: 'T', extra: 'ignored', other: 1 })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T' })
  })

  it('returns ok:false when JSON is unparseable', () => {
    const r = parseDraftResponse('not json', 'Bug')
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('returns ok:false when JSON is not an object', () => {
    const r = parseDraftResponse('"a string"', 'Bug')
    expect(r).toEqual({ ok: false, reason: 'malformed' })
    const r2 = parseDraftResponse('[1,2,3]', 'Bug')
    expect(r2).toEqual({ ok: false, reason: 'malformed' })
  })

  it('coerces non-string values to strings if reasonable, else drops', () => {
    const raw = JSON.stringify({ title: 'T', main: null, reproSteps: 42 })
    const r = parseDraftResponse(raw, 'Bug')
    expect(r.ok && r.value).toEqual({ title: 'T', reproSteps: '42' })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/ui/ai/parseResponse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module**

```ts
// src/ui/ai/parseResponse.ts
import { DRAFT_KEYS, type DraftOutput } from './types'

export type ParseResult =
  | { ok: true; value: DraftOutput }
  | { ok: false; reason: 'malformed' }

function keysFor(wit: string | undefined): Array<keyof DraftOutput> {
  const w = wit ?? 'User Story'
  switch (w) {
    case 'Bug':
      return ['title', 'main', 'reproSteps', 'expected', 'actual']
    case 'Task':
    case 'Epic':
      return ['title', 'main', 'acceptanceCriteria']
    case 'User Story':
    case 'Feature':
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope']
    default:
      return ['title', 'main', 'acceptanceCriteria', 'outOfScope']
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim()
  // ```json ... ``` or ``` ... ```
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m && m[1] !== undefined ? m[1] : trimmed
}

function coerce(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
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
    const raw = (parsed as Record<string, unknown>)[key]
    if (raw === undefined) continue
    const s = coerce(raw)
    if (s !== undefined) value[key] = s
  }
  return { ok: true, value }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/ai/parseResponse.test.ts`
Expected: PASS, all 9.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ai/parseResponse.ts tests/ui/ai/parseResponse.test.ts
git commit -m "feat(ai): parseDraftResponse with WIT-aware key filtering"
```

---

## Task 15: `ai/anthropic.ts` — direct browser call

**Files:**
- Create: `src/ui/ai/anthropic.ts`

This is a thin wrapper around `fetch`. Tested through `ai/draft.ts` (Task 17). No standalone test file — it's a 25-line provider adapter with no branching.

- [ ] **Step 1: Create the module**

```ts
// src/ui/ai/anthropic.ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'

export interface AnthropicCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
}

const URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048

export async function callAnthropic(
  input: AnthropicCallInput,
): Promise<Result<string>> {
  return tryRequest<string>(
    () =>
      fetch(URL, {
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
          messages: [{ role: 'user', content: input.userPrompt }],
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/ai/anthropic.ts
git commit -m "feat(ai): anthropic direct-browser adapter"
```

---

## Task 16: `ai/openai.ts` — direct browser call

**Files:**
- Create: `src/ui/ai/openai.ts`

Same pattern as Anthropic; OpenAI's chat-completions endpoint.

- [ ] **Step 1: Create the module**

```ts
// src/ui/ai/openai.ts
import { tryRequest } from '../../providers/tryRequest'
import type { Result } from '../../providers/types'

export interface OpenAiCallInput {
  apiKey: string
  systemPrompt: string
  userPrompt: string
}

const URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'
const MAX_TOKENS = 2048

export async function callOpenAI(
  input: OpenAiCallInput,
): Promise<Result<string>> {
  return tryRequest<string>(
    () =>
      fetch(URL, {
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
            { role: 'user', content: input.userPrompt },
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/ai/openai.ts
git commit -m "feat(ai): openai direct-browser adapter"
```

---

## Task 17: `ai/draft.ts` — orchestrator with retry

**Files:**
- Create: `src/ui/ai/draft.ts`
- Test: `tests/ui/ai/draft.test.ts`

The orchestrator: picks provider, calls it, parses, retries once on malformed.

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/ai/draft.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { draftFromContext } from '../../../src/ui/ai/draft'
import { installFetch, jsonResponse } from '../../helpers/fetchMock'
import type { FrameContext } from '../../../src/shared/types'

const ctx: FrameContext = {
  frameName: 'Login',
  workItemType: 'Bug',
  annotations: ['Submit broken'],
  textLayers: ['Sign in'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('draftFromContext (Anthropic)', () => {
  it('returns parsed JSON on 200 happy path', async () => {
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: jsonResponse(200, {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ title: 'T', main: 'M', reproSteps: 'R', expected: 'E', actual: 'A' }),
            },
          ],
        }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.title).toBe('T')
    expect(r.value.acceptanceCriteria).toBeUndefined() // Bug → AC dropped
  })

  it('sets the dangerous-direct-browser-access header', async () => {
    const calls: { headers: Record<string, string> }[] = []
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: (req) => {
          calls.push({ headers: Object.fromEntries(new Headers(req.headers).entries()) })
          return jsonResponse(200, { content: [{ type: 'text', text: '{}' }] })
        },
      },
    ])
    await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(calls[0]?.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01')
    expect(calls[0]?.headers['x-api-key']).toBe('k')
  })

  it('returns auth_failed on 401', async () => {
    installFetch([
      { matches: () => true, response: jsonResponse(401, { error: 'bad key' }) },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('auth_failed')
  })

  it('returns rate_limited on 429', async () => {
    installFetch([{ matches: () => true, response: jsonResponse(429, {}) }])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('rate_limited')
  })

  it('returns server_error on 500', async () => {
    installFetch([{ matches: () => true, response: jsonResponse(500, {}) }])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('server_error')
  })

  it('returns network_error when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('network_error')
  })

  it('retries once on malformed JSON, then succeeds', async () => {
    let call = 0
    installFetch([
      {
        matches: (url) => url.includes('api.anthropic.com'),
        response: () => {
          call += 1
          if (call === 1) {
            return jsonResponse(200, { content: [{ type: 'text', text: 'not json' }] })
          }
          return jsonResponse(200, {
            content: [{ type: 'text', text: '{"title":"T"}' }],
          })
        },
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.title).toBe('T')
    expect(call).toBe(2)
  })

  it('returns unknown reason after retry still malformed', async () => {
    installFetch([
      {
        matches: () => true,
        response: () => jsonResponse(200, { content: [{ type: 'text', text: 'not json' }] }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'anthropic', key: 'k' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('unknown')
  })
})

describe('draftFromContext (OpenAI)', () => {
  it('uses Authorization: Bearer header', async () => {
    const calls: { headers: Record<string, string> }[] = []
    installFetch([
      {
        matches: (url) => url.includes('api.openai.com'),
        response: (req) => {
          calls.push({ headers: Object.fromEntries(new Headers(req.headers).entries()) })
          return jsonResponse(200, {
            choices: [{ message: { content: '{"title":"T"}' } }],
          })
        },
      },
    ])
    await draftFromContext(ctx, { provider: 'openai', key: 'k' })
    expect(calls[0]?.headers['authorization']).toBe('Bearer k')
  })

  it('returns parsed JSON on 200 happy path', async () => {
    installFetch([
      {
        matches: (url) => url.includes('api.openai.com'),
        response: jsonResponse(200, {
          choices: [{ message: { content: '{"title":"T","main":"M"}' } }],
        }),
      },
    ])
    const r = await draftFromContext(ctx, { provider: 'openai', key: 'k' })
    expect(r.ok && r.value.title).toBe('T')
  })
})
```

(One supporting check: open `tests/helpers/fetchMock.ts` and confirm that `installFetch` rules accept either a static `response` value or a `(req) => Response` factory. If the existing helper only accepts a static value, extend it minimally in this same task — the change is additive and should be one extra branch in the helper. Tests for the helper extension are not required since downstream tests cover the behavior.)

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/ui/ai/draft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `draft.ts`**

```ts
// src/ui/ai/draft.ts
import type { FrameContext } from '../../shared/types'
import type { Result } from '../../providers/types'
import type { AiConfig } from '../../storage/aiConfig'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { parseDraftResponse } from './parseResponse'
import { callAnthropic } from './anthropic'
import { callOpenAI } from './openai'
import type { DraftOutput } from './types'

async function callOnce(
  ai: AiConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<Result<string>> {
  if (ai.provider === 'anthropic') {
    return callAnthropic({ apiKey: ai.key, systemPrompt, userPrompt })
  }
  return callOpenAI({ apiKey: ai.key, systemPrompt, userPrompt })
}

export async function draftFromContext(
  ctx: FrameContext,
  ai: AiConfig,
): Promise<Result<DraftOutput>> {
  const system = buildSystemPrompt()
  const user = buildUserPrompt(ctx)

  const first = await callOnce(ai, system, user)
  if (!first.ok) return first

  const parsed = parseDraftResponse(first.value, ctx.workItemType)
  if (parsed.ok) return { ok: true, value: parsed.value, status: first.status }

  // Retry once with a stricter reminder.
  const stricter =
    user + '\n\nReturn ONLY a valid JSON object. No prose, no markdown fences.'
  const second = await callOnce(ai, system, stricter)
  if (!second.ok) return second

  const parsed2 = parseDraftResponse(second.value, ctx.workItemType)
  if (parsed2.ok) return { ok: true, value: parsed2.value, status: second.status }

  return { ok: false, reason: 'unknown', status: second.status }
}
```

- [ ] **Step 4: If `fetchMock` doesn't yet support factory `response`, extend it**

Inspect `tests/helpers/fetchMock.ts`. If `response` is only typed as a static value, change the rule's `response` to accept `Response | ((req: Request) => Response | Promise<Response>)` and call/await as a function when applicable. This is a 5-line change.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/ui/ai/draft.test.ts`
Expected: PASS, all sub-tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ai/draft.ts tests/ui/ai/draft.test.ts tests/helpers/fetchMock.ts
git commit -m "feat(ai): draftFromContext orchestrator with retry-once"
```

---

## Task 18: Update `manifest.json` with new domains

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update manifest**

Replace the `networkAccess` block with:

```json
"networkAccess": {
  "allowedDomains": [
    "https://api.notion.com",
    "https://dev.azure.com",
    "https://*.visualstudio.com",
    "https://api.anthropic.com",
    "https://api.openai.com"
  ],
  "reasoning": "Creates tickets in the user's chosen tracker (Notion or Azure DevOps) from a selected frame. Optional AI Draft sends frame name, native Figma annotations, and visible text-layer copy (no images) to the user's chosen LLM provider (Anthropic or OpenAI) using their own API key. No third-party servers."
}
```

- [ ] **Step 2: Run full build to confirm manifest is valid JSON**

Run: `npm run build`
Expected: SUCCESS — both `dist/index.html` and `dist/code.js` produced.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore(manifest): allow api.anthropic.com and api.openai.com for AI Draft"
```

---

## Task 19: Settings UI — AI provider + key fields

**Files:**
- Modify: `src/ui/views/SettingsView.tsx`

The Settings view is presentational. We add an AI section that reads/writes via `getAiConfig`/`setAiConfig`/`clearAiConfig` (Task 12).

Note: existing `SettingsView` calls into `App.tsx`-supplied callbacks. We follow the same pattern: SettingsView is a dumb view, App.tsx wires the storage calls.

- [ ] **Step 1: Read the current Settings view**

```bash
cat src/ui/views/SettingsView.tsx
```

Identify the props interface and where provider/PAT inputs live.

- [ ] **Step 2: Extend props and add fields**

Add to the props interface:

```ts
aiProvider: 'anthropic' | 'openai' | 'off'
aiKey: string
onAiChange: (next: { provider: 'anthropic' | 'openai' | 'off'; key: string }) => void
```

Below the existing provider/PAT fields, insert a section:

```tsx
<section className="settings-section">
  <h3>AI Draft (optional)</h3>
  <p className="hint">
    Disabled by default. Sends frame name, native annotations, and visible
    text layer copy to your chosen provider using your own API key.
    No image content. No telemetry.
  </p>
  <label>
    Provider
    <select
      value={props.aiProvider}
      onChange={(e) =>
        props.onAiChange({
          provider: e.target.value as 'anthropic' | 'openai' | 'off',
          key: props.aiKey,
        })
      }
    >
      <option value="off">Off</option>
      <option value="anthropic">Anthropic</option>
      <option value="openai">OpenAI</option>
    </select>
  </label>
  {props.aiProvider !== 'off' && (
    <label>
      API key
      <input
        type="password"
        autoComplete="off"
        value={props.aiKey}
        onChange={(e) =>
          props.onAiChange({ provider: props.aiProvider, key: e.target.value })
        }
      />
    </label>
  )}
</section>
```

- [ ] **Step 3: Wire from `App.tsx`**

In `src/ui/App.tsx`:

1. Add state `const [aiProvider, setAiProvider] = useState<'anthropic'|'openai'|'off'>('off')` and `const [aiKey, setAiKey] = useState('')`.
2. On mount, load existing config via `getAiConfig()` and hydrate state.
3. Pass `aiProvider`, `aiKey`, and `onAiChange` to `<SettingsView />`.
4. In `onAiChange`: if `provider === 'off'` OR `key === ''` → `await clearAiConfig()`; else `await setAiConfig({ provider, key })`.

- [ ] **Step 4: Typecheck and confirm app builds**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/views/SettingsView.tsx
git commit -m "feat(settings): add AI Draft provider + key fields"
```

---

## Task 20: CreateView — Draft button

**Files:**
- Modify: `src/ui/views/CreateView.tsx`
- Modify: `src/ui/App.tsx`

The Draft button: visible iff (AI configured) AND (selection has annotations OR text layers). On click → fetch frame context via sandbox, call `draftFromContext`, prefill the form.

- [ ] **Step 1: Read CreateView to understand its state shape**

```bash
cat src/ui/views/CreateView.tsx
```

Identify the form-state object (title, main, reproSteps, expected, actual, acceptanceCriteria, outOfScope) and how it's owned. If owned by CreateView, we add the Draft button there. If owned by App.tsx, we pass setters down.

- [ ] **Step 2: Add `aiConfig` prop and Draft handler**

Extend CreateView props with `aiConfig?: AiConfig | undefined`. Add a Draft button (icon ✨) next to the existing header/Create button.

Button visibility:

```tsx
const canDraft =
  props.aiConfig !== undefined &&
  (selection.annotationsCount > 0 || selection.textLayersCount > 0)
```

(See Task 22 — selection counts need to be added to `SelectionState`.)

- [ ] **Step 3: Handler implementation in CreateView**

```tsx
async function onDraft() {
  if (!props.aiConfig) return
  setDrafting(true)
  setDraftError(null)
  try {
    const wit = props.workItemType
    const res = await props.request({
      type: 'get-frame-context',
      nodeId: props.nodeId,
      workItemType: wit,
    })
    if (res.type !== 'frame-context') {
      setDraftError(
        res.type === 'error'
          ? `Couldn't read frame: ${res.reason}`
          : 'Couldn\'t read frame',
      )
      return
    }
    if (res.context.annotations.length === 0 && res.context.textLayers.length === 0) {
      setDraftError('Nothing to draft from — add a Figma annotation or text layer first.')
      return
    }
    const drafted = await draftFromContext(res.context, props.aiConfig)
    if (!drafted.ok) {
      setDraftError(reasonToCopy(drafted.reason))
      return
    }
    // Merge into form state
    setForm((f) => ({
      title: drafted.value.title ?? f.title,
      main: drafted.value.main ?? f.main,
      reproSteps: drafted.value.reproSteps ?? f.reproSteps,
      expected: drafted.value.expected ?? f.expected,
      actual: drafted.value.actual ?? f.actual,
      acceptanceCriteria: drafted.value.acceptanceCriteria ?? f.acceptanceCriteria,
      outOfScope: drafted.value.outOfScope ?? f.outOfScope,
    }))
  } finally {
    setDrafting(false)
  }
}

function reasonToCopy(reason: string): string {
  switch (reason) {
    case 'auth_failed':
      return 'Invalid API key — check Settings.'
    case 'rate_limited':
      return 'Rate limited — try again in a moment.'
    case 'server_error':
      return 'AI provider is having issues — try again.'
    case 'network_error':
      return 'Couldn\'t reach the AI provider.'
    default:
      return 'AI draft failed — try again.'
  }
}
```

Render: spinner-state Draft button, plus an inline error/info area for `draftError`.

- [ ] **Step 4: App.tsx wires `aiConfig` prop**

In `App.tsx`, when `mode === 'create'`, pass `aiConfig` (assembled from the `aiProvider` + `aiKey` state, only if `provider !== 'off'` and `key !== ''`) to `<CreateView />`.

- [ ] **Step 5: Typecheck, build, and run full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/views/CreateView.tsx src/ui/App.tsx
git commit -m "feat(create): AI Draft button + handler with WIT-aware prefill"
```

---

## Task 21: App.tsx — sync annotation post-create + reconcile on linked-frame select

**Files:**
- Modify: `src/ui/App.tsx`

The two hook points:
- **Post-create**: after a successful `write-ticket-link`, send `sync-annotation` with the new ticket id, provider, title. Show "pin couldn't be added" warning if `ok:false`.
- **On selecting a linked frame**: when `selection.kind === 'single' && selection.link != null`, immediately send `sync-annotation` (reconcile is idempotent).

- [ ] **Step 1: Locate the post-create write-link block**

Inspect `App.tsx` for the existing `write-ticket-link` call. Immediately after it succeeds, add:

```tsx
const syncRes = await request({
  type: 'sync-annotation',
  nodeId: selection.nodeId,
  providerId: link.providerId,
  ticketId: link.id,
  title: form.title,
})
if (syncRes.type === 'error') {
  setAttachmentFailedId(null)
  setPinFailedId(selection.nodeId)
}
```

Add `pinFailedId` state and clear it when `selectedNodeId` changes (mirroring the existing `attachmentFailedId` pattern in App.tsx).

- [ ] **Step 2: Add reconcile-on-select**

In a `useEffect` triggered when `selection.kind === 'single'` and `selection.link != null`:

```tsx
useEffect(() => {
  if (selection.kind !== 'single' || selection.link == null) return
  void request({
    type: 'sync-annotation',
    nodeId: selection.nodeId,
    providerId: selection.link.providerId,
    // Use ticket id from the stored link.
    ticketId: selection.link.id,
    // Title isn't stored on the link — for Azure the title isn't in the label,
    // and for Notion we cannot reconstruct it. Use a stable fallback string;
    // syncAnnotation only uses title for Notion-format labels, where we accept
    // that re-selecting a Notion-linked frame may show the canonical label
    // with a placeholder until the user runs Create again.
    title: selection.nodeName,
  })
}, [selection.kind === 'single' ? selection.nodeId : null])
```

(Acknowledged tradeoff: the reconcile-on-select path doesn't have the original Notion title. For Azure this doesn't matter — label = `AZURE-<id>`. For Notion, we use `nodeName` as a stand-in. The spec's reconcile flow is about *existence + ownership-recognisable label*, not about preserving the exact title; using node name keeps the label canonical-formatted and recognisable to `isOursLabel`.)

- [ ] **Step 3: Add LinkedView banner for `pinFailedId`**

In `LinkedView.tsx` (or App.tsx if the banner is owned there), render a non-blocking yellow banner: "Pin couldn't be added to this frame." when `pinFailedId === selection.nodeId`.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/views/LinkedView.tsx
git commit -m "feat(app): sync annotation post-create + reconcile on linked-frame select"
```

---

## Task 22: Selection includes annotation + text-layer counts

**Files:**
- Modify: `src/sandbox/selection.ts`
- Modify: `src/shared/types.ts`
- Modify: `tests/sandbox/selection.test.ts`

The Draft button needs to know "does this frame have annotations or text layers" *before* spending an LLM call. Cheapest way: have `classifySelection` count them.

- [ ] **Step 1: Add failing test**

Append to `tests/sandbox/selection.test.ts`:

```ts
it('reports annotationsCount and textLayersCount for a single FRAME selection', () => {
  // Build a stub node with 2 annotations and 3 nested TEXT nodes
  const node = {
    id: '1:1',
    type: 'FRAME',
    name: 'Login',
    visible: true,
    annotations: [{ label: 'a1' }, { label: 'a2' }],
    children: [
      { type: 'TEXT', characters: 't1', visible: true, children: [] },
      {
        type: 'FRAME',
        visible: true,
        annotations: [],
        children: [
          { type: 'TEXT', characters: 't2', visible: true, children: [] },
          { type: 'TEXT', characters: 't3', visible: true, children: [] },
        ],
      },
    ],
  } as unknown as SceneNode
  const result = classifySelection([node])
  expect(result.kind).toBe('single')
  if (result.kind !== 'single') return
  expect(result.annotationsCount).toBe(2)
  expect(result.textLayersCount).toBe(3)
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/sandbox/selection.test.ts`
Expected: FAIL — properties not present on `SelectionState`.

- [ ] **Step 3: Add fields to `SelectionState`**

In `src/shared/types.ts`, modify the `single` variant:

```ts
| {
    kind: 'single'
    nodeId: string
    nodeName: string
    link: TicketLink | null
    annotationsCount: number
    textLayersCount: number
  }
```

- [ ] **Step 4: Update `classifySelection`**

In `src/sandbox/selection.ts`, when building the `single` result:

```ts
function countTextLayers(node: SceneNode, depth = 0): number {
  if (depth > 5) return 0
  if (!('visible' in node) || (node as { visible: boolean }).visible === false) return 0
  if (node.type === 'TEXT') return 1
  const children = (node as unknown as { children?: SceneNode[] }).children ?? []
  let total = 0
  for (const c of children) total += countTextLayers(c, depth + 1)
  return total
}

function countAnnotations(node: SceneNode): number {
  const ann = (node as unknown as { annotations?: Array<{ label: string }> }).annotations
  return Array.isArray(ann) ? ann.length : 0
}
```

Add these counts to the returned `single` state.

- [ ] **Step 5: Update App.tsx & CreateView to pass `annotationsCount` + `textLayersCount` into the Draft button's `canDraft` logic (Task 20)**

This was already referenced in Task 20 — now the data is real.

- [ ] **Step 6: Run typecheck + tests + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/sandbox/selection.ts tests/sandbox/selection.test.ts
git commit -m "feat(selection): expose annotationsCount + textLayersCount for Draft button gating"
```

---

## Task 23: Update SECURITY.md

**Files:**
- Modify: `SECURITY.md`

- [ ] **Step 1: Add a section**

Append a section titled "AI Draft (optional)" with:

- Opt-in feature, disabled by default.
- API keys stored in `figma.clientStorage` (per-user, per-machine) under `ai:provider` and `ai:key`. Same isolation as PATs.
- Each Draft call sends ONLY: frame name, native Figma annotations on the frame, visible TEXT node content from the frame (bounded). No image content. No telemetry.
- Destinations: `api.anthropic.com` or `api.openai.com`, depending on user selection. Listed in manifest's `networkAccess.allowedDomains`.
- Disabling AI Draft (Settings → Off) clears both keys from clientStorage atomically.

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs(security): disclose AI Draft opt-in, data sent, no telemetry"
```

---

## Task 24: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Future Claudes need to know about the new modules and conventions. Keep it terse.

- [ ] **Step 1: Add notes**

In the "Architecture" section, add a paragraph after the description composer block:

```
**Auto-pin annotations — `src/sandbox/annotations.ts`**
Pin lifecycle is managed entirely in the sandbox via `figma.annotations`.
`syncAnnotation` is idempotent: it reconciles to a single canonical pin per
node and ticket. Pin labels follow `AZURE-<id>` or `Notion · <title> · #<8-hex>`.
`isOursLabel`'s regex is the single source of truth for ownership — never
parse labels by hand elsewhere.

**AI Draft — `src/ui/ai/`**
BYO-key, text-only (no image content). Calls live in the UI iframe; sandbox
only collects context via `get-frame-context`. Reuses the providers'
`Result<T>` and `NormalizedReason` types — do not invent parallel error
shapes. New `manifest.json` domains: `api.anthropic.com`, `api.openai.com`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document annotations.ts and ai/ modules"
```

---

## Task 25: Manual QA additions to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append items to the existing Manual QA checklist**

Add two items:

```
- **Auto-pin sanity:** Create a ticket on a frame → confirm a numbered annotation
  appears on the frame and is visible in Figma's Annotations panel; clicking it
  opens the correct ticket. Re-select the same frame: no duplicate pin. Manually
  delete the pin and reopen the plugin on the same frame: pin is recreated.
- **AI Draft sanity:** With an Anthropic (or OpenAI) key configured in Settings
  and a frame that has at least one native annotation, click ✨ Draft → confirm
  the form pre-fills coherently for the chosen WIT (Bug shows reproSteps/expected/
  actual; User Story shows acceptanceCriteria/outOfScope). Edit and Create the
  ticket; confirm it lands as expected. Unconfigure the key in Settings → the
  Draft button disappears.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): add manual QA items for auto-pin and AI Draft"
```

---

## Task 26: Final integration sweep

**Files:**
- None new — full-suite verification.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all green, including new tests from tasks 1–22.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `dist/index.html` and `dist/code.js` both produced.

- [ ] **Step 4: Manual import in Figma (out-of-CI verification)**

In Figma desktop → Plugins → Development → Import plugin from manifest → select `manifest.json`. Smoke-check:
1. Settings: configure provider + PAT (as before), then configure AI Draft with a known-good key.
2. Select a frame with ≥1 native Figma annotation → CreateView shows ✨ Draft button.
3. Click Draft → fields prefill within ~5s.
4. Click Create → ticket lands; annotation pin appears on frame; LinkedView shows.
5. Re-select the same frame → no duplicate pin; LinkedView still shows.

If any step fails, fix in a follow-up task before merging.

- [ ] **Step 5: Final commit (if any tweaks made)**

```bash
git add -A
git commit -m "chore: integration sweep cleanup"
```

(Skip if no changes.)

---

## Done criteria

- [ ] All 26 tasks above complete.
- [ ] `npm test` green.
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` produces both bundle artifacts.
- [ ] Manual QA checklist (Task 26 Step 4) passes against a real Notion or Azure org.
