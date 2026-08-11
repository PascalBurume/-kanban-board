// One-off repair: quiz LaTeX was corrupted because the quiz generator used
// JSON output, so backslash commands were swallowed by JSON escapes
// (\frac → form-feed+"rac", \text/\times → tab+"ext"/"imes", etc.). The
// control characters survived into the refined artifacts. This restores them
// to proper LaTeX backslash commands across all quiz fields.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFINED = path.resolve(__dirname, "..", "public", "content", "refined");

// literal control char -> the LaTeX backslash sequence it came from
export function repairLatex(s) {
  return String(s ?? "")
    .replace(/\f/g, "\\f") // \frac, \forall…
    .replace(/\t/g, "\\t") // \text, \times, \theta, \tan…
    .replace(/\x08/g, "\\b") // \binom, \beta…
    .replace(/\x0B/g, "\\v") // \vec, \varphi…
    .replace(/\r/g, "\\r") // \rho, \rightarrow…
    .replace(/\n/g, "\\n"); // \neq, \nabla… (quiz fields are single-line)
}

function repairJsonArray(json) {
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return JSON.stringify(arr.map((x) => (typeof x === "string" ? repairLatex(x) : x)));
  } catch { /* leave as-is */ }
  return json;
}

let files = 0, questions = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!e.endsWith(".json")) continue;
    const a = JSON.parse(fs.readFileSync(p, "utf8"));
    let changed = false;
    for (const l of a.lessons || []) {
      if (!l.quiz) continue;
      for (const q of l.quiz.questions || []) {
        const before = JSON.stringify(q);
        if (q.promptMd) q.promptMd = repairLatex(q.promptMd);
        if (q.explanationMd) q.explanationMd = repairLatex(q.explanationMd);
        if (q.optionsJson) q.optionsJson = repairJsonArray(q.optionsJson);
        if (q.answerJson) q.answerJson = repairJsonArray(q.answerJson);
        if (JSON.stringify(q) !== before) { changed = true; questions++; }
      }
    }
    if (changed) { fs.writeFileSync(p, JSON.stringify(a, null, 2)); files++; }
  }
}
walk(REFINED);
console.log(`Repaired quiz LaTeX — files:${files} questions:${questions}`);
