# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev          # vite build --watch; rebuilds dist/ on every change
npm run build        # two-pass build: UI bundle, then sandbox bundle
npm test             # vitest run (one-shot)
npm run test:watch   # vitest in watch mode
npm test -- tests/providers/notion.test.ts   # run a single test file
npm test -- -t "creates a page"              # filter by test name
npm run typecheck    # tsc --noEmit
```

Then in Figma desktop: **Plugins → Development → Import plugin from manifest → `manifest.json`**. The manifest points at `dist/code.js` and `dist/index.html`, so the build must run before importing.

CI (`.github/workflows/ci.yml`) runs typecheck → test → build, then asserts both `dist/code.js` and `dist/index.html` exist — if you change build output paths, update the manifest *and* the workflow.

## Build model — two bundles, one Vite config

`vite.config.ts` switches on `process.env.BUILD_TARGET` and `package.json`'s `build` script runs Vite twice:

1. **UI** (default) — React app rooted at `src/ui/`. Inlined into a single `dist/index.html` via `vite-plugin-singlefile` (Figma plugin iframes don't load sibling JS/CSS).
2. **`BUILD_TARGET=sandbox`** — IIFE bundle of `src/sandbox/main.ts` → `dist/code.js`. Targets ES2017 because it runs inside Figma's QuickJS-based plugin sandbox.

Order matters: the UI build clears `dist/`, the sandbox build appends to it (`emptyOutDir: false`). Don't reorder.

## Architecture

The plugin is split into **two runtime contexts** that talk only via `postMessage`. Keep this divide clean — it's the security boundary Figma enforces and breaking it is the #1 source of bugs.

```
┌────────────────────────────────┐    postMessage    ┌────────────────────────────┐
│ src/sandbox/  (dist/code.js)   │  ←─ protocol ─→   │ src/ui/  (dist/index.html) │
│ Figma QuickJS sandbox          │                   │ React iframe               │
│ • figma.* API                  │                   │ • fetch() to providers     │
│ • selection events             │                   │ • renders views            │
│ • clientStorage (PATs)         │                   │ • holds the form state     │
│ • root.pluginData (file cfg)   │                   │                            │
│ • node.pluginData (ticket id)  │                   │                            │
└────────────────────────────────┘                   └────────────────────────────┘
```

**The sandbox never makes network calls.** Provider HTTP happens in the UI iframe — that's why `manifest.json` declares `networkAccess.allowedDomains`. If you find yourself wanting to `fetch()` inside `src/sandbox/`, you're on the wrong side of the divide.

### Message protocol — `src/messages/protocol.ts`

Single source of truth for the sandbox↔UI wire format. Both directions are tagged unions with type guards (`isUiToSandbox`, `isSandboxToUi`).

- UI → sandbox messages carry a `requestId`; the sandbox replies with the same `requestId`.
- `selection-changed` is a *push* event (no `requestId`); `selection-state` is the *response* form of the same payload.
- `useSandbox` (UI) keeps a `Map<requestId, resolve>` and turns the message protocol into a `request()` promise API.
- When adding a new message type: extend both unions, add the literal to the matching `UI_TYPES` / `SANDBOX_TYPES` `Set`, and handle it in `src/sandbox/main.ts`'s switch (which uses an exhaustiveness check).

### Provider plug-in surface — `src/providers/`

Every provider implements `TicketProvider` (`types.ts`):
`testAuth`, `listBoards`, `getFieldSchema`, `createTicket`, `uploadAttachment`. They are wired into `registry.ts` keyed by `ProviderId = 'notion' | 'azure'`.

All HTTP goes through `tryRequest()` (`tryRequest.ts`), which normalizes responses into `Result<T>` with a `NormalizedReason` (`auth_failed` / `not_found` / `rate_limited` / `server_error` / `network_error` / `unknown`). Provider methods should never throw for HTTP errors — return `Result.ok=false` instead. The UI branches on `reason` to decide what to display.

Provider-specific quirks worth knowing:
- **Azure**: PAT is stored as `"org|token"` (single string). `boardId` is `"org|project|workItemType"`. `parsePat` / `parseBoardId` enforce these shapes. Auth header is HTTP Basic with empty username: `'Basic ' + btoa(':' + token)`. Listing teams/work-item-types fails CORS from the plugin iframe, so we hardcode `DEFAULT_WORK_ITEM_TYPES` and only fetch projects.
- **Azure field routing**: `createTicket` writes structured content into native Azure fields when present in `TicketInput`:
  - `description` → `System.Description` (passed through as-is; composer owns escaping, see UI section below)
  - `acceptanceCriteriaHtml` → `Microsoft.VSTS.Common.AcceptanceCriteria`
  - `reproStepsHtml` → `Microsoft.VSTS.TCM.ReproSteps`
  - `figmaDeepLink` → both embedded as a `<p><strong>Figma:</strong> …</p>` block at the top of Description **and** attached as a `Hyperlink` relation via `/relations/-`. Belt-and-suspenders: relation is the queryable anchor, description block is the obvious scan target. Don't remove either.
- **Azure attachment bytes** must be wrapped in a `Blob`, not passed as a raw `Uint8Array`. Figma's UI iframe stringifies typed arrays going into `fetch()` (Azure receives `"[object Uint8Array]"` instead of the PNG). See `uploadAttachment` in `azureDevops.ts`.
- **Notion**: Property names are discovered case-insensitively from the database schema (`discoverPropertyNames`) — "Type", "type", and "TYPE" are all matched. Attachment upload is currently a no-op (`supported: false`); the Figma deep link goes in a callout block instead. Notion **ignores** `acceptanceCriteriaHtml` and `reproStepsHtml` today — those fields are Azure-only.

### Storage — `src/storage/`

Two distinct stores, do not mix them:
- `credentials.ts` → `figma.clientStorage` (per-user, per-device, async). Holds PATs only. Keyed `pat:<providerId>`.
- `fileConfig.ts` → `figma.root.setPluginData` (per-file, travels with the .fig file, sync). Holds the chosen provider + board + `fileKey`. Validates with a runtime type guard before returning.
- `src/sandbox/nodeLink.ts` → `node.setPluginData('ticketLink', ...)`. One ticket link per scene node. JSON-encoded, type-guarded on read.

**`figma.fileKey` is `null` in the public/Community runtime**, so `FileConfig.fileKey` is collected from the user (paste the file URL in Settings) and reused for deep links — see `deepLinkFor()` in `App.tsx`.

### UI shape — `src/ui/`

`App.tsx` is the state machine. Mode is computed from selection + fileConfig + a `forceSettings` override:

```
loading → settings (no fileConfig) → create | linked | empty (depending on selection)
                ↑ openSettings() (cog icon)
