"use client";
import { useState } from "react";
import { EditorContent } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import SymbolKeyboard from "@/components/editor/SymbolKeyboard";
import LatexPanel from "@/components/editor/LatexPanel";
import FigureEditPanel from "@/components/editor/FigureEditPanel";
import { CONTEXTS, keepSelection } from "@/components/editor/useLessonEditor";
import { FIGURE_KINDS } from "@/lib/figures";
import { toast } from "@/lib/toast";

// Wireframe 1f — the tablet chrome, 1024×768.
//
// The desktop ribbon assumes a mouse and a wide window. Here the rails become a bottom
// dock, and the dock's contents ARE the context: writing prose it holds the block and
// inline controls, inside a formula it becomes the symbol keyboard, and in the LaTeX
// editor the panel takes the screen and the dock steps aside entirely.
//
// Nothing is greyed out (1a callout 2): a control you cannot use is simply not there.

const HINTS = {
  doc: [["Ctrl+M", "formule"], ["Ctrl+Maj+M", "formule centrée"], ["Échap", "quitter la zone"]],
  math: [["espace", "convertit le mot"], ["\\", "commande LaTeX"], ["^ _ /", "structures"], ["Ctrl+Maj+J", "copier le LaTeX"], ["Échap", "quitter la zone"]],
  latex: [["espace", "convertit le mot"], ["\\", "commande LaTeX"], ["Tab", "champ suivant"], ["Échap", "quitter la zone"]],
};

// A short palette: the dock is one row of 44px keys, so this is the four colours a
// lesson actually uses, not the eight the ribbon offers.
const TC_COLORS = [
  { hex: "#4f46e5", name: "Indigo" },
  { hex: "#16a34a", name: "Vert" },
  { hex: "#be123c", name: "Rouge" },
  { hex: "#1c1c1e", name: "Noir" },
];

