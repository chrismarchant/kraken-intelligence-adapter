// Probe: what MistralGateway charges a call, over random sequences of provider replies.
// Usage: node probe-gateway-charging.ts <path-to-src-root> [iterations]
// Offline: fetch is a stub; no network. Checks, for every sequence:
//   (a) total completion tokens charged <= MAX_TOKEN_FACTOR * request.maxTokens (3,000 here);
//   (b) total >= min(3000, sum of a lower bound per request): a failed non-4xx request counts its
//       sent max_tokens, an answer counts min(reported, sent max_tokens) or sent max_tokens if missing;
//   (c) when every answer was truthful (reported <= sent max_tokens) or missing, total == that sum exactly.
import { z } from "zod";
const root = process.argv[2]!;
const iterations = Number(process.argv[3] ?? 20000);
const { MistralGateway } = await import(`${root}/src/gateway/mistral.ts`);

const Answer = z.strictObject({ theme: z.string(), score: z.number() });
const request = { purpose: "probe", system: "sys", user: "user", schema: Answer, schemaName: "answer", maxTokens: 1000 };

type Kind = "ok" | "length" | "notjson" | "badschema" | "502" | "500" | "400" | "429" | "drop" | "broken";
type Usage = "truthful" | "over" | "absurd" | "missing" | "under" | "negative" | "nan";
const kinds: Kind[] = ["ok", "length", "notjson", "badschema", "502", "500", "400", "429", "drop", "broken"];
const usages: Usage[] = ["truthful", "over", "absurd", "missing", "under", "negative", "nan"];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

let violations = 0;
const counts = { sequences: 0, truthfulOnly: 0, withOver: 0 };
for (let it = 0; it < iterations; it++) {
  const script = Array.from({ length: 8 }, () => ({ kind: pick(kinds), usage: pick(usages), frac: Math.random() }));
  let i = 0;
  let lower = 0;
  let exactPossible = true;
  const log: string[] = [];
  const fetchStub = (async (_url: string, init: { body: string }) => {
    const sent = JSON.parse(init.body).max_tokens as number;
    const step = script[i++] ?? { kind: "502" as Kind, usage: "truthful" as Usage, frac: 1 };
    log.push(`${step.kind}/${step.usage}@${sent}`);
    if (step.kind === "drop") { lower += sent; throw new TypeError("fetch failed"); }
    if (step.kind === "502" || step.kind === "500") { lower += sent; return new Response("x", { status: Number(step.kind) }); }
    if (step.kind === "400" || step.kind === "429") return new Response("x", { status: Number(step.kind) });
    if (step.kind === "broken") { lower += sent; return new Response(new ReadableStream({ start: (c) => c.error(new Error("reset")) }), { status: 200, headers: { "content-type": "text/event-stream" } }); }
    const truthful = Math.floor(step.frac * sent);
    let completion: unknown;
    switch (step.usage) {
      case "truthful": completion = truthful; lower += truthful; break;
      case "under": completion = Math.floor(truthful / 10); lower += Math.floor(truthful / 10); break;
      case "over": completion = sent + 1 + Math.floor(step.frac * 5000); lower += sent; exactPossible = false; break;
      case "absurd": completion = 1e15; lower += sent; exactPossible = false; break;
      case "missing": completion = undefined; lower += sent; break;
      case "negative": completion = -5; lower += sent; break;
      case "nan": completion = "NaN"; lower += sent; break;
    }
    const content = step.kind === "ok" ? '{"theme":"t","score":1}' : step.kind === "badschema" ? '{"theme":1}' : step.kind === "notjson" ? "nope" : "";
    const finish = step.kind === "length" ? "length" : "stop";
    const usage = completion === undefined ? undefined : { prompt_tokens: 1, completion_tokens: completion };
    return new Response(JSON.stringify({ model: "m", choices: [{ finish_reason: finish, message: { content } }], usage }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const gateway = new MistralGateway({ fetch: fetchStub, backoffMs: 0, apiKey: "placeholder" });
  const total: number = await gateway.generateJson(request).then((r: any) => r.usage.completionTokens, (e: any) => e.cost?.usage?.completionTokens ?? NaN);
  counts.sequences++;
  if (exactPossible) counts.truthfulOnly++; else counts.withOver++;
  const bound = Math.min(3000, lower);
  const bad = !(total <= 3000) || !(total >= bound) || (exactPossible && total !== bound);
  if (bad && violations++ < 10) console.log("VIOLATION", { total, bound, exactPossible, log: log.join(" ") });
}
console.log(JSON.stringify({ root, ...counts, violations }));
