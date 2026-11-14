Create the file harness/proof/duration.mjs (Node 22, ES module, no dependencies).

It must export one function, formatDuration(ms), that turns a duration in milliseconds into text:
- units are d, h, m, s (days, hours, minutes, seconds); whole units only, fractions of a second are dropped;
- largest unit first, units joined by one space, units whose value is zero are omitted;
- a duration shorter than one second is "0s";
- if ms is not a finite number, or is negative, or is not of type number, throw a TypeError.

The acceptance test is harness/proof/duration.test.mjs, given below. Do not change it. Return only harness/proof/duration.mjs.
