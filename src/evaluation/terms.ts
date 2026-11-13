/**
 * Looking for a ruled-out term in the text of a post.
 *
 * The rule errs towards refusing. A term is looked for in every way a reader could take each
 * word of the text: with accents off and look-alike letters read as plain ones; with the
 * marks around a word left off; with every mark, digit and symbol that can stand in for a
 * letter read as that letter; with a lower-case L beside a capital read as a capital I, and a
 * capital I after small letters as an L; with what is slipped inside a word removed, or taken
 * as a break between two words; and with single letters set apart by spaces or dots joined.
 *
 * What it does not do is stated in the threat model: it does not understand a rephrasing, and
 * it does not read two ordinary letters as the one they are drawn to resemble ("rn" for "m").
 */

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

/** Accents off and look-alike letters to the plain ones they resemble. */
export function fold(text: string, asSeen = false): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(CONFUSABLE_LETTER, (c) => (asSeen ? AS_SEEN[c] : undefined) ?? CONFUSABLE[c] ?? c);
}

/**
 * What each mark, digit and symbol a draft may contain is read as when it is read as a letter.
 * Every character allowed by characters.ts that is drawn like a letter and can be written
 * against one is here. An upright stroke and the digit one are read once as "i" and once as
 * "l". Brackets are not read as "c": they stand against words too often in honest text.
 */
const SYMBOL_READING: Record<string, string> = {
  "@": "a", $: "s", "!": "i", "+": "t", "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "\u00A2": "c", "\u20AC": "e", "\u00A3": "l", "\u00A5": "y", "\u00D7": "x", "\u00B0": "o", "\u2022": "o", "\u00A1": "i",
  "\u2020": "t", "\u2021": "t", "\u00A7": "s", "\u00A9": "c", "\u00AE": "r",
};
const REPEATED = /([@$!+|0134578\u00A2\u20AC\u00A3\u00A5\u00D7\u00B0\u2022\u00A1\u2020\u2021\u00A7\u00A9\u00AE])\1+/g;
const READABLE = /[@$!+|0134578\u00A2\u20AC\u00A3\u00A5\u00D7\u00B0\u2022\u00A1\u2020\u2021\u00A7\u00A9\u00AE]/g;

/** Whatever opens or closes a word without being a letter or a digit: stops, quotation marks, brackets, dashes, signs. */
const LEADING_EDGE = /^[^\p{L}\p{N}]+/u;
const TRAILING_EDGE = /[^\p{L}\p{N}]+$/u;

/**
 * The contractions that are read as they stand. A closed list of whole words: with the
 * apostrophe removed, several would be other words ("we'll", "I'll", "we're", "can't", "it's").
 * An apostrophe anywhere else in a word is a mark like any other.
 */
const CONTRACTION = new RegExp(
  "^(?:" +
    "(?:i|you|he|she|it|we|they|that|there|who|what)'ll" +
    "|(?:you|we|they|who)'re" +
    "|(?:i|you|we|they|who|would|could|should)'ve" +
    "|(?:i|you|he|she|it|we|they|who)'d" +
    "|i'm" +
    "|(?:it|he|she|that|there|here|what|who|where|how|let)'s" +
    "|(?:ca|wo|do|does|did|is|are|was|were|have|has|had|would|could|should|must)n't" +
    ")$",
  "i",
);
const contractionOf = (word: string): string | null => {
  const plain = word.replace(/\u2019/g, "'");
  return CONTRACTION.test(plain) ? plain : null;
};

/** Stands between the letters of a run of single letters that was joined. Never in a text: it is not a letter, a digit or a space. */
const RUN = "\u00B7";
const L_BESIDE_A_CAPITAL = /(?<=\p{Lu}\u00B7?)l|l(?=\u00B7?\p{Lu})/gu;
const I_AFTER_SMALL_LETTERS = /(?<=\p{Ll}(?:\u00B7?I)*\u00B7?)I/gu;

/** Letters and digits kept; every run of anything else becomes `between`. */
const lettersOf = (text: string, between: string): string => text.replace(/[^\p{L}\p{N}]+/gu, between).trim();

