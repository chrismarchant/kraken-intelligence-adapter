# Mistral response-normalisation shim

Status: implemented on a branch; not accepted. The server and its spend limits were in the scope of the reviews that approved `2537386`; the normaliser was read by the first review only (see `harness/state/GATE_STATE.md`). Verified 2026-11-13 against `mistral-large-4` (see Evidence).

## What it does

OpenBot talks to models through the `@ai-sdk/openai` Chat Completions client (`createOpenAI({ baseURL }).chat(model)`). Mistral Large 4 returns `message.content` (and streamed `delta.content`) as an array of blocks, which that client rejects ("Invalid JSON response"). The shim is a small HTTP reverse proxy between an OpenAI-compatible client and Mistral. It forwards requests unchanged and rewrites responses so `content` is always a string.

Code:

- `src/shim/normalize.ts`: pure functions (`normalizeChatCompletion`, `createSseNormalizer`, `normalizeSseEvent`). No I/O; importable by other KIC code.
- `src/shim/server.ts`: `createShimServer(config)` factory, `loadConfig(env)`, and the CLI entry point (`npm run shim`).

Behaviour:

- `POST /v1/chat/completions`: body forwarded byte-for-byte to `${SHIM_UPSTREAM}/v1/chat/completions`. A successful response is normalised, as JSON or as SSE according to the upstream content type.
- `GET /v1/models` and `GET /v1/models/<id>` (`<id>` matches `^[A-Za-z0-9._:-]{1,128}$`): passed through, response streamed back unchanged.
- Nothing else is forwarded. Any other path under `/v1/` (batch, files, fine-tuning, and so on) gets 404 with a JSON error. A known path with the wrong method gets 405 with an `Allow` header. DELETE, PUT and PATCH are never forwarded anywhere.
- `GET /healthz`: `{"ok":true}`. Needs no token.
- Everything else: 404.
- Normalisation: text blocks are concatenated into a string; `thinking` blocks are dropped (or exposed as `reasoning_content`); unknown block types are ignored. String and null content, `tool_calls`, `finish_reason`, `usage`, ids and every other field are preserved. In streams, a delta that contains only thinking has its `content` key removed (the chunk is still forwarded). A non-stream message whose content has no text block gets `content: ""`.

## Modes

| Mode | When | Who authenticates to the provider | Client auth to the shim |
|---|---|---|---|
| Pass-through | `MISTRAL_API_KEY` unset, `SHIM_HOST` loopback | The client's own `Authorization` header is forwarded upstream | None (loopback only) |
| Key injection | `MISTRAL_API_KEY` set | The shim, with its own key; the client's `Authorization` is never forwarded | `SHIM_CLIENT_TOKEN` required: `Authorization: Bearer <token>` |

A non-loopback `SHIM_HOST` also requires `SHIM_CLIENT_TOKEN`, so a non-loopback shim is always in key injection mode. `SHIM_CLIENT_TOKEN` without `MISTRAL_API_KEY` is refused: there would be no provider credential to forward in its place.

## Configuration

Invalid values are a startup error (the process exits with a message that never contains a secret).

| Variable | Default | Meaning |
|---|---|---|
| `SHIM_HOST` | `127.0.0.1` | Listen address. A non-loopback value (anything except `127.0.0.1`, `::1`, `localhost`) requires `SHIM_CLIENT_TOKEN` |
| `SHIM_PORT` | `8787` | Listen port, integer 0 to 65535 (0 is for tests) |
| `SHIM_UPSTREAM` | `https://api.mistral.ai` | Only egress target; `/v1/...` is appended. Must be `https:`, or `http:` only for a loopback host (test mocks). No embedded credentials |
| `SHIM_ALLOWED_MODELS` | unset (any) in pass-through; **required in key injection** | Comma list; other models get 400 before any upstream call |
| `SHIM_MAX_BODY_BYTES` | `2097152` | Request body limit, positive integer; larger gets 413 |
| `SHIM_UPSTREAM_TIMEOUT_MS` | `120000` | Positive integer. Time to response headers and idle time between body chunks; exceeded gets 504 (or the stream is cut if headers were already sent) |
| `SHIM_EXPOSE_REASONING` | off | `1`/`true`: add thinking text as `reasoning_content` |
| `SHIM_CLIENT_TOKEN` | unset | At least 24 characters, no whitespace. When set, every `/v1/*` request must carry `Authorization: Bearer <token>`. Required if `MISTRAL_API_KEY` is set or `SHIM_HOST` is not loopback |
| `SHIM_ALLOWED_HOSTS` | unset | Comma list of extra `Host` header names accepted (see Security notes) |
| `MISTRAL_API_KEY` | unset | Enables key injection mode; replaces the Authorization header upstream. Requires `SHIM_CLIENT_TOKEN` |
| `SHIM_MAX_TOKENS_PER_REQUEST` | `32000` | Key injection only. The most completion tokens a request may ask for; a larger figure gets 400, and a request that names none is given this. A request for more than one answer (`n`) gets 400 |
| `SHIM_MAX_CONCURRENT` | `8` | Key injection only. Requests in flight at once; more get 429 |
| `SHIM_SPEND_FILE`, `SHIM_MAX_TOTAL_REQUESTS`, `SHIM_MAX_TOTAL_COMPLETION_TOKENS` | unset | Key injection only. A persistent ceiling on everything spent through the shim. Each request is charged at what it asked for when admitted and corrected to what the provider reported; one that reports nothing stays charged in full; a provider refusal costs no tokens. At the ceiling, requests get 429 and nothing is sent upstream. The file must be an absolute path out of the workspace's reach |
| `SHIM_ALLOW_UNLIMITED` | unset | `1` starts key injection without a ceiling. Otherwise the process refuses to start in key injection unless all three ceiling variables are set |

