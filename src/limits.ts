/** Hard execution bounds. Every loop in the workflow is limited by one of these. */
export interface Limits {
  maxNarratives: number;
  maxSlots: number;
  maxVariantsPerSlot: number;
  maxRevisionPasses: number;
  maxConcurrency: number;
  /** Posts drafted by one drafting step when the caller does not name them. */
  maxSlotsPerDraftStep: number;
  /** Model calls allowed over the life of one campaign. */
  maxModelCalls: number;
  /** Completion tokens (including reasoning) allowed over the life of one campaign. */
  maxCompletionTokens: number;
  /** Wall-clock limit for a single model call. */
  modelCallTimeoutMs: number;
  /** Lifetime of a pending editorial decision request. */
  decisionRequestTtlMs: number;
  maxDecisionCodeAttempts: number;
  /** How long a started step may stay unsettled before its whole allowance is charged. */
  reservationTtlMs: number;
  /** Decision requests that may be waiting for a person at one time, per campaign. */
  maxPendingDecisions: number;
  /** LinkedIn's documented limit for an organic post body. */
  linkedinMaxChars: number;
}

export const DEFAULT_LIMITS: Limits = Object.freeze({
  maxNarratives: 5,
  maxSlots: 24,
  maxVariantsPerSlot: 4,
  maxRevisionPasses: 2,
  maxConcurrency: 3,
  maxSlotsPerDraftStep: 6,
  maxModelCalls: 80,
  maxCompletionTokens: 400_000,
  modelCallTimeoutMs: 180_000,
  decisionRequestTtlMs: 30 * 60_000,
  maxDecisionCodeAttempts: 5,
  reservationTtlMs: 30 * 60_000,
  maxPendingDecisions: 25,
  linkedinMaxChars: 3000,
});

export class LimitExceededError extends Error {
  readonly limit: keyof Limits;
  constructor(limit: keyof Limits, message: string) {
    super(message);
    this.name = "LimitExceededError";
    this.limit = limit;
  }
}
