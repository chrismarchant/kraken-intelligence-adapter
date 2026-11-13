import { z } from "zod";

export const SCHEMA_VERSION = "0.1.0";

export const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]{1,79}$/, "lowercase id of 2-80 characters");
export type Id = z.infer<typeof Id>;

export const IsoDateTime = z.iso.datetime({ offset: true });

export const NonEmpty = z.string().trim().min(1);
export const ShortText = z.string().trim().min(1).max(400);
export const LongText = z.string().trim().min(1).max(6000);

export const TokenUsage = z.strictObject({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsage>;

/** How a piece of model-produced content came to exist. */
export const GenerationMeta = z.strictObject({
  provider: z.string(),
  model: z.string(),
  skill: z.string(),
  skillVersion: z.string(),
  promptVersion: z.string(),
  /** live = a real model call in this run; fixture = replayed recorded output. */
  source: z.enum(["live", "fixture"]),
  generatedAt: IsoDateTime,
  usage: TokenUsage,
});
export type GenerationMeta = z.infer<typeof GenerationMeta>;

/** A person. KIC never accepts a model or service as the actor of an editorial decision. */
export const HumanActor = z.strictObject({
  kind: z.literal("human"),
  id: NonEmpty.max(120),
  name: NonEmpty.max(200),
});
export type HumanActor = z.infer<typeof HumanActor>;
