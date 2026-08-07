"use client";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import katex from "katex";
import Icon from "@/components/ui/Icon";
import SymbolPalette from "@/components/editor/SymbolPalette";
import { MATH_GROUPS, STRUCT_GROUPS, CHEM_GROUPS, PHYS_GROUPS, MATH_FONTS, applyFont, searchSymbols } from "@/lib/symbols";
import { expandTrigger, triggerWords } from "@/lib/mathInput";
import { checkLatex, liveHints, latexReason } from "@/lib/latexCheck";
import { toast } from "@/lib/toast";

// The LaTeX editor: source on the left, what the class will see on the right, and
// Copilot above it able to rewrite the formula from a sentence in French.
//
// It exists because the inline formula field is a single-line <input>. That is the
// right surface for \frac{a}{b} and the wrong one for a derivation — six lines of
// \begin{aligned} in a one-line box is unreadable, so teachers stopped writing them.
//
// It edits the SAME blockMath node the inline field edits. There is no "LaTeX block"
// in the markdown: a derivation written here is "$$\n…\n$$" in the lesson source, which
// students, the RAG index and the formula audit already understand. That is the whole
// reason this replaced the drawing canvas rather than sitting beside it — a drawing was
// a private JSON format only its own renderer could read.
//
// Nothing Copilot produces is written straight into the document. It is checked with
// KaTeX first, and a result that does not render is offered as a diagnosis, never as an
// edit. See src/lib/latexCheck.ts.

const ALL_GROUPS = [...MATH_GROUPS, ...STRUCT_GROUPS, ...PHYS_GROUPS, ...CHEM_GROUPS];
const TRIGGERS = triggerWords();

// Starting points, so an empty editor is never a blank page. These are the shapes a
// 5e/6e teacher actually reaches for and cannot type from memory.
const STARTERS = [
  { id: "aligned", label: "Démonstration", hint: "plusieurs lignes alignées sur le =", tex: "\\begin{aligned}\nI &= a + b \\\\\n  &= c\n\\end{aligned}" },
  { id: "cases", label: "Définition par cas", hint: "accolade, si / sinon", tex: "f(x) = \\begin{cases}\n  x^2 & \\text{si } x \\geq 0 \\\\\n  -x & \\text{sinon}\n\\end{cases}" },
  { id: "system", label: "Système", hint: "deux équations, deux inconnues", tex: "\\begin{cases}\n  2x + 3y = 8 \\\\\n  x - y = 1\n\\end{cases}" },
  { id: "matrix", label: "Matrice", hint: "tableau entre parenthèses", tex: "\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}" },
  // Ruled and filled on purpose: an empty {ccc} array typesets to blank space, and a
  // teacher who starts from one thinks the editor is broken.
  { id: "table", label: "Tableau", hint: "filets, en-têtes, cases à remplir", tex: "\\begin{array}{|c|c|c|}\n\\hline\n x & x^2 & x^3 \\\\\n\\hline\n 1 & 1 & 1 \\\\\n 2 & 4 & 8 \\\\\n 3 & 9 & 27 \\\\\n\\hline\n\\end{array}" },
  { id: "integral", label: "Intégrale", hint: "bornes et élément différentiel", tex: "\\int_{0}^{1} (1+x)^3 \\, dx" },
  { id: "reaction", label: "Réaction chimique", hint: "équilibre et états", tex: "\\mathrm{N_2}_{(g)} + 3\\,\\mathrm{H_2}_{(g)} \\rightleftharpoons 2\\,\\mathrm{NH_3}_{(g)}" },
];

// The fragment the teacher is part-way through typing — either a "\command" or a bare
// word on its way to becoming one. Same rule as the inline field, so the two surfaces
// autocomplete identically.
function trailingCommand(text, caret) {
  const before = text.slice(0, caret);
  const cmd = before.match(/\\([a-zA-Zé]*)$/);
  if (cmd) return { word: cmd[1], from: caret - cmd[0].length, to: caret };
  const bare = before.match(/([a-zA-Zé]{2,})$/);
  if (!bare) return null;
  const word = bare[1].toLowerCase();
  if (!TRIGGERS.some((t) => t.toLowerCase().startsWith(word))) return null;
  return { word: bare[1], from: caret - bare[1].length, to: caret };
}