export default function TabletChrome({ ed, value, onChange, disabled, saveState, stats, onOpenSettings, spellcheck, subjectSlug, classLevel }) {
  const [menu, setMenu] = useState(false);
  const [figMenu, setFigMenu] = useState(false);
  const { editor, mode, setMode, gate, ctx, exitCtx, mathSel, figSel } = ed;

  const ctxInfo = CONTEXTS[ctx];
  const canUndo = !!editor?.can().undo();
  const canRedo = !!editor?.can().redo();

  function exportMarkdown() {
    const url = URL.createObjectURL(new Blob([value || ""], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lecon.md";
    a.click();
    URL.revokeObjectURL(url);
    setMenu(false);
  }

  // Schools reach this app over plain http on the LAN, where navigator.clipboard is
  // undefined — so the legacy path is the normal one here, not a rare fallback.
  function copyLatex() {
    const text = (mathSel?.tex || "").trim();
    if (!text) return;
    const legacy = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
      return ok;
    };
    if (!navigator.clipboard?.writeText) {
      toast(legacy() ? "LaTeX copié ✓" : "Copie impossible", { icon: legacy ? "check" : "alert" });
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast("LaTeX copié ✓", { icon: "check" }),
      () => toast(legacy() ? "LaTeX copié ✓" : "Copie impossible", { icon: "check" })
    );
  }

  const active = (n, a) => ed.active(n, a);
  const src = mode === "source";

  return (
    <div className={`tc tc-${ctx}`}>
      {/* ── top bar (1f) : ☰ · context chip · ↶ ↷ · Terminé ── */}
      <div className="tc-bar" onMouseDown={keepSelection}>
        <button className="tc-b" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Menu du document">☰</button>
        <span className="tc-chip">{ctxInfo.chip}</span>
        {ctx !== "doc" && (
          <span className="tc-crumb">
            <span>Document</span><span aria-hidden="true">›</span><b>{ctxInfo.crumb}</b>
          </span>
        )}
        <span className="tc-gap" />
        <span className="tc-save">{saveState}</span>
        <button className="tc-b" onClick={() => ed.chain()?.undo().run()} disabled={!canUndo} aria-label="Annuler">↶</button>
        <button className="tc-b" onClick={() => ed.chain()?.redo().run()} disabled={!canRedo} aria-label="Rétablir">↷</button>
        <button className="tc-done" onClick={exitCtx} disabled={ctx === "doc"} aria-label="Quitter la zone">Terminé</button>
      </div>

      {menu && (
        <>
          <div className="tc-scrim" onClick={() => setMenu(false)} />
          <div className="tc-menu" role="menu" aria-label="Menu du document">
            <button role="menuitem" onClick={exportMarkdown}><Icon name="download" /> Exporter la leçon (Markdown)</button>
            <button role="menuitem" disabled={!mathSel} onClick={() => { copyLatex(); setMenu(false); }}><Icon name="func" /> Copier la formule en LaTeX</button>
            <hr />
            <button role="menuitem" onClick={() => { setMenu(false); onOpenSettings(); }}><Icon name="settings" /> Paramètres du document…</button>
            <button role="menuitem" onClick={() => { setMenu(false); window.print(); }}><Icon name="file" /> Imprimer</button>
            <hr />
            <div className="tc-menu-seg" role="group" aria-label="Mode d'édition">
              <button className={!src ? "on" : ""} disabled={!gate.ok} title={gate.ok ? "" : gate.reason} onClick={() => { if (gate.ok) { setMode("visual"); setMenu(false); } }}>Visuel</button>
              <button className={src ? "on" : ""} onClick={() => { setMode("source"); setMenu(false); }}>Markdown</button>
            </div>
          </div>
        </>
      )}

      {!gate.ok && src && (
        <div className="lw-note">
          <Icon name="alert" />
          <span>{gate.reason} Elle s'affiche ici en lecture seule — modifiez-la depuis le Studio de contenu.</span>
        </div>
      )}

      {/* ── the page ── */}
      <div className="tc-stage lw-canvas">
        {ctx === "latex" && mode === "visual" && !disabled ? (
          <LatexPanel
            tex={mathSel.tex}
            onChange={ed.updateMath}
            onClose={exitCtx}
            disabled={disabled}
            subjectSlug={subjectSlug}
            classLevel={classLevel}
          />
        ) : (
          <div className="lw-page">
            {mode === "visual" ? (
              <>
                {figSel && !disabled && <FigureEditPanel spec={figSel.spec} anchor={figSel.anchor} onChange={ed.updateFigure} onClose={() => ed.setFigSel(null)} />}
                <EditorContent editor={editor} />
              </>
            ) : (
              <textarea
                className="lw-input"
                value={value}
                onChange={(e) => { ed.emitted.current = e.target.value; onChange(e.target.value); }}
                readOnly={!gate.ok}
                disabled={disabled}
                spellCheck={spellcheck}
                placeholder="Commencez à écrire votre leçon…"
              />
            )}
          </div>
        )}
      </div>

      {/* ── LaTeX preview strip (1a callout 8) — live, and a copy target ── */}
      {ctx === "math" && (
        <div className="tc-latex" onMouseDown={keepSelection}>
          <span className="tc-latex-l">LaTeX</span>
          <code>{mathSel.tex || "—"}</code>
          <button onClick={copyLatex} disabled={!mathSel.tex?.trim()} aria-label="Copier le LaTeX">Copier</button>
        </div>
      )}

      {/* ── bottom dock : the rails, flattened ── */}
      {ctx !== "latex" && (
        <div className="lw-dock tc-dock" onMouseDown={keepSelection}>
          {ctx === "math" ? (
            <SymbolKeyboard
              tex={mathSel.tex}
              display={mathSel.display}
              onTexChange={ed.updateMath}
              onInsertSymbol={ed.insertSymbol}
              onClose={exitCtx}
              disabled={disabled}
            />
          ) : (
            <div className="tc-docdock">
              <select
                className="tc-style"
                value={active("heading", { level: 2 }) ? "h2" : active("heading", { level: 3 }) ? "h3" : "p"}
                onChange={(e) => ed.setBlock(e.target.value)}
                disabled={disabled || src}
                aria-label="Style du paragraphe"
              >
                <option value="p">Paragraphe</option>
                <option value="h2">Titre de section</option>
                <option value="h3">Sous-titre</option>
              </select>

              <span className="tc-sep" />
              <button className={`tc-k${active("bold") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBold().run()} disabled={disabled || src} aria-label="Gras" aria-pressed={active("bold")}><Icon name="bold" /></button>
              <button className={`tc-k${active("italic") ? " on" : ""}`} onClick={() => ed.chain()?.toggleItalic().run()} disabled={disabled || src} aria-label="Italique" aria-pressed={active("italic")}><Icon name="italic" /></button>
              {/* Parity with the ribbon is not optional: a command that exists on the
                  desktop and not here makes the tablet a second-class editor, and the
                  tablet is what most of these classrooms actually have. */}
              <button className={`tc-k${active("underline") ? " on" : ""}`} onClick={() => ed.chain()?.toggleUnderline().run()} disabled={disabled || src} aria-label="Souligné" aria-pressed={active("underline")}><Icon name="underline" /></button>
              <button className={`tc-k${active("strike") ? " on" : ""}`} onClick={() => ed.chain()?.toggleStrike().run()} disabled={disabled || src} aria-label="Barré" aria-pressed={active("strike")}><Icon name="strike" /></button>
              <button className={`tc-k${active("subscript") ? " on" : ""}`} onClick={() => ed.chain()?.toggleSubscript().run()} disabled={disabled || src} aria-label="Indice" aria-pressed={active("subscript")}><Icon name="subscript" /></button>
              <button className={`tc-k${active("superscript") ? " on" : ""}`} onClick={() => ed.chain()?.toggleSuperscript().run()} disabled={disabled || src} aria-label="Exposant" aria-pressed={active("superscript")}><Icon name="superscript" /></button>
              <button className={`tc-k${active("bulletList") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBulletList().run()} disabled={disabled || src} aria-label="Liste à puces" aria-pressed={active("bulletList")}><Icon name="list" /></button>
              <button className={`tc-k${active("orderedList") ? " on" : ""}`} onClick={() => ed.chain()?.toggleOrderedList().run()} disabled={disabled || src} aria-label="Liste numérotée" aria-pressed={active("orderedList")}><Icon name="sort" /></button>
              <button className={`tc-k${active("blockquote") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBlockquote().run()} disabled={disabled || src} aria-label="Citation" aria-pressed={active("blockquote")}><Icon name="message" /></button>

              <span className="tc-sep" />
              {/* Colours and alignment as flat 44px keys rather than dropdowns — a
                  popover inside a bottom dock is a fiddly target on a touchscreen. */}
              {TC_COLORS.map((c) => (
                <button key={c.hex} className="tc-k tc-swatch" style={{ background: c.hex }} onClick={() => ed.setColor(c.hex)} disabled={disabled || src} aria-label={`Couleur ${c.name}`} title={c.name} />
              ))}
              <button className="tc-k" onClick={() => ed.setHighlight("#fef08a")} disabled={disabled || src} aria-label="Surligner"><Icon name="highlight" /></button>
              <button className={`tc-k${active({ textAlign: "center" }) ? " on" : ""}`} onClick={() => ed.setAlign("center")} disabled={disabled || src} aria-label="Centrer" aria-pressed={active({ textAlign: "center" })}><Icon name="alignCenter" /></button>
              <button className={`tc-k${active({ textAlign: "right" }) ? " on" : ""}`} onClick={() => ed.setAlign("right")} disabled={disabled || src} aria-label="Aligner à droite" aria-pressed={active({ textAlign: "right" })}><Icon name="alignRight" /></button>
              <button className="tc-k" onClick={ed.clearFormatting} disabled={disabled || src} aria-label="Effacer la mise en forme"><Icon name="clearFormat" /></button>

              <span className="tc-sep" />
              <button className="tc-k wide" onClick={() => ed.insertFormula(false)} disabled={disabled || src} aria-label="Insérer une formule"><Icon name="func" /> Formule</button>
              <button className="tc-k wide" onClick={() => ed.insertFormula(true)} disabled={disabled || src} aria-label="Insérer une formule centrée"><Icon name="func" /> Centrée</button>
              <div className="tc-figwrap">
                <button className={`tc-k wide${figMenu ? " on" : ""}`} onClick={() => setFigMenu((f) => !f)} disabled={disabled || src} aria-expanded={figMenu} aria-label="Insérer une figure"><Icon name="chart" /> Figure</button>
                {figMenu && (
                  <div className="tc-figmenu" role="menu" aria-label="Types de figure">
                    {FIGURE_KINDS.map((k) => (
                      <button key={k.kind} role="menuitem" onClick={() => { setFigMenu(false); ed.insertFigure(k.kind); }}>
                        <span className="t">{k.label}</span>
                        <span className="h">{k.hint}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="tc-k wide" onClick={ed.openLatex} disabled={disabled || src} aria-label="Ouvrir l'éditeur LaTeX"><Icon name="func" /> LaTeX</button>
            </div>
          )}
        </div>
      )}

      {/* ── context hint bar (1a callout 10) — teaches the keyboard model, no manual ── */}
      <div className="tc-hints">
        {HINTS[ctx].map(([k, what]) => <span key={k}><b>{k}</b> {what}</span>)}
        <span className="tc-gap" />
        <span>{stats.words} mot{stats.words > 1 ? "s" : ""}</span>
        <span>{stats.formulas} formule{stats.formulas > 1 ? "s" : ""}</span>
        {stats.flagged > 0 && <span className="warn"><Icon name="alert" /> {stats.flagged} à vérifier</span>}
      </div>
    </div>
  );
}
