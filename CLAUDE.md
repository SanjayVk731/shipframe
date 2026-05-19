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
- **Notion**: Property names are discovered case-insensitively from the database schema (`discoverPropertyNames`) — "Type", "type", and "TYPE" are all matched. Attachment upload is currently a no-op (`supported: false`); the Figma deep link goes in a callout block instead.

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
2. **`justCreatedId`** is set *before* the post-create refresh so the LinkedView shows the "Ticket created" banner on its first render. It clears when `selectedNodeId` changes.

Views (`src/ui/views/`) are presentational; they receive callbacks and `Result<T>` promises from `App.tsx` and render. Don't put fetch logic or sandbox calls inside view components.

### Selection contract — `src/sandbox/selection.ts`

`classifySelection()` returns one of `{kind: 'none' | 'multi' | 'unsupported' | 'single'}`. Supported node types are `FRAME | COMPONENT | COMPONENT_SET | INSTANCE | SECTION`. `exportThumbnail()` caps the longest edge at 2048px (otherwise scales 2×) — keep this when changing export logic, since both providers expect a bounded image size.

`documentAccess: 'dynamic-page'` in the manifest means node lookups in the sandbox **must** use `figma.getNodeByIdAsync()`, not synchronous `getNodeById`. `findNode()` in `main.ts` is the only call site.

## Tests

Vitest + happy-dom + React Testing Library. Two helpers do most of the heavy lifting:

- `tests/helpers/figmaMock.ts` — `installFigmaMock()` returns an in-memory stub of `figma.clientStorage` and `figma.root.{get,set}PluginData`. Call it in `beforeEach` for storage / sandbox tests.
- `tests/helpers/fetchMock.ts` — `installFetch([{ matches, response }])` stubs `globalThis.fetch` with URL-matching rules. Use `jsonResponse(status, body)` for typical JSON replies. Used by every provider test.

Tests mirror `src/` exactly (e.g. `src/providers/notion.ts` → `tests/providers/notion.test.ts`).

## Conventions

- **`strict` + `noUncheckedIndexedAccess`** in `tsconfig.json` — `arr[0]` is `T | undefined`; either narrow or use `!` if you can prove it's safe (e.g. after a `length` check).
- **No external runtime deps** beyond React. The sandbox bundle in particular must stay tiny and dependency-free — adding a library that pulls in Node/DOM polyfills will silently break in QuickJS.
- **Errors from provider calls are normalized, not thrown.** Don't `try/catch` `Result<T>` returns; branch on `.ok`.
- **Don't widen `networkAccess.allowedDomains`** without updating both `manifest.json` and `SECURITY.md` — Figma reviewers read both. Currently locked to `api.notion.com`, `dev.azure.com`, `*.visualstudio.com`.
- The manifest `id` (`shipframe-local-dev`) is overwritten by Figma on first publish. Leave it as-is.

## Pre-release QA

Before tagging a release, walk `README.md`'s **Manual QA checklist** against a real Notion workspace + real Azure DevOps org. Automated tests do not cover the Figma sandbox runtime; the checklist is the only thing that does.
