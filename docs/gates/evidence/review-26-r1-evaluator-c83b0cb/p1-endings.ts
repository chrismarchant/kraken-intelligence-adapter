// P1: plain terms, case, multi-word joins, and every ending the contract lists, at its boundary.
import { show } from "./lib.ts";
const must: Array<[string[], string]> = [
  [["AI"], "We use ai daily."], [["AI"], "Two AIs agree."], [["roi"], "Our ROIs rose."],
  [["ban"], "They were banned."], [["ban"], "We are banning it."], [["ban"], "Two bans."],
  [["bus"], "Two buses."], [["fix"], "It fixes it."], [["fix"], "It was fixed."], [["fix"], "We are fixing."],
  [["tax"], "taxes rose"], [["fee"], "Two fees."], [["buy"], "He buys."], [["buy"], "He buyed."],
  [["scam"], "They scammed us."], [["scam"], "They scamed us."], [["scam"], "scamming"], [["scam"], "scams"],
  [["guarantee"], "Fully guaranteed."], [["guarantee"], "guaranteeing"], [["guarantee"], "guarantees"],
  [["cure"], "curing it"], [["cure"], "cured"], [["deny"], "they denied it"], [["deny"], "denies"], [["deny"], "denying"],
  [["match"], "matches"], [["push"], "pushes"], [["box"], "boxes"],
  [["AI powered"], "AI-powered tools"], [["AI powered"], "AIpowered tools"], [["AI powered"], "AI powered tools"],
  [["AI powered"], "ai\npowered"], [["AI powered"], "AI—powered"], [["game changer"], "game-changers"],
  [["can't"], "You CAN'T miss."], [["can't"], "You can’t miss."], [["we'll"], "We'll see."],
  [["free trial"], "a free-trials offer"], [["free trial"], "FREE TRIAL"],
  [["get rich"], "getting rich"], [["data driven"], "Data-Driven"],
  // ending of a 4+ letter word whose final consonant is h/w/x/y: contract says "with or without a doubled last consonant"
  [["catch"], "catched"], [["relax"], "relaxes"], [["guess"], "guessed"],
  // 3 letters with -es after ch/sh: impossible except e.g. "ash"? contract lists sh
  [["ash"], "ashes"],
  // -ied for a final y after a consonant in a three-letter term (contract: four letters or more only)
  [["fly"], "flies"],
  // "-es" for a 4+ letter word ending in a vowel
  [["hype"], "hypees"],
];
for (const [t, s] of must) show("must be found per P1", t, s);
console.log("--- must NOT match (longer, different word / contraction rule) ---");
const not: Array<[string[], string]> = [
  [["can"], "You can't."], [["win"], "wind"], [["win"], "wines"], [["fun"], "fund"], [["AI"], "AIed"], [["us"], "used"],
  [["ban"], "baned"], [["it"], "it's fine"], [["car"], "cares"], [["scam"], "scampi"], [["free"], "freedom"], [["he"], "he'll"],
];
for (const [t, s] of not) show("must not match", t, s);
