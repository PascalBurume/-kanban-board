import { describe, it, expect } from "vitest";
import { CATALOGUE, DOMAINS, DISCIPLINES, searchCatalogue, groupByDomain, disciplineOf, domainOf } from "../figureCatalogue";
import { checkLatex } from "../latexCheck";
import { parseFigure } from "../figures";
import { figureBlock } from "../figureSvg";
import { DRAWINGS } from "../figureDrawings";
import { mdToDoc } from "../lessonDoc";
import { EPURE_CATALOGUE } from "../epureCatalogue";
import { renderEpure, epureProblems } from "../epure";
import { figureToJson } from "../figures";

// The catalogue is 76 hand-authored LaTeX snippets. Exactly the kind of data where one
// typo ships a broken formula into a lesson and nobody notices until a class does.
// Every entry is walked here so that cannot happen.

describe("every catalogue entry displays", () => {
  it.each(CATALOGUE.map((f) => [f.code, f] as const))("%s renders in KaTeX", (code, fig) => {
    const v = checkLatex(fig.latex, true);
    expect(v.ok, `${code} — ${v.error}`).toBe(true);
    // A formula that parses and shows nothing is the failure mode this editor exists
    // to remove; a catalogue entry must never be one.
    expect(v.blank, `${code} renders blank`).toBeFalsy();
    expect(v.suspect, `${code} — ${v.suspect}`).toBeUndefined();
  });

  it.each(CATALOGUE.filter((f) => f.chart).map((f) => [f.code, f] as const))("%s has a valid chart spec", (code, fig) => {
    const body = fig.chart!.replace(/^```figure\n/, "").replace(/\n```$/, "");
    expect(parseFigure(body), `${code} chart spec does not parse`).toBeTruthy();
  });
});

describe("the catalogue matches the printed reference", () => {
  it("holds all 76 figures", () => {
    expect(CATALOGUE).toHaveLength(76);
  });

  it("covers the 19 domains, four figures each", () => {
    const byDomain = new Map<string, number>();
    for (const f of CATALOGUE) byDomain.set(domainOf(f.code), (byDomain.get(domainOf(f.code)) ?? 0) + 1);
    expect(byDomain.size).toBe(19);
    for (const [d, n] of byDomain) expect(n, `${d} should hold 4 figures`).toBe(4);
  });

  it("names every domain it uses", () => {
    for (const f of CATALOGUE) expect(DOMAINS[domainOf(f.code)], `${domainOf(f.code)} unnamed`).toBeTruthy();
  });

  it("uses only the four declared disciplines", () => {
    const known = new Set(DISCIPLINES.map((d) => d.id));
    for (const f of CATALOGUE) expect(known.has(disciplineOf(f.code)), f.code).toBe(true);
  });

  // The code IS the classification label — a duplicate would point two different
  // figures at the same scanned plate.
  it("has no duplicate code", () => {
    const seen = new Set<string>();
    for (const f of CATALOGUE) {
      expect(seen.has(f.code), `duplicate ${f.code}`).toBe(false);
      seen.add(f.code);
    }
  });

  it("numbers each domain 01 to 04 in order", () => {
    for (const g of groupByDomain(CATALOGUE)) {
      expect(g.items.map((f) => f.code.slice(-2))).toEqual(["01", "02", "03", "04"]);
    }
  });
});

