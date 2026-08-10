// Recover the photographs a transcription references but never shipped.
//
// The sources in content/sources carry lines like `![img-4.jpeg](img-4.jpeg)`
// pointing at bitmaps that were never exported beside the markdown. The names are
// useless as identifiers — chimie-5 reuses six of them across thirty-four
// references, because the book was transcribed in page batches that each restart
// at img-0 — and the counts do not line up either (34 references vs 37 embedded
// images; maths-6 has 33 references against 239 embedded images). So neither the
// filename nor the position can be trusted to say which photo goes where.
//
// What IS reliable is the prose around each reference: it was transcribed from
// the page the photo sits on. This locates that text in the PDF, then extracts
// the images embedded in that page. Matches are forced to run forward through the
// book, so one bad match cannot drag the rest out of alignment.
//
//   node scripts/extract-book-images.mjs             # every configured book
//   node scripts/extract-book-images.mjs chimie-5
//
// Output: content/book-images/<book>/*.png + a manifest beside them. That path is
// TRACKED, unlike public/content, which is generated and ignored wholesale — the
// PDFs live outside the repo, so images written only into the build output would
// vanish on a fresh checkout with no way to rebuild them. The injector copies
// what it uses into public/content/img at build time and never reads the PDF.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const OUTDIR = path.join(ROOT, "content/book-images");
const MANIFEST = path.join(OUTDIR, "manifest.json");
const WORK = path.join(ROOT, ".cache/pdftext");

const HOME = process.env.HOME ?? "";
const BOOKS = [
  { book: "chimie-5", md: "content/sources/chimie-5-notions.md", pdf: `${HOME}/Downloads/901298112-notions-de-chimie-5.pdf` },
  { book: "maths-6-scientifique", md: "content/sources/maths-6-scientifique-maitriser.md", pdf: `${HOME}/Downloads/776545856-Maitriser-Les-Maths-6_Scientifics.pdf` },
];

const has = (bin) => { try { execFileSync("which", [bin], { stdio: "pipe" }); return true; } catch { return false; } };

