import type {
  CampaignBrief,
  CriterionKey,
  EligibilityFailure,
  PostDraft,
  ProgrammeSlot,
  Signal,
} from "../contracts/index.ts";
import type { Limits } from "../limits.ts";
import { canonicalText, settledCanonicalText, truncate } from "../util/runtime.ts";
import { characterProblems, named } from "./characters.ts";

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

/**
 * Clock times are not figures a reader would check against a source. Only forms that cannot
 * be a ratio or an amount are read as times: an hour from 1 to 12 with "am" or "pm"; a
 * 24-hour time written with a leading zero or an hour from 13 to 23 ("09:30", "16:30");
 * any other hour and minutes directly after "at" or directly before a time zone. "1:25" on
 * its own is a ratio as far as this rule can tell, and "40 pm" is not a time.
 */
const CLOCK_TIME = new RegExp(
  "\\b(?:1[0-2]|0?[1-9])(?::[0-5]\\d)?\\s?(?:am|pm)\\b" +
    "|\\b(?:0\\d|1[3-9]|2[0-3]):[0-5]\\d\\b" +
    "|(?<=\\bat\\s)(?:1[0-2]|[1-9]):[0-5]\\d\\b" +
    "|\\b(?:1[0-2]|[1-9]):[0-5]\\d(?=\\s?(?:UTC|GMT|BST|CET|CEST|EST|EDT|PST|PDT)\\b)",
  "gi",
);
/** Any number written in the digits 0 to 9. */
const NUMBER = /\d(?:[\d,.]*\d)?/g;
/**
 * A numeral that is not one of the digits 0 to 9: digits of another script, and number signs
 * that compatibility folding leaves alone. A figure written this way cannot be matched
 * against a reference, so it is refused like a quantity written in words.
 */
