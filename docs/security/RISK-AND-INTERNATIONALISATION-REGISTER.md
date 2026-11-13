# Risk and internationalisation register

Opened on 2026-11-13 under `docs/spec/directives/KIC-01-GATE-RECONCILIATION-INSTRUCTION-2026-11-13.md`, sections 5 and 7. It describes the code at commit `c83b0cbd0134eb224552b73e52a43b7111cde721` and changes nothing in it.

It does not replace the earlier lists; it gathers them and adds the internationalisation record the owner asked for. The detailed lists remain where they were: `docs/security/THREAT-MODEL.md` ("Known weaknesses"), `harness/state/GATE_STATE.md` (A1 to A26, E1 to E11, B1 to B4) and `docs/spec/EVALUATOR-ACCEPTANCE-CONTRACT.md` (L1 to L15, F1 to F6).

## Part 1. The character list: a temporary prototype constraint

**Standing, by the owner's instruction of 2026-11-13: the list of characters a draft may contain is a temporary constraint of the prototype. It is not an approved, permanent commercial product policy.** It is not broadened or replaced in this phase.

### 1.1 What the list is

`src/evaluation/characters.ts`. A draft (body, hashtags, hook, call to action, claims) may contain only:

| Group | Contents | Count |
|---|---|---|
| Letters | The Latin alphabet as European languages write it: basic Latin, the Latin-1 letters, Latin Extended-A, the Romanian comma letters, the Vietnamese letters, the pinyin tone letters, the capital sharp s | 505 |
| Digits | 0 to 9 | 10 |
| Keyboard marks | Every mark on an ordinary keyboard | 32 |
| Typographic marks | Curly quotation marks, dashes, a bullet, guillemets, inverted marks, section and paragraph signs, daggers, ©, ®, °, ±, ×, ÷, €, £, ¥, ¢, minus, prime, per mille, ≈, ≠, ≤, ≥, ∞ | 38 |
| Pictures | 22 arrows, ticks, stars and shapes; 87 emoji, each a picture of a thing, a face or a gesture | 109 |
| Other | The space and the line feed; the emoji variation selector, only directly after a listed picture | — |

Anything else makes the draft ineligible, with the rule `suspicious-characters`. A picture must stand apart from letters and digits. The count the reviews confirmed is 694 characters, 696 code points with the space and the line feed (review of `e30451c`). The group counts above were obtained by the orchestrator on 2026-11-13 by running every code point through the code at `c83b0cb`, and sum to 694; they were not separately reviewed. The letter pattern in the file names 511 letters; six of them (the Dutch ij ligatures, the Catalan l with middle dot, the n preceded by an apostrophe, the long s) can never appear, because compatibility folding changes them and the draft is refused as not in canonical form before the list is consulted.

### 1.2 Why it exists: the security rationale

A ruled-out word can be written so that a reader sees it and a rule does not. Four reviews in a row each found a kind that the lists of look-alike characters then in use had missed:

| Review | What passed |
|---|---|
| `2537386` | Greek and Cyrillic letters that pass for Latin ones; digits of other scripts |
| `1d8bafe` | Letters of the extended Latin blocks that pass for plain ones |
| `a1affd2` | Characters that are not letters but are drawn as letters: squared-letter emoji, mathematical alphabets, combining small letters |
| `1f159a2` | Flags made of two letter symbols; figures and words drawn as emoji |

No list of look-alikes is complete, because the set of characters that resemble a letter is open-ended and grows with each Unicode version. The rule was therefore turned round: name what is allowed, refuse the rest. That form of the rule is the only one that held under review (`e30451c`: every accepted letter folds to plain ASCII; no joiner, tag, skin tone, keycap, regional indicator, unassigned code point or uncomposed combining mark is accepted).

The cost was known when it was done and is the subject of this part.

### 1.3 Excluded scripts and multilingual use cases

Checked by probe against the code at `c83b0cb` on 2026-11-13.

| Cannot be written | Consequence |
|---|---|
| **Any script other than Latin**: Greek, Cyrillic, Arabic, Hebrew, Devanagari and the other Indic scripts, Chinese, Japanese, Korean, Thai and all others | A campaign in a language written in one of these cannot be prepared at all. This excludes, among others, Russian, Ukrainian, Bulgarian, Serbian in Cyrillic, Greek, Arabic, Hebrew, Persian, Hindi, Bengali, Tamil, Chinese, Japanese, Korean and Thai |
| A word, a name or a quotation in such a script inside a Latin-script post | A post cannot name a person, a company, a product or a place in its own script, or quote a phrase in it. It must be transliterated |
| Latin letters outside the listed ranges | The schwa (Azerbaijani), the open e and open o and hooked letters (many West African languages, among them Hausa, Ewe, Yoruba in some orthographies), the okina (Hawaiian), phonetic and small-capital letters. A campaign in those languages cannot be prepared, and such names cannot be written |
| Currency signs other than $, €, £, ¥ and ¢ | The rupee, won, rouble, lira, dong and shekel signs are refused. Prices in those currencies must use the currency code |

