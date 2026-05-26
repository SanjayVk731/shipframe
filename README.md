# Shipframe

Create Azure DevOps work items from a selected frame in Figma.

[![CI](https://github.com/SanjayVk731/shipframe/actions/workflows/ci.yml/badge.svg)](https://github.com/SanjayVk731/shipframe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Develop

```bash
npm install
npm run dev          # rebuilds dist/ on change
```

In Figma desktop: Plugins → Development → Import plugin from manifest → pick `manifest.json`.

## Build

```bash
npm run build
```

## Test

```bash
npm test
npm run typecheck
```

## Azure DevOps setup

1. Create a Personal Access Token at https://dev.azure.com/{org}/_usersSettings/tokens with **Work Items (Read & write)** scope.
2. In the plugin Settings, paste the PAT in the format `org|token` (e.g. `myorg|abc123...`).
3. Pick the **project / work item type** combo. Work item types are the defaults across Agile/Scrum/Basic templates: Bug, Task, User Story, Feature, Epic. (Team is not required — work items are created at the project root.)

> A Notion provider lives in `src/providers/notion.ts` but is not wired into the published UI or the manifest's allowed network hosts. See the architecture section below.

## Manual QA checklist before release

- [ ] Azure: Settings with `org|pat` → see project/team/type combos → save.
- [ ] Azure: Create ticket → work item created with description, thumbnail attached, Figma link in description.
- [ ] Azure: Create ticket → confirm the frame screenshot is **embedded inline** at the top of the work item Description (an `<img>`, not just an attachment), and renders.
- [ ] Azure: Bad PAT → SettingsView shows "Your token isn't working".
- [ ] Multi-select two frames → "Select a single frame or section" empty state.
- [ ] Non-frame (text node) → empty state.
- [ ] Frame larger than 2048px → ticket still created (thumbnail downscaled).
- [ ] **Auto-pin sanity:** Create a ticket on a frame → confirm a numbered annotation appears on the frame and is visible in Figma's Annotations panel; clicking it opens the correct ticket. Re-select the same frame: no duplicate pin. Manually delete the pin and reopen the plugin on the same frame: pin is recreated.
- [ ] **AI Draft → pin sanity:** With an Anthropic (or OpenAI) key configured in Settings and a frame that has at least one native annotation or text layer, click ✨ AI Draft → pin → confirm (a) the form pre-fills coherently for the chosen WIT (Bug shows reproSteps/expected/actual; User Story shows acceptanceCriteria/outOfScope), and (b) a rich annotation pin appears on the frame in Figma with the AI-written summary. Unconfigure the key in Settings → the Draft button disappears.
- [ ] **Vision capture:** Draft a frame whose key text lives inside an icon/vector or a rasterized image (not a `TEXT` layer). Confirm the draft reflects that text — proving the screenshot, not just the layer tree, was read. Repeat across Anthropic, OpenAI, and Azure OpenAI (each must use a vision-capable model/deployment).
- [ ] **Publish flow:** After AI Draft → pin, the submit button reads **Publish** (not "Create ticket"). Edit the pin text in Figma, then Publish → the **ticket body** matches the form (not the edited pin), and the pin on the canvas keeps its edited text with `— AZURE-<id>` / `— Notion #<short>` appended on a new line. (Form and pin diverge intentionally.)
- [ ] **Discard draft pin:** After AI Draft → pin, click "Discard draft pin" → the pin disappears from the frame and the form keeps its values; the submit button reverts to "Create ticket".
- [ ] **Manual create still pins:** Without using AI Draft, fill the form and Create → a short-label pin (`AZURE-<id>` / `Notion · … · #<hex>`) still appears on the frame (regression check).
- [ ] **SECTION node:** Select a SECTION → the manual Create flow still works, but pin operations are skipped silently (sections don't support annotations) — confirm no error banner.
- [ ] **Oversized frame (>5 MB PNG):** Confirm the "too large to attach" banner appears, the ticket still creates with the Figma link, and no inline image is embedded.
- [ ] **Inline upload failure (best-effort check):** If a frame's screenshot upload to the tracker fails, confirm the ticket is still created with a plain description + Figma link (the image is silently dropped — no inline image, but no spurious "thumbnail couldn't be attached" warning on the inlined path).
- [ ] **AI Draft — Azure OpenAI:** In Settings pick Azure OpenAI, paste a deployment endpoint URL (`https://<tenant>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21`) and the api-key → save. Confirm validation warnings appear for non-Azure hosts and for endpoints missing `?api-version=…`. Click ✨ Draft on an annotated frame → form pre-fills. Switch provider back to Off → `ai:endpoint` is cleared alongside provider+key.

### Notion (not in published listing, run before any re-list)

- [ ] Notion: Settings → enter PAT → see databases → pick → save.
- [ ] Notion: Create ticket → page appears in Notion with Figma link callout.
- [ ] Notion: Create ticket → confirm the frame screenshot appears as an **image block** on the page (uploaded via Notion's File Upload API, not a broken/external link).
- [ ] Notion: Re-select the same frame → LinkedView with Open link.
- [ ] Notion: Unlink → frame goes back to CreateView; Notion page still exists.
- [ ] Notion integration without any shared databases → help text in Settings.

## Architecture

See `docs/superpowers/specs/2026-05-19-figma-tickets-plugin-design.md` (in the parent DesignerUX repo) for the full design spec, or the inline structure:

- `src/sandbox/` — runs in the Figma plugin sandbox. Selection, thumbnail export, node pluginData.
- `src/ui/` — React iframe. Settings / Create / Linked views.
- `src/providers/` — pluggable ticket providers (Notion, Azure DevOps).
- `src/storage/` — wrappers around `clientStorage` (PATs) and `root.pluginData` (file config).
- `src/messages/` — typed sandbox ↔ UI protocol.
- `src/shared/` — shared types.