const OTHER_NUMERAL = /(?:(?![0-9])\p{N})+/gu;

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
    `|\\b(?:halved|doubled|tripled|quadrupled)\\b` +
    // Magnitudes attached to a thing: "two million records", "a hundred hours", "hundreds of", "a dozen".
    `|\\b(?:(?:a|an|${NUMBER_PHRASE})[\\s-]+)?(?:hundred|thousand|million|billion|dozen)s?\\b` +
    // Fractions of a thing: "half their time", "a third", "two thirds of".
    `|\\bhalf\\s+(?:of|the|their|your|our|its)\\b` +
    `|\\b(?:a|one|two|three)[\\s-]+(?:third|quarter|fifth|tenth)s?\\s+of\\b`,
  "gi",
);

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
  // The term is folded the way the text is (accents off, look-alike letters to plain ones), and
  // its words are whatever letters and digits it has: "na\u00EFve" is one word.
  const parts = fold(phrase).toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!parts) return false;
  const pattern = parts.join("[\\s\\-_./\u2010-\u2015]*");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}${inflections(parts[parts.length - 1] as string)}(?![\\p{L}\\p{N}])`, "iu").test(haystack);
}

/**
 * The endings under which the last word of a ruled-out term still matches. English spelling
 * decides them, and the aim is to catch the word's own inflections without catching other words:
 *
 * - One or two letters ("AI", "US"): the plural only. With more, "US" would catch "used".
 * - Three letters ending consonant, vowel, consonant ("ban", "win", "fun"): the plural, and
 *   "-ed" and "-ing" with the last letter doubled, as English writes them ("banned"). Without
 *   the doubling they are other words ("fund" is not "fun"; "wind" is not "win").
 * - Any other three letters ("fix", "tax", "buy", "fee"): "-s", "-es", "-ed", "-ing".
 * - Four letters or more: the same, with or without a doubled last consonant ("scammed",
 *   "marketed"), and a bare "-d" after a final "e" ("guaranteed").
 */
function inflections(last: string): string {
  const length = [...last].length;
  if (length <= 2) return "s?";
  const final = last.slice(-1);
  const doubles = /[bcdfgklmnprstvz]/.test(final);
  if (length === 3) return /[^aeiou][aeiou][bcdfgklmnprstvz]$/.test(last) ? `(?:s|${final}ed|${final}ing)?` : "(?:s|es|ed|ing)?";
  const doubled = doubles ? `${final}?` : "";
  return `(?:s|es|${final === "e" ? "d|" : ""}${doubled}ed|${doubled}ing)?`;
}

/** Letters and digits only, folded and lower case. Used where words are run together, as in hashtags. */
function squash(text: string): string {
  return fold(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Digits that are part of an everyday term and state no figure: "B2B", "Q3", "24/7", an
 * identifier such as "COVID-19" or "ISO-9001", and a year named as a date ("in 2026").
 * These are removed before figures are looked for. The list is deliberately short.
 */
const NOT_A_FIGURE = [
  /\b[A-Z]2[A-Z]\b/g,
  /\bQ[1-4]\b/g,
  /\b24\/7\b/g,
  // Named standards and the like. A short fixed list: any other "WORD-123" is a figure.
  /\b(?:ISO|IEC|SOC|RFC|COVID)[- ]\d{1,5}\b/g,
  // A year named as a date: after a word that only introduces a date, and followed by the end
  // of the clause or by a word that cannot be the thing counted ("in 2026 we", not "in 2026
  // customers"). "by" and "from" are not such words: "cut hours by 1950" states a figure.
  /\b(?:in|since|during|until|before|after|early|late|mid)[\s-]+(?:19|20)\d{2}\b(?=\s*(?:[.,;:!?)]|$|\n)|\s+(?:and|or|we|the|it|this|that|our|when|was|were|is|has|had|will|there)\b)/gi,
  // "By 2027 this will ..." only where "By" opens a sentence; inside one, "by 1950" is an amount.
  /(?:^|(?<=[.!?]\s)|(?<=\n))By\s+(?:19|20)\d{2}\b(?=\s*(?:[.,;:!?)]|$|\n)|\s+(?:we|the|it|this|that|our|there)\b)/g,
];

/** "from 2019 to 2024": a span of years, read as dates only when it runs forward in time. */
const YEAR_SPAN = /\b((?:from|between|during|since)\s+)((?:19|20)\d{2})(\s*(?:-|\u2013|to|and)\s*)((?:19|20)\d{2})\b(?=\s*(?:[.,;:!?)]|$|\n)|\s+(?:and|or|we|the|it|this|that|our|when|was|were|is|has|had|will|there)\b)/gi;

/** The numbers written in digits in a text, without clock times and everyday terms, as plain digit strings. */
function numbersIn(text: string, options: { everydayTerms: boolean } = { everydayTerms: true }): string[] {
  let scanned = text.replace(CLOCK_TIME, " ");
  if (options.everydayTerms) {
    scanned = scanned.replace(YEAR_SPAN, (whole, _lead, first: string, _join, second: string) => (Number(second) > Number(first) ? " " : whole));
    for (const pattern of NOT_A_FIGURE) scanned = scanned.replace(pattern, " ");
  }
  const found = scanned.match(NUMBER) ?? [];
  return [...new Set(found.map((n) => n.replace(/,/g, "").replace(/\.$/, "")))];
}

/** Letters that are easily mistaken for plain Latin ones, mapped to the letter they resemble. */
const CONFUSABLE: Record<string, string> = {
  "\u0131": "i", "\u0261": "g", "\u0251": "a", "\u0269": "i", "\u026A": "i", "\u028F": "y", "\u0299": "b", "\u1D00": "a", "\u1D04": "c",
  "\u1D05": "d", "\u1D07": "e", "\u1D0A": "j", "\u1D0B": "k", "\u1D0D": "m", "\u1D0F": "o", "\u1D18": "p", "\u1D1B": "t", "\u1D1C": "u",
  "\u1D20": "v", "\u1D21": "w", "\u1D22": "z", "\u0142": "l", "\u00F8": "o", "\u0111": "d", "\u0127": "h", "\u017F": "s", "\u01C0": "l",
  // Greek capitals and small letters that pass for Latin ones.
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H", "\u0399": "I", "\u039A": "K", "\u039C": "M", "\u039D": "N",
  "\u039F": "O", "\u03A1": "P", "\u03A4": "T", "\u03A5": "Y", "\u03A7": "X", "\u03B1": "a", "\u03B2": "b", "\u03B3": "y", "\u03B5": "e",
  "\u03B7": "n", "\u03B9": "i", "\u03BA": "k", "\u03BC": "u", "\u03BD": "v", "\u03BF": "o", "\u03C1": "p", "\u03C4": "t", "\u03C5": "u",
  "\u03C7": "x", "\u03C9": "w", "\u03F2": "c", "\u03F9": "C", "\u03F3": "j",
  // Cyrillic capitals and small letters that pass for Latin ones.
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041A": "K", "\u041C": "M", "\u041D": "H", "\u041E": "O", "\u0420": "P", "\u0421": "C",
  "\u0422": "T", "\u0423": "Y", "\u0425": "X", "\u0405": "S", "\u0406": "I", "\u0408": "J", "\u0430": "a", "\u0432": "b", "\u0435": "e",
  "\u043A": "k", "\u043C": "m", "\u043D": "h", "\u043E": "o", "\u0440": "p", "\u0441": "c", "\u0442": "t", "\u0443": "y", "\u0445": "x",
  "\u0455": "s", "\u0456": "i", "\u0458": "j", "\u0501": "d", "\u04BB": "h", "\u051B": "q", "\u051D": "w", "\u0433": "r", "\u043F": "n",
  "\u044C": "b",
  // Letters of European alphabets that are allowed in a post and resemble, or stand for, plain ones.
  "\u00E6": "ae", "\u00C6": "AE", "\u00F0": "d", "\u00D0": "D", "\u00D8": "O", "\u00FE": "th", "\u00DE": "Th", "\u00DF": "ss",
  "\u0110": "D", "\u0126": "H", "\u0138": "k", "\u0141": "L", "\u014B": "n", "\u014A": "N", "\u0153": "oe", "\u0152": "OE",
  "\u0167": "t", "\u0166": "T", "\u1E9E": "SS",
};
/**
 * The same letters as a reader who does not know them may see them: the sharp s as a capital
 * B, thorn as p, eth as o. A term is looked for under both readings.
 */
const AS_SEEN: Record<string, string> = { "\u00DF": "B", "\u1E9E": "B", "\u00FE": "p", "\u00DE": "P", "\u00F0": "o" };
const CONFUSABLE_LETTER = new RegExp(`[${Object.keys(CONFUSABLE).join("")}]`, "gu");

/**
 * Accents off and look-alike letters to the plain ones they resemble. Applied to a ruled-out
 * term and to the text it is looked for in, so that "ΑΙ" in Greek capitals is found as "AI".
 */
function fold(text: string, asSeen = false): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(CONFUSABLE_LETTER, (c) => (asSeen ? AS_SEEN[c] : undefined) ?? CONFUSABLE[c] ?? c);
}

/**
 * The forms of a text that a ruled-out term is looked for in. Besides the text itself: with
 * accents off and look-alike letters read as plain ones; with the marks, digits and symbols
 * that can stand in for a letter read as that letter; with a lower-case L beside a capital
 * read as a capital I, and a capital I after small letters read as a lower-case L, since in
 * the type a post is set in they are drawn alike; with dots removed from dotted initials
 * ("A.I." becomes "AI"); with anything slipped inside a word removed; and with letters that
 * were spaced out joined up.
 */
function matchForms(text: string): string[] {
  const forms = new Set<string>();
  const sources = new Set<string>([text]);
  for (const read of symbolsAsLetters(text)) sources.add(read);
  for (const source of [...sources]) {
    sources.add(source.replace(/(?<=\p{Lu})l|l(?=\p{Lu})/gu, "I"));
    sources.add(source.replace(/(?<=\p{Ll}I*)I/gu, "l"));
  }
  for (const source of sources) {
    for (const folded of new Set([fold(source), fold(source, true)])) {
      const undotted = folded.replace(/\b(?:[A-Za-z]\.){2,}/g, (m) => m.replace(/\./g, ""));
      // Anything slipped between two letters that is not itself a letter, a digit or a space:
      // hyphens and dashes of every kind, emphasis marks, punctuation, symbols, emoji. The
      // apostrophe of a common contraction is left where it is: "we'll" is not "well". Only
      // the contractions listed are spared; an apostrophe put anywhere else in a word, before
      // an ending included ("guarantee'd"), is removed like any other mark.
      const kept = undotted.replace(CONTRACTION, (whole) => whole.replace(/['\u2019]/, KEPT_APOSTROPHE));
      const unbroken = kept.replace(/(?<=[\p{L}\p{N}])[^\p{L}\p{N}\s\uE000]+(?=[\p{L}\p{N}])/gu, "").replaceAll(KEPT_APOSTROPHE, "'");
      // Single letters set apart by spaces or dots: "A I", "R. O. I.", "s c a m".
      const joined = unbroken.replace(/\b(?:[A-Za-z][ .])+[A-Za-z]\b/g, (m) => m.replace(/[ .]/g, ""));
      for (const form of [source, folded, undotted, unbroken, joined]) forms.add(form);
    }
  }
  return [...forms];
}

/** Stands in for an apostrophe that is to be kept. A private-use character: a draft may not contain one. */
const KEPT_APOSTROPHE = "\uE000";

/**
 * The contractions whose apostrophe is kept. A closed list of whole words: with the apostrophe
 * removed, several would become other words ("we'll", "I'll", "we're", "can't", "it's").
 */
const CONTRACTION = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:" +
    "(?:i|you|he|she|it|we|they|that|there|who|what)['\u2019]ll" +
    "|(?:you|we|they|who)['\u2019]re" +
    "|(?:i|you|we|they|who|would|could|should)['\u2019]ve" +
    "|(?:i|you|he|she|it|we|they|who)['\u2019]d" +
    "|i['\u2019]m" +
    "|(?:it|he|she|that|there|here|what|who|where|how|let)['\u2019]s" +
    "|(?:ca|wo|do|does|did|is|are|was|were|have|has|had|would|could|should|must)n['\u2019]t" +
    ")(?![\\p{L}\\p{N}])",
  "giu",
);

/**
 * What each mark, digit and symbol a draft may contain is read as when it stands against a
 * letter. Every single character allowed by characters.ts that is drawn like a letter is
 * here. An upright stroke and the digit one are read once as "i" and once as "l". Brackets
 * are not read as "c": they stand against words too often in honest text ("(at" is not "cat").
 * Two letters drawn to look like one ("rn" for "m", "vv" for "w") are not read either: they
 * are ordinary letters, and the words they are part of are ordinary words.
 */
const SYMBOL_READING: Record<string, string> = {
  "@": "a", $: "s", "!": "i", "+": "t", "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "\u00A2": "c", "\u20AC": "e", "\u00A3": "l", "\u00A5": "y", "\u00D7": "x", "\u00B0": "o", "\u2022": "o", "\u25CF": "o", "\u00A1": "i",
  "\u2020": "t", "\u2021": "t", "\u00A7": "s", "\u00A9": "c", "\u00AE": "r", "\u2717": "x", "\u2718": "x",
};
const READ_AS_LETTER = /(?<=\p{L})[@$!+|0134578\u00A2\u20AC\u00A3\u00A5\u00D7\u00B0\u2022\u25CF\u00A1\u2020\u2021\u00A7\u00A9\u00AE\u2717\u2718]|[@$!|0134578\u00A2\u20AC\u00A3\u00A5\u00D7\u00B0\u2022\u25CF\u00A1\u2020\u2021\u00A7\u00A9\u00AE\u2717\u2718](?=\p{L})/gu;

/**
 * The text with marks, digits and symbols read as the letters they can stand in for, wherever
 * one stands against a letter: inside a word ("gu@rantee"), at its start ("$cam") or at its
 * end ("A|"). A plus sign is read only after a letter. These readings are added to the forms
 * a term is looked for in; they take nothing away.
 */
function symbolsAsLetters(text: string): string[] {
  const read = (stroke: string) => text.replace(READ_AS_LETTER, (c) => (c === "|" || c === "1" ? stroke : (SYMBOL_READING[c] ?? c)));
  return [read("i"), read("l")].filter((form) => form !== text);
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
  // Everyday terms ("B2B", "in 2026") are not figures in running text. Inside a hashtag every digit counts.
  const figures = [...new Set([...numbersIn(body), ...numbersIn(hashtags.join(" "), { everydayTerms: false })])];
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
  const otherNumerals = [...new Set(published.match(OTHER_NUMERAL) ?? [])];
  for (const numeral of otherNumerals) {
    failures.push({
      rule: "unlisted-statistic",
      detail: `The figure "${numeral.slice(0, 40)}" is not written in the digits 0 to 9; state figures in digits exactly as the cited reference does`,
    });
  }
  const spelled = [...new Set((published.match(SPELLED_QUANTITY) ?? []).map((m) => m.trim().toLowerCase()))];
  for (const quantity of spelled) {
    failures.push({
      rule: "unlisted-statistic",
      detail: `The quantity "${quantity}" is written in words; state figures in digits exactly as the cited reference does`,
    });
  }
  const ungrounded = unlisted.length + spelled.length + otherNumerals.length;
  const grounding = ungrounded > 0 ? 0 : checkable.length === 0 ? 0.75 : supported.length / checkable.length;
  signals.push({
    criterion: "grounding",
    observation:
      `${supported.length} of ${checkable.length} checkable claims cite a brief reference; ` +
      `${figures.length + spelled.length + otherNumerals.length} figures in the post, ${ungrounded} not backed by a cited reference`,
    evidence: [
      ...supported.map((c) => `${c.evidenceRef}: ${c.text.slice(0, 120)}`),
      ...unlisted.map((f) => `unsupported figure: ${f}`),
      ...spelled.map((q) => `figure in words: ${q}`),
      ...otherNumerals.map((n) => `figure in other numerals: ${n.slice(0, 40)}`),
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
  const squashedTags = hashtags.flatMap((tag) => matchForms(tag).map(squash));
  const bodyForms = matchForms(body);
  for (const term of brief.constraints.mustAvoid) {
    const squashedTerm = squash(term);
    // Hashtags run words together, so a ruled-out term is looked for inside each one.
    const inHashtag = squashedTerm.length >= 4 && squashedTags.some((tag) => tag.includes(squashedTerm));
    if (bodyForms.some((form) => containsPhrase(form, term)) || inHashtag) {
      failures.push({ rule: "must-avoid-term", detail: `Contains "${term}", which the brief rules out` });
    }
  }
  // Text that tries to slip past the rules above. A draft must be in canonical form, and may
  // contain only the characters listed in characters.ts. Every part the editor is shown or the
  // record keeps is checked, not only what is published, and each part is held to the same
  // rule whatever the rest contains.
  const raw = [draft.body, draft.hashtags.join(" "), draft.hook, draft.callToAction, ...draft.claims.map((c) => c.text)].join("\n");
  if (canonicalText(raw) !== raw) {
    failures.push({ rule: "suspicious-characters", detail: "Contains invisible or compatibility characters (for example zero-width spaces or full-width digits)" });
  }
  // What canonical form would remove is reported once, above; the characters are then checked in what remains.
  const problems = characterProblems(canonicalText(raw) === raw ? raw : settledCanonicalText(raw));
  if (problems.outside.length > 0) {
    const shown = problems.outside.slice(0, 8).map(named).join(", ");
    failures.push({
      rule: "suspicious-characters",
      detail: `Contains ${problems.outside.length} kind(s) of character a post may not use (${shown}${problems.outside.length > 8 ? ", ..." : ""}): letters outside the ordinary Latin alphabet, or symbols that can pass for letters`,
    });
  }
  if (problems.attachedEmoji > 0) {
    failures.push({ rule: "suspicious-characters", detail: `${problems.attachedEmoji} emoji are written against a word; put a space between an emoji and a word` });
  }

  // What is kept of each observation is cut to the length the contract allows. Eligibility
  // rests on every failure found, not on how much of its description is kept.
  for (const signal of signals) {
    signal.observation = truncate(signal.observation, 400);
    signal.evidence = signal.evidence.map((item) => truncate(item, 200)).filter((item) => item.length > 0);
  }
  for (const failure of failures) failure.detail = truncate(failure.detail, 400);

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
