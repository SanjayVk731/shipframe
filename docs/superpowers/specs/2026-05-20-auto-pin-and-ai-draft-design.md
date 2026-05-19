# Auto-pin on Frame & AI Draft — Design

**Date:** 2026-05-20
**Status:** Approved for planning
**Goal:** Adoption-focused feature pair that makes Shipframe demo-able in a single GIF and uniquely useful at first run.

## Why these two, together

The plugin works today but is quiet. The Figma Community listing screenshot does most of the install-decision work, and our current screenshots show a sidebar form — the same shape as a dozen other handoff plugins. Two features change that:

1. **Auto-pin on frame** — when a ticket is created, drop a native Figma annotation on the node. Zoom out and the file *visually* shows which parts have open tickets. Unique among Figma↔tracker plugins. The screenshot sells itself.
2. **AI Draft** — text-only LLM call reads the frame's native annotations + visible text layers, fills the structured ticket fields. The "magic moment" feature; turns annotated frames into tickets in one click.

The two compound: auto-pins put annotations *on* the frame at create time; AI Draft reads annotations *off* the frame at draft time. Same primitive, both directions.

Marketing is downstream of these features, not parallel to them. A demo GIF showing "annotate → click Draft → ticket appears → pin lands on frame" is the entire pitch.

## Non-goals

- **Status sync back** (ticket closed in tracker → pin updates). Out of scope; would require polling the provider on every plugin open.
- **Batch mode**. Out of scope here. `nodeLink.ts` stays single-link for v1; widening to `TicketLink[]` is deferred until batch is on the roadmap.
- **Hosted AI proxy**. BYO key only. Preserves the "no backend, no telemetry" story in SECURITY.md.
- **Image input to LLM**. Text-only payload. Avoids pixel-privacy concerns and keeps inference cheap and fast.
- **Unlink → pin cleanup**. Pins persist after unlink; user can delete manually.

## User flows

### Flow A — Create ticket with auto-pin

```
1. Designer selects frame
2. Plugin opens to CreateView (today)
3. Fills title + description (today)
4. Clicks Create
5. Ticket created in tracker (today)
6. NEW: Sandbox creates a native Figma annotation on the node
       - label: "AZURE-1234" (Azure) or "Notion · <title> · #<short-id>" (Notion)
       - short-id = last 8 chars of Notion page UUID — enough to disambiguate
         two pins on the same node with the same title
       - categoryId: color-coded per provider
7. Sandbox writes nodeLink pluginData (today)
8. UI flips to LinkedView, "Ticket created" banner (today)
9. Designer zooms out → frame shows numbered pin in Figma's Annotations panel
```

### Flow B — Reopen plugin on a linked frame

```
1. Designer re-selects a linked frame
2. Plugin opens
3. NEW: Sandbox reconciles annotation state:
        - Reads pluginData('ticketLink')
        - Reads node.annotations
        - If ours is missing → create (self-heal)
        - If ours has wrong label → update
        - If correct → noop
4. UI shows LinkedView (today)
```

### Flow C — AI Draft

```
1. Designer selects frame
2. Plugin opens to CreateView
3. NEW: "✨ Draft with AI" button visible iff:
       (a) AI provider + key configured in Settings, AND
       (b) frame has ≥1 native annotation OR ≥1 TEXT layer
4. Designer clicks Draft
5. UI iframe:
       - Asks sandbox for { frameName, wit, annotations[], textLayers[] }
       - POSTs to api.anthropic.com or api.openai.com with BYO key
       - Receives structured JSON
       - Pre-fills the textareas for the active WIT (Bug / User Story / etc)
6. Designer edits if needed, then Create (Flow A from step 4 onward)
```

### Flow D — Settings (new AI config)

```
1. Designer opens Settings (cog icon)
2. NEW section "AI Draft (optional)":
       - Provider: [ Anthropic | OpenAI | Off ]
       - API key: [_______________]
       - Disclosure: "Disabled by default. Sends frame name, native
                     annotations, and visible text layer copy to your
                     chosen LLM provider using your own key. No image
                     content. No telemetry."
3. Saved to clientStorage (per-user, per-machine).
```

## Architecture

The plugin's sandbox/UI divide is the security boundary. Both new features respect it.

- **Auto-pin**: 100% sandbox. `figma.annotations` is a sandbox-only API. UI sends a `sync-annotation` message; sandbox does the work.
- **AI Draft**: 100% UI iframe for the network call. UI requests frame context from sandbox (text + annotations), then calls the LLM itself. Sandbox only returns data, never reaches network.