// "{a}" placeholders left by a snippet — Tab walks between them.
function nextPlaceholder(text, from) {
  const re = /\{([a-zA-Z][a-zA-Z0-9]{0,2})\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index + 1 >= from) return { from: m.index + 1, to: m.index + 1 + m[1].length };
  }
  re.lastIndex = 0;
  m = re.exec(text);
  return m ? { from: m.index + 1, to: m.index + 1 + m[1].length } : null;
}

export default function LatexPanel({ tex, onChange, onClose, disabled, subjectSlug, classLevel }) {
  const taRef = useRef(null);
  const [caret, setCaret] = useState((tex || "").length);
  const [menuIndex, setMenuIndex] = useState(0);
  const [palTab, setPalTab] = useState("math");
  const [palQuery, setPalQuery] = useState("");
  const [showPalette, setShowPalette] = useState(true);

  // Copilot
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null); // { tex, verdict } awaiting accept/reject
  const [aiError, setAiError] = useState("");

  const src = tex || "";

  // Focus lands here on open — the teacher pressed a button called "LaTeX"; making them
  // then click into the box would be a second step for nothing.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Display mode: this panel writes into a blockMath node, so \begin{aligned} and the
  // other display-only environments are legal here.
  const verdict = useMemo(() => (src.trim() ? checkLatex(src, true) : null), [src]);

  const rendered = useMemo(() => {
    if (!src.trim()) return "";
    try {
      return katex.renderToString(src, { throwOnError: true, displayMode: true });
    } catch {
      return "";
    }
  }, [src]);

  // Structural help WHILE typing. checkLatex only speaks about a finished formula;
  // mid-flight its error is noise. These say the one actionable thing and nothing when
  // the structure is sound — and they need no model, which matters because the school's
  // Ollama being unreachable is the normal case, not the exception.
  const hints = useMemo(() => (src.trim() ? liveHints(src) : []), [src]);

  // Apply a hint's own repair. Appending is right for every closer we suggest
  // (\end{…}, }, \right.) — they all belong at the end of what has been typed.
  function applyFix(h) {
    if (!h.fix) return;
    const next = `${src.replace(/\s+$/, "")}${h.fix.startsWith("\\") ? "\n" : ""}${h.fix}`;
    onChange(next);
    setSelection(next.length, 0);
  }

  const frag = trailingCommand(src, caret);
  const matches = useMemo(() => {
    if (!frag) return [];
    return searchSymbols(ALL_GROUPS, frag.word).flatMap((g) => g.items).slice(0, 8);
  }, [frag?.word]);

  useEffect(() => setMenuIndex(0), [frag?.word]);

  const setSelection = useCallback((at, len) => {
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at + len);
      setCaret(at + len);
    });
  }, []);

  // Insert at the caret rather than appending: a teacher fixing the middle of line
  // three of a derivation means "here", not "at the end".
  const insertAtCaret = useCallback((snippet, select) => {
    const el = taRef.current;
    const from = el?.selectionStart ?? src.length;
    const to = el?.selectionEnd ?? from;
    const next = src.slice(0, from) + snippet + src.slice(to);
    onChange(next);
    const at = from + (select ? select[0] : snippet.length);
    setSelection(at, select ? select[1] : 0);
  }, [src, onChange, setSelection]);

  function applySymbol(sym, liveFrag, liveText) {
    const base = liveText ?? src;
    const f = liveFrag || trailingCommand(base, caret);
    const snippet = sym.insert.trimEnd();
    // Pressed from the palette with no half-typed command in front of the caret, this
    // is a plain insert; pressed from the autocomplete menu it REPLACES what was typed.
    if (!f) {
      insertAtCaret(snippet, sym.select);
      return;
    }
    const next = base.slice(0, f.from) + snippet + base.slice(f.to);
    onChange(next);
    const at = f.from + (sym.select ? sym.select[0] : snippet.length);
    setSelection(at, sym.select ? sym.select[1] : 0);
  }

  // Type-to-convert: "somme" + a boundary becomes \sum_{i=1}^{n} with the caret on the
  // index. One ordinary edit, so Ctrl+Z brings back the word the teacher typed.
  function onInput(e) {
    const value = e.target.value;
    const at = e.target.selectionStart ?? value.length;
    const r = expandTrigger(value, at);
    if (r) {
      onChange(value.slice(0, r.from) + r.insert + value.slice(r.to));
      setSelection(r.select ? r.select[0] : r.from + r.insert.length, r.select ? r.select[1] : 0);
      return;
    }
    onChange(value);
    setCaret(at);
  }

  function applyFontChoice(cmd) {
    const el = taRef.current;
    if (!cmd || !el) return;
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? 0;
    const whole = from === to;
    const target = whole ? src : src.slice(from, to);
    const { latex, select } = applyFont(cmd, target);
    const base = whole ? 0 : from;
    onChange(whole ? latex : src.slice(0, from) + latex + src.slice(to));
    setSelection(base + select[0], select[1]);
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "j") {
      e.preventDefault();
      copyLatex();
      return;
    }
    // Read the caret from the textarea, not from state: state can lag a fast typist by
    // a render, and a stale caret makes Enter close the panel instead of accepting the
    // highlighted symbol.
    const liveFrag = trailingCommand(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
    const live = liveFrag ? searchSymbols(ALL_GROUPS, liveFrag.word).flatMap((g) => g.items).slice(0, 8) : [];
    if (live.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIndex((i) => (i + 1) % live.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenuIndex((i) => (i - 1 + live.length) % live.length); return; }
      if (e.key === "Tab") { e.preventDefault(); applySymbol(live[Math.min(menuIndex, live.length - 1)], liveFrag, e.currentTarget.value); return; }
    }
    if (e.key === "Tab") {
      const el = e.currentTarget;
      const p = nextPlaceholder(src, el.selectionEnd);
      if (p) { e.preventDefault(); el.setSelectionRange(p.from, p.to); setCaret(p.to); return; }
    }
    // Enter inserts a newline here — this is a multi-line editor, and a derivation is
    // written across lines. Only Escape leaves, which is what the breadcrumb promises.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  // Schools reach this app over plain http on the LAN, where navigator.clipboard is
  // undefined — the legacy path is the normal one here, not a rare fallback. It only
  // works while the user gesture is live, so it must not run after an await.
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    taRef.current?.focus();
    return ok;
  }

  function copyLatex() {
    const text = src.trim();
    if (!text) return;
    const report = (ok) => toast(ok ? "LaTeX copié ✓" : "Copie impossible", { icon: ok ? "check" : "alert" });
    if (!navigator.clipboard?.writeText) { report(legacyCopy(text)); return; }
    navigator.clipboard.writeText(text).then(() => report(true), () => report(legacyCopy(text)));
  }

  // ── Copilot ──
  //
  // The answer is checked before it is offered, and offered rather than applied. A
  // teacher who asked for "the same thing but with bounds 0 to 1" must be able to see
  // what they are about to accept — Copilot gets the arithmetic wrong often enough that
  // silently overwriting a correct formula with a plausible one is the worst outcome.
  // "Corriger" — the same call as any other request, with the KaTeX error handed to the
  // model as the instruction. A teacher staring at a parse error should not have to
  // translate it into a sentence before they can ask for help with it.
  function repair() {
    if (!verdict || verdict.ok) return;
    ask(`Cette formule ne s'affiche pas. Erreur de KaTeX : « ${verdict.error} ». Corrige-la en gardant exactement le même sens mathématique, sans rien ajouter.`);
  }

  async function ask(override) {
    const instruction = (override ?? prompt).trim();
    if (!instruction || busy) return;
    setBusy(true);
    setAiError("");
    setProposal(null);
    try {
      const r = await fetch("/api/studio/ai/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "latex", subjectSlug: subjectSlug || "", classLevel, tex: src, instruction }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setAiError(
          r.status === 403 ? "Copilot n'écrit des formules que pour les enseignants. Tout le reste de l'éditeur fonctionne."
          : r.status === 503 ? "Copilot est hors ligne — le modèle de l'école ne répond pas. Vous pouvez continuer à écrire à la main."
          : r.status === 429 ? "Trop de demandes d'affilée. Attendez une minute."
          : latexReason(body?.error) ?? "Copilot n'a pas pu répondre. Votre formule n'a pas été modifiée."
        );
        return;
      }
      const data = await r.json();
      const v = checkLatex(String(data.tex ?? ""), true);
      if (!v.ok) {
        setAiError(`Copilot a répondu quelque chose que KaTeX refuse (${v.error}). Votre formule n'a pas été modifiée.`);
        return;
      }
      // The server already retries a blank answer; this catches one that slipped past
      // rather than offering the teacher an empty preview to accept.
      if (v.blank) {
        setAiError("Copilot a répondu une formule qui ne montre rien. Précisez ce que doivent contenir les cases et réessayez.");
        return;
      }
      setProposal({ tex: v.tex, verdict: v, note: data.note || "" });
    } catch {
      setAiError("Copilot est injoignable. Vous pouvez continuer à écrire à la main.");
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!proposal) return;
    onChange(proposal.tex);
    setProposal(null);
    setPrompt("");
    toast("Formule remplacée ✓", { icon: "check" });
  }

  const proposalHtml = useMemo(() => {
    if (!proposal) return "";
    try { return katex.renderToString(proposal.tex, { throwOnError: false, displayMode: true }); } catch { return ""; }
  }, [proposal]);

  return (
    <div className="lx" role="dialog" aria-label="Éditeur LaTeX">
      <div className="lx-bar">
        <span className="lx-title"><Icon name="func" /> Éditeur LaTeX</span>
        <select
          className="lx-font"
          value=""
          aria-label="Police mathématique"
          title="Appliquer une police à la sélection, ou à toute la formule"
          onChange={(e) => { applyFontChoice(e.target.value); e.target.value = ""; }}
          disabled={disabled}
        >
          <option value="">Police…</option>
          {MATH_FONTS.map((f) => <option key={f.cmd} value={f.cmd}>{f.label}</option>)}
        </select>
        <button className={`lx-b${showPalette ? " on" : ""}`} onClick={() => setShowPalette((p) => !p)} aria-pressed={showPalette}>
          <Icon name="grid" /> Symboles
        </button>
        <button className="lx-b" onClick={copyLatex} disabled={!src.trim()} title="Copier le LaTeX (Ctrl+Maj+J)">Copier</button>
        <span className="lx-gap" />
        <button className="lx-done" onClick={onClose}>Terminé — Échap</button>
      </div>

      <div className="lx-body">
        {/* ── left: Copilot ── */}
        <div className="lx-ai">
          <p className="lx-l"><Icon name="sparkles" /> Demander à Copilot</p>
          <textarea
            className="lx-ai-in"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="« transforme ça en intégrale de 0 à 1 de (1+x)^3 et calcule étape par étape »"
            rows={3}
            disabled={disabled || busy}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } }}
          />
          <button className="btn btn-primary btn-sm lx-ai-go" onClick={ask} disabled={disabled || busy || !prompt.trim()}>
            {busy ? "Copilot réfléchit…" : "Écrire la formule"}
          </button>

          {aiError && <p className="lx-ai-err"><Icon name="alert" /> {aiError}</p>}

          {proposal && (
            <div className="lx-prop">
              <p className="lx-l">Proposition</p>
              <div className="lx-prop-r" dangerouslySetInnerHTML={{ __html: proposalHtml }} />
              {proposal.verdict.suspect && <p className="lx-warn"><Icon name="alert" /> {proposal.verdict.suspect}</p>}
              {proposal.verdict.repaired && <p className="lx-note">Copilot avait ajouté {proposal.verdict.repaired} — retiré.</p>}
              <code className="lx-prop-s">{proposal.tex}</code>
              <div className="lx-prop-a">
                <button className="btn btn-primary btn-sm" onClick={accept}>Remplacer</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setProposal(null)}>Annuler</button>
              </div>
              <p className="lx-disclaim">Vérifiez chaque calcul — Copilot se trompe régulièrement.</p>
            </div>
          )}

          {!proposal && !src.trim() && (
            <div className="lx-starters">
              <p className="lx-l">Ou partir d'un modèle</p>
              {STARTERS.map((s) => (
                <button key={s.id} className="lx-starter" onClick={() => { onChange(s.tex); setSelection(s.tex.length, 0); }} disabled={disabled}>
                  <b>{s.label}</b>
                  <span>{s.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── centre: source ── */}
        <div className="lx-src">
          <p className="lx-l">LaTeX</p>
          <div className="lx-ta-wrap">
            <textarea
              ref={taRef}
              className={`lx-ta${verdict && !verdict.ok ? " bad" : ""}`}
              value={src}
              spellCheck="false"
              autoComplete="off"
              autoCapitalize="off"
              disabled={disabled}
              placeholder={"\\begin{aligned}\n  I &= \\int_0^1 (1+x)^3 \\, dx \\\\\n    &= \\frac{15}{4}\n\\end{aligned}"}
              onChange={onInput}
              onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
            />
            {matches.length > 0 && (
              <ul className="lx-menu" role="listbox" aria-label="Symboles proposés">
                {matches.map((s, i) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={i === menuIndex}
                    className={i === menuIndex ? "on" : ""}
                    onMouseDown={(e) => { e.preventDefault(); applySymbol(s); }}
                  >
                    <span className="lx-menu-tex" dangerouslySetInnerHTML={{ __html: katex.renderToString(s.tex, { throwOnError: false }) }} />
                    <span className="lx-menu-l">{s.label}</span>
                    <code>{s.insert.trim()}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Live structural help. Present only when there is something to say, so the
              strip does not become furniture the teacher learns to look past. */}
          {hints.length > 0 ? (
            <ul className="lx-hints" aria-live="polite">
              {hints.slice(0, 3).map((h, i) => (
                <li key={i}>
                  <Icon name="alert" />
                  <span>{h.message}</span>
                  {h.fix && (
                    <button onClick={() => applyFix(h)} disabled={disabled} title={`Ajouter ${h.fix}`}>
                      Ajouter <code>{h.fix}</code>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="lx-tip">Tapez « somme », « racine », « matrice »… puis espace — ou « \ » pour chercher une commande. <b>Tab</b> passe au champ suivant.</p>
          )}
        </div>

        {/* ── right: what the class will see ── */}
        <div className="lx-out">
          <p className="lx-l"><Icon name="eye" /> Ce que verra la classe</p>
          <div className="lx-render">
            {!src.trim() ? (
              <span className="lx-empty">La formule s'affichera ici pendant que vous l'écrivez.</span>
            ) : verdict?.ok ? (
              <span dangerouslySetInnerHTML={{ __html: rendered }} />
            ) : (
              <span className="lx-empty">—</span>
            )}
          </div>
          {verdict && !verdict.ok && (
            <>
              <p className="lx-err"><Icon name="alert" /> {verdict.error}</p>
              <button className="btn btn-secondary btn-sm lx-fix" onClick={repair} disabled={disabled || busy}>
                <Icon name="sparkles" /> {busy ? "Copilot corrige…" : "Corriger avec Copilot"}
              </button>
            </>
          )}
          {verdict?.ok && verdict.suspect && (
            <p className="lx-warn"><Icon name="alert" /> {verdict.suspect}</p>
          )}
          {verdict?.ok && !verdict.suspect && src.trim() && (
            <p className="lx-ok"><Icon name="check" /> S'affiche correctement.</p>
          )}
        </div>
      </div>

      {showPalette && (
        // The catalogue is a browsable list, not a grid of keys — it needs room the
        // symbol grid does not.
        <div className={`lx-pal${palTab === "figures" ? " tall" : ""}`}>
          <SymbolPalette
            tab={palTab}
            onTab={setPalTab}
            query={palQuery}
            onQuery={setPalQuery}
            onPick={(s) => applySymbol(s)}
            // A ```figure block is markdown and this editor writes a maths node, so the
            // catalogue offers only the formula here — see allowChart in FigureCatalogue.
            onInsertFigure={(code) => { insertAtCaret(src.trim() ? `\n${code}` : code); toast("Formule du catalogue insérée ✓", { icon: "check" }); }}
            allowChart={false}
            disabled={disabled}
            compact
          />
        </div>
      )}
    </div>
  );
}