describe("search finds a figure the way a teacher would look for it", () => {
  it("finds by the code on a scanned plate", () => {
    expect(searchCatalogue("MA-TR-01").map((f) => f.code)).toContain("MA-TR-01");
    expect(searchCatalogue("matr01").map((f) => f.code)).toContain("MA-TR-01");
    expect(searchCatalogue("PH-OP").map((f) => f.code)).toEqual(["PH-OP-01", "PH-OP-02", "PH-OP-03", "PH-OP-04"]);
  });

  it("finds by title, keyword and domain name", () => {
    expect(searchCatalogue("thalès").map((f) => f.code)).toContain("MA-GP-03");
    expect(searchCatalogue("hypoténuse").map((f) => f.code)).toContain("MA-TR-02");
    expect(searchCatalogue("optique").map((f) => f.code)).toContain("PH-OP-01");
  });

  // A school keyboard often has no French layout.
  it("ignores accents in both directions", () => {
    expect(searchCatalogue("thales").map((f) => f.code)).toContain("MA-GP-03");
    expect(searchCatalogue("geometrie").length).toBeGreaterThan(0);
    expect(searchCatalogue("électrochimique").map((f) => f.code)).toContain("CH-RE-04");
  });

  it("narrows to a discipline", () => {
    const phys = searchCatalogue("", "PH");
    expect(phys).toHaveLength(20);
    expect(phys.every((f) => f.code.startsWith("PH"))).toBe(true);
    // "cycle" appears in both SVT and chemistry; the filter must separate them.
    expect(searchCatalogue("cycle", "SV").every((f) => f.code.startsWith("SV"))).toBe(true);
  });

  it("returns nothing for a term that is not there, rather than everything", () => {
    expect(searchCatalogue("zzzzz")).toHaveLength(0);
  });
});

// Everything the « Insérer » buttons can produce has to be markdown the visual editor
// can actually represent. The catalogue's own buttons went to a handler that did not
// exist in LessonWriter — every one of them threw "onInsert is not a function" — and
// once wired, a figure mdToDoc could not parse would refuse just as silently. So walk
// all 76 through the same conversion the insert does.
describe("every insert produces markdown the editor accepts", () => {
  const clean = (md: string) => {
    const { doc, unsupported } = mdToDoc(md);
    return { kinds: (doc.content ?? []).map((n) => n.type), unsupported };
  };

  // « Insérer la figure » now emits a ```figure fence holding the épure spec, so what
  // lands in the lesson is an editable figure node — not the rawHtml atom the raw <svg>
  // used to produce, which could only be edited as markdown text.
  it.each(CATALOGUE.map((f) => [f.code, f] as const))("%s inserts as an editable figure", (code, fig) => {
    const { kinds, unsupported } = clean("```figure\n" + figureToJson(EPURE_CATALOGUE[fig.code] as never) + "\n```");
    expect(unsupported, `${code} — ${unsupported.join(", ")}`).toHaveLength(0);
    expect(kinds).toEqual(["figure"]);
  });

  it.each(CATALOGUE.map((f) => [f.code, f] as const))("%s inserts its formula", (code, fig) => {
    const { kinds, unsupported } = clean(`$$\n${fig.latex}\n$$`);
    expect(unsupported, `${code} — ${unsupported.join(", ")}`).toHaveLength(0);
    expect(kinds).toEqual(["blockMath"]);
  });

  it.each(CATALOGUE.filter((f) => f.chart).map((f) => [f.code, f] as const))("%s inserts its chart", (code, fig) => {
    const { kinds, unsupported } = clean(fig.chart!);
    expect(unsupported, `${code} — ${unsupported.join(", ")}`).toHaveLength(0);
    expect(kinds).toEqual(["figure"]);
  });

  // The drawing is the point of "Insérer la figure": a caption with no <svg> would
  // insert cleanly and show the teacher an empty box.
  it("draws every catalogue code", () => {
    for (const f of CATALOGUE) {
      expect(DRAWINGS[f.code], `${f.code} has no drawing`).toBeTruthy();
      expect(DRAWINGS[f.code], `${f.code} draws no SVG`).toContain("<svg");
    }
  });
});

