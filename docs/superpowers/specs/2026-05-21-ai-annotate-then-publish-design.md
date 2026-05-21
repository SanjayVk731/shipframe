# AI Annotate-then-Publish + Vision + Inline Images

Status: Draft
Date: 2026-05-21
Owner: @DrLector666

## Problem

Today's flow is one-shot: user clicks **AI Draft**, the LLM reads text layers + native annotations, the form prefills, user clicks Create. After create, a short ticket-id pin (`AZURE-123` or `Notion · title · #abc`) is dropped on the frame.

Three concrete failures:

1. **Text capture is unreliable.** Text-layer crawling misses any text rendered as a vector, baked into an icon component, or rasterized inside an image fill. The LLM sees an incomplete picture and produces incomplete tickets.
2. **Pins don't get placed at all.** Production reports say the post-create annotation never appears on the frame. Root cause (confirmed by reading `src/sandbox/annotations.ts:91` against the Figma `Annotation` typing at `node_modules/@figma/plugin-typings/plugin-api.d.ts:8073`): we write `categoryId: 'azure'` / `categoryId: 'notion'`, which are not real Figma category IDs. The runtime silently rejects the assignment.
3. **No image in the ticket body.** The frame thumbnail is attached as a file, but it's not embedded inline in the description, so reviewers have to open an attachment to see what the ticket is about.

## Goals

- AI Draft *writes the spec onto the canvas* before publish, where the designer can read and edit it in Figma.
- LLM sees a screenshot of the frame, not just text.
- Ticket descriptions embed the frame screenshot inline (Notion image block / Azure `<img>`), uploaded via the existing provider attachment plumbing — no new hosts.
- Post-publish, the single pin on the frame shows both the AI-written spec and the ticket ID.

## Non-goals

- Per-element pins (multiple annotations per frame). Out of scope; one pin per frame.
- AI-generated cropped screenshots per annotation. Out of scope.
- Auto-publish (no human review). Always two clicks: AI Draft → pin, then Publish.
- A new vision-only provider. Reuse existing Anthropic / OpenAI / Azure OpenAI / Ollama with image content in the message payload.
- Telemetry. No new logging or analytics.
- Widening `manifest.json` `networkAccess.allowedDomains`. All four AI hosts plus the two provider hosts are already whitelisted.

## User flow

1. User selects an unlinked, supported frame.
2. CreateView shows the empty form and the button **AI Draft → pin** (replaces the current "AI Draft" button when AI is configured).
3. User clicks **AI Draft → pin**. Plugin:
   1. Exports the frame PNG (reuses `selection.exportThumbnail`; respects 2048px / 5MB caps).
   2. Downscales to 1024px max edge for the LLM (`downscaleForVision`).
   3. Sends the screenshot + the existing `FrameContext` (text layers, native annotations, frame name, WIT) to the configured AI provider.
   4. Parses the JSON response. New key `pinMarkdown` is a 1–3 line markdown summary of the work, ≤280 chars.
   5. Writes `pinMarkdown` to the frame's `annotations` as `labelMarkdown`, and sets `node.pluginData['aiDraftPin'] = '1'`.
   6. Prefills the form with the structured fields (same WIT-aware mapping as today).
   7. Shows inline banner: *"Draft pin added to frame. Edit it in Figma if you'd like, then publish."* (or an error banner if pin write failed).
4. User reviews. They can:
   - Edit the form (canonical for what gets published).
   - Edit the pin text in Figma (canonical for what shows on the canvas after publish). The two are deliberately decoupled — see *Trade-offs* below.
   - Click **Discard draft pin** to remove the pin + `pluginData` flag without losing the form.
5. User clicks **Publish**. Plugin:
   1. Creates the ticket via the provider, with the frame PNG passed as `TicketInput.inlineImage`. Provider uploads the image via its native attachment endpoint and inlines it in the description body.
   2. Writes `node.pluginData('ticketLink')` as today.
   3. Sends `append-ticket-id-to-annotation`: reads the current pin's `labelMarkdown`, appends `\n— AZURE-<id>` or `\n— Notion #<short>`, writes back, clears the `aiDraftPin` flag.
