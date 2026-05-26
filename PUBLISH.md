# Publishing checklist

Status: pre-submission. Do these before clicking Publish in Figma.

The published plugin is **Azure DevOps only**. The Notion provider exists in the
code but is opt-in and not in the manifest's allowed domains — keep it out of
the listing and assets.

## 1. Assets (uploaded in the Figma publish dialog, not committed here)

- [ ] **Icon** — 128×128, PNG or SVG. Should read at small sizes.
- [ ] **Cover image** — 1920×1080 PNG/JPG. Shown on the Community listing.
- [ ] **Carousel images** (optional, up to 9) — screenshots of the plugin in use:
  - Settings view (Azure PAT + optional AI key)
  - AI Draft → pin (the spec annotation on the frame)
  - CreateView with the form prefilled
  - LinkedView showing "Open ticket"
  - The work item in Azure DevOps with the inline frame screenshot

Drop the final asset files into `assets/` here for version control once made.

## 2. Listing copy (entered in the publish dialog)

- **Name:** Shipframe
- **Tagline (~60 chars):** Turn any frame into an Azure DevOps work item.
- **Tags:** workflow, productivity, project-management, handoff, collaboration
- **Description:** see `LISTING.md`
- **Support contact:** sanjayvk00@gmail.com (or a dedicated support address)

## 3. Manifest verification

- [x] `editorType: ["figma"]` — Figma Design only, not FigJam/Slides.
- [x] `documentAccess: "dynamic-page"` — required for new plugins.
- [x] `networkAccess.allowedDomains` — Azure DevOps + the three AI hosts only:
      dev.azure.com, *.visualstudio.com, api.anthropic.com, api.openai.com,
      *.openai.azure.com. (No api.notion.com — Notion is opt-in.)
- [x] `networkAccess.reasoning` — accurately discloses that AI Draft sends a
      downscaled frame screenshot to the LLM and uploads it to the user's Azure
      org for the inline embed. Reviewers read this — keep it truthful.
- [ ] `id` — currently `shipframe-local-dev`. **Figma assigns the real ID on
      first publish**, so leave as-is.

## 4. Data-handling disclosure (real review concerns)

Two things reviewers are sensitive to — both disclosed in the listing + SECURITY.md:

- **Credential handling.** The Azure DevOps PAT is stored in `figma.clientStorage`
  (per-user, per-device, never transmitted off the machine except to Azure DevOps
  directly). The AI key (optional) is stored the same way.
- **Image data sent off-machine.** With AI Draft on and "Include image" enabled,
  a downscaled screenshot of the selected frame is sent to the user's chosen LLM
  provider, and the full screenshot is uploaded to the user's own Azure org for
  the inline ticket embed. No third-party image hosts. This is stated in the
  manifest reasoning, the listing's SECURITY section, and SECURITY.md.

Mitigations in place:
- [x] Stated explicitly in the listing description and SECURITY.md.
- [x] AI Draft is opt-in and off by default; nothing reaches an LLM until the
      user configures a key and clicks Draft.
- [x] "Include image" can be turned off per draft for a text-only request.

## 5. Pre-submit smoke test (manual QA from README)

Run through every item in the README's "Manual QA checklist" against a real
Figma file and a real Azure DevOps org. Don't skip — automated tests do not
cover the Figma sandbox runtime or live API calls. Pay special attention to:
- AI Draft → pin on an image-only frame (vision path).
- The inline screenshot actually rendering in the Azure work item.
- AI config persisting across a plugin reload.

## 6. Submit

1. With the plugin imported locally (Plugins → Development → Shipframe),
   right-click in the plugin menu → **Publish new release…**
2. Walk the dialog: assets → listing copy → support contact → submit.
3. Review turnaround: typically 2–14 days. You can keep pushing local updates to
   the dev plugin while waiting.

## 7. Post-publish

- Figma assigns a published ID. The dev plugin entry stays separate; you'll have
  both side-by-side in Plugins → Development.
- Subsequent releases: "Publish new release…" from the published entry.
- Watch the plugin's Community page for reviews; respond to bug reports there or
  via the support contact.