/** One way of reading a word. Each is applied to every word of a text in turn. */
interface Reading {
  /** Leave off the marks that open and close the word. */
  stripEdges: boolean;
  /** Read the sharp s, thorn and eth as the letters they resemble, not the ones they stand for. */
  asSeen: boolean;
  /** Read marks, digits and symbols as letters; the stroke and the digit one as this letter. */
  stroke: "i" | "l" | null;
  /** What is left between the letters of a word: nothing, or a break between two words. */
  between: "" | " ";
  /** Read a run of one symbol repeated as a single letter ("w!!n"), not as that letter repeated ("fr\u20AC\u20AC"). */
  once: boolean;
}

const READINGS: Reading[] = [];
for (const stripEdges of [false, true]) {
  for (const asSeen of [false, true]) {
    for (const stroke of [null, "i", "l"] as const) {
      for (const between of ["", " "] as const) {
        READINGS.push({ stripEdges, asSeen, stroke, between, once: false });
        if (stroke !== null) READINGS.push({ stripEdges, asSeen, stroke, between, once: true });
      }
    }
  }
}

function readWord(word: string, reading: Reading): string {
  const core = reading.stripEdges ? word.replace(LEADING_EDGE, "").replace(TRAILING_EDGE, "") : word;
  const contraction = contractionOf(core.replace(LEADING_EDGE, "").replace(TRAILING_EDGE, ""));
  if (contraction !== null) return contraction;
  let text = fold(core, reading.asSeen);
  if (reading.stroke !== null) {
    const stroke = reading.stroke;
    if (reading.once) text = text.replace(REPEATED, "$1");
    // The stroke and the digit one are read as "i" or as "l". The pound sign, which is drawn
    // like both an L and an E, is read as "e" in the first reading and "l" in the second.
    text = text.replace(READABLE, (c) => (c === "|" || c === "1" ? stroke : c === "\u00A3" && stroke === "i" ? "e" : (SYMBOL_READING[c] ?? c)));
  }
  return lettersOf(text, reading.between);
}

/**
 * Every form of a text that a term is looked for in: its words read each way, single letters
 * set apart joined up, and the two readings of I and l. Lower case, words one space apart.
 */
export function readingsOf(text: string): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const forms = new Set<string>();
  for (const reading of READINGS) {
    const read = words.map((word) => readWord(word, reading)).filter((word) => word !== "").join(" ");
    // Single letters set apart, by spaces or by dots: "A I", "R. O. I.", "s c a m". A run of
    // them is joined, with a mark between the letters in place of the spaces, so that a term
    // can be found anywhere along the run: in "a s c a m" the word begins at the second letter.
    const joined = read.replace(/(?<![^ ])(?:[\p{L}\p{N}] )+[\p{L}\p{N}](?![^ ])/gu, (run) => run.replace(/ /g, RUN));
    for (const form of new Set([read, joined])) {
      forms.add(form.toLowerCase());
      // In the type a post is set in, a capital I and a lower-case L are drawn alike.
      forms.add(form.replace(L_BESIDE_A_CAPITAL, "I").toLowerCase());
      forms.add(form.replace(I_AFTER_SMALL_LETTERS, "l").toLowerCase());
    }
  }
  return [...forms];
}

/**
 * The endings under which the last word of a term still matches. English spelling decides
 * them. The aim is to catch the word's own inflections without catching other words:
 *
 * - One or two letters ("AI", "US"): the plural only. With more, "US" would catch "used".
 * - Three letters ending consonant, vowel, consonant ("ban", "win", "bus"): "-s", "-es", and
 *   "-ed" and "-ing" with the last letter doubled, as English writes them ("banned").
 *   Without the doubling they are other words ("fund" is not "fun"; "wind" is not "win").
 * - Any other three letters ("fix", "tax", "buy", "fee"): "-s", "-es", "-ed", "-ing".
 * - Four letters or more: the same, with or without a doubled last consonant ("scammed",
 *   "marketed"), and a bare "-d" after a final "e" ("guaranteed").
 * - A final "e" is dropped before "-ing" ("curing"), and a final "y" after a consonant
 *   becomes "-ied" and "-ies" ("denied").
 */
