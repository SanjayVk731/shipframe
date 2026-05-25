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

> A Notion provider also exists in the codebase but is not part of the published listing. See `src/providers/notion.ts` and the architecture section below.

## Manual QA checklist before release

- [ ] Azure: Settings with `org|pat` → see project/team/type combos → save.
- [ ] Azure: Create ticket → work item created with description, thumbnail attached, Figma link in description.
- [ ] Azure: Bad PAT → SettingsView shows "Your token isn't working".
- [ ] Multi-select two frames → "Select a single frame or section" empty state.
- [ ] Non-frame (text node) → empty state.
- [ ] Frame larger than 2048px → ticket still created (thumbnail downscaled).
- [ ] **Auto-pin sanity:** Create a ticket on a frame → confirm a numbered annotation appears on the frame and is visible in Figma's Annotations panel; clicking it opens the correct ticket. Re-select the same frame: no duplicate pin. Manually delete the pin and reopen the plugin on the same frame: pin is recreated.
- [ ] **AI Draft sanity:** With an Anthropic (or OpenAI) key configured in Settings and a frame that has at least one native annotation, click ✨ Draft → confirm the form pre-fills coherently for the chosen WIT (Bug shows reproSteps/expected/actual; User Story shows acceptanceCriteria/outOfScope). Edit and Create the ticket; confirm it lands as expected. Unconfigure the key in Settings → the Draft button disappears.
- [ ] **AI Draft — Azure OpenAI:** In Settings pick Azure OpenAI, paste a deployment endpoint URL (`https://<tenant>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21`) and the api-key → save. Confirm validation warnings appear for non-Azure hosts and for endpoints missing `?api-version=…`. Click ✨ Draft on an annotated frame → form pre-fills. Switch provider back to Off → `ai:endpoint` is cleared alongside provider+key.

### Notion (not in published listing, run before any re-list)

- [ ] Notion: Settings → enter PAT → see databases → pick → save.
- [ ] Notion: Create ticket → page appears in Notion with Figma link callout.
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