6. LinkedView appears as today.

Manual-create path (AI not configured, or user skips AI Draft) is unchanged. Manual creates still get the short-label pin via the existing `sync-annotation` path.

## Architecture changes

### Sandbox

**`src/sandbox/annotations.ts`**

- Remove the fake `categoryId` from the write. `Annotation.categoryId` is optional; we leave it unset. This alone fixes the "pins don't get placed" bug.
- Replace `isOursLabel` with two helpers:
  - `isOursPostPublish(label)`: regex `/\n— (AZURE-\d+|Notion #[0-9a-f]{8})$/` on the last line.
  - `isOurs(node, label)`: returns true if `isOursPostPublish(label)` *or* `node.getPluginData('aiDraftPin') === '1'`. Used to identify ours-pins for replace/delete.
- New `writeAiAnnotation(nodeId, markdown)`: preserves manual non-ours annotations, replaces any existing ours-pin with `{ labelMarkdown: markdown }`, sets `pluginData['aiDraftPin'] = '1'`. Returns `SyncResult`.
- New `appendTicketIdToAnnotation(nodeId, providerId, ticketId)`: reads the current ours-pin, computes the suffix (`AZURE-<id>` or `Notion #<8-hex>` derived as today via end-of-uuid), appends `\n— <suffix>` to its `labelMarkdown`, clears `pluginData['aiDraftPin']`. If no ours-pin exists, creates one whose entire label is `<suffix>` (self-heal path: designer deleted the draft pin before publishing).
- New `clearAiAnnotation(nodeId)`: removes any ours-pin and clears the `aiDraftPin` flag. Used by the "Discard draft pin" UI action.
- The existing `syncAnnotation(nodeId, BuildLabelInput)` and `clearAnnotation(nodeId)` stay. They serve the manual-create path and the post-publish reconcile-on-select path. Internally they use the new `isOurs` helper for ownership detection.

**`src/sandbox/selection.ts`**

- `classifySelection`'s `single` variant gains `hasDraftPin: boolean`, set from `node.getPluginData('aiDraftPin') === '1'`. Cheap pluginData read; same trip.

**`src/sandbox/main.ts`**

- Three new switch cases mirroring three new messages: `write-ai-annotation`, `append-ticket-id-to-annotation`, `clear-ai-annotation`. Exhaustiveness check (`_exhaustive: never`) enforces handling.

### Messages

**`src/messages/protocol.ts`**

New UI → sandbox:

```ts
| { type: 'write-ai-annotation'; nodeId: string; markdown: string; requestId: string }
| { type: 'append-ticket-id-to-annotation'; nodeId: string; providerId: ProviderId; ticketId: string; requestId: string }
| { type: 'clear-ai-annotation'; nodeId: string; requestId: string }
```

All three reply `ack` on success or `error` with a `SyncReason`. No new sandbox → UI message types; existing `ack` / `error` envelopes cover them.

`UI_TYPES` set gains the three literals. `useSandbox` needs no changes — it's tag-agnostic.

### Shared types

**`src/shared/types.ts`**

- `SelectionState`'s `single` variant gains `hasDraftPin: boolean`.
- `TicketInput` gains `inlineImage?: { bytes: Uint8Array; filename: string }`.

### Providers

**`src/providers/azureDevops.ts`**

- `createTicket` extension: if `input.inlineImage` is present, call `uploadAttachment` *before* the work-item POST. Use the returned `url` to prepend an `<img src="<url>" alt="Frame screenshot"/>` block to `System.Description` *after* the composer has run (so the composer's DOMPurify pass doesn't strip it — see DOMPurify carve-out below).
- Existing field routing (Description / AcceptanceCriteria / ReproSteps / Figma hyperlink relation) unchanged.

**`src/providers/notion.ts`**

- `createTicket` extension: if `input.inlineImage` is present, after creating the page, append a Notion `image` block whose `external` URL is the Notion file-upload URL. Notion's file_upload API is currently a no-op in our code (`uploadAttachment` returns `supported: false`) — this work makes it supported for inline images only. Page-attachment proper stays out of scope.
- If file upload fails, the page is still created and the existing Figma callout block stays. Logged as `attachmentFailedId` per existing pattern.

