# Publishing checklist

Status: pre-submission. Do these before clicking Publish in Figma.

## 1. Assets (uploaded in the Figma publish dialog, not committed here)

- [ ] **Icon** — 128×128, PNG or SVG. Should read at small sizes.
- [ ] **Cover image** — 1920×1080 PNG/JPG. Shown on the Community listing.
- [ ] **Carousel images** (optional, up to 9) — screenshots of the plugin in use:
  - Settings view (provider radio + PAT)
  - CreateView with a thumbnail filled in
  - LinkedView showing "Open ticket"
  - The ticket as it appears in Notion / Azure DevOps

Drop the final asset files into `assets/` here for version control once made.

## 2. Listing copy (entered in the publish dialog)

- **Name:** Tickets
- **Tagline (~60 chars):** Create Notion & Azure DevOps tickets from any Figma frame.
- **Tags:** workflow, productivity, project management, handoff
- **Description:** see `LISTING.md` (todo — write this when ready)
- **Support contact:** sanjayvk00@gmail.com (or a dedicated support address)

## 3. Manifest verification

- [x] `editorType: ["figma"]` — Figma Design only, not FigJam/Slides.
- [x] `documentAccess: "dynamic-page"` — required for new plugins.
- [x] `networkAccess.allowedDomains` — locked to api.notion.com + dev.azure.com + *.visualstudio.com.
- [x] `networkAccess.reasoning` — explains why network access is needed (reviewers read this).
- [x] `networkAccess.devAllowedDomains` — localhost permitted for development only.
- [ ] `id` — currently `figma-tickets-local-dev`. **Figma assigns the real ID on first publish**, so leave as-is.

## 4. Token-handling disclosure (real review concern)

The plugin stores Personal Access Tokens in `figma.clientStorage` (per-user, per-device, never transmitted off the user's machine except to the provider API directly). Figma reviewers are sensitive to credential handling. Mitigate by:

- [x] Stating it explicitly in the listing description (see `SECURITY.md` for the canonical wording).
- [ ] Optionally: add a one-time consent screen the first time a user enters a token (currently the SettingsView is the consent — fine for v1).
- [ ] **Recommended before publish:** switch Notion to OAuth (Notion has a clean OAuth flow; Azure DevOps OAuth is being deprecated for Entra, so PAT stays for now).

## 5. Pre-submit smoke test (manual QA from README)

Run through every item in the README's "Manual QA checklist" against a real Figma file, real Notion workspace, real Azure DevOps org. Don't skip.

## 6. Submit

1. With the plugin imported locally (Plugins → Development → Tickets), right-click in the plugin menu → **Publish new release…**
2. Walk the dialog: assets → listing copy → support contact → submit.
3. Review turnaround: typically 2–14 days. You can keep pushing local updates to the dev plugin while waiting.

## 7. Post-publish

- Figma assigns a published ID. The dev plugin entry stays separate; you'll have both side-by-side in Plugins → Development.
- Subsequent releases: "Publish new release…" from the published entry.
- Watch the plugin's Community page for reviews; respond to bug reports there or via the support contact.