// Comparison form: accents, punctuation and case all vary between the OCR and the
// PDF's own text layer, and none of them help identify a page.
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Strip the markdown/LaTeX that the PDF's text layer will not contain.
const prose = (s) =>
  s.replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^#+\s*/gm, " ")
    .replace(/[*_`>|]/g, " ");

const shingles = (text, n = 5) => {
  const w = norm(prose(text)).split(" ").filter((x) => x.length > 2);
  const out = [];
  for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(" "));
  return out;
};

// Every image reference in book order, with the prose that precedes it.
function references(mdPath) {
  const lines = fs.readFileSync(mdPath, "utf8").split("\n");
  const refs = [];
  let page = null;
  for (let i = 0; i < lines.length; i++) {
    const pm = lines[i].match(/<!--\s*page (\d+)\s*-->/);
    if (pm) { page = Number(pm[1]); continue; }
    if (!/!\[img-\d+\.[a-z]+\]\(/i.test(lines[i])) continue;
    // Look back for real sentences, and forward too — a photo often sits between
    // its introduction and its caption.
    const back = lines.slice(Math.max(0, i - 14), i).join("\n");
    const fwd = lines.slice(i + 1, i + 8).join("\n");
    refs.push({ line: i, mdPage: page, raw: lines[i].trim(), context: back + "\n" + fwd });
  }
  return refs;
}

function pdfPages(pdf, book) {
  fs.mkdirSync(WORK, { recursive: true });
  const cache = path.join(WORK, `${book}.txt`);
  if (!fs.existsSync(cache)) {
    execFileSync("pdftotext", ["-layout", pdf, cache], { stdio: "pipe" });
  }
  return fs.readFileSync(cache, "utf8").split("\f").map(norm);
}

// The page whose text best carries this reference's prose. `from` keeps the scan
// moving forward: the book and its transcription are in the same order, so a
// match behind the previous one is a false positive, not a discovery.
function locate(pages, context, from) {
  const sh = shingles(context);
  if (!sh.length) return null;
  let best = null;
  for (let p = from; p < pages.length; p++) {
    const text = pages[p];
    if (!text) continue;
    let hits = 0;
    for (const s of sh) if (text.includes(s)) hits++;
    if (hits === 0) continue;
    const score = hits / sh.length;
    if (!best || score > best.score) best = { page: p + 1, score, hits, of: sh.length };
    // A page carrying most of the surrounding prose is the page; stop early so a
    // later chapter that repeats a phrase cannot outscore it.
    if (score > 0.5) break;
  }
  return best;
}

// Every visual element in the markdown, in document order: the AI-recreated <svg>
// figures and the missing photographs interleaved as they appear.
function visuals(mdPath) {
  const text = fs.readFileSync(mdPath, "utf8");
  const re = /<figure class="ai-figure|!\[img-\d+\.[a-z]+\]\(/gi;
  const out = [];
  let m, imgOrdinal = 0;
  while ((m = re.exec(text))) {
    const isImg = m[0].startsWith("![");
    out.push({ kind: isImg ? "img" : "svg", imgOrdinal: isImg ? imgOrdinal++ : null });
  }
  return out;
}

// The PDF's images in document order, as (page, position-within-page) — which is
// the order pdfimages -list prints them and the order it numbers the files it
// writes.
function pdfImageOrder(pdf) {
  const rows = execFileSync("pdfimages", ["-list", pdf], { encoding: "utf8" }).split("\n").slice(2);
  const seenOnPage = new Map();
  const out = [];
  for (const line of rows) {
    // The trailing blank line must be rejected explicitly: Number("") is 0, and
    // Number.isInteger(0) is true, so it would otherwise register as a phantom
    // image on page 0 — enough to break the exact 239 = 239 count this relies on.
    const first = line.trim().split(/\s+/)[0];
    const page = Number(first);
    if (!first || !Number.isInteger(page)) continue;
    const k = seenOnPage.get(page) ?? 0;
    seenOnPage.set(page, k + 1);
    out.push({ page, within: k });
  }
  return out;
}

const only = process.argv[2];
if (!has("pdftotext") || !has("pdfimages")) {
  console.error("extract-book-images: poppler (pdftotext, pdfimages) not found — install it or skip.");
  process.exit(1);
}

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};

for (const b of BOOKS) {
  if (only && b.book !== only) continue;
  const md = path.join(ROOT, b.md);
  if (!fs.existsSync(md)) { console.log(`${b.book}: source markdown missing — skipped`); continue; }
  if (!fs.existsSync(b.pdf)) { console.log(`${b.book}: PDF not found at ${b.pdf} — skipped`); continue; }

  const refs = references(md);
  const dir = path.join(OUTDIR, b.book);
  fs.mkdirSync(dir, { recursive: true });

  // Two kinds of PDF turn up here, and they need opposite strategies.
  //
  // If the PDF is the platform's own RENDER of the markdown, it contains exactly
  // one image per visual element — the recreated <svg> figures and the missing
  // photographs together, in document order. maths-6: 206 + 33 = 239 embedded
  // images, exactly. Then the mapping is positional and exact, and no text
  // matching is needed or wanted.
  //
  // If it is the ORIGINAL SCAN (chimie-5), the counts do not line up at all and
  // position means nothing, so each reference has to be anchored by the prose
  // around it.
  const order = pdfImageOrder(b.pdf);
  const vis = visuals(md);
  const positional = order.length === vis.length && vis.length > 0;

  console.log(`\n${b.book} — ${refs.length} photo references · ${vis.length} visual elements · ${order.length} images in the PDF`);

  if (positional) {
    console.log(`  PDF is a render of the transcription — mapping positionally (exact)`);
    const entries = [];
    let extracted = 0;
    for (const [i, v] of vis.entries()) {
      if (v.kind !== "img") continue;                 // an <svg> figure: already in the lesson
      const slot = order[i];
      const stem = path.join(dir, `p${slot.page}`);
      if (!fs.readdirSync(dir).some((f) => f.startsWith(`p${slot.page}-`))) {
        try {
          execFileSync("pdfimages", ["-f", String(slot.page), "-l", String(slot.page), "-png", b.pdf, stem], { stdio: "pipe" });
        } catch { /* nothing extractable here */ }
      }
      const onPage = fs.readdirSync(dir).filter((f) => f.startsWith(`p${slot.page}-`)).sort();
      const file = onPage[slot.within] ?? null;
      if (file) extracted++;
      entries.push({ ordinal: v.imgOrdinal, mdPage: refs[v.imgOrdinal]?.mdPage ?? null, page: slot.page, file, score: 1 });
      console.log(`  ref ${String(v.imgOrdinal).padStart(2)} (md p.${String(refs[v.imgOrdinal]?.mdPage ?? "?").padStart(3)}) → element ${String(i).padStart(3)} → PDF p.${String(slot.page).padStart(3)} #${slot.within}  ${file ?? "NO IMAGE"}`);
    }
    const claimed = new Set(entries.map((e) => e.file).filter(Boolean));
    let pruned = 0;
    for (const f of fs.readdirSync(dir)) if (!claimed.has(f)) { fs.unlinkSync(path.join(dir, f)); pruned++; }
    manifest[b.book] = entries;
    console.log(`  ${entries.length} references mapped exactly · ${extracted} images extracted · ${pruned} unclaimed pruned`);
    continue;
  }

  const pages = pdfPages(b.pdf, b.book);
  console.log(`  PDF is the original scan — anchoring each reference by its prose`);

  // Which PDF pages actually hold images, and how many each. The text match lands
  // on the page carrying the prose, which is often one or two off the page
  // carrying the photo — the transcription runs across page breaks. Snapping to
  // this list is what turns "no image on page" into the right picture.
  const slots = [];
  for (const line of execFileSync("pdfimages", ["-list", b.pdf], { encoding: "utf8" }).split("\n").slice(2)) {
    const p = Number(line.trim().split(/\s+/)[0]);
    if (Number.isInteger(p)) slots.push({ page: p, taken: false });
  }

  // Pass 1: where does each reference's prose live?
  const located = refs.map((ref, i) => ({ i, ref, hit: null }));
  let cursor = 0;
  for (const r of located) {
    const hit = locate(pages, r.ref.context, cursor);
    if (hit) { r.hit = hit; cursor = Math.max(0, hit.page - 1); }
  }

  // Between the two passes: learn how the transcription's page numbers map onto
  // the PDF's. They are not the same scale — chimie-5's page 105 is PDF page 199,
  // maths-6 runs at roughly 2.75 PDF pages per transcribed one — but the relation
  // is close to linear, and the confident text matches are enough to fit it.
  // Least squares over the median-consistent matches, so one bad hit cannot tilt
  // the line. This gives every reference a sane expected page, which matters most
  // for maths-6: its prose is mostly LaTeX, which strips away to too few words to
  // match on, and without a prior those references were landing hundreds of pages
  // from where they belong.
  const anchors = located.filter((r) => r.hit && r.ref.mdPage != null && r.hit.hits >= 4);
  let fit = null;
  if (anchors.length >= 3) {
    const ratios = anchors.map((r) => r.hit.page / Math.max(1, r.ref.mdPage)).sort((a, b) => a - b);
    const med = ratios[ratios.length >> 1];
    // Keep the anchors that agree with the typical scale, then fit a line to them.
    const keep = anchors.filter((r) => Math.abs(r.hit.page / Math.max(1, r.ref.mdPage) - med) < med * 0.25);
    if (keep.length >= 3) {
      const n = keep.length;
      const sx = keep.reduce((a, r) => a + r.ref.mdPage, 0);
      const sy = keep.reduce((a, r) => a + r.hit.page, 0);
      const sxx = keep.reduce((a, r) => a + r.ref.mdPage ** 2, 0);
      const sxy = keep.reduce((a, r) => a + r.ref.mdPage * r.hit.page, 0);
      const denom = n * sxx - sx * sx;
      if (denom !== 0) {
        const a = (n * sxy - sx * sy) / denom;
        const b = (sy - a * sx) / n;
        fit = { a, b, used: keep.length };
        console.log(`  page map fitted on ${keep.length} anchors: pdf ≈ ${a.toFixed(2)}·md ${b >= 0 ? "+" : "−"} ${Math.abs(b).toFixed(0)}`);
      }
    }
  }
  // Only ever interpolate. The anchors for maths-6 all sit in the last third of
  // the book, and a line fitted there predicts page 241 for transcribed page 44 —
  // which would overrule a perfectly good text match with an extrapolation.
  const span = anchors.length ? [Math.min(...anchors.map((r) => r.ref.mdPage)), Math.max(...anchors.map((r) => r.ref.mdPage))] : null;
  const predict = (mdPage) =>
    fit && span && mdPage != null && mdPage >= span[0] && mdPage <= span[1] ? fit.a * mdPage + fit.b : null;
  // Evidence beats the model: a solid text match is where the prose actually is,
  // and the fitted line is only an average over a relation that is not truly
  // linear (maths-6's cover really is PDF page 1, which no line through the rest
  // of the book will predict). So the map fills gaps — references with no match,
  // or one so thin it could be a phrase that recurs elsewhere — and never
  // overrides a match that stands on its own.
  for (const r of located) {
    const strong = r.hit && r.hit.hits >= 4;
    r.guess = strong ? r.hit.page : predict(r.ref.mdPage) ?? r.hit?.page ?? null;
  }

  // Pass 2: assign references to image slots. Both run in book order, so this is a
  // monotonic alignment — and picking greedily gets it wrong, because an early
  // reference with no text match will happily claim the slot its neighbour needed
  // and shove the rest of the book along by one. Solve it exactly instead: choose
  // the order-preserving assignment that minimises the total distance between each
  // located reference and its page, letting the surplus slots (37 images for 34
  // references) fall out as the ones nobody wants. A reference with no text match
  // costs nothing wherever it lands, so it settles between its located neighbours.
  const n = located.length, m = slots.length;
  const INF = Infinity;
  const cost = (i, j) => {
    const want = located[i].guess ?? located[i].hit?.page ?? null;
    return want == null ? 0 : Math.abs(slots[j].page - want);
  };
  const f = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const take = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let j = 0; j <= m; j++) f[n][j] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const withIt = cost(i, j) + f[i + 1][j + 1];
      const skip = f[i][j + 1];
      if (withIt <= skip) { f[i][j] = withIt; take[i][j] = 1; } else { f[i][j] = skip; take[i][j] = 0; }
    }
  }
  const assigned = new Array(n).fill(null);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (take[i][j]) { assigned[i] = slots[j]; i++; j++; } else j++;
  }

  let matched = 0, extracted = 0;
  const entries = [];
  for (const r of located) {
    const pick = assigned[r.i];
    if (!pick) {
      entries.push({ ordinal: r.i, mdPage: r.ref.mdPage, page: null, file: null, score: 0 });
      console.log(`  ref ${String(r.i).padStart(2)} (md p.${r.ref.mdPage}) — no image left to claim`);
      continue;
    }
    if (r.hit) matched++;

    const stem = path.join(dir, `p${pick.page}`);
    if (!fs.readdirSync(dir).some((f) => f.startsWith(`p${pick.page}-`))) {
      try {
        execFileSync("pdfimages", ["-f", String(pick.page), "-l", String(pick.page), "-png", b.pdf, stem], { stdio: "pipe" });
      } catch { /* nothing extractable on this page */ }
    }
    const onPage = fs.readdirSync(dir).filter((f) => f.startsWith(`p${pick.page}-`)).sort();
    const used = entries.filter((e) => e.page === pick.page).length;
    const file = onPage[used] ?? onPage[0] ?? null;
    if (file) extracted++;

    // Just the basename: the injector resolves the tracked source and the served
    // destination, so neither path is baked into the manifest.
    entries.push({
      ordinal: r.i, mdPage: r.ref.mdPage, page: pick.page,
      file: file ?? null,
      score: r.hit ? Number(r.hit.score.toFixed(2)) : 0,
    });
    console.log(
      `  ref ${String(r.i).padStart(2)} (md p.${String(r.ref.mdPage).padStart(3)}) → PDF p.${String(pick.page).padStart(3)}` +
      `${r.hit ? `  text p.${r.hit.page}` : r.guess ? `  predicted p.${Math.round(r.guess)}` : "  (interpolated)"}  ${file ?? "NO IMAGE"}`
    );
  }

  // Drop page extractions nothing claimed, so the committed folder holds only
  // images the lessons will actually show.
  const claimed = new Set(entries.map((e) => e.file && path.basename(e.file)).filter(Boolean));
  let pruned = 0;
  for (const f of fs.readdirSync(dir)) if (!claimed.has(f)) { fs.unlinkSync(path.join(dir, f)); pruned++; }

  manifest[b.book] = entries;
  console.log(`  ${matched}/${refs.length} references located · ${extracted} images extracted · ${pruned} unclaimed pruned`);
}

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(`\nmanifest → ${path.relative(ROOT, MANIFEST)}\n`);
