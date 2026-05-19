# Security & data handling

## What the plugin stores

| Data | Location | Scope | Notes |
|---|---|---|---|
| Notion integration token | `figma.clientStorage` | Per-user, per-device | Never transmitted off your machine except to `api.notion.com` |
| Azure DevOps PAT (in `org\|token` form) | `figma.clientStorage` | Per-user, per-device | Never transmitted off your machine except to `dev.azure.com` / `*.visualstudio.com` |
| Provider + board choice for the file | `figma.root.setPluginData` | Per-file, travels with the file | No secrets; just IDs and labels |
| Ticket link on each linked frame | `node.setPluginData` | Per-node, travels with the file | Stores the ticket id, URL, provider id, and timestamp |

`clientStorage` is sandboxed by Figma to this plugin and this user/device. It is not synced to the cloud and is not visible to other plugins.

## What the plugin does NOT do

- No telemetry, analytics, or crash reporting.
- No third-party servers — the plugin talks directly from your machine to the Notion API or Azure DevOps API.
- No background polling.
- No automatic ticket updates (one-way: Figma → tracker only).
- No reading of other Figma plugins' data.

## Network access

The manifest declares exactly three allowed domains:

- `https://api.notion.com`
- `https://dev.azure.com`
- `https://*.visualstudio.com` (legacy Azure DevOps org domains)

Any other outbound network call is blocked by Figma's plugin runtime.

## Token best practices

- **Notion:** Create an Internal Integration with the minimum scopes you need (read content, insert content, update content). Share only the databases you want this plugin to write to.
- **Azure DevOps:** Create a PAT scoped to **Work Items (Read & write)**. Set the shortest expiry window you're comfortable with.
- **Rotation:** If a token leaks, revoke it in the provider's UI. Then re-enter a fresh token in plugin Settings.

## Suggested listing-page wording

> The plugin stores your provider tokens locally on your machine via Figma's `clientStorage` API. They are never sent to any server other than the provider's own API (api.notion.com or dev.azure.com). The plugin has no backend.