function lastWordPattern(last: string): string {
  const length = [...last].length;
  const whole = spelled(last);
  if (length <= 2) return `${whole}s?`;
  const final = last.slice(-1);
  const stem = spelled(last.slice(0, -1));
  const alternatives: string[] = [];
  if (length === 3 && /[^aeiou][aeiou][bcdfgklmnprstvz]$/.test(last)) {
    alternatives.push(`${whole}(?:s|es|${final}ed|${final}ing)?`);
  } else if (length === 3) {
    alternatives.push(`${whole}(?:s|es|ed|ing)?`);
  } else {
    const doubled = /[bcdfgklmnprstvz]/.test(final) ? `${final}?` : "";
    alternatives.push(`${whole}(?:s|es|${final === "e" ? "d|" : ""}${doubled}ed|${doubled}ing)?`);
  }
  if (final === "e" && length >= 4) alternatives.push(`${stem}ing`);
  if (final === "y" && /[^aeiou]y$/.test(last)) alternatives.push(`${stem}(?:ied|ies)`);
  return `(?:${alternatives.join("|")})`;
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A word of a term as a pattern that also finds it along a joined run of single letters. */
const spelled = (word: string): string => [...word].map(escaped).join(`${RUN}?`);

/** The words of a term, as they are looked for: contractions as they stand, anything else as its letters and digits. */
function wordsOfTerm(term: string): string[] {
  const words: string[] = [];
  for (const word of term.split(/\s+/)) {
    const contraction = contractionOf(word.replace(LEADING_EDGE, "").replace(TRAILING_EDGE, ""));
    if (contraction !== null) words.push(contraction.toLowerCase());
    else words.push(...lettersOf(fold(word), " ").toLowerCase().split(" ").filter((part) => part !== ""));
  }
  return words;
}

/**
 * A term that is not made of words: one with no letter or digit at all ("$$$"), or with a
 * sign that is part of its name ("C++"). Reduced to its letters it would be nothing, or
 * another word. It is looked for as it is written.
 */
const isLiteral = (term: string): boolean => /[^\p{L}\p{N}\s\-_./'\u2019&]/u.test(term) || !/[\p{L}\p{N}]/u.test(term);

/** A function that says whether a term appears in the text it was made for. */
export function termFinder(text: string): (term: string) => boolean {
  const forms = readingsOf(text);
  const lowered = text.toLowerCase();
  return (term: string): boolean => {
    const wanted = term.trim();
    if (wanted === "") return false;
    if (isLiteral(wanted)) {
      const literal = wanted.toLowerCase();
      const before = /^[\p{L}\p{N}]/u.test(literal) ? "(?<![\\p{L}\\p{N}])" : "";
      const after = /[\p{L}\p{N}]$/u.test(literal) ? "(?![\\p{L}\\p{N}])" : "";
      return new RegExp(`${before}${escaped(literal)}${after}`, "u").test(lowered);
    }
    const words = wordsOfTerm(wanted);
    if (words.length === 0) return false;
    const last = words[words.length - 1] as string;
    // The words of the term may be joined, hyphenated or spaced in the text ("AI-powered"
    // catches "AI powered" and "AIpowered"). A longer, different word does not match.
    const pattern = [...words.slice(0, -1).map(spelled), lastWordPattern(last)].join(`[ ${RUN}]?`);
    const found = new RegExp(`(?<![\\p{L}\\p{N}'])${pattern}(?![\\p{L}\\p{N}'])`, "u");
    return forms.some((form) => found.test(form));
  };
}

/**
 * The same for hashtags, where words are run together. A tag is read as its words (split at
 * an underscore and where a small letter meets a capital) and as one word. A term of four
 * letters or more is also looked for anywhere inside the tag; a shorter one at its start and
 * at its end, where a short word run together with others is found ("#AIpowered").
 */
export function hashtagFinder(tags: readonly string[]): (term: string) => boolean {
  const read = tags.map((tag) => {
    const name = tag.replace(/^#/, "");
    const spaced = name.replace(/_+/g, " ").replace(/(?<=\p{Ll})(?=\p{Lu})/gu, " ");
    const whole = readingsOf(name).map((form) => form.replace(/[ \u00B7]/g, ""));
    return { find: termFinder(spaced), whole: [...new Set(whole)] };
  });
  return (term: string): boolean => {
    if (isLiteral(term.trim())) return read.some((tag) => tag.find(term));
    const squashed = wordsOfTerm(term).join("").replace(/'/g, "");
    if (squashed === "") return false;
    return read.some(
      (tag) =>
        tag.find(term) ||
        tag.whole.some((whole) => (squashed.length >= 4 ? whole.includes(squashed) : whole.startsWith(squashed) || whole.endsWith(squashed))),
    );
  };
}