Written and accepted: the Western, Central and Northern European languages in Latin script, Turkish, Romanian, Polish, the Baltic languages, Maltese, Welsh, Vietnamese, and pinyin.

A second-order effect: ruled-out terms are matched after folding to plain letters, so in an accepted language a term and a word that differ only by an accent are the same word to screening.

### 1.4 Unsupported emoji and character sequences

| Refused | Examples |
|---|---|
| Any emoji not among the 87 listed | Face with tears of joy, hundred points, smiling face with sunglasses, party face, heart eyes, crying face. The list favours business posts and omits most faces |
| Flags | Every country flag (two regional indicator symbols), the rainbow flag |
| Skin tones | Any emoji with a skin-tone modifier: the unmodified gesture is accepted, the modified one is not |
| Emoji joined into one | Every sequence with a zero-width joiner: professions, families, couples |
| Keycaps | Digit and symbol keycaps |
| A variation selector anywhere but directly after a listed picture | — |
| An emoji written against a word | "launch🚀" is refused; "launch 🚀" is accepted |

### 1.5 False-positive consequences

Honest text that is refused because of the character rules. The first group surprised the orchestrator when probed and is the most likely to be met in ordinary use.

| Refused | Why | What the author is told |
|---|---|---|
| **The ellipsis character** (which many editors and phones type in place of three dots) | Compatibility folding turns it into three dots, so the text is "not in canonical form" | "Contains invisible or compatibility characters (for example zero-width spaces or full-width digits)". **The message does not name the character.** |
| **The no-break space and the narrow no-break space** (standard in French typography before ":", "?", "!" and inside numbers; common in text pasted from a word processor or a web page) | The same | The same message |
| The trade mark sign, the numero sign, vulgar fractions, superscript digits, the micro sign, the non-breaking hyphen, the soft hyphen, the double prime, a tab | The same | The same message |
| A character outside the list | Section 1.3 and 1.4 | The rule, the number of kinds, and up to eight code points ("U+1F602"). Usable, though a code point means little to most authors |
| An emoji against a word | Section 1.4 | A count, and the instruction to set them apart with a space |

Consequences: text pasted from elsewhere will often be refused for a character the author cannot see; the model that drafts must be kept to the list by its prompt and will sometimes fail; a refusal costs a revision, which costs budget. None of this has been measured on real drafts: the only live drafting was the recorded synthetic campaign, whose nine drafts are all eligible.

The other honest text that screening refuses (strict numbers, look-alike readings, inflections, hashtags) is in the evaluator contract, F3 to F6.

### 1.6 Options for a future Unicode-aware screening architecture

Not designed, not costed and not authorised. Each would need its own instruction, and each changes what the earlier reviews tested.

| | Option | What it gives | What it risks or costs |
|---|---|---|---|
| A | **Keep the list; extend it by reviewed additions** (the ellipsis and no-break space mapped rather than refused; more emoji; more currency signs; more Latin letters) | The smallest step. Removes the most common false positives | Each addition must be checked for whether it can stand in for a letter. Does nothing for other scripts |
| B | **A script profile per campaign**: the brief names the campaign's language; one further script is allowed for it; mixing scripts inside a word is refused (the restriction levels of Unicode Technical Standard 39) | Campaigns in Greek, Cyrillic, Arabic and so on become possible | Ruled-out terms must then be matched in that script, with its own inflection and its own look-alikes. Each script is a separate piece of work and review |
| C | **Unicode's own data in place of hand-made tables**: the confusables table of UTS 39 to fold look-alikes to a skeleton; the identifier profile to say which characters are ordinary | Tables maintained by the standard, not by this project; wider coverage | The confusables table is built for identifiers, not prose, and is known to be both over- and under-inclusive. Earlier look-alike lists failed review four times; a bigger list is still a list |
| D | **Emoji by the standard's emoji data**: accept the recommended emoji set as whole units (with skin tones and joined sequences), minus the classes that depict letters, digits, words or flags | Ordinary emoji use becomes possible | The excluded classes must be defined and reviewed; new emoji arrive every year |
| E | **Quarantine in place of refusal**: a character outside the screened set does not make the draft ineligible; it is shown to the editor written out, with its name, and needs an explicit signed acknowledgement | Nothing honest is blocked; the control moves to the editor, where OD-21 already puts it | More for the editor to read and sign. Screening no longer says anything about such a draft |
| F | **A check on the rendered text** (comparing how the post is drawn, not which characters it holds) | Addresses look-alikes at the root | Heavy, dependent on fonts and platform, and a new kind of component to review |