// THE regression net for the conversion.
//
// epureCatalogue.ts is generated from figureDrawings.ts by scripts/convert-catalogue.ts
// and was verified mark-for-mark at generation time. Nothing stops someone editing the
// hand-drawn source afterwards and not regenerating — and the failure would be silent,
// because both files render something plausible. This re-runs the comparison in CI.
describe("the generated épures still match the drawings they came from", () => {
  // Compare what is DRAWN, not which elements draw it: a triangle written as one closed
  // path and the same triangle as three lines are the same picture, and the conversion
  // deliberately prefers the second because it is editable.
  const marks = (svg: string) => {
    const q = (v: number) => Math.round(v * 2) / 2;
    const attrs = (raw: string) => {
      const o: Record<string, string> = {};
      for (const m of raw.matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)) o[m[1]] = m[2];
      return o;
    };
    const n = (v?: string, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
    const nil = (v?: string) => (!v || v === "none" ? "none" : v);
    const out: string[] = [];
    const seg = (x1: number, y1: number, x2: number, y2: number, s: string, dash: string) => {
      const a = [q(x1), q(y1)], b = [q(x2), q(y2)];
      const [p, r] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
      out.push(`seg ${p[0]},${p[1]} ${r[0]},${r[1]} ${s} ${dash}`);
    };
    const poly = (d: string) => {
      const t = d.trim();
      if (!/^M[-\d.\s]+(L[-\d.\s]+)+Z?$/.test(t)) return null;
      const nums = t.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
      if (nums.length < 4 || nums.length % 2) return null;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
      return { pts, closed: /Z$/.test(t) };
    };
    for (const [, tag, raw, text] of svg.matchAll(/<(line|circle|ellipse|rect|path|text)\b([^>]*)>(?:([^<]*)<\/text>)?/g)) {
      const a = attrs(raw);
      const stroke = nil(a.stroke);
      const dash = a["stroke-dasharray"] ?? "";
      if (tag === "line") seg(n(a.x1), n(a.y1), n(a.x2), n(a.y2), stroke, dash);
      else if (tag === "text") out.push(`txt ${q(n(a.x))},${q(n(a.y))} ${a.fill ?? ""} ${n(a["font-size"], 12)} ${(text ?? "").trim()}`);
      else if (tag === "circle") {
        const r = n(a.r);
        if (a.fill && a.fill !== "none" && !a.stroke && r <= 4.2) out.push(`dot ${q(n(a.cx))},${q(n(a.cy))} ${a.fill}`);
        else out.push(`cir ${q(n(a.cx))},${q(n(a.cy))} ${q(r)} ${stroke} ${nil(a.fill)} ${dash}`);
      } else if (tag === "ellipse") out.push(`ell ${q(n(a.cx))},${q(n(a.cy))} ${q(n(a.rx))},${q(n(a.ry))} ${stroke} ${dash}`);
      else if (tag === "rect") {
        if (n(a.width) >= 360 && n(a.height) >= 240) continue;
        out.push(`rct ${q(n(a.x))},${q(n(a.y))} ${q(n(a.width))}x${q(n(a.height))} ${stroke} ${nil(a.fill)} ${dash}`);
      } else if (tag === "path") {
        const d = (a.d ?? "").trim();
        const head = a.fill && a.fill !== "none" && a.stroke === a.fill && /^M[\d.\s-]+L[\d.\s-]+L[\d.\s-]+Z$/.test(d);
        if (head) {
          const m = /^M\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/.exec(d);
          if (m) out.push(`hed ${q(Number(m[1]))},${q(Number(m[2]))} ${a.fill}`);
          continue;
        }
        const p = (!a.fill || a.fill === "none") && poly(d);
        if (p) {
          for (let i = 0; i + 1 < p.pts.length; i++) seg(p.pts[i].x, p.pts[i].y, p.pts[i + 1].x, p.pts[i + 1].y, stroke, dash);
          if (p.closed && p.pts.length > 2) seg(p.pts[p.pts.length - 1].x, p.pts[p.pts.length - 1].y, p.pts[0].x, p.pts[0].y, stroke, dash);
        } else out.push(`pth ${d.replace(/-?\d*\.?\d+/g, (m) => String(q(Number(m))))} ${stroke} ${nil(a.fill)} ${dash}`);
      }
    }
    return out.sort();
  };

  it("covers every catalogue code", () => {
    expect(Object.keys(EPURE_CATALOGUE).sort()).toEqual(CATALOGUE.map((f) => f.code).sort());
  });

  it.each(CATALOGUE.map((f) => [f.code] as const))("%s draws the same picture", (code) => {
    expect(marks(renderEpure(EPURE_CATALOGUE[code]))).toEqual(marks(DRAWINGS[code]));
  });

  it("reports no structural problem in any converted figure", () => {
    for (const [code, spec] of Object.entries(EPURE_CATALOGUE)) {
      expect(epureProblems(spec), code).toEqual([]);
    }
  });
});