### New and changed modules

```
src/
├── sandbox/
│   ├── main.ts                          ← extended switch: 3 new messages
│   ├── annotations.ts                   ← NEW: pin reconcile, create, clear
│   ├── frameContext.ts                  ← NEW: collect text layers + annotations
│   └── nodeLink.ts                      ← unchanged (single TicketLink for v1)
├── ui/
│   ├── App.tsx                          ← post-create: sync-annotation
│   │                                       plugin-open w/ link: reconcile
│   ├── views/
│   │   ├── CreateView.tsx               ← new "✨ Draft" button
│   │   └── SettingsView.tsx             ← AI provider + key fields
│   ├── ai/                              ← NEW
│   │   ├── types.ts                     ← DraftInput, DraftOutput, AiConfig
│   │   ├── prompt.ts                    ← buildSystemPrompt, buildUserPrompt
│   │   ├── anthropic.ts                 ← POST /v1/messages
│   │   ├── openai.ts                    ← POST /v1/chat/completions
│   │   └── draft.ts                     ← orchestrator: provider pick, validate
│   └── composeDescription.ts            ← unchanged
├── storage/
│   └── aiConfig.ts                      ← NEW: clientStorage 'ai:provider', 'ai:key'
├── messages/
│   └── protocol.ts                      ← 3 new message types
└── manifest.json                        ← add anthropic.com + openai.com
```

### Message protocol additions (`src/messages/protocol.ts`)

```ts
// UI → sandbox
| { type: 'sync-annotation';   requestId; nodeId; label: string; provider: ProviderId }
| { type: 'clear-annotation';  requestId; nodeId }
| { type: 'get-frame-context'; requestId; nodeId }

// sandbox → UI
| { type: 'sync-annotation-result';  requestId; ok: boolean; reason?: string }
| { type: 'clear-annotation-result'; requestId; ok: boolean }
| { type: 'frame-context-result';
    requestId;
    result: { ok: true; context: FrameContext } | { ok: false; reason: string } }
```

Each new literal goes into the `UI_TYPES` / `SANDBOX_TYPES` sets and the sandbox's exhaustive switch — same pattern as today's messages.

```ts
type FrameContext = {
  frameName: string;
  workItemType: string | undefined;
  annotations: string[];   // native figma annotation labels
  textLayers: string[];    // visible TEXT.characters, top-down, bounded
};
```

### Sandbox: `annotations.ts`

Two responsibilities: **sync** (create or update) and **clear** (on future unlink hook).

`syncAnnotation(nodeId, label, provider)`:

1. `figma.getNodeByIdAsync(nodeId)` (required by `documentAccess: 'dynamic-page'`)
2. If node missing or not annotatable → `{ ok: false, reason: 'node-missing' }`
3. Find existing annotation matching our ownership regex:
   - Azure: `/^AZURE-\d+$/`
   - Notion: `/^Notion · .+ · #[0-9a-f]{8}$/`
4. If found with same label → noop
5. Otherwise: replace ours, preserve everyone else's
6. `node.annotations = [...others, { label, categoryId: forProvider(provider) }]`

We never touch annotations whose label doesn't match our format. The regex is strict on purpose: a manual annotation that happens to start with "AZURE-" but isn't followed by digits is left alone. `categoryId` is chosen per provider so all Azure pins share a color and all Notion pins share a different one.

### Sandbox: `frameContext.ts`

Bounded traversal:

- Depth cap: 5
- Max TEXT nodes collected: 50 (stop at 50; append `…and N more truncated` summary)
- Max chars per TEXT node: 300 (`…` suffix on truncate)
- Max native annotations: 20
- Max total prompt chars: 8000

Constants at top of file, greppable. Above any limit → truncate silently and append a summary line so the LLM knows it isn't seeing everything.

### UI: `ai/draft.ts`

Orchestrator. Pure-ish: takes `FrameContext + AiConfig`, returns `Result<DraftOutput>`.

```ts
type DraftOutput = {
  title?: string;
  main?: string;
  reproSteps?: string;
  expected?: string;
  actual?: string;
  acceptanceCriteria?: string;
  outOfScope?: string;
};

async function draftFromContext(
  context: FrameContext,
  ai: AiConfig
): Promise<Result<DraftOutput, AiReason>>;
```

Errors normalize same as providers: `auth_failed | rate_limited | server_error | network_error | unknown`. Each maps to user-facing copy in CreateView.