The orchestrator's view, offered as a view only: A removes the false positives most likely to be met and is cheap; E fits the owner's policy that the editor is the control; B is what a client in a non-Latin market would need and is the largest.

## Part 2. Risk register

One line each; the detail is in the document named. "Standing" says who has accepted what: nothing here is accepted by the owner unless it says so.

| # | Risk | Detail | Standing | Future remediation, if wanted |
|---|---|---|---|---|
| K1 | **Screening can be written round** | Contract L1 to L15; GATE_STATE E1 to E11 | **Accepted by the owner on 2026-11-13 as documented limitations of pattern screening (OD-21), not remediated** | None planned. A second reader, human or model, would be a new component |
| K2 | The control against unacceptable content is the editor reading every word; no person has used the operator tool, and nothing in code can make a person read | Threat model; OD-9 | Open | An editor's surface (OD-9); guidance for editors; the external assessment (OD-11) |
| K3 | The term-matching code is fragile to change | Two of three regression passes on its last round found the fix had made something worse; ordinary drafts evaluate about 2.9 times slower than at `e30451c` | Recorded | Do not change it without a regression review against a fixed baseline; keep the reviewers' comparison probes |
| K4 | The character list blocks honest text and whole languages | Part 1 | **Recorded by the owner as a temporary prototype constraint** | Part 1.6 |
| K5 | Every reviewer was an agent inside this programme; reviewer identity in the ledger is self-declared | GATE_STATE A14; threat model | Open: **OD-11**, required before real-client use | The external approval-path assessment; branch protection (OD-4) |
| K6 | The programme plan is not a signed editor decision | A4 | Open: OD-19 | A signed decision on the plan |
| K7 | Guesses at a confirmation code are not limited across requests | A12, rated medium by its reviewer | Mitigated, not fixed | A limit across requests |
| K8 | Evaluations shown to the editor are unsigned and can be changed by a store writer | A20 | Accepted by the orchestrator; listed for the owner | Sign evaluations, or show only recomputed eligibility |
| K9 | The default export directory is inside the data directory | A10 | Deployment requirement 19 proposed; no instance exists | Enforce the placement in code |
| K10 | The provider's accounting is unverified; prompt tokens are not limited; the shim's ceiling can be waived by a setting; its key-holding mode has never run against the provider | A2, A8, A25 | Open: OD-6 | A first live run under a ceiling; a prompt-token limit |
| K11 | The store's lock is for one machine and one process-id space | Threat model | Deployment requirement | A lock service, if instances ever share storage |
| K12 | A waiting decision request holds its place for 30 minutes; notices to the operator channel can reach about 1,200 a day across many decisions; a replaced request's details are kept for one replacement | B1 to B3 | Accepted by the orchestrator; listed for the owner | A withdraw action for the requester; a daily cap on notices |
| K13 | The gateway and the workflow have not been run against the provider in their present form; the largest live campaign was four posts | Acceptance package, section 5 | Recorded | A live run of the synthetic campaign under a ceiling (OD-6) |
| K14 | Nothing about an OpenBot instance has been run: runtime, attachment, streaming and tools inside it, persistence, confinement | Acceptance package, section 7 | **Blocked**: OD-7, OD-8, OD-15, OD-20 | The integration proof (proposed KIC-01B) |
| K15 | The licence a client-owned production instance needs is not confirmed | OD-8 | Open; the owner's to seek | — |
| K16 | Operator output has not been seen on a real terminal; four older fixes have no regression test in the repository | A11, A26 | Recorded | A person's run of the tool; the four tests |
| K17 | No base branch exists, so nothing can be merged or protected | OD-4 | Open | Create and protect `main` |
| K18 | The review check in the harness measures the ledger's rule, not coverage, and does not carry findings forward | GATE_STATE, "Disposition of KIC-01" | Recorded | A coverage rule in the harness: needs an instruction, since it changes the gate mechanism |
