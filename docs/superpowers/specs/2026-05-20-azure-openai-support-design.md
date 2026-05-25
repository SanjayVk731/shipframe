# Azure OpenAI support for AI Draft

Date: 2026-05-20

## Goal

Add `azure-openai` as a third AI Draft provider alongside `anthropic` and `openai`, so users on corporate Azure tenants (typically with an `AZURE_OPENAI_API_KEY`) can use the Draft button against their own Azure OpenAI deployment.

Non-goals:
- No Entra ID / managed identity. API key only, matching the other providers.
- No streaming.
- No deployment-discovery API call.
- No model selector — the model is implicit in the deployment chosen via the endpoint URL.

## Why this shape

Azure OpenAI is wire-compatible with OpenAI's Chat Completions but differs in three ways:
1. **Endpoint is per-tenant and per-deployment**, e.g. `https://mycorp.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21`. The hostname includes the user's Azure resource and the path includes a deployment name.
2. **Auth header is `api-key: <key>`**, not `Authorization: Bearer ...`.
3. **No `model` field in the body** — the deployment is selected by URL.

Figma plugin `networkAccess.allowedDomains` is static in the manifest. We add `https://*.openai.azure.com` once and let users target any tenant — the same precedent as `*.visualstudio.com` for Azure DevOps.

The user pastes the full endpoint URL (including the `api-version` query param). This avoids stitching together resource + deployment + api-version in three fields, and lets users pin to whatever API version their tenant supports without us having to ship updates.

## Changes

### Storage — `src/storage/aiConfig.ts`

```ts
export type AiProvider = 'anthropic' | 'openai' | 'azure-openai'

export interface AiConfig {
  provider: AiProvider
  key: string
  endpoint?: string
}
```

- New `KEY_ENDPOINT = 'ai:endpoint'`.
- `setAiConfig(cfg)`: writes endpoint when provided; otherwise deletes the stored endpoint so switching providers doesn't leave a stale URL behind.
- `getAiConfig()`: when provider is `azure-openai`, require a non-empty `endpoint` that looks like `https://*.openai.azure.com/...`. Otherwise return `undefined` (same "not configured" treatment as a missing key).
- `clearAiConfig()` also deletes the endpoint.

### Adapter — new `src/ui/ai/azureOpenAI.ts`

`callAzureOpenAI({ apiKey, endpoint, systemPrompt, userPrompt }) => Promise<Result<string>>`

- POST to the user-supplied `endpoint`.
- Headers: `content-type: application/json`, `api-key: <key>`.
- Body: `{ messages, max_tokens, response_format: { type: 'json_object' } }`. No `model` field.
- Response parsing: identical to OpenAI (`choices[0].message.content`).
- Uses `tryRequest`, returns `Result<string>` with the standard `NormalizedReason`s.

### Dispatcher — `src/ui/ai/draft.ts`

`callOnce` switches on `ai.provider`:
- `anthropic` → `callAnthropic`
- `openai` → `callOpenAI`
- `azure-openai` → `callAzureOpenAI` with `endpoint` from config. If endpoint is somehow missing (shouldn't happen — `getAiConfig` gates this), return `{ ok: false, reason: 'auth_failed' }`.

### Settings UI — `src/ui/views/SettingsView.tsx`

- Add `"Azure OpenAI"` to the provider `<select>`.
- When `aiProvider === 'azure-openai'`, render an "Endpoint URL" `Input` above the API key, placeholder `https://mycorp.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21`.
- Light validation: when non-empty, must start with `https://` and host must match `*.openai.azure.com`. On mismatch, show a one-line hint under the field. Don't block typing; the field is purely informational since the actual call will fail with a clear error if the URL is wrong.
- `onAiChange` signature widens to `{ provider, key, endpoint? }`. New prop `aiEndpoint: string`.

### App wiring — `src/ui/App.tsx`

Existing `aiConfig` load/save plumbing extends to carry `endpoint` through to `SettingsView` and into `setAiConfig`.

### Manifest — `manifest.json`

Add `"https://*.openai.azure.com"` to `networkAccess.allowedDomains`. Update `reasoning` to mention Azure OpenAI alongside Anthropic and OpenAI.

### Security disclosure — `SECURITY.md`

Add Azure OpenAI to the AI Draft section. Endpoint URL is user-supplied, stored in clientStorage, never leaves the user's device except as a fetch target. Data sent: same as Anthropic/OpenAI (frame name, native annotations, visible text — no images). No telemetry.

### Tests

- New `tests/ui/ai/azureOpenAI.test.ts`: success returns string; sends `api-key` header (not `Authorization`); POSTs to the configured endpoint; body has `response_format: json_object` and no `model`; surfaces `auth_failed` on 401 and `not_found` on 404.
- Extend `tests/storage/aiConfig.test.ts`: round-trip `azure-openai` with endpoint; `getAiConfig` returns undefined when endpoint missing for `azure-openai`; `clearAiConfig` deletes endpoint.
- Extend `tests/ui/ai/draft.test.ts`: provider `azure-openai` routes through the Azure adapter (URL-matched fetch mock).

## Acceptance

A user with an Azure OpenAI tenant URL + API key can pick "Azure OpenAI" in Settings, paste endpoint and key, save, and successfully use Draft on a selected frame. Anthropic and OpenAI users see no behavior change.
