import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

test("toolchain: type stripping, zod and JSON Schema export work", () => {
  const S = z.object({ a: z.literal(false) });
  const js = z.toJSONSchema(S) as unknown as { properties: { a: { const: boolean } } };
  assert.equal(js.properties.a.const, false);
});
