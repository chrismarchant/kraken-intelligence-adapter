# Mistral response-normalisation shim

Status: implemented on a branch, not yet reviewed or accepted. Verified 2026-11-13 against `mistral-large-4` (see Evidence).

## What it does

OpenBot talks to models through the `@ai-sdk/openai` Chat Completions client (`createOpenAI({ baseURL }).chat(model)`). Mistral Large 4 returns `message.content` (and streamed `delta.content`) as an array of blocks, which that client rejects ("Invalid JSON response"). The shim is a small HTTP reverse proxy between an OpenAI-compatible client and Mistral. It forwards requests unchanged and rewrites responses so `content` is always a string.

Code:

- `src/shim/normalize.ts`: pure functions (`normalizeChatCompletion`, `createSseNormalizer`, `normalizeSseEvent`). No I/O; importable by other KIC code.
- `src/shim/server.ts`: `createShimServer(config)` factory, `loadConfig(env)`, and the CLI entry point (`npm run shim`).

Behaviour:

- `POST /v1/chat/completions`: body forwarded byte-for-byte to `${SHIM_UPSTREAM}/v1/chat/completions`. A successful response is normalised, as JSON or as SSE according to the upstream content type.
- Any other path under `/v1/` (for example `GET /v1/models`): method, query and body passed through, response streamed back unchanged.
- `GET /healthz`: `{"ok":true}`.
- Everything else: 404.
- Normalisation: text blocks are concatenated into a string; `thinking` blocks are dropped (or exposed as `reasoning_content`); unknown block types are ignored. String and null content, `tool_calls`, `finish_reason`, `usage`, ids and every other field are preserved. In streams, a delta that contains only thinking has its `content` key removed (the chunk is still forwarded). A non-stream message whose content has no text block gets `content: ""`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SHIM_HOST` | `127.0.0.1` | Listen address |
| `SHIM_PORT` | `8787` | Listen port |
| `SHIM_UPSTREAM` | `https://api.mistral.ai` | Only egress target; `/v1/...` is appended |
| `SHIM_ALLOWED_MODELS` | unset (any) | Comma list; other models get 400 before any upstream call |
| `SHIM_MAX_BODY_BYTES` | `2097152` | Request body limit; larger gets 413 |
| `SHIM_UPSTREAM_TIMEOUT_MS` | `120000` | Time to response headers and idle time between body chunks; exceeded gets 504 (or the stream is cut if headers were already sent). `0` disables. |
| `SHIM_EXPOSE_REASONING` | off | `1`/`true`: add thinking text as `reasoning_content` |
| `MISTRAL_API_KEY` | unset | If set, replaces the client's Authorization header upstream |

## Pointing a client at it

```
SHIM_ALLOWED_MODELS=mistral-large-4 npm run shim
```

```ts
const openai = createOpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "proxy-injected" });
const model = openai.chat("mistral-large-4"); // use .chat(), the Chat Completions path
```

In a session where the network proxy injects the key, run the shim with `NODE_USE_ENV_PROXY=1` so its outbound `fetch` uses the proxy, and send `Authorization: Bearer proxy-injected` from the client. Set `max_tokens` generously (at least 2000): the model spends most completion tokens on reasoning.

## Security notes

- Binds to loopback by default. There is no client authentication on the shim itself: do not expose it beyond a trusted host. If `MISTRAL_API_KEY` is set, anyone who can reach the shim can spend that key.
- The Authorization header, request bodies and response bodies are never logged, echoed or stored. One log line per request: method, path (no query), status, duration, model, and token counts if present. Model and path are sanitised before logging.
- Only the client's `content-type`, `accept` and `user-agent` headers are forwarded, plus Authorization (or the env key). Upstream `set-cookie` and hop-by-hop headers are not relayed.
- Egress only to `SHIM_UPSTREAM`. Redirects are not followed (`redirect: "manual"`); any 3xx becomes 502. Paths must start with `/v1/`; a leading `//` is rejected.
- Client disconnect aborts the upstream request.
- No call to any TypeSafe/JEV endpoint exists in this code.

