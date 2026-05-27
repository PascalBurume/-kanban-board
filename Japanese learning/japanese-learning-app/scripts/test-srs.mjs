import { scheduleNext, formatInterval, RATING_QUALITY } from "../src/lib/srs.ts";

const tests = [];
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  tests.push({ label, ok, actual, expected });
}

// Fresh card, "good" → graduating interval 1d (Anki convention)
const fresh = { ease: 2.5, interval: 0 };
eq("good on fresh: 1d", scheduleNext(fresh, "good").interval, 1);

// Second review "good" → 3d (graduated → mature transition)
eq("good on first-day review: 3d",
  scheduleNext({ ease: 2.5, interval: 1 }, "good").interval, 3);

// "again" resets
const r2 = scheduleNext({ ease: 2.5, interval: 6 }, "again");
eq("again resets interval", r2.interval, 0);
eq("again sets lapsed", r2.lapsed, true);

// "easy" on fresh → 4
eq("easy on fresh", scheduleNext(fresh, "easy").interval, 4);

// Mature "good" → interval * ease  (10 * 2.5 = 25)
eq("mature good", scheduleNext({ ease: 2.5, interval: 10 }, "good").interval, 25);

// "hard" on short interval stays >=1
eq("hard 1d→1d", scheduleNext({ ease: 2.5, interval: 1 }, "hard").interval, 1);

// Ease floor 1.3
eq("ease floor", Math.round(scheduleNext({ ease: 1.3, interval: 5 }, "again").ease * 10) / 10, 1.3);

// formatInterval
eq("fmt 0", formatInterval(0), "<10m");
eq("fmt 3", formatInterval(3), "3d");
eq("fmt 30", formatInterval(30), "1mo");
eq("fmt 365", formatInterval(365), "1.0y");

// quality mapping
eq("q again=1", RATING_QUALITY.again, 1);
eq("q good=4", RATING_QUALITY.good, 4);
eq("q easy=5", RATING_QUALITY.easy, 5);

let pass = 0, fail = 0;
for (const t of tests) {
  if (t.ok) { pass++; console.log("  ✓", t.label); }
  else { fail++; console.log("  ✗", t.label, "→", JSON.stringify(t.actual), "expected", JSON.stringify(t.expected)); }
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
