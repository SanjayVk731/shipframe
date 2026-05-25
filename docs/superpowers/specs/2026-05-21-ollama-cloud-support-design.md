# Ollama Cloud support for AI Draft

Date: 2026-05-21

## Status: NOT SHIPPED — abandoned due to CORS

Implemented and reverted in the same session (2026-05-21). The code worked, but Ollama Cloud (`https://ollama.com`) does **not** return any `Access-Control-Allow-Origin` header, and its `OPTIONS` preflight responds 401. The browser blocks the request in the Figma plugin iframe before it reaches the server. No plugin-side or manifest fix is possible:

- The Same-Origin Policy is enforced by the browser, not the server we're calling.
- The plugin iframe runs at origin `https://www.figma.com` — there is no way to change that.
- The Figma sandbox (where `figma.*` APIs run) has no `fetch`, so we can't move the call out of the iframe.
- Ollama Cloud has no equivalent of Anthropic's `anthropic-dangerous-direct-browser-access` opt-in header.

We confirmed the response shape with a direct preflight test:

```
$ curl -i -X OPTIONS https://ollama.com/v1/chat/completions \
    -H 'Origin: https://www.figma.com' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization,content-type'
HTTP/2 401
content-type: text/plain; charset=utf-8
# … no access-control-allow-* headers, body: "unauthorized"
```

Paths that could unblock this in the future, none of which we want to ship now:

1. A user-deployed CORS proxy (Cloudflare Worker / Vercel Function) in front of `ollama.com`. Plugin work would be a generic "OpenAI-compatible BYO endpoint" provider; user work would be deploying and maintaining the proxy.
2. Ollama publishing a CORS-enabled endpoint or an opt-in dangerous-browser-access header.
3. A future Figma plugin runtime that proxies network calls server-side.

The spec is kept as a record so the next person who reaches for "add Ollama" sees the wall before they build it.

The rest of the original design is preserved below for reference.

---

## Goal

Add `ollama` as a fourth AI Draft provider alongside `anthropic`, `openai`, and `azure-openai`. Targets **Ollama Cloud** (`https://ollama.com`) using an Ollama API key. Optional model override.

## Why this shape

Ollama Cloud's REST surface is OpenAI-compatible:

```
POST https://ollama.com/v1/chat/completions
Authorization: Bearer <key>
Content-Type: application/json

{ "model": "gpt-oss-20b", "messages": [...], "max_tokens": 2048, "response_format": { "type": "json_object" } }
```

The endpoint is fixed (we don't take a URL field). One manifest entry: `https://ollama.com`. The body shape is identical to OpenAI's Chat Completions, so the adapter is almost a copy of `openai.ts` with a different URL and a caller-supplied `model`.

### Why no self-hosted / localhost Ollama

Figma plugins run in an iframe under `https://www.figma.com`. Chromium blocks mixed-content (HTTPS → HTTP) regardless of what the plugin manifest allows — so `fetch('http://localhost:11434/...')` will throw before any header or CORS check happens. Self-hosted Ollama is therefore out of scope for this spec; users who want it must front their server with TLS (Cloudflare Tunnel, ngrok, Caddy) — which we'll consider as a follow-up if asked, since the wire format is identical.

## Changes

### Storage — `src/storage/aiConfig.ts`

```ts
export type AiProvider = 'anthropic' | 'openai' | 'azure-openai' | 'ollama'

export interface AiConfig {
  provider: AiProvider
  key: string
  endpoint?: string  // azure-openai
  model?: string     // ollama (optional override; default lives in the adapter dispatcher)
}
```

- New `KEY_MODEL = 'ai:model'`.
- `setAiConfig()`: writes model when provider is `ollama` and `model` is non-empty; otherwise deletes the stored model (so switching providers can't leave a stale value behind).
- `getAiConfig()` returns the model when present for `ollama`; no required-field gate — a missing model just falls back to the default at dispatch time.
- `clearAiConfig()` deletes the model key.

### Adapter — new `src/ui/ai/ollama.ts`

`callOllama({ apiKey, model, systemPrompt, userPrompt }) => Promise<Result<string>>`

- POST to `https://ollama.com/v1/chat/completions`
- Headers: `content-type: application/json`, `authorization: Bearer <key>`
- Body: `{ model, max_tokens: 2048, response_format: { type: 'json_object' }, messages: [{ role: 'system', content }, { role: 'user', content }] }`
- Response parsing: identical to OpenAI (`choices[0].message.content`).
- Uses `tryRequest`, returns `Result<string>`.

### Dispatcher — `src/ui/ai/draft.ts`

Add a branch for `'ollama'`, defaulting the model to `gpt-oss-20b` when `ai.model` is missing. The default lives here, not in storage — keeps storage minimal and lets us bump the default with a single edit.

### Settings UI — `src/ui/views/SettingsView.tsx`

- Add `"Ollama Cloud"` to the provider `<select>`.
- When `aiProvider === 'ollama'`: existing API key input + a new optional "Model" text `Input` with placeholder `gpt-oss-20b` and help text noting the default.
- New prop `aiModel: string`. `onAiChange` widens to `{ provider, key, endpoint?, model? }`.

### App wiring — `src/ui/App.tsx`

`aiModel` state, loaded from `getAiConfig()`, threaded through Settings and CreateView. When `aiProvider === 'ollama'` and the key is set, the `aiConfig` passed to CreateView includes `model: aiModel || undefined`.

### Manifest — `manifest.json`

Add `"https://ollama.com"` to `networkAccess.allowedDomains`. Update `reasoning` to mention Ollama Cloud alongside the existing providers.

### Security disclosure — `SECURITY.md`

Add Ollama Cloud to the AI Draft section: data goes to `ollama.com`, no different from the other LLM providers. API key stored in clientStorage. Note that local/self-hosted Ollama is not supported by this plugin due to mixed-content rules; users must use Ollama Cloud or a self-hosted instance behind their own HTTPS proxy.

### Tests

- New `tests/ui/ai/ollama.test.ts`: POSTs to `ollama.com/v1/chat/completions`; uses `authorization: Bearer`; uses `model` from config; surfaces `auth_failed` / `not_found` / `rate_limited` / `server_error` for 401/404/429/500.
- Extend `tests/storage/aiConfig.test.ts`: round-trip ollama with model; round-trip ollama without model; switching to non-ollama clears the stale model; `clearAiConfig` deletes the model key.
- Extend `tests/ui/ai/draft.test.ts`: ollama provider routes through the new adapter; missing `model` falls back to `gpt-oss-20b`.

## Non-goals

- Self-hosted / localhost Ollama (mixed-content block).
- Model discovery via `/api/tags`.
- Streaming.
- "Test connection" button for AI providers (no AI provider has one today).

## Acceptance

A user with an Ollama Cloud API key can pick "Ollama Cloud" in Settings, paste the key (and optionally a model name), save, and successfully use Draft. Default model is `gpt-oss-20b`.
