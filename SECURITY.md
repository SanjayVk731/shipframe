# Security & data handling

## What the plugin stores

| Data | Location | Scope | Notes |
|---|---|---|---|
| Azure DevOps PAT (in `org\|token` form) | `figma.clientStorage` | Per-user, per-device | Never transmitted off your machine except to `dev.azure.com` / `*.visualstudio.com` |
| AI provider + API key (optional) | `figma.clientStorage` (keys `ai:provider`, `ai:key`, and `ai:endpoint` for Azure OpenAI) | Per-user, per-device | Only present when AI Draft is enabled. Never transmitted off your machine except to `api.anthropic.com`, `api.openai.com`, or the user-supplied `*.openai.azure.com` endpoint |
| Provider + board choice for the file | `figma.root.setPluginData` | Per-file, travels with the file | No secrets; just IDs and labels |
| Ticket link on each linked frame | `node.setPluginData` | Per-node, travels with the file | Stores the ticket id, URL, provider id, and timestamp |

`clientStorage` is sandboxed by Figma to this plugin and this user/device. It is not synced to the cloud and is not visible to other plugins.

## What the plugin does NOT do

- No telemetry, analytics, or crash reporting.
- No third-party servers — the plugin talks directly from your machine to the Azure DevOps API.
- No background polling.
- No automatic ticket updates (one-way: Figma → tracker only).
- No reading of other Figma plugins' data.

## Network access

The manifest declares exactly five allowed domains:

- `https://dev.azure.com`
- `https://*.visualstudio.com` (legacy Azure DevOps org domains)
- `https://api.anthropic.com` — only contacted when AI Draft is enabled
- `https://api.openai.com` — only contacted when AI Draft is enabled
- `https://*.openai.azure.com` — only contacted when AI Draft is enabled and the user chose Azure OpenAI; the exact host is the user's own Azure tenant

Any other outbound network call is blocked by Figma's plugin runtime.

## AI Draft (optional)

AI Draft is opt-in and disabled by default. To enable it, the user pastes their own Anthropic, OpenAI, or Azure OpenAI API key in Settings; that key is stored in `clientStorage` (same isolation as the provider PATs). For Azure OpenAI, the user also supplies the full endpoint URL for their own tenant's deployment (e.g. `https://mycorp.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=…`); this URL is stored locally and used as the fetch target.

Each time the user clicks "✨ Draft with AI", the plugin sends — and **only** sends — the following from the selected frame to the chosen LLM:

- The frame name (e.g. "Login — error state").
- The work item type from the chosen tracker board (e.g. "Bug").
- The labels of any native Figma annotations on the frame (the designer's own words).
- The contents of visible `TEXT` nodes inside the frame, bounded to 50 nodes, 300 chars per node, and 8000 chars total.

**Not sent:** the frame's rendered image, contents of hidden layers, contents of other frames, any provider PAT, any file metadata beyond what's listed above.

Disabling AI Draft (Settings → Provider: Off, or clearing the key) atomically removes `ai:provider`, `ai:key`, and `ai:endpoint` from `clientStorage`. No telemetry.

## Token best practices

- **Azure DevOps:** Create a PAT scoped to **Work Items (Read & write)**. Set the shortest expiry window you're comfortable with.
- **Rotation:** If a token leaks, revoke it in Azure DevOps. Then re-enter a fresh token in plugin Settings.

## Suggested listing-page wording

> The plugin stores your Azure DevOps PAT locally on your machine via Figma's `clientStorage` API. It is never sent to any server other than Azure DevOps (`dev.azure.com` or `*.visualstudio.com`). The plugin has no backend.