### Manifest

```jsonc
"networkAccess": {
  "allowedDomains": [
    "https://api.notion.com",
    "https://dev.azure.com",
    "https://*.visualstudio.com",
    "https://api.anthropic.com",
    "https://api.openai.com"
  ],
  "reasoning": "Creates tickets in the user's chosen tracker. Optional AI Draft sends frame name, native annotations, and visible text-layer copy (no images) to the user's chosen LLM provider using their own API key."
}
```

**SECURITY.md** gets a new paragraph: AI Draft is opt-in, key stored in clientStorage (per-user, per-machine, same as PATs), text-only payload, no telemetry on top of the existing baseline.

### Storage (clientStorage)

```
pat:notion       ← existing
pat:azure        ← existing
ai:provider      ← NEW: 'anthropic' | 'openai' | undefined
ai:key           ← NEW: string
```

Both required for Draft button to render. Either missing → button hidden. No partial state allowed; clearing one clears both.

### Untouched

- `composeDescription.ts` — still the only HTML-escaping path. AI fills raw textareas; composer sanitizes on submit.
- `providers/` — totally untouched. Auto-pin is sandbox-only; AI Draft is UI-only.
- `tryRequest.ts` — provider-only. `ai/` defines its own narrow `Result` (different error shapes).

## Data flow

### Create with auto-pin

```
UI (CreateView)                                  Sandbox (main.ts)

user clicks Create
  │
  ├─→ fetch provider API
  ←── TicketRef { id, url, providerId }
  │
  ├─→ request('write-ticket-link')              setPluginData('ticketLink')
  ←── ok
  │
  ├─→ request('sync-annotation',                getNodeByIdAsync
  │           label, provider)                  inspect node.annotations
  │                                             upsert our pin
  ←── { ok, reason? }
  │
  ├─→ request('get-selection-state')            (refresh)
  ←── selection-state w/ ticketLink
  │
  flip to LinkedView; show "Ticket created"
  if sync !ok: show "Pin couldn't be added" (non-blocking warning)
```

Auto-pin sync is **non-blocking for the success state**. Ticket is the user's intent; pin is a delight layer. Pin failure surfaces as a yellow warning, same pattern as `attachmentFailedId` today.

### AI Draft

```
UI (CreateView)                                  Sandbox (main.ts)

user clicks ✨ Draft
setLoading(true)
  │
  ├─→ request('get-frame-context', nodeId)     walk node tree (bounded)
                                                collect TEXT + annotations
  ←── { ok: true, context }
  │
  if context.annotations.length === 0 &&
     context.textLayers.length === 0:
    show "Nothing to draft from — add an annotation or text layer first"
    abort
  │
  draft = await draftFromContext(context, aiConfig)
    └─ fetch api.anthropic.com or api.openai.com
       (BYO key in Authorization header)
       (anthropic: anthropic-dangerous-direct-browser-access: true)
  │
  if draft.ok:
    setForm({ title, main, reproSteps, ... })
    show "Draft inserted — review before creating"
  else:
    show reason-specific copy
      auth_failed   → "Invalid API key — check Settings"
      rate_limited  → "Rate limited — try again shortly"
      server_error  → "<provider> is having issues — try again"
      network_error → "Couldn't reach <provider>"
      unknown       → "AI draft failed — try again"
  setLoading(false)
```

Draft is **separate from Create**. Draft fills the form; user reviews; user submits. No "auto-draft on open" — that would burn API credits without consent.

### Three corner cases

1. **Empty frame** (no annotations, no text layers): UI refuses to call the LLM. Saves money, avoids hallucination-from-nothing.
2. **Malformed JSON from LLM**: validator retries once with stricter prompt; if still bad, surface as `unknown`. No partial fills.
3. **User clicks Create before Draft resolves**: Create proceeds with whatever's in the form; Draft promise discarded. We don't lock the whole form during Draft; only the Draft button is disabled while in flight.

## Limits & edge cases

### Frame context collection

| Limit | Value | Why |
|---|---|---|
| Max TEXT nodes | 50 | Enough for an empty-state screen, not a whole design library |
| Max chars per node | 300 | One paragraph |
| Max total prompt | 8000 chars | Predictable token cost |
| Max annotations | 20 | If you have >20, split the frame |
| Max traversal depth | 5 | Don't recurse into deeply nested components |

Above any limit → truncate silently and append `…and N more truncated` so the LLM is aware.

