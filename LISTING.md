# Figma Community listing copy

Paste these into the Figma publish dialog. Variants included where useful.

---

## Name

**Tickets**

(If "Tickets" is taken — common single-word names usually are — fall back to one of:
- **Frame Tickets**
- **Ticket Bridge**
- **Handoff Tickets**)

---

## Tagline (≤60 chars)

Primary:

> **Turn any frame into a Notion or Azure DevOps ticket.**

Alternates:

> Hand off Figma frames as tickets — no copy-paste.

> One-click tickets from Figma to Notion or Azure DevOps.

---

## Short description (first line of listing — keep tight)

> Select a frame. Click Create. The ticket lands in Notion or Azure DevOps with the frame thumbnail, a deep link back, and your form fields filled in.

---

## Full description

```
Stop screenshotting frames into Jira.

Select any frame, component, or section. Open the plugin. Fill in title, description, type, priority, assignee, labels — then hit Create. The ticket is created in Notion or Azure DevOps with the frame's thumbnail attached and a deep link back to the Figma file.

Re-select the same frame later? The plugin shows "Linked to AZURE-1234" with an Open button. No duplicate tickets.

────────────────────

WHAT IT DOES

• Selection-driven — one frame, one ticket. Works on frames, components, instances, and sections.
• Per-file setup — pick provider (Notion or Azure DevOps) and target board/database once per Figma file. Teammates inherit your choice automatically.
• Per-user auth — paste your token once. Stored locally on your machine; teammates use their own.
• Thumbnail attached — exports the frame at up to 2048px and attaches it to the ticket (Azure DevOps) or embeds a Figma deep link (Notion).
• One-way link tracking — selecting a linked frame shows the ticket; click to open it.

────────────────────

WORKS WITH

• Notion — any database the integration has access to. Title, type, priority, assignee, labels are matched to your database's properties (case-insensitive, so "type" or "Type" both work).
• Azure DevOps — any project / team / work item type combo. Title, description (HTML with Figma link), priority, assignee, tags, plus the thumbnail as a real file attachment.

────────────────────

SECURITY & DATA

The plugin stores your provider tokens locally on your machine via Figma's clientStorage API. They are never sent to any server other than the provider's own API (api.notion.com or dev.azure.com). There is no backend.

No telemetry. No analytics. No background polling.

See SECURITY.md in the GitHub repo for the full data-handling breakdown.

────────────────────

SETUP

Notion:
1. Create an Internal Integration at notion.so/profile/integrations.
2. In Notion, share each target database with the integration (Database → ••• → Connections).
3. In the plugin Settings, paste the integration token and pick the database.

Azure DevOps:
1. Create a Personal Access Token at dev.azure.com/{org}/_usersSettings/tokens with Work Items (Read & write) scope.
2. In the plugin Settings, paste the PAT as `org|token` (e.g. myorg|abc123…), then pick the project / team / work item type.

────────────────────

LIMITS (V1)

• One frame per ticket — no batch creation yet.
• One-way only — edits in Notion or Azure DevOps don't sync back to Figma.
• Notion doesn't get image upload yet (the deep-link callout is the visual reference). Azure DevOps gets real attachments.
• Personal Access Tokens only — OAuth on the roadmap for Notion.

────────────────────

FEEDBACK & ISSUES

Built for design teams who hand off work to engineers tracked in Notion or Azure DevOps. Hit a bug or want a feature? Email sanjayvk00@gmail.com or open an issue on GitHub.
```

---

## Tags (pick up to 5)

- workflow
- productivity
- project-management
- handoff
- collaboration

(Avoid "automation" — vague and crowded.)

---

## Support contact

`sanjayvk00@gmail.com`

(Consider creating `tickets-support@<yourdomain>` before publish if you want to keep personal email private.)

---

## Carousel image captions (optional, max 9 images)

If you make screenshot/carousel images, here are caption suggestions:

1. **Settings** — "Pick a provider, paste a token, choose your destination board. Once per file."
2. **CreateView with thumbnail** — "Frame name prefills the title. The thumbnail goes on the ticket."
3. **LinkedView** — "Re-select a linked frame? Open the ticket in one click."
4. **Ticket in Notion** — "The ticket as it lands in Notion — Figma link in a callout block at the top."
5. **Ticket in Azure DevOps** — "Work item created, thumbnail attached, Figma deep link in the description."
6. **Empty state** — "Select a single frame, component, or section. The plugin tells you when it can't help."

---

## Notes on phrasing choices

- **"Stop screenshotting frames into Jira"** as the opener — Jira is the dominant mental model even though we support Notion + Azure DevOps. Naming the pain (screenshots → tickets) is more concrete than naming the product category.
- **Lead with the workflow, not the tech stack** — "Select a frame. Click Create." is the whole pitch.
- **The security paragraph is intentionally upfront** — Figma reviewers and security-conscious users both look for it. Better to disclose proactively than have it surface as a question.
- **The "Limits (v1)" section** — most plugin listings hide limitations. Putting them in writing builds trust and pre-empts negative reviews from people expecting batch mode or two-way sync.
- **No emoji, no exclamation points, no "supercharge your handoff workflow"** — designer audience reads through hype quickly.

---

## Meta / SEO (for the Community page slug + search)

Figma Community auto-generates the URL slug from the plugin name. No manual control. Search ranking inside the Community is driven by name + description, so the description's first 200 characters matter most — that's what shows in search results.

Keywords to weave in naturally (already in the copy above):
- frame to ticket, figma to notion, figma to azure devops, design handoff, ticket from frame, design ops
