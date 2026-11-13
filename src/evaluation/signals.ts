import type {
  CampaignBrief,
  CriterionKey,
  EligibilityFailure,
  PostDraft,
  ProgrammeSlot,
  Signal,
} from "../contracts/index.ts";
import type { Limits } from "../limits.ts";
import { canonicalText } from "../util/runtime.ts";

const STOPWORDS = new Set(
  ("about above after again against also among because been before being between both could does doing during each from further " +
    "have having here into more most other over same should some such than that their theirs them then there these they this those " +
    "through under until very were what when where which while will with within without would your yours team teams work company " +
    "companies business need needs head heads lead leads senior director directors manager managers people using used")
    .split(" "),
);

const HYPE_TERMS = [
  "revolutionary",
  "game-changing",
  "game changer",
  "supercharge",
  "unlock",
  "cutting-edge",
  "world-class",
  "best-in-class",
  "synergy",
  "disrupt",
  "10x",
];

/** Clock times are not figures a reader would check against a source. */
const CLOCK_TIME = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}:\d{2}\b/gi;
/** Any number written in digits. */
const NUMBER = /\d(?:[\d,.]*\d)?/g;

const NUMBER_WORD =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|" +
  "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)";
const NUMBER_PHRASE = `${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD})*`;
/**
 * Quantities written in words: "sixty-two percent", "three in four", "nine out of ten",
 * "twice as", "half of". They cannot be matched against a reference by code, so a post
 * must state its figures in digits, exactly as its reference does.
 */
const SPELLED_QUANTITY = new RegExp(
  `\\b${NUMBER_PHRASE}[\\s-]+(?:percent|per[\\s-]cent)\\b` +
    `|\\b${NUMBER_PHRASE}\\s+(?:in|out\\s+of)\\s+(?:every\\s+)?(?:${NUMBER_PHRASE}|\\d+)\\b` +
    `|\\b${NUMBER_PHRASE}[\\s-]+(?:times|fold)\\b` +
    `|\\b(?:twice|double|triple|quadruple)\\s+(?:as|the)\\b` +
    `|\\b(?:half|a\\s+third|a\\s+quarter|two[\\s-]thirds|three[\\s-]quarters)\\s+of\\b` +
    `|\\b(?:halved|doubled|tripled|quadrupled)\\b`,
  "gi",
);

/** Letters of a script that is easily mistaken for Latin, used to spot disguised words. */
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const LATIN = /\p{Script=Latin}/u;

export interface DraftAnalysis {
  /** 0..1 per criterion, derived only from the observations in `signals`. */
  features: Record<CriterionKey, number>;
  signals: Signal[];
  failures: EligibilityFailure[];
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? [];
}

function keywords(phrases: readonly string[]): string[] {
  const out = new Set<string>();
  for (const phrase of phrases) {
    for (const w of words(phrase)) if (w.length >= 4 && !STOPWORDS.has(w)) out.add(w);
  }
  return [...out];
}

/**
 * Whole-phrase match, case-insensitive, for mandatory constraints, which err towards
 * refusing. The words of the phrase may be joined, hyphenated or spaced ("AI-powered"
 * catches "AI powered" and "AIpowered"), and common inflections of the last word match
 * ("guarantee" catches "guaranteed"). A longer, different word does not match.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const parts = phrase.toLowerCase().match(/[a-z0-9]+/g);
  if (!parts) return false;
  const pattern = parts.join("[\\s\\-_./\u2010-\u2015]*");
  return new RegExp(`(?<![a-z0-9])${pattern}(?:s|es|d|ed|ing)?(?![a-z0-9])`, "i").test(haystack);
}

/** Letters and digits only, lower case. Used where words are run together, as in hashtags. */
function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The numbers written in digits in a text, without clock times, as plain digit strings. */
function numbersIn(text: string): string[] {
  const found = text.replace(CLOCK_TIME, " ").match(NUMBER) ?? [];
  return [...new Set(found.map((n) => n.replace(/,/g, "").replace(/\.$/, "")))];
}

