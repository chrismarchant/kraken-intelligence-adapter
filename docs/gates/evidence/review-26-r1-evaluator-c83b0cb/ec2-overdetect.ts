// EC-2 "ineligible if and only if": cases the code refuses that P1-P7 as written do not define as "found".
import { show } from "./lib.ts";
show("-ies on a 3-letter term (P1 gives -ied/-ies only to 4+ letters)", ["fly"], "Time flies.");
show("-ied on a 3-letter term", ["cry"], "She cried.");
show("number with closing ! (P3: sentence punctuation around a number makes it a number)", ["lol"], "We hit 101!");
show("pound read as e (P3 table: £ is l)", ["beer"], "Fine b££r");
show("word split at an apostrophe (not a stand-in, not a joint)", ["neil"], "Thanks to O'Neil.");
show("word split at a dot inside", ["com"], "Visit example.com today.");
show("word split at an ampersand", ["amp"], "R&amp");
show("version string read as letters", ["AI"], "Upgrade to v2.4.1 now.");
