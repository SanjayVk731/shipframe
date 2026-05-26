# Figma Community listing copy

Paste these into the Figma publish dialog. Variants included where useful.

The published plugin targets **Azure DevOps**. A Notion provider exists in the
code but is opt-in (not wired into the manifest's allowed domains), so it is
**not** mentioned in the listing — keep the copy Azure-only to match what users
actually get out of the box.

---

## Name

**Shipframe**

---

## Tagline (≤60 chars)

Primary:

> **Turn any frame into an Azure DevOps work item.**

Alternates:

> AI-drafted Azure DevOps tickets, straight from Figma.

> Frame to work item — with the screenshot and an AI draft.

---

## Short description (first line of listing — keep tight)

> Select a frame. Shipframe drafts the ticket with AI (it reads the screenshot), drops a spec pin on the canvas, and creates the Azure DevOps work item with the frame embedded inline and a deep link back.

---

## Full description

```
Stop screenshotting frames into your tracker by hand.

Select any frame, component, or section. Let AI draft the ticket — it sees a screenshot of the frame, so it picks up text baked into icons, vectors, and images, not just editable text layers. Review and edit, then publish. The Azure DevOps work item is created with the frame screenshot embedded right in the description and a deep link back to the Figma node.

Re-select the same frame later? Shipframe shows "Linked to AZURE-1234" with an Open button. No duplicate tickets.

────────────────────

WHAT IT DOES

• Selection-driven — one frame, one work item. Works on frames, components, instances, and sections.
• AI Draft → pin (optional, bring your own key) — drafts title, description, and the right fields for the work item type (Bug → repro/expected/actual; User Story/Feature → acceptance criteria + out of scope). Writes a readable spec annotation onto the frame in Figma; on Publish the ticket ID is appended to it.
• Vision — sends a downscaled screenshot of the frame to your chosen model so it reads what's actually on screen. Toggle "Include image" off any time for a text-only, lower-cost draft.
• Inline screenshot — the frame image is embedded in the work item description (not just attached), so reviewers see the design without opening anything.
• Auto-pin tracking — selecting a linked frame shows the ticket; click to open it.
• Per-file setup — pick your Azure DevOps project / work item type once per Figma file. Teammates inherit the choice.
• Per-user auth — paste your PAT once. Stored locally on your machine; teammates use their own.

────────────────────

WORKS WITH

• Azure DevOps — any project / work item type combo (Bug, Task, User Story, Feature, Epic). Title, description (HTML with the inline frame screenshot + Figma link), acceptance criteria, repro steps, priority, assignee, and tags.
• AI Draft (optional) — bring your own key for Anthropic, OpenAI, or Azure OpenAI (your own tenant). Off by default; nothing is sent to any LLM until you enable it and click Draft.

────────────────────

SECURITY & DATA

Your Azure DevOps Personal Access Token is stored locally on your machine via Figma's clientStorage API. It is never sent to any server other than Azure DevOps (dev.azure.com or *.visualstudio.com). There is no backend.

AI Draft is opt-in. When you use it, the plugin sends the frame name, native Figma annotations, visible text, and — unless you turn "Include image" off — a downscaled screenshot of the frame, to the LLM provider you configured, using your own API key. The screenshot is also uploaded to your own Azure DevOps org for the inline embed. No third-party image hosts.

No telemetry. No analytics. No background polling.

See SECURITY.md in the GitHub repo for the full data-handling breakdown.

────────────────────

SETUP

Azure DevOps:
1. Create a Personal Access Token at dev.azure.com/{org}/_usersSettings/tokens with Work Items (Read & write) scope.
2. In the plugin Settings, paste the PAT as `org|token` (e.g. myorg|abc123…), then pick the project / work item type.

AI Draft (optional):
1. In Settings, choose Anthropic, OpenAI, or Azure OpenAI and paste your own API key. Use a vision-capable model.
2. For Azure OpenAI, also paste your deployment endpoint URL.

────────────────────

LIMITS (V1)

• One frame per work item — no batch creation yet.
• One-way only — edits in Azure DevOps don't sync back to Figma.
• AI Draft requires your own API key and a vision-capable model for the screenshot to be read.
• Frames whose screenshot exceeds 5 MB skip the inline image (the work item is still created, with the Figma link).
• Personal Access Tokens only — OAuth on the roadmap.

────────────────────

FEEDBACK & ISSUES

Built for design teams handing off work to engineers in Azure DevOps. Hit a bug or want a feature? Email sanjayvk00@gmail.com or open an issue on GitHub.
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

(Consider creating a dedicated support address before publish if you want to keep personal email private.)

---

## Carousel image captions (optional, max 9 images)

If you make screenshot/carousel images, here are caption suggestions:

1. **Settings** — "Paste your Azure DevOps PAT, pick a project and work item type. Once per file."
2. **AI Draft → pin** — "One click: AI reads the frame's screenshot and drafts the ticket."
3. **Spec pin on canvas** — "The AI summary is written onto the frame as an annotation — edit it in Figma before you publish."
4. **CreateView with the form filled** — "Fields prefill for the work item type. Edit anything, then Publish."
5. **Work item in Azure DevOps** — "The frame screenshot is embedded inline in the description, with a deep link back to Figma."
6. **LinkedView** — "Re-select a linked frame? Open the work item in one click."

---

## Notes on phrasing choices

- **"Stop screenshotting frames into your tracker by hand"** as the opener — names the pain (manual screenshot → ticket) before naming the product.
- **Lead with AI Draft + the inline screenshot** — those are the differentiators; "select a frame, create a ticket" alone is table stakes.
- **AI Draft framed as opt-in, BYO-key** — sets expectations (no free AI) and pre-empts the "what does it send to the LLM" question.
- **Azure-only** — Notion is deliberately omitted; the published manifest doesn't allow api.notion.com, so promising Notion would be inaccurate.
- **The "Limits (v1)" section** — putting limitations in writing builds trust and pre-empts negative reviews.
- **No emoji, no exclamation points, no "supercharge your workflow"** — designer audience reads through hype quickly.

---

## Meta / SEO (for the Community page slug + search)

Figma Community auto-generates the URL slug from the plugin name. Search ranking inside the Community is driven by name + description, so the description's first 200 characters matter most — that's what shows in search results.

Keywords woven into the copy above:
- frame to ticket, figma to azure devops, design handoff, AI ticket draft, ticket from frame, design ops