function hasNumber(text: string, number: string): boolean {
  return numbersIn(text).includes(number);
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Observe a draft with deterministic code. The observations are shown to the editor as
 * evidence; the mandatory constraints they yield override any score.
 */
export function analyseDraft(
  brief: CampaignBrief,
  slot: Pick<ProgrammeSlot, "callToAction">,
  draft: Pick<PostDraft, "hook" | "body" | "callToAction" | "hashtags" | "claims">,
  limits: Pick<Limits, "linkedinMaxChars">,
): DraftAnalysis {
  const signals: Signal[] = [];
  const failures: EligibilityFailure[] = [];
  // Every rule below reads the canonical form of the text. A post that differs from its own
  // canonical form is carrying invisible or compatibility characters and is refused.
  const body = canonicalText(draft.body);
  const hashtags = draft.hashtags.map(canonicalText);
  const bodyWords = new Set(words(body));

  // Relevance: vocabulary shared with the stated audience and its problems.
  const audienceTerms = keywords([...brief.audience.roles, ...brief.audience.industries, ...brief.audience.painPoints]);
  const matchedAudience = audienceTerms.filter((t) => bodyWords.has(t) || bodyWords.has(`${t}s`));
  // Using about two thirds of the audience's own vocabulary is treated as full marks.
  const relevance = audienceTerms.length === 0 ? 0.5 : clamp(matchedAudience.length / (0.65 * audienceTerms.length));
  signals.push({
    criterion: "relevance",
    observation: `${matchedAudience.length} of ${audienceTerms.length} audience and pain-point terms appear in the post`,
    evidence: matchedAudience.slice(0, 12),
  });

  // Brand fit: required points covered, stated don'ts and hype vocabulary absent.
  const required = brief.constraints.mustInclude;
  const covered = required.filter((p) => keywords([p]).some((k) => bodyWords.has(k)));
  const dontHits = brief.tone.dont.filter((p) => containsPhrase(body, p));
  const hypeHits = HYPE_TERMS.filter((p) => containsPhrase(body, p));
  const coverage = required.length === 0 ? 0.5 : covered.length / required.length;
  const brandFit = clamp(0.5 + 0.5 * coverage - 0.3 * dontHits.length - 0.15 * hypeHits.length);
  signals.push({
    criterion: "brand_fit",
    observation:
      `${covered.length} of ${required.length} required points covered; ` +
      `${dontHits.length} stated don'ts and ${hypeHits.length} hype terms found`,
    evidence: [...covered.map((c) => `covers: ${c}`), ...dontHits.map((d) => `don't: ${d}`), ...hypeHits.map((h) => `hype: ${h}`)].slice(0, 12),
  });

  // Clarity: sentence length, paragraphing and overall length.
  const sentences = body.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const averageSentence = sentences.length === 0 ? 0 : words(body).length / sentences.length;
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim()).length;
  // Ten words a sentence or fewer scores full marks; thirty or more scores nothing.
  const sentenceScore = clamp((30 - averageSentence) / 20);
  const paragraphScore = clamp(paragraphs / 5);
  // 600 to 1500 characters is the range the drafting skill asks for.
  const lengthScore = body.length < 600 ? body.length / 600 : body.length <= 1500 ? 1 : clamp(1 - (body.length - 1500) / 1500);
  const clarity = clamp(0.5 * sentenceScore + 0.25 * paragraphScore + 0.25 * lengthScore);
  signals.push({
    criterion: "clarity",
    observation: `${round2(averageSentence)} words per sentence on average, ${paragraphs} paragraphs, ${body.length} characters`,
    evidence: [],
  });

  // Grounding: checkable claims and figures must point at a reference in the brief.
  const references = new Map(brief.references.map((r) => [r.id, canonicalText(`${r.title ?? ""} ${r.summary ?? ""}`)]));
  const checkable = draft.claims.filter((c) => c.needsEvidence);
  const supported = checkable.filter((c) => c.evidenceRef !== null && references.has(c.evidenceRef));
  for (const claim of checkable) {
    if (claim.evidenceRef === null) {
      failures.push({ rule: "unsupported-claim", detail: `No reference cited for: "${claim.text.slice(0, 200)}"` });
    } else if (!references.has(claim.evidenceRef)) {
      failures.push({
        rule: "unknown-evidence-reference",
        detail: `Reference "${claim.evidenceRef}" is not in the brief (claim: "${claim.text.slice(0, 160)}")`,
      });
    }
  }
  // Every number in the post or its hashtags (clock times aside) must appear in a claim that
  // cites a reference, and in that reference itself. Citing a reference that does not
  // contain the figure does not support it.
  const published = `${body}\n${hashtags.join(" ")}`;
  const figures = numbersIn(published);
  const citing = draft.claims.filter((c) => c.evidenceRef !== null && references.has(c.evidenceRef));
  const unlisted = figures.filter(
    (figure) => !citing.some((c) => hasNumber(canonicalText(c.text), figure) && hasNumber(references.get(c.evidenceRef as string) as string, figure)),
  );
  for (const figure of unlisted) {
    failures.push({
      rule: "unlisted-statistic",
      detail: `The figure "${figure}" is not backed by a claim that cites a brief reference containing it`,
    });
  }
  const spelled = [...new Set((published.match(SPELLED_QUANTITY) ?? []).map((m) => m.trim().toLowerCase()))];
  for (const quantity of spelled) {
    failures.push({
      rule: "unlisted-statistic",
      detail: `The quantity "${quantity}" is written in words; state figures in digits exactly as the cited reference does`,
    });
  }
  const ungrounded = unlisted.length + spelled.length;
  const grounding = ungrounded > 0 ? 0 : checkable.length === 0 ? 0.75 : supported.length / checkable.length;
  signals.push({
    criterion: "grounding",
    observation:
      `${supported.length} of ${checkable.length} checkable claims cite a brief reference; ` +
      `${figures.length + spelled.length} figures in the post, ${ungrounded} not backed by a cited reference`,
    evidence: [
      ...supported.map((c) => `${c.evidenceRef}: ${c.text.slice(0, 120)}`),
      ...unlisted.map((f) => `unsupported figure: ${f}`),
      ...spelled.map((q) => `figure in words: ${q}`),
    ].slice(0, 12),
  });

  // Opening line.
  const firstLine = (body.split("\n").find((l) => l.trim()) ?? "").trim();
  const specific = /\d|\?/.test(firstLine);
  const addressesReader = /\b(you|your|you're)\b/i.test(firstLine);
  // Up to 90 characters is short; the allowance falls away to nothing by 200.
  const brevity = firstLine.length <= 90 ? 0.5 : clamp((200 - firstLine.length) / 110) * 0.5;
  const hook = firstLine.length === 0 ? 0 : clamp(brevity + (specific ? 0.25 : 0) + (addressesReader ? 0.25 : 0));
  signals.push({
    criterion: "hook",
    observation: `Opening line is ${firstLine.length} characters; specific: ${specific}; addresses the reader: ${addressesReader}`,
    evidence: firstLine ? [firstLine.slice(0, 200)] : [],
  });

  // Call to action.
  const cta = draft.callToAction.trim();
  const ctaLead = words(cta).slice(0, 4).join(" ");
  const tail = body.slice(-500).toLowerCase();
  const inBody = ctaLead.length > 0 && words(body).join(" ").includes(ctaLead);
  const atClose = ctaLead.length > 0 && words(tail).join(" ").includes(ctaLead);
  const planTerms = keywords([slot.callToAction]);
  const matchesPlan = planTerms.length > 0 && planTerms.filter((t) => words(cta).includes(t)).length / planTerms.length >= 0.4;
  const callToAction = !cta ? 0 : !inBody ? 0.25 : !atClose ? 0.5 : matchesPlan ? 1 : 0.75;
  signals.push({
    criterion: "call_to_action",
    observation: `Call to action in the post: ${inBody}; at the close: ${atClose}; matches the plan for the slot: ${matchesPlan}`,
    evidence: cta ? [cta.slice(0, 200)] : [],
  });

  // Mandatory constraints that do not depend on any score.
  if (body.trim().length === 0) failures.push({ rule: "empty-body", detail: "The post has no text" });
  const length = body.length + (hashtags.length ? 2 + hashtags.join(" ").length : 0);
  if (length > limits.linkedinMaxChars) {
    failures.push({ rule: "over-length", detail: `${length} characters with hashtags; the limit is ${limits.linkedinMaxChars}` });
  }
  const squashedTags = hashtags.map(squash);
  for (const term of brief.constraints.mustAvoid) {
    const squashedTerm = squash(term);
    // Hashtags run words together, so a ruled-out term is looked for inside each one.
    const inHashtag = squashedTerm.length >= 4 && squashedTags.some((tag) => tag.includes(squashedTerm));
    if (containsPhrase(body, term) || inHashtag) {
      failures.push({ rule: "must-avoid-term", detail: `Contains "${term}", which the brief rules out` });
    }
  }
  // Text that tries to slip past the rules above: invisible or compatibility characters,
  // control characters, and words that mix Latin letters with look-alike scripts.
  const raw = `${draft.body}\n${draft.hashtags.join(" ")}`;
  const disguised = (raw.match(/[\p{L}\p{M}]+/gu) ?? []).filter((word) => LATIN.test(word) && LOOKALIKE_SCRIPT.test(word));
  if (canonicalText(raw) !== raw) {
    failures.push({ rule: "suspicious-characters", detail: "Contains invisible or compatibility characters (for example zero-width spaces or full-width digits)" });
  } else if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(raw)) {
    failures.push({ rule: "suspicious-characters", detail: "Contains control characters" });
  }
  if (disguised.length > 0) {
    failures.push({ rule: "suspicious-characters", detail: `Contains ${disguised.length} word(s) mixing Latin letters with look-alike letters from another script` });
  }

  return {
    features: {
      relevance: round2(relevance),
      brand_fit: round2(brandFit),
      clarity: round2(clarity),
      grounding: round2(grounding),
      hook: round2(hook),
      call_to_action: round2(callToAction),
    },
    signals,
    failures,
  };
}