## Pointing a client at it

Pass-through, loopback:

```
SHIM_ALLOWED_MODELS=mistral-large-4 npm run shim
```

```ts
const openai = createOpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "proxy-injected" });
const model = openai.chat("mistral-large-4"); // use .chat(), the Chat Completions path
```

Key injection: the shim holds the provider key, the client sends only the shim token.

```
MISTRAL_API_KEY=... SHIM_CLIENT_TOKEN=... SHIM_ALLOWED_MODELS=mistral-large-4 npm run shim
```

```ts
const openai = createOpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: process.env.SHIM_CLIENT_TOKEN });
```

In a session where the network proxy injects the key, run the shim with `NODE_USE_ENV_PROXY=1` so its outbound `fetch` uses the proxy, and send `Authorization: Bearer proxy-injected` from the client (pass-through mode). Set `max_tokens` generously (at least 2000): the model spends most completion tokens on reasoning.

Deployment note for a client instance: the shim process holds `MISTRAL_API_KEY`; the agent workspace is given only `SHIM_CLIENT_TOKEN` (and the shim URL), never the provider key. Rotating either secret is then independent, and a leaked workspace token cannot reach any endpoint beyond chat completions and model listing.

## Security notes

- Spending: in key injection the holder of the client token spends the provider's key. The limits above exist for that reason (approval-path security review, 2026-11-13). In pass-through the caller spends its own key and nothing is limited. In key injection the body sent to the provider is always written out again from the parsed request, with `max_tokens` at the figure the shim reserved and without `max_completion_tokens`; in pass-through bodies are forwarded as written. An idle connection is closed after the upstream timeout plus thirty seconds.

- Path and method allowlist: only `POST /v1/chat/completions`, `GET /v1/models` and `GET /v1/models/<id>` are forwarded. Batch, files, fine-tuning and all DELETE/PUT/PATCH requests are refused with 404 or 405 before any upstream call. Path traversal such as `%2e%2e` or an encoded slash fails the id pattern and gets 404.
- Client authentication: when `SHIM_CLIENT_TOKEN` is set, `/v1/*` requires `Authorization: Bearer <token>`; otherwise 401 and nothing is forwarded. The comparison hashes both sides with SHA-256 and uses `timingSafeEqual`, so neither content nor length leaks through timing. In key injection mode the token is consumed by the shim and never forwarded; the upstream request carries the injected key. `/healthz` is unauthenticated.
- Host check (DNS rebinding): the `Host` header name (port ignored) must be a loopback name, the configured `SHIM_HOST`, or in `SHIM_ALLOWED_HOSTS`; otherwise 403. A request with any `Origin` header is refused with 403: the shim is a server-to-server endpoint and is never called from a browser. Both checks apply to every route including `/healthz`.
- Without a token the shim is only safe on loopback. With `MISTRAL_API_KEY` set, a valid token is the only thing standing between a caller and the provider key's spend, so treat it as a secret of the same class.
- The Authorization header, request bodies and response bodies are never logged, echoed or stored. One log line per request: method, path (no query), status, duration, `auth=ok|missing|bad|none`, model, and token counts if present. Model and path are sanitised before logging.
- Only the client's `content-type`, `accept` and `user-agent` headers are forwarded, plus the injected key (key injection) or the client's Authorization (pass-through). Upstream `set-cookie` and hop-by-hop headers are not relayed.
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
npm test            # whole product suite: 202 tests at 2537386 (98 when this was first written) (shim: normalize.test.ts, server.test.ts, security.test.ts)
```

Cases covered: non-stream plain and tool call; stream plain and tool call (1, 3, 7, 13, 64-byte slices, which split UTF-8 characters and `data:` lines); string content passthrough; unknown block type; reasoning option; allowlist; body limit; upstream 4xx/5xx passthrough; redirect refused; timeout; client disconnect aborts upstream; client Authorization forwarded and env key override; no secret in log lines; routing (`/healthz`, 404, `/v1/models` passthrough). `security.test.ts` (finding F8, offline): batch/files/fine-tune/delete never reach the mock upstream in either mode; 405 on wrong method; 401 for missing or wrong token with upstream untouched; correct token forwarded as the injected key with the client token absent upstream and from logs; pass-through still forwards the client header; startup refusals; foreign `Host` and any `Origin` get 403.

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
- No TLS termination or rate limiting. Client auth is a single shared bearer token (no per-client identity or revocation list). Single process, no persistence.
- Non-stream responses are buffered in memory before being returned.
- Verified only against `mistral-large-4`. Other Mistral models and shapes are not verified.