```

Two non-obvious behaviors:
1. **`pluginData` writes don't fire `selectionchange`.** After `write-ticket-link` or `clear-ticket-link`, the UI must explicitly `request({ type: 'get-selection-state' })` to refresh — otherwise it stays on the wrong view.
2. **`justCreatedId`** is set *before* the post-create refresh so the LinkedView shows the "Ticket created" banner on its first render. It clears when `selectedNodeId` changes. `attachmentFailedId` follows the same pattern for the "thumbnail couldn't be attached" warning.

Views (`src/ui/views/`) are presentational; they receive callbacks and `Result<T>` promises from `App.tsx` and render. Don't put fetch logic or sandbox calls inside view components.

### Description composer — `src/ui/composeDescription.ts`

The composer is the single trust boundary that turns user-typed markdown into safe HTML for Azure. It's a pure function called from `CreateView.submit()`.

Input is structured (`main`, `reproSteps`, `expected`, `actual`, `acceptanceCriteria`, `outOfScope`, optional `figmaLink`); output is `{ description, acceptanceCriteriaHtml, reproStepsHtml }`. Three outputs because Azure has native fields for AC and ReproSteps — those don't belong in Description.

Pipeline per field:
1. `marked.parse()` (block) or `marked.parseInline()` (list items) renders markdown → HTML. Configured with `gfm: true, breaks: true` — single newlines in textareas become `<br>`.
2. `DOMPurify.sanitize()` with an `ALLOWED_TAGS` whitelist (`p`, `br`, `strong`, `em`, `b`, `i`, `code`, `pre`, `a`, `ul`, `ol`, `li`, `h2`, `h3`, `blockquote`) and `ALLOWED_ATTR: ['href']`. `FORBID_TAGS` explicitly blocks `img`, `script`, `style`, `iframe` — no external image embeds in Azure descriptions (privacy + render reliability) and no script-y vectors.
3. For list-shaped fields (AC, ReproSteps): split on newlines, strip leading list markers (`-`, `*`, `•`, `1.`, `2)`) since users keep typing them, then wrap each rendered line in `<li>`.

Because the composer owns escaping, **`azureProvider.createTicket` must not double-escape** — it passes `description`, `acceptanceCriteriaHtml`, and `reproStepsHtml` through as-is.

### Auto-pin annotations — `src/sandbox/annotations.ts`

Pin lifecycle is managed entirely in the sandbox via `figma.annotations`. `syncAnnotation` is idempotent — it reconciles to a single canonical pin per node and ticket: noop when the label matches, replace when it drifted, preserve any non-ours annotation. Pin labels follow `AZURE-<id>` or `Notion · <title> · #<8-hex>`. `isOursLabel`'s regex (`^AZURE-\d+$` / `^Notion · .+ · #[0-9a-f]{8}$`) is the **single source of truth** for ownership — never parse pin labels by hand elsewhere. `clearAnnotation` removes only ours-pins; it's wired in the message protocol but not currently surfaced in any UI action (kept around for a future "delete pin" flow). The sandbox handler in `main.ts` translates `sync-annotation` / `clear-annotation` failures to the generic `error` envelope.

### Frame context collection — `src/sandbox/frameContext.ts`

Read by the UI to build the AI Draft prompt. Bounded traversal: depth ≤ 5, ≤ 50 TEXT nodes, ≤ 300 chars per node, ≤ 20 annotations, ≤ 8000 total chars. The depth cap bounds **container recursion**, not leaf inclusion — a TEXT leaf inside a depth-5 FRAME is still collected. Truncation appends `…and N more text nodes truncated` or `…and N more chars truncated` so the LLM knows it isn't seeing everything. Invisible nodes are skipped.

