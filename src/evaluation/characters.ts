/**
 * The characters a draft may contain.
 *
 * A ruled-out word can be written so that a reader sees it and a rule does not: with a letter
 * from another alphabet, with a symbol that is drawn as a letter, with an emoji of a letter in
 * a square, with a small letter printed above another one. Several reviews each found a kind
 * that the lists of look-alikes then in use had missed, and no such list is ever complete.
 * So the rule is turned round: this file says what a draft MAY contain, and everything else
 * is refused. What is allowed is small enough to go through one character at a time, and for
 * each character that can stand in for a letter, signals.ts reads it as that letter too.
 *
 * The cost is stated in the threat model. A draft cannot quote a word in another script,
 * cannot use a symbol that is not listed here, and must put a space between an emoji and a
 * word.
 */

/**
 * Letters: the Latin alphabet as European languages write it, with Vietnamese and pinyin.
 * Not the phonetic, small-capital, historic or mathematical Latin letters.
 */
const LETTER =
  /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u01A0\u01A1\u01AF\u01B0\u01CD-\u01DC\u0218-\u021B\u1E00-\u1E99\u1E9E\u1EA0-\u1EF9]/u;

/** Every mark on an ordinary keyboard. */
const KEYBOARD_MARK = /[!-/:-@[-`{-~]/;

/**
 * Typographic marks in everyday use: quotation marks, dashes, bullets, currency signs, a few
 * arrows, ticks and stars, and the commonest signs of arithmetic. Those that can stand in for
 * a letter are read as that letter in signals.ts (SYMBOL_READING there must cover this list).
 */
const TYPOGRAPHIC = new Set(
  [
    "\u2018", "\u2019", "\u201A", "\u201C", "\u201D", "\u201E", "\u2013", "\u2014", "\u2022", "\u00B7", "\u00AB", "\u00BB", "\u2039", "\u203A",
    "\u00A1", "\u00BF", "\u00A7", "\u00B6", "\u2020", "\u2021", "\u00A9", "\u00AE", "\u00B0", "\u00B1", "\u00D7", "\u00F7", "\u20AC", "\u00A3",
    "\u00A5", "\u00A2", "\u2190", "\u2192", "\u2191", "\u2193", "\u2194", "\u21D2", "\u2713", "\u2714", "\u2717", "\u2718", "\u2605", "\u2606",
    "\u2212", "\u2032", "\u2030", "\u2248", "\u2260", "\u2264", "\u2265", "\u221E", "\u25AA", "\u25A0", "\u25A1", "\u25B6", "\u25BA", "\u25C6",
    "\u25CF",
  ].join(""),
);

/**
 * Emoji that are drawn as letters, words or ideographs: the information sign, the circled M,
 * the part alternation mark, the circled ideographs, and the whole block of squared and
 * circled letters and regional indicators' neighbours (U+1F100 to U+1F2FF).
 */
const LETTER_EMOJI = /[\u2139\u24C2\u303D\u3297\u3299\u{1F100}-\u{1F2FF}]/u;
const PICTURE = /\p{Extended_Pictographic}/u;
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;
const REGIONAL_INDICATOR = /\p{Regional_Indicator}/u;

const VARIATION = "\uFE0F";
const JOINER = "\u200D";
const KEYCAP = "\u20E3";

export const isAllowedLetter = (character: string): boolean => LETTER.test(character);

function isPicture(character: string | undefined): boolean {
  return character !== undefined && !TYPOGRAPHIC.has(character) && !LETTER_EMOJI.test(character) && PICTURE.test(character);
}

export interface CharacterProblems {
  /** Characters a draft may not contain, each once, in order of first appearance. */
  outside: string[];
  /** Emoji written directly against a letter or a digit. */
  attachedEmoji: number;
}

/**
 * Go through a text one character at a time and report what it may not contain. The text is
 * expected to be in canonical form already (see canonicalText): what compatibility folding
 * would change is refused before this is asked.
 */
export function characterProblems(text: string): CharacterProblems {
  const characters = [...text];
  const outside = new Set<string>();
  let attachedEmoji = 0;
  /** What kind of thing sits at each position: a letter or digit, part of an emoji, or neither. */
  const kind: Array<"word" | "emoji" | "other"> = [];

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i] as string;
    const previous = characters[i - 1];
    const next = characters[i + 1];
    if (LETTER.test(c) || /[0-9]/.test(c)) {
      kind.push("word");
    } else if (c === " " || c === "\n" || c === "\t" || KEYBOARD_MARK.test(c) || TYPOGRAPHIC.has(c)) {
      kind.push("other");
    } else if (isPicture(c) || SKIN_TONE.test(c)) {
      kind.push("emoji");
    } else if (REGIONAL_INDICATOR.test(c)) {
      // A flag is two of these. One on its own is drawn as a letter in a box.
      let start = i;
      while (start > 0 && REGIONAL_INDICATOR.test(characters[start - 1] as string)) start--;
      let end = i;
      while (end + 1 < characters.length && REGIONAL_INDICATOR.test(characters[end + 1] as string)) end++;
      if ((end - start + 1) % 2 !== 0) outside.add(c);
      kind.push("emoji");
    } else if (c === VARIATION && previous !== undefined && (kind[i - 1] === "emoji" || TYPOGRAPHIC.has(previous) || (/[0-9#*]/.test(previous) && next === KEYCAP))) {
      // Asks for the emoji drawing of what precedes it.
      kind.push(kind[i - 1] === "emoji" ? "emoji" : "other");
    } else if (c === JOINER && kind[i - 1] === "emoji" && isPicture(next)) {
      kind.push("emoji");
    } else if (c === KEYCAP && previous !== undefined && (/[0-9#*]/.test(previous) || (previous === VARIATION && /[0-9#*]/.test(characters[i - 2] ?? "")))) {
      // A digit in a keycap. The digit itself is still a digit, and a figure.
      kind.push("other");
    } else {
      outside.add(c);
      kind.push("other");
    }
  }

  // An emoji against a word can stand in for a letter of it. Emoji are written apart.
  for (let i = 0; i < characters.length; i++) {
    if (kind[i] !== "emoji") continue;
    if (kind[i - 1] === "word" || kind[i + 1] === "word") attachedEmoji += 1;
  }
  return { outside: [...outside], attachedEmoji };
}

/** A character named so that it cannot itself mislead: "U+1F170". */
export const named = (character: string): string => `U+${(character.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`;
