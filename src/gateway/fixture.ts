import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { GenerateRequest, GenerateResult, ModelGateway } from "./gateway.ts";
import { ModelOutputError } from "./gateway.ts";
import { sha256 } from "../util/runtime.ts";

interface StoredFixture {
  purpose: string;
  schemaName: string;
  requestSha256: string;
  provider: string;
  model: string;
  recordedAt: string;
  usage: { promptTokens: number; completionTokens: number; reasoningTokens: number };
  value: unknown;
}

function requestKey<T>(request: GenerateRequest<T>): string {
  return sha256([request.purpose, request.schemaName, request.system, request.user].join("\u0000"));
}

function fixturePath<T>(dir: string, request: GenerateRequest<T>): string {
  return join(dir, `${request.purpose}.${requestKey(request).slice(0, 16)}.json`);
}

export class FixtureMissingError extends Error {
  constructor(purpose: string, path: string) {
    // The file is named, not its directory: the message can reach a caller of the server.
    super(`No recorded model output for "${purpose}" (${basename(path)}). Re-record the fixtures with a live run.`);
    this.name = "FixtureMissingError";
  }
}

/** Replays recorded model outputs. A request that was not recorded is an error, never a guess. */
export class FixtureGateway implements ModelGateway {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const path = fixturePath(this.dir, request);
    let stored: StoredFixture;
    try {
      stored = JSON.parse(await readFile(path, "utf8")) as StoredFixture;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new FixtureMissingError(request.purpose, path);
      throw error;
    }
    // Recorded output is validated again: a schema change must not let stale fixtures through.
    const checked = request.schema.safeParse(stored.value);
    if (!checked.success) throw new ModelOutputError(request.purpose, "recorded fixture no longer matches the schema");
    return {
      value: checked.data,
      provider: stored.provider,
      model: stored.model,
      source: "fixture",
      usage: stored.usage,
      providerRequests: 0,
      latencyMs: 0,
    };
  }
}

/** Passes calls to a live gateway and records each validated answer for later replay. */
export class RecordingGateway implements ModelGateway {
  private readonly inner: ModelGateway;
  private readonly dir: string;

  constructor(inner: ModelGateway, dir: string) {
    this.inner = inner;
    this.dir = dir;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const result = await this.inner.generateJson(request);
    const stored: StoredFixture = {
      purpose: request.purpose,
      schemaName: request.schemaName,
      requestSha256: requestKey(request),
      provider: result.provider,
      model: result.model,
      recordedAt: new Date().toISOString(),
      usage: result.usage,
      value: result.value,
    };
    await mkdir(this.dir, { recursive: true });
    await writeFile(fixturePath(this.dir, request), `${JSON.stringify(stored, null, 2)}\n`);
    return result;
  }
}

/** Replays a recorded answer when there is one, and otherwise asks the fallback gateway. */
export class FallbackGateway implements ModelGateway {
  private readonly primary: ModelGateway;
  private readonly fallback: ModelGateway;
  /** Purposes that were not found in the recording and went to the fallback. */
  readonly missed: string[] = [];

  constructor(primary: ModelGateway, fallback: ModelGateway) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async generateJson<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    try {
      return await this.primary.generateJson(request);
    } catch (error) {
      if (!(error instanceof FixtureMissingError)) throw error;
      this.missed.push(request.purpose);
      return this.fallback.generateJson(request);
    }
  }
}