### AI Draft — `src/ui/ai/`

BYO-key, text-only. The UI iframe calls `api.anthropic.com` or `api.openai.com` directly using the user's API key from `clientStorage` (`ai:provider` + `ai:key`, atomic clear via `clearAiConfig`). The sandbox only collects context via `get-frame-context`; no network in the sandbox. Reuses providers' `Result<T>` and `NormalizedReason` — no parallel error-shape system. `parseDraftResponse` strips ```` ```json ```` fences, validates JSON shape, filters keys by WIT (same mapping as `sectionSetFor` in CreateView), and coerces numbers/booleans to strings. The orchestrator (`draft.ts`) retries once on malformed JSON with a stricter reminder; if still malformed, returns `reason: 'unknown'`. Anthropic adapter sends `anthropic-dangerous-direct-browser-access: true` (required for browser-direct calls). OpenAI adapter sets `response_format: { type: 'json_object' }`. `draft.ts` is **dynamic-imported** from CreateView so the AI bundle is only fetched when the user clicks Draft.

`CreateView` chooses which sections to render based on the Azure work item type (`Bug` → repro/expected/actual; `User Story` / `Feature` → AC + out of scope; `Task` / `Epic` → AC only; unknown → User Story set as a safe default). The mapping lives in `sectionSetFor()` in `CreateView.tsx`. WIT is parsed out of `boardId` by `workItemTypeFor()` in `App.tsx`; Notion-flavored boards return `undefined` and CreateView falls back to the User Story set.

### Selection contract — `src/sandbox/selection.ts`

`classifySelection()` returns one of `{kind: 'none' | 'multi' | 'unsupported' | 'single'}`. Supported node types are `FRAME | COMPONENT | COMPONENT_SET | INSTANCE | SECTION`.

`exportThumbnail()` returns `{ bytes, oversized }`, not a bare `Uint8Array`. Two limits apply:
- Longest edge capped at 2048px (otherwise scales 2×) so the PNG dimensions stay sane.
- Resulting PNG capped at **5MB** (`MAX_THUMB_BYTES`). Beyond that — typical for large multi-frame sections — `bytes` is `null` and `oversized: true`. The UI surfaces this upfront with a "section too large to attach" banner; the ticket still creates with the Figma link, the thumbnail is just skipped. The 5MB threshold matches Notion's free-workspace cap and is well under Azure's 60MB ceiling.

`documentAccess: 'dynamic-page'` in the manifest means node lookups in the sandbox **must** use `figma.getNodeByIdAsync()`, not synchronous `getNodeById`. `findNode()` in `main.ts` is the only call site.

## Tests

Vitest + happy-dom + React Testing Library. Two helpers do most of the heavy lifting:

- `tests/helpers/figmaMock.ts` — `installFigmaMock()` returns an in-memory stub of `figma.clientStorage` and `figma.root.{get,set}PluginData`. Call it in `beforeEach` for storage / sandbox tests.
- `tests/helpers/fetchMock.ts` — `installFetch([{ matches, response }])` stubs `globalThis.fetch` with URL-matching rules. Use `jsonResponse(status, body)` for typical JSON replies. Used by every provider test.

Tests mirror `src/` exactly (e.g. `src/providers/notion.ts` → `tests/providers/notion.test.ts`).

## Conventions

- **`strict` + `noUncheckedIndexedAccess`** in `tsconfig.json` — `arr[0]` is `T | undefined`; either narrow or use `!` if you can prove it's safe (e.g. after a `length` check).
- **Sandbox bundle must stay tiny and dependency-free.** It runs in QuickJS; libraries that pull in Node/DOM polyfills silently break there. The UI bundle is allowed real dependencies (currently React, `marked`, `isomorphic-dompurify`) but check the bundle delta — the UI ships inlined into a single HTML file via `vite-plugin-singlefile`. Anything you add to UI imports must NOT be imported by `src/sandbox/` or `src/shared/`, or it'll leak into the sandbox bundle.
- **Errors from provider calls are normalized, not thrown.** Don't `try/catch` `Result<T>` returns; branch on `.ok`. Error detail from the provider body (e.g. Azure's "field X is required") is surfaced verbatim in `CreateView` via `extractProviderDetail()`.
- **Don't widen `networkAccess.allowedDomains`** without updating both `manifest.json` and `SECURITY.md` — Figma reviewers read both. Currently locked to `api.notion.com`, `dev.azure.com`, `*.visualstudio.com`, `api.anthropic.com`, `api.openai.com`.
- **HTML produced by `composeDescription` is trusted by providers.** If you add another consumer of user-typed prose, run it through the composer (or DOMPurify directly) — don't hand-roll escaping again.
- The manifest `id` (`shipframe-local-dev`) is overwritten by Figma on first publish. Leave it as-is.

## Pre-release QA

Before tagging a release, walk `README.md`'s **Manual QA checklist** against a real Notion workspace + real Azure DevOps org. Automated tests do not cover the Figma sandbox runtime; the checklist is the only thing that does.
