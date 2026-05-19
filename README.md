# Figma Tickets

Create Notion or Azure DevOps tickets from a selected frame in Figma.

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

## Provider setup

### Notion
1. Create an Internal Integration at https://www.notion.so/profile/integrations and copy the token.
2. In Notion, open each database you want to file tickets to → ••• → Connections → add the integration.
3. In the plugin Settings, paste the token and pick the database.

### Azure DevOps
1. Create a Personal Access Token at https://dev.azure.com/{org}/_usersSettings/tokens with **Work Items (Read & write)** scope.
2. In the plugin Settings, paste the PAT in the format `org|token` (e.g. `myorg|abc123...`).
3. Pick the **project / work item type** combo. Work item types are the defaults across Agile/Scrum/Basic templates: Bug, Task, User Story, Feature, Epic. (Team is not required — work items are created at the project root.)

## Manual QA checklist before release

- [ ] Notion: Settings → enter PAT → see databases → pick → save.
- [ ] Notion: Create ticket → page appears in Notion with Figma link callout.
- [ ] Notion: Re-select the same frame → LinkedView with Open link.
- [ ] Notion: Unlink → frame goes back to CreateView; Notion page still exists.
- [ ] Azure: Settings with `org|pat` → see project/team/type combos → save.
- [ ] Azure: Create ticket → work item created with description, thumbnail attached, Figma link in description.
- [ ] Azure: Bad PAT → SettingsView shows "Your token isn't working".
- [ ] Multi-select two frames → "Select a single frame or section" empty state.
- [ ] Non-frame (text node) → empty state.
- [ ] Frame larger than 2048px → ticket still created (thumbnail downscaled).
- [ ] Notion integration without any shared databases → help text in Settings.

## Architecture

See `docs/superpowers/specs/2026-05-19-figma-tickets-plugin-design.md` (in the parent DesignerUX repo) for the full design spec, or the inline structure:

- `src/sandbox/` — runs in the Figma plugin sandbox. Selection, thumbnail export, node pluginData.
- `src/ui/` — React iframe. Settings / Create / Linked views.
- `src/providers/` — pluggable ticket providers (Notion, Azure DevOps).
- `src/storage/` — wrappers around `clientStorage` (PATs) and `root.pluginData` (file config).
- `src/messages/` — typed sandbox ↔ UI protocol.
- `src/shared/` — shared types.
