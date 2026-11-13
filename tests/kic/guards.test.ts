import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** Every TypeScript source file under src/. */
function sources(dir = "src"): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const files = sources().map((path) => ({ path, text: readFileSync(path, "utf8") }));

test("no source file names a publishing, advertising or outreach service", () => {
  const forbidden = /api\.linkedin\.com|linkedin\.com\/(?:oauth|v2|rest)|ugcPosts|graph\.facebook|api\.twitter|api\.x\.com|hubapi|salesrobot|zernio/i;
  for (const { path, text } of files) assert.doesNotMatch(text, forbidden, `${path} must not reference a publishing or outreach API`);
});

test("no source file can reach the JEV service", () => {
  for (const { path, text } of files) {
    assert.doesNotMatch(text, /typesafe\.ai|\/v1\/systemone|TYPESAFE_API_KEY/i, `${path} must not reference the live JEV endpoint or its key`);
  }
});

test("outbound HTTP exists only in the model gateway and the model shim", () => {
  const allowed = new Set(["src/gateway/mistral.ts", "src/shim/server.ts"]);
  for (const { path, text } of files) {
    const calls = /\bfetch\s*\(|\bfetchImpl\s*\(|node:https|http\.request\(|https\.request\(/.test(text);
    if (calls) assert.ok(allowed.has(path), `${path} makes outbound HTTP calls but is not an approved egress point`);
  }
  const hosts = new Set<string>();
  for (const { text } of files) for (const match of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(match[1]!.toLowerCase());
  assert.deepEqual([...hosts].sort(), ["api.mistral.ai"], "the model API is the only external host named in the source");
});

test("no source file reads a publishing or evaluator credential from the environment", () => {
  const names = new Set<string>();
  for (const { text } of files) for (const match of text.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) names.add(match[1]!);
  for (const name of names) {
    assert.match(name, /^(KIC_|SHIM_|MISTRAL_API_KEY$)/, `unexpected environment variable ${name}`);
  }
});