### Composer

**`src/ui/composeDescription.ts`**

- DOMPurify config: add `img` to `ALLOWED_TAGS`, add `src` and `alt` to `ALLOWED_ATTR`. `FORBID_TAGS` continues to forbid `script`, `style`, `iframe`.
- The composer still does not construct the `<img>` itself. The provider builds the `<img>` tag from the upload URL, then runs the final assembled description through DOMPurify one last time (defense in depth — strips `<img onerror>`, `<img onload>`, javascript: URLs, etc.).

### AI Draft

**`src/ui/ai/types.ts`**

- `DraftOutput` gains `pinMarkdown?: string`.
- `DRAFT_KEYS` gains `'pinMarkdown'`.

**`src/ui/ai/prompt.ts`**

- System prompt gains: *"You will receive a screenshot of the frame. Use it as the primary signal for what's on screen; the text-layer list is incomplete (icons, vectors, and rasterized text won't appear there)."*
- System prompt gains: *"`pinMarkdown` is a 1–3 line markdown summary placed as a Figma annotation visible on the canvas. Keep it under 280 characters."*

**`src/ui/ai/parseResponse.ts`**

- `pinMarkdown` is preserved for all WITs (it's not gated by `sectionSetFor`).
- If `pinMarkdown` is longer than 280 chars, truncate at 279 + `…`.
- If `pinMarkdown` is missing, the orchestrator synthesizes one client-side from `title` + first line of `main`, truncated.

**`src/ui/ai/anthropic.ts`** — message content becomes `[{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: <b64> }}, { type: 'text', text: userPrompt }]`. Header `anthropic-dangerous-direct-browser-access: true` already present.

**`src/ui/ai/openai.ts`** — message content becomes `[{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } }]`.

**`src/ui/ai/azureOpenAI.ts`** — same shape as OpenAI. Failure when the deployment isn't vision-capable surfaces through the existing normalizer.

**`src/ui/ai/ollama.ts`** — `images: [<b64>]` as a sibling of `content` (Ollama-specific shape). Users running text-only models get the existing malformed-JSON retry → `unknown` path.

**`src/ui/ai/draft.ts`** — `draftFromContext` signature gains `imageBytes: Uint8Array` parameter, passed to whichever adapter is selected. Calls `downscaleForVision` once before dispatch.

**New `src/ui/ai/downscale.ts`** — takes `Uint8Array` PNG bytes, returns a `Uint8Array` of the rescaled PNG with longest edge ≤1024px, using `OffscreenCanvas` (DOM-available in the UI iframe). Hardcoded threshold; not user-tunable.

### UI

**`src/ui/App.tsx`**

- The post-create `sync-annotation` call (line 274) stays for the manual-create path, but is skipped when `hasDraftPin` was true — in that case the new `append-ticket-id-to-annotation` runs instead.
- The reconcile-on-select effect (line 130) keeps using `sync-annotation`. `syncAnnotation`'s contract changes: if `OURS_TAIL_RE` already matches an existing pin label, it's a no-op (preserves the AI body). It only replaces the pin when there is no ours-pin at all (self-heal after the designer deleted it). This avoids clobbering suffix-form labels on reselect.
- `onCreate` is renamed `onPublish` (still wired the same way, just clearer at the call site). Threads `inlineImage` into the `TicketInput` when a thumbnail is available.

**`src/ui/views/CreateView.tsx`**

- "AI Draft" button label → "AI Draft → pin". Same gating (AI configured, supported selection).
- After draft success: dispatches `write-ai-annotation`, shows the result banner, prefills the form.
- "Discard draft pin" link button: appears when `selection.hasDraftPin === true`; calls `clear-ai-annotation`; preserves form state.
- Primary submit label: "Create" when `!hasDraftPin`, "Publish" when `hasDraftPin`. Same handler.
- New inline note below the form: *"Frame screenshot will be embedded in the ticket description."* — replaced by the existing oversized warning when the export overflowed 5MB.

**`src/ui/views/LinkedView.tsx`**

- No structural changes.
- `pinFailed` banner copy updates to clarify that the *draft pin remains on the frame* but the ticket-ID append failed — covers the new failure mode.

## Data shape and ownership

### Pin label format

Pre-publish (draft pin):

```
<AI-written summary, markdown>
```

`pluginData['aiDraftPin'] === '1'` is the ownership marker.

Post-publish:

```
<AI-written summary, markdown>

— AZURE-12345
```

or

```
<AI-written summary, markdown>

— Notion #a1b2c3d4
```

`pluginData['aiDraftPin']` is cleared. The suffix on the final line is the ownership marker. The em-dash + space + provider tag is the single canonical pattern; `OURS_SUFFIX_RE` is the only place this is parsed.

Manual-create pins (no AI Draft) keep the today format: bare `AZURE-12345` or `Notion · title · #abc`. The ownership regex matches both forms — manual labels are one-line (so the whole label is the last line); AI-Draft labels are multi-line with the suffix on the last line:

```ts
const OURS_TAIL_RE = /(?:^|\n)(— )?(AZURE-\d+|Notion (?:· .+ · )?#[0-9a-f]{8})$/
```

That regex is the single source of truth for pin ownership.

### TicketLink

`TicketLink` (in `node.pluginData['ticketLink']`) is unchanged. It remains the canonical "is this frame linked?" signal — pin labels are display + canvas search, not authority.

## Trade-offs and deliberate choices

**Pin text vs form state diverge after AI Draft.** Once the AI runs, the pin and the form hold the same content. If the user edits the pin in Figma, the form isn't updated; if they edit the form, the pin isn't updated. At publish time, the **form** is what gets sent to the provider; the **pin** is what remains visible on the canvas (with the ticket ID appended). This is deliberate — bidirectional sync is expensive (extra round trips, conflict resolution) and the failure mode is benign (designer sees a slightly different summary on the canvas than in the ticket). The README QA item must call this out so users aren't surprised.

**One pin per frame, even rich.** No per-element pins. If a frame has multiple discrete issues, the AI summarises them into one block of markdown. Per-element pins are deferrable to a future iteration.

**Single ownership regex.** All pin ownership detection lives in one regex in `annotations.ts`. The pluginData flag is a secondary signal used only between draft and publish. Two signals because there's a real intermediate state to represent.

**Vision request size.** 1024px max edge, base64-encoded. Anthropic charges per image; OpenAI charges per "tile" of the image. We don't expose model selection beyond what already exists in settings. Users who want lower cost can switch model in Settings or skip AI Draft.

**No new networkAccess domains.** Provider attachment endpoints (Notion file_upload, Azure dev.azure.com attachments) are already covered by the existing whitelist. AI hosts unchanged.

## Errors and observability

All new paths return existing `Result<T>` shapes. Failure modes and surfaces:

- **`write-ai-annotation` fails** (e.g. `unsupported-node` for SECTION): banner *"Couldn't add pin to frame: <reason>. You can still publish."* Form prefill still completes from the AI response.
- **LLM call fails**: existing CreateView error UI; no pin is written, no form prefill.
- **`pinMarkdown` malformed or missing**: synthesize client-side fallback; pin still gets written. The retry-once mechanism (`draft.ts`) is unchanged for the broader JSON-malformed case.
- **Image upload fails on publish** (Notion file_upload or Azure attachment): ticket is still created with the existing Figma callout / Figma hyperlink-relation. `attachmentFailedId` shows the existing "thumbnail couldn't be attached" warning.
- **`append-ticket-id-to-annotation` fails**: ticket exists, pluginData ticketLink is written, but the pin is missing the ID suffix. `pinFailedId` shows a copy-updated warning. The reconcile-on-select effect self-heals on the next selection.

No new telemetry. Console warns mirror today's `console.warn('figma-tickets: …')` pattern.

## Security

`SECURITY.md` gains two bullets:

1. AI Draft now sends a frame **screenshot** to the configured AI provider, in addition to text layers and annotations. The screenshot is downscaled to 1024px max edge and base64-encoded in the request body. Sent only on explicit AI Draft button click.
2. On Publish, the frame screenshot is uploaded to the user's Notion workspace or Azure DevOps project as an attachment, and embedded inline in the ticket description body. Same destination as the existing per-ticket attachment.

`manifest.json` `networkAccess.allowedDomains` is unchanged.

DOMPurify's new `img` allowance is scoped to `src` and `alt` attributes — no event handlers, no inline styles. The final assembled description runs through DOMPurify one more time after `<img>` insertion (defense in depth).

## Testing

Vitest, mirroring `src/`:

- **`tests/sandbox/annotations.test.ts`** — extended:
  - The written annotation entry has no `categoryId` key (regression).
  - `isOursTail` matches both manual labels and suffix-style labels.
  - `writeAiAnnotation` sets the pluginData flag and preserves manual non-ours annotations.
  - `appendTicketIdToAnnotation` adds the suffix on a new line and clears the pluginData flag.
  - `clearAiAnnotation` removes ours-pins and clears the flag.
  - `appendTicketIdToAnnotation` self-heals when no draft pin exists (creates a suffix-only pin).
- **`tests/ui/ai/prompt.test.ts`** — `DRAFT_KEYS` contains `pinMarkdown`; system prompt mentions the screenshot signal.
- **`tests/ui/ai/parseResponse.test.ts`** — `pinMarkdown` truncated at 280 chars; missing `pinMarkdown` does not fail parsing.
- **`tests/ui/ai/anthropic.test.ts` / `openai.test.ts` / `azureOpenAI.test.ts` / `ollama.test.ts`** — each existing fetch-mock test extended to assert the request body carries image content in the provider-specific shape.
- **`tests/ui/ai/draft.test.ts`** — orchestrator passes image bytes through; client-side `pinMarkdown` fallback exercised when LLM omits it.
- **`tests/ui/ai/downscale.test.ts`** — new. Verifies a 2048-px input produces a ≤1024-px output (uses `happy-dom`'s OffscreenCanvas if available; otherwise skipped with a note).
- **`tests/providers/azureDevops.test.ts`** — `createTicket` with `inlineImage` uploads then prepends an `<img>` to Description. Malicious `<img onerror>` is stripped by the final DOMPurify pass.
- **`tests/providers/notion.test.ts`** — `createTicket` with `inlineImage` uploads, then appends a Notion `image` block referencing the upload URL.
- **`tests/ui/composeDescription.test.ts`** — `<img src="…" alt="…"/>` survives DOMPurify; `<img onerror="alert(1)">` is stripped.

`tests/helpers/figmaMock.ts` gains a settable `annotations` array per scene node and `getPluginData` / `setPluginData` for the `aiDraftPin` key (already partially present for `ticketLink`).

## Manual QA (added to README)

- AI Draft → pin: pin appears on the frame with the AI-written summary; form prefills.
- Edit the pin text in Figma, then Publish: ticket gets the form's content (not the edited pin). The pin on the canvas keeps the edited text + appended ticket ID.
- Discard draft pin: pin disappears, form state preserved.
- Publish manually without AI Draft: short-label pin still placed (regression).
- Each of anthropic / openai / azure-openai / ollama vision-capable models successfully drafts with image content.
- SECTION node selected: AI Draft → pin button is gated off; existing behavior.
- Oversized frame (>5 MB after thumbnail export): AI Draft still works (no pin write attempted because thumbnail is null — verify gating); Publish proceeds without inline image, ticket gets Figma callout / hyperlink relation only.

## Rollout

Single PR. No feature flag. The `categoryId` removal is a bug fix that wants to ship regardless; the new flow is gated behind "user clicks AI Draft → pin" + "user has AI configured", so manual-create users see no behavior change.

## Open questions

None at spec-time. Specific implementation questions (e.g. exact Notion file_upload endpoint shape, exact OpenAI tile-size cost calculation) will be resolved in the implementation plan, not here.