## Observed Mistral shapes (captured 2026-11-13, `mistral-large-4`)

Raw captures are in `fixtures/shim/` (bodies only, no headers or keys; produced by `tests/shim/capture.ts`).

Non-stream:

- `choices[0].message.content` is an array: `[{"type":"thinking","thinking":[{"type":"text","text":"..."}],"closed":true},{"type":"text","text":"..."}]`.
- With a tool call, `tool_calls` is a normal OpenAI array (`id`, `type:"function"`, `function.name`, `function.arguments` as a JSON string, `index`) and `content` holds only the thinking block (no text block). Without a tool call, `tool_calls` is `null`.
- `usage` includes `completion_tokens_details.reasoning_tokens` and `service_tier`.

Stream (`stream_options.include_usage` true):

- First chunk: `delta: {"role":"assistant","content":""}` (already a string).
- Reasoning chunks: `delta.content` is an array containing one thinking block with `closed:true` on every chunk, each carrying a text fragment.
- Answer chunks: `delta.content` is a plain string.
- Tool call: arrives complete in one delta (`delta.tool_calls[0]` with full arguments) together with `finish_reason:"tool_calls"` and the `usage` object on the same chunk.
- Final answer chunk: `delta.content:""`, `finish_reason:"stop"`, `usage` on the same chunk, then `data: [DONE]`.
- Chunks carry an extra padding field `"p":"abc..."`; it is preserved untouched.
- Events are separated by `\n\n`; no CRLF observed.

## Tests and evidence

Offline (deterministic; mock upstream replays the fixtures):

```
npm run typecheck   # passes
npm test            # 27 tests, 27 pass, 0 fail (12 in normalize.test.ts, 14 in server.test.ts, 1 smoke)
```

Cases covered: non-stream plain and tool call; stream plain and tool call (1, 3, 7, 13, 64-byte slices, which split UTF-8 characters and `data:` lines); string content passthrough; unknown block type; reasoning option; allowlist; body limit; upstream 4xx/5xx passthrough; redirect refused; timeout; client disconnect aborts upstream; client Authorization forwarded and env key override; no secret in log lines; routing (`/healthz`, 404, `/v1/models` passthrough).

Live (manual, calls the real API; about 10 requests):

```
NODE_USE_ENV_PROXY=1 node tests/shim/live.ts
```

Result on 2026-11-13, runtime Node v22.23.4 (the OpenBot client packages resolved under Node; Bun was not needed), model `mistral-large-4`:

```
PASS a raw fetch non-stream
PASS b raw fetch stream
PASS c raw fetch tool call
PASS d generateText + tool via shim
PASS e streamText plain via shim
PASS f streamText + tool exec + final answer via shim
FAIL control d WITHOUT shim (expected FAIL): Invalid JSON response
```

The control run goes straight to `https://api.mistral.ai/v1` with the same client and fails as described, which shows the shim is what makes the client work. `OPENBOT_SERVER_DIR` overrides the default checkout path; if absent, cases d to f print SKIP.

## Limitations

- Only the Chat Completions path is handled. The Responses API and other endpoints are passed through unnormalised.
- Streaming normalisation assumes events are separated by blank lines and fields are JSON `data:` lines; anything it cannot parse is forwarded unchanged.
- Reasoning is dropped by default, so clients get no thinking output and no signal while the model is reasoning (a long silent period before the first answer token is expected with Large 4). Thinking-only chunks are still forwarded, which keeps the connection active.
- Token usage in the log line is read from the response; if the client did not request `include_usage` on a stream, Mistral may still send it (it did in the captures), but this is not guaranteed.
- No TLS termination, rate limiting or client auth on the shim. Single process, no persistence.
- Non-stream responses are buffered in memory before being returned.
- Verified only against `mistral-large-4`. Other Mistral models and shapes are not verified.