### Annotation reconcile — failure modes

| Scenario | Behavior |
|---|---|
| Node not found (deleted) | `{ ok: false, reason: 'node-missing' }`; UI shows non-blocking warning |
| Node unsupported type | Same as above; selection guard should prevent, defensive only |
| `figma.annotations` API unavailable | `{ ok: false, reason: 'api-unavailable' }`; UI silently swallows — no nag |
| Pin manually deleted | Reconcile recreates on next plugin open (self-healing) |
| Pin label manually edited | Reconcile overwrites to canonical format; designer can't customize label |
| Multiple of ours on same node | Keep first match, remove duplicates |

### AI Draft — failure modes

| Scenario | Behavior |
|---|---|
| No key configured | Draft button hidden entirely |
| 401 | `auth_failed` |
| 429 | `rate_limited` |
| 5xx | `server_error` |
| CORS / network fail | `network_error` |
| Valid JSON, wrong shape | Retry once with stricter prompt → `unknown` if still wrong |
| Unparseable text | Same retry-once → `unknown` |
| Extra unknown keys in response | Ignore silently |
| Keys outside current WIT | Filter before applying (e.g. drop `reproSteps` for User Story) |

### Settings edge cases

| Scenario | Behavior |
|---|---|
| Wrong provider/key combo | Not pre-validated; first Draft call surfaces `auth_failed` |
| Partial unconfigure | Either field cleared → both cleared. No partial state |
| Old bundle, new manifest gap | Surfaces as `network_error` (CORS); shouldn't happen post-publish |

### Performance budget

- Auto-pin sync: <50ms (sync API)
- Frame context collection: <200ms for a 50-text-node frame
- AI Draft: 2–8s typical (text-only structured call). Spinner on Draft button only; form remains editable.

## Testing

Vitest + happy-dom, mirroring existing structure.

### New test files

```
tests/
├── sandbox/
│   ├── annotations.test.ts
│   └── frameContext.test.ts
├── ui/
│   └── ai/
│       ├── prompt.test.ts
│       ├── draft.test.ts
│       └── parseResponse.test.ts
└── storage/
    └── aiConfig.test.ts
```

### Helper extension

`figmaMock` gets `figma.annotations` support: per-node `annotations: AnnotationEntry[]` array, sync read/write. ~30 lines.

### High-leverage cases

**`annotations.test.ts`**
- creates when none of ours exist
- noop when matching exists
- updates on label drift
- preserves manual (non-ours) annotations
- removes duplicates, keeps first
- node-missing → reason
- api-unavailable → reason

**`frameContext.test.ts`**
- collects TEXT.characters from direct + nested children
- depth cap at 5
- node count cap at 50
- char cap at 300/node with `…`
- includes node.annotations
- total cap at 8000 chars with summary line
- empty frame → empty arrays

**`draft.test.ts`**
- 200 valid JSON → ok
- 401 → auth_failed
- 429 → rate_limited
- 500 → server_error
- network error → network_error
- malformed JSON → retry → unknown
- extra keys ignored
- WIT-key filtering applied
- Anthropic headers present (`anthropic-version`, `anthropic-dangerous-direct-browser-access`)
- OpenAI `Authorization: Bearer` present

**`aiConfig.test.ts`**
- read/write/clear round-trip
- clearing one clears both
- partial state returns undefined

### Manual QA additions to README

1. **Auto-pin sanity:** Create ticket → annotation appears on frame, opens correct ticket from Annotations panel, re-selecting frame doesn't duplicate, manually deleting pin and reopening plugin recreates it.
2. **AI Draft sanity:** With Anthropic key + a frame that has ≥1 native annotation → click Draft → form pre-fills coherently → edit and Create → ticket lands. Then unconfigure key → Draft button disappears.

### Coverage policy

No numeric target. Existing tests cover provider HTTP + message protocol; extensions follow the same shape. PR adding a public function in `ai/` or `sandbox/annotations.ts` without a test is a review red flag.

## Open follow-ups (not in this spec)

- Batch mode (multi-frame → multi-ticket). Will require widening `TicketLink` to `TicketLink[]`. Migration path: on read, if value is an object not an array, wrap in `[value]`. ~20 lines, no data loss.
- Hosted AI proxy (free-tier on top of BYO). Revisit only if adoption demands it; current decision preserves no-backend story.
- Status sync (read ticket state from provider, reflect in annotation label). Big perf/rate-limit risk; not worth it until users ask.
