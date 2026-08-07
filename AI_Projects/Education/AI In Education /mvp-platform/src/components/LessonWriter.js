"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { EditorContent } from "@tiptap/react";
import Icon from "@/components/ui/Icon";
import FormulaEditor from "@/components/editor/FormulaEditor";
import FigurePanel from "@/components/editor/FigurePanel";
import EpurePanel from "@/components/editor/EpurePanel";
import LatexPanel from "@/components/editor/LatexPanel";
import SymbolPalette from "@/components/editor/SymbolPalette";
import DocSettings from "@/components/editor/DocSettings";
import FindReplacePanel from "@/components/editor/FindReplacePanel";
import Markdown from "@/components/Markdown";
import TabletChrome from "@/components/editor/TabletChrome";
import { useLessonEditor, keepSelection } from "@/components/editor/useLessonEditor";
import { FIGURE_KINDS, isEpure } from "@/lib/figures";
import { EPURE_TEMPLATES } from "@/lib/epure";
import { insertAt, insertBlock } from "@/lib/mdCaret";
import { addImage } from "@/lib/imageUpload";
import { toast } from "@/lib/toast";
import { extractFormulas } from "@/lib/formulas";
import { loadSettings, saveSettings, settingsToVars } from "@/lib/docSettings";
import "./LessonWriter.css";

// WYSIWYG lesson editor. What you see is the lesson: headings look like headings,
// bold is bold, and formulas are rendered maths you click to edit.
//
// The document is still STORED as markdown + LaTeX — that is what students, the RAG
// index and Copilot read — so every change is serialised back on the way out. When a
// lesson contains something that would not survive that round trip (an SVG épure, a
// table, bold wrapped around a formula), canEditVisually() says so and this falls
// back to editing the source. See src/lib/lessonDoc.ts.
//
// There are two chromes over that one document. A tablet gets wireframe 1f — bottom
// dock, symbol keyboard — and a desktop keeps the ribbon, because a 44px key grid is
// a downgrade when you have a mouse and a wide window. Both drive useLessonEditor(),
// so the FEATURES are identical; only the chrome differs.

// 1024×768 is the tablet the wireframe is drawn for. `pointer: coarse` catches the
// large touchscreens that are wider than that — on those the ribbon's 26px buttons are
// the problem, not the width.
const TABLET_QUERY = "(max-width: 1024px), (pointer: coarse)";

function useIsTablet() {
  // Starts false and corrects on mount: matchMedia does not exist during server
  // rendering, and guessing wrong there produces a hydration mismatch on every load.
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(TABLET_QUERY);
    const apply = () => setTablet(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return tablet;
}


// Small, deliberate palettes. A free colour picker in a lesson editor produces
// unreadable low-contrast text on a projector; these are drawn from the design tokens
// and every one of them prints legibly. Six-digit lowercase hex is also the ONLY form
// lessonDoc's dialect accepts — see HTML_OPEN there.
const TEXT_COLORS = [
  { hex: "#1c1c1e", name: "Noir" },
  { hex: "#4f46e5", name: "Indigo" },
  { hex: "#2563eb", name: "Bleu" },
  { hex: "#0d9488", name: "Sarcelle" },
  { hex: "#16a34a", name: "Vert" },
  { hex: "#ea580c", name: "Orange" },
  { hex: "#be123c", name: "Rouge" },
  { hex: "#7c3aed", name: "Violet" },
];
const HIGHLIGHTS = [
  { hex: "#fef08a", name: "Jaune" },
  { hex: "#bbf7d0", name: "Vert" },
  { hex: "#bfdbfe", name: "Bleu" },
  { hex: "#fecaca", name: "Rouge" },
  { hex: "#e9d5ff", name: "Violet" },
  { hex: "#fed7aa", name: "Orange" },
];
const ALIGNS = [
  { value: "left", icon: "alignLeft", title: "Aligner à gauche" },
  { value: "center", icon: "alignCenter", title: "Centrer" },
  { value: "right", icon: "alignRight", title: "Aligner à droite" },
  { value: "justify", icon: "alignJustify", title: "Justifier" },
];
const CASES = [
  { id: "upper", label: "MAJUSCULES" },
  { id: "lower", label: "minuscules" },
  { id: "title", label: "Première Lettre" },
];

// A colour dropdown. keepSelection on the trigger is what stops the document losing
// its selection the moment the button is pressed — without it the colour would land
// on nothing.
function Swatches({ open, onOpen, label, icon, colors, onPick, clearLabel, disabled }) {
  return (
    <div className="lw-swatchwrap">
      <button
        className={`lw-btn${open ? " on" : ""}`}
        onClick={onOpen}
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-expanded={open}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div className="lw-swatches" role="menu" aria-label={label}>
          {colors.map((c) => (
            <button
              key={c.hex}
              role="menuitem"
              className="lw-swatch"
              style={{ background: c.hex }}
              title={c.name}
              aria-label={c.name}
              onClick={() => onPick(c.hex)}
            />
          ))}
          <button className="lw-swatch-clear" role="menuitem" onClick={() => onPick(null)}>{clearLabel}</button>
        </div>
      )}
    </div>
  );
}

// The 8x8 size picker every word processor has. Hovering shows "3 × 4" so the teacher
// commits to a size they have actually seen, rather than typing numbers into a dialog.
function TableGrid({ onPick }) {
  const [hover, setHover] = useState({ r: 0, c: 0 });
  const N = 8;
  return (
    <div className="lw-tablegrid" role="menu" aria-label="Taille du tableau">
      <div className="lw-tablegrid-cells" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
        {Array.from({ length: N * N }, (_, i) => {
          const r = Math.floor(i / N) + 1;
          const c = (i % N) + 1;
          return (
            <button
              key={i}
              role="menuitem"
              className={`lw-tablecell${r <= hover.r && c <= hover.c ? " on" : ""}`}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onPick(r, c)}
              aria-label={`${r} lignes sur ${c} colonnes`}
            />
          );
        })}
      </div>
      <p className="lw-tablegrid-l">{hover.r ? `${hover.r} × ${hover.c}` : "Choisissez la taille"}</p>
    </div>
  );
}

// `onReady` hands the caller an insert-at-cursor function, so Copilot output lands
// where the writer is looking instead of being appended to the end of the document.
//
// `subjectSlug`/`classLevel` are only passed through to the LaTeX editor's Copilot,
// which needs to know it is writing chemistry for a 6e rather than maths in general.
// Both are optional: without them the editor still works, Copilot just asks for less.
// `toolbarHost`/`statusHost` let the page render the ribbon and status bar somewhere
// else in ITS layout — the Docs shell spans them across all three columns, above and
// below the outline/document/Copilot row. They go through createPortal rather than
// being lifted out as props so this component keeps owning the editor: React context
// and event bubbling both follow the portal, so `keepSelection` and every `ed.*`
// command work exactly as they do inline. Without a host, they render in place.
export default function LessonWriter({ value, onChange, disabled, saveState, lessonId, onReady, subjectSlug, classLevel, toolbarHost, statusHost }) {
  const ed = useLessonEditor({ value, onChange, disabled });
  const { editor, mode, setMode, gate, ctx, exitCtx, mathSel, figSel, latexOpen, insertMarkdown } = ed;

  // The page drives the menu bar, so it needs more than insert-at-caret: the whole
  // command surface, plus enough state to tick the right boxes.
  //
  // Deliberately no dependency array. `ed` is rebuilt every render, so listing it
  // would make the array's contents change identity on every pass anyway — and
  // half-listing it hands the menu bar a stale editor whose commands act on the
  // previous document. Re-running is one ref assignment; correctness is worth more.
  useEffect(() => {
    if (!onReady) return undefined;
    onReady({ insertMarkdown, ed, openSettings: () => setSettingsOpen(true), openPalette: () => setPalette(true), openFind: () => setFindOpen(true), chooseImage });
    return () => onReady(null);
  });

  const tablet = useIsTablet();
  const [palette, setPalette] = useState(false);
  const [palTab, setPalTab] = useState("math");
  const [query, setQuery] = useState("");
  const [figMenu, setFigMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swatch, setSwatch] = useState(null); // "color" | "highlight" | "align" | "case" | null
  const [marksOn, setMarksOn] = useState(false); // ¶ show paragraph boundaries
  const [findOpen, setFindOpen] = useState(false);
  const [settings, setSettings] = useState(null);

  // Settings are read once on the client — localStorage does not exist on the server,
  // and reading it during render would make the first paint differ from the markup.
  useEffect(() => setSettings(loadSettings()), []);

  // Ctrl+F is muscle memory, and the browser's own find is worse than useless here: it
  // searches the rendered page, not the document, so it cannot see source mode and
  // offers no way to replace.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "f" || e.key === "h") {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The palette stays reachable in Markdown mode, so its inserts have to land in the
  // TEXTAREA there. Every ed.* command drives the ProseMirror document, which in source
  // mode is off-screen — clicking a symbol wrote into an invisible editor and the
  // teacher saw nothing happen at all.
  const taRef = useRef(null);

  /** Splice markdown in at the textarea caret, then put the caret after it. */
  function insertIntoSource(snippet, asBlock) {
    const ta = taRef.current;
    const src = value || "";
    const from = ta ? ta.selectionStart : src.length;
    const to = ta ? ta.selectionEnd : src.length;
    const next = asBlock ? insertBlock(src, from, snippet) : insertAt(src, from, to, snippet);
    ed.emitted.current = next.md;
    onChange(next.md);
    requestAnimationFrame(() => {
      if (!taRef.current) return;
      taRef.current.focus();
      taRef.current.setSelectionRange(next.caret, next.caret);
    });
    return next;
  }

  // The catalogue offers three different things and they insert differently: a drawn
  // épure is inline SVG and a chart is a ```figure block — both already markdown — while
  // the formula is bare LaTeX that needs $$ around it to become a block.
  function insertFromCatalogue(code, kind, fig) {
    const md = kind === "math" ? `$$\n${code}\n$$` : code;
    if (mode === "visual") {
      // insertMarkdown refuses anything mdToDoc cannot represent. Saying so beats
      // inserting a mangled copy, and beats the silence this used to give.
      if (!ed.insertMarkdown(md)) {
        toast("Cette figure ne peut pas être insérée en mode Visuel — passez en Markdown.", { icon: "alert" });
        return;
      }
    } else {
      const { movedOutOfFence } = insertIntoSource(md, true);
      if (movedOutOfFence) toast("Insérée après le bloc de code.", { icon: "alert" });
    }
    toast(`${fig.code} inséré ✓`, { icon: "check" });
  }

  function pickSymbol(sym) {
    if (mode === "visual") { ed.insertSymbol(sym); return; }
    insertIntoSource(sym.insert, false);
  }

  // ── pictures ──
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function insertPicture(file) {
    if (!file || !lessonId) return;
    setUploading(true);
    try {
      // addImage shrinks first — a 12 MP phone photo is ~5 MB, capped at 1600px it is
      // ~250 KB — then uploads, or queues it on the device if the server is unreachable
      // and hands back a mwalimu-pending: placeholder the editor can still draw.
      const { src, pending } = await addImage(lessonId, file);
      // The alt text is the teacher's to write, and an empty one is honest: a wrong
      // guessed description is worse for a screen reader than none.
      if (mode === "visual") ed.insertImage({ src, alt: "" });
      else insertIntoSource(`![](${src})`, true);
      toast(
        pending ? "Image gardée sur cet appareil — envoyée dès le retour du serveur." : "Image insérée ✓",
        { icon: pending ? "alert" : "check" },
      );
    } catch (e) {
      toast(e?.message || "L'image n'a pas pu être envoyée.", { icon: "alert" });
    } finally {
      setUploading(false);
    }
  }

  function chooseImage() {
    if (!lessonId) { toast("Enregistrez la leçon avant d'ajouter une image.", { icon: "alert" }); return; }
    fileRef.current?.click();
  }

  const stats = useMemo(() => {
    const text = (value || "").replace(/\$[^$]*\$/g, " ");
    const words = text.trim() ? text.split(/\s+/).filter(Boolean).length : 0;
    const f = extractFormulas(value || "");
    return { words, formulas: f.length, flagged: f.filter((x) => !x.ok || x.suspect).length };
  }, [value]);

  if (mode === null || !settings) return <div className="lw" />;

  const vars = settingsToVars(settings);
  const spellcheck = settings.spellcheck === "on";
  const shell = (body) => (
    <div className={`lw${settings.dark ? " lw-dark" : ""}${tablet ? " lw-tablet" : ""}${marksOn ? " lw-marks" : ""}`} style={vars} data-brackets={settings.brackets} data-lazy={settings.lazyMath}>
      {body}
      {settingsOpen && (
        <DocSettings
          settings={settings}
          onPreview={setSettings}
          onApply={(s) => { setSettings(s); saveSettings(s); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );

  if (tablet) {
    return shell(
      <TabletChrome
        ed={ed}
        value={value}
        onChange={onChange}
        disabled={disabled}
        saveState={saveState}
        stats={stats}
        spellcheck={spellcheck}
        subjectSlug={subjectSlug}
        classLevel={classLevel}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    );
  }

  // The LaTeX editor takes the whole pane, so the document ribbon is hidden while it is
  // open — bold, lists and block style do not apply to a formula, and on a 720px screen
  // the 70px it occupies is the difference between a usable source box and a squeezed
  // one. The breadcrumb below is the way back, and it stays.
  const latexFull = ctx === "latex" && mode === "visual" && !disabled;
  // Every document command is dead in source mode — the textarea is the editor there.
  const off = disabled || mode !== "visual";

  // ── desktop ribbon ──
  const ribbon = (
    <div className="lw-ribbon" onMouseDown={keepSelection} hidden={latexFull}>
        <div className="lw-group">
          <select
            className="lw-style"
            value={ed.active("heading", { level: 2 }) ? "h2" : ed.active("heading", { level: 3 }) ? "h3" : "p"}
            onChange={(e) => ed.setBlock(e.target.value)}
            disabled={disabled || mode === "source"}
          >
            <option value="p">Paragraphe</option>
            <option value="h2">Titre de section</option>
            <option value="h3">Sous-titre</option>
          </select>
        </div>

        <div className="lw-group">
          <button className={`lw-btn${ed.active("bold") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBold().run()} disabled={off} title="Gras (Ctrl+B)" aria-label="Gras" aria-pressed={ed.active("bold")}><Icon name="bold" /></button>
          <button className={`lw-btn${ed.active("italic") ? " on" : ""}`} onClick={() => ed.chain()?.toggleItalic().run()} disabled={off} title="Italique (Ctrl+I)" aria-label="Italique" aria-pressed={ed.active("italic")}><Icon name="italic" /></button>
          <button className={`lw-btn${ed.active("underline") ? " on" : ""}`} onClick={() => ed.chain()?.toggleUnderline().run()} disabled={off} title="Souligné (Ctrl+U)" aria-label="Souligné" aria-pressed={ed.active("underline")}><Icon name="underline" /></button>
          <button className={`lw-btn${ed.active("strike") ? " on" : ""}`} onClick={() => ed.chain()?.toggleStrike().run()} disabled={off} title="Barré" aria-label="Barré" aria-pressed={ed.active("strike")}><Icon name="strike" /></button>
          <button className={`lw-btn${ed.active("subscript") ? " on" : ""}`} onClick={() => ed.chain()?.toggleSubscript().run()} disabled={off} title="Indice — H₂O" aria-label="Indice" aria-pressed={ed.active("subscript")}><Icon name="subscript" /></button>
          <button className={`lw-btn${ed.active("superscript") ? " on" : ""}`} onClick={() => ed.chain()?.toggleSuperscript().run()} disabled={off} title="Exposant — m²" aria-label="Exposant" aria-pressed={ed.active("superscript")}><Icon name="superscript" /></button>
          <Swatches open={swatch === "color"} onOpen={() => setSwatch(swatch === "color" ? null : "color")} label="Couleur du texte" icon="palette" colors={TEXT_COLORS} onPick={(c) => { ed.setColor(c); setSwatch(null); }} clearLabel="Couleur par défaut" disabled={off} />
          <Swatches open={swatch === "highlight"} onOpen={() => setSwatch(swatch === "highlight" ? null : "highlight")} label="Surlignage" icon="highlight" colors={HIGHLIGHTS} onPick={(c) => { ed.setHighlight(c); setSwatch(null); }} clearLabel="Sans surlignage" disabled={off} />
          <button className={`lw-btn${ed.active("bulletList") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBulletList().run()} disabled={disabled || mode === "source"} title="Liste à puces" aria-label="Liste à puces" aria-pressed={ed.active("bulletList")}><Icon name="list" /></button>
          <button className={`lw-btn${ed.active("orderedList") ? " on" : ""}`} onClick={() => ed.chain()?.toggleOrderedList().run()} disabled={disabled || mode === "source"} title="Liste numérotée" aria-label="Liste numérotée" aria-pressed={ed.active("orderedList")}><Icon name="sort" /></button>
          <button className={`lw-btn${ed.active("blockquote") ? " on" : ""}`} onClick={() => ed.chain()?.toggleBlockquote().run()} disabled={off} title="Citation" aria-label="Citation" aria-pressed={ed.active("blockquote")}><Icon name="message" /></button>
          <button className="lw-btn" onClick={() => ed.chain()?.sinkListItem("listItem").run()} disabled={off} title="Augmenter le retrait" aria-label="Augmenter le retrait"><Icon name="indent" /></button>
          <button className="lw-btn" onClick={() => ed.chain()?.liftListItem("listItem").run()} disabled={off} title="Diminuer le retrait" aria-label="Diminuer le retrait"><Icon name="outdent" /></button>
        </div>

        <div className="lw-group">
          {ALIGNS.map((a) => (
            <button key={a.value} className={`lw-btn${ed.active({ textAlign: a.value }) ? " on" : ""}`} onClick={() => ed.setAlign(a.value)} disabled={off} title={a.title} aria-label={a.title} aria-pressed={ed.active({ textAlign: a.value })}><Icon name={a.icon} /></button>
          ))}
        </div>

        <div className="lw-group">
          <button className={`lw-btn${ed.active("link") ? " on" : ""}`} onClick={ed.setLink} disabled={off} title="Lien (Ctrl+K)" aria-label="Lien" aria-pressed={ed.active("link")}><Icon name="link" /></button>
          <button className="lw-btn wide" onClick={() => ed.insertFormula(false)} disabled={disabled || mode === "source"} title="Formule dans le texte (Ctrl+M)" aria-label="Insérer une formule"><Icon name="func" /> Formule</button>
          <button className="lw-btn wide" onClick={() => ed.insertFormula(true)} disabled={disabled || mode === "source"} title="Formule centrée (Ctrl+Maj+M)" aria-label="Insérer une formule centrée"><Icon name="func" /> Centrée</button>
          <button className={`lw-btn wide${palette ? " on" : ""}`} onClick={() => setPalette((p) => !p)} disabled={disabled} title="Symboles mathématiques et chimiques" aria-label="Symboles" aria-expanded={palette}><Icon name="grid" /> Symboles</button>
          <div className="lw-swatchwrap">
            <button className={`lw-btn${swatch === "table" ? " on" : ""}`} onClick={() => setSwatch(swatch === "table" ? null : "table")} disabled={off} title="Insérer un tableau" aria-label="Insérer un tableau" aria-expanded={swatch === "table"}><Icon name="table" /></button>
            {swatch === "table" && <TableGrid onPick={(r, c) => { setSwatch(null); ed.insertTable(r, c); }} />}
          </div>
          <button
            className="lw-btn wide"
            onClick={chooseImage}
            disabled={disabled || uploading || !gate.ok}
            title="Insérer une image — photo, schéma scanné"
            aria-label="Insérer une image"
          >
            <Icon name="image" /> {uploading ? "Envoi…" : "Image"}
          </button>
          <div className="lw-figwrap">
            <button className={`lw-btn wide${figMenu ? " on" : ""}`} onClick={() => setFigMenu((f) => !f)} disabled={disabled || mode === "source"} title="Insérer une figure" aria-label="Insérer une figure" aria-expanded={figMenu}><Icon name="chart" /> Figure</button>
            {figMenu && (
              <div className="lw-figmenu" role="menu" aria-label="Types de figure">
                {/* Geometry first: it is what these lessons are mostly made of, and it
                    was the one thing the figure button could not do. */}
                <p className="lw-figmenu-s">Géométrie</p>
                {EPURE_TEMPLATES.map((t) => (
                  <button key={t.id} role="menuitem" onClick={() => { setFigMenu(false); ed.insertEpure(t.spec); }}>
                    <span className="lw-figmenu-i"><Icon name={t.icon} /></span>
                    <span className="lw-figmenu-t">{t.label}</span>
                    <span className="lw-figmenu-h">{t.hint}</span>
                  </button>
                ))}
                <p className="lw-figmenu-s">Graphiques</p>
                {FIGURE_KINDS.map((k) => (
                  <button key={k.kind} role="menuitem" onClick={() => { setFigMenu(false); ed.insertFigure(k.kind); }}>
                    <span className="lw-figmenu-i"><Icon name={k.icon} /></span>
                    <span className="lw-figmenu-t">{k.label}</span>
                    <span className="lw-figmenu-h">{k.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={`lw-btn wide${latexOpen ? " on" : ""}`} onClick={ed.openLatex} disabled={disabled || mode === "source"} title="Éditeur LaTeX — démonstrations sur plusieurs lignes, systèmes, matrices" aria-label="Ouvrir l'éditeur LaTeX" aria-pressed={latexOpen}><Icon name="func" /> LaTeX</button>
        </div>

        <div className="lw-group">
          <button className="lw-btn" onClick={() => ed.chain()?.undo().run()} disabled={off} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Icon name="undo" /></button>
          <button className="lw-btn" onClick={() => ed.chain()?.redo().run()} disabled={off} title="Rétablir (Ctrl+Y)" aria-label="Rétablir"><Icon name="redo" /></button>
          <div className="lw-swatchwrap">
            <button className={`lw-btn${swatch === "case" ? " on" : ""}`} onClick={() => setSwatch(swatch === "case" ? null : "case")} disabled={off} title="Modifier la casse" aria-label="Modifier la casse" aria-expanded={swatch === "case"}><Icon name="case" /></button>
            {swatch === "case" && (
              <div className="lw-swatches lw-cases" role="menu" aria-label="Modifier la casse">
                {CASES.map((c) => (
                  <button key={c.id} role="menuitem" onClick={() => { ed.changeCase(c.id); setSwatch(null); }}>{c.label}</button>
                ))}
              </div>
            )}
          </div>
          <button className="lw-btn" onClick={ed.clearFormatting} disabled={off} title="Effacer la mise en forme" aria-label="Effacer la mise en forme"><Icon name="clearFormat" /></button>
        </div>

        <div className="lw-group lw-right">
          {/* Not a Word pilcrow: markdown has no invisible characters, but the line
              between a paragraph break and a hard break is exactly what changes how a
              lesson renders, so this shows those boundaries. */}
          <button className={`lw-btn${marksOn ? " on" : ""}`} onClick={() => setMarksOn((m) => !m)} title="Afficher les marques de paragraphe" aria-label="Afficher les marques de paragraphe" aria-pressed={marksOn}><Icon name="pilcrow" /></button>
          <button className="lw-btn" onClick={() => window.print()} title="Imprimer (Ctrl+P)" aria-label="Imprimer"><Icon name="print" /></button>
          <button className="lw-btn" onClick={() => setSettingsOpen(true)} title="Paramètres du document" aria-label="Paramètres du document"><Icon name="settings" /></button>
          <div className="lw-seg">
            <button className={mode === "visual" ? "on" : ""} onClick={() => gate.ok && setMode("visual")} disabled={!gate.ok} title={gate.ok ? "" : gate.reason}>Visuel</button>
            <button className={mode === "source" ? "on" : ""} onClick={() => setMode("source")}>Markdown</button>
            <button className={mode === "split" ? "on" : ""} onClick={() => setMode("split")} title="Source à gauche, rendu élève à droite">Côte à côte</button>
          </div>
        </div>
    </div>
  );

  const status = (
    <div className="lw-status">
      <span>{stats.words} mot{stats.words > 1 ? "s" : ""}</span>
      <span>{stats.formulas} formule{stats.formulas > 1 ? "s" : ""}</span>
      {stats.flagged > 0 && <span className="warn"><Icon name="alert" /> {stats.flagged} à vérifier</span>}
      <span className="lw-save">{saveState}</span>
    </div>
  );

  return shell(
    <>
      {toolbarHost ? createPortal(ribbon, toolbarHost) : ribbon}

      {/* Breadcrumb — only at depth ≥ 1, and it carries the Esc affordance (1a callout 3). */}
      {ctx !== "doc" && (
        <div className="lw-crumb">
          <span>Document</span><span aria-hidden="true">›</span><b>{ctx === "math" ? "Math (fx)" : "Éditeur LaTeX"}</b>
          <span className="lw-crumb-gap" />
          <button onClick={exitCtx}>Échap — revenir au document</button>
        </div>
      )}

      {!gate.ok && mode === "source" && (
        <div className="lw-note">
          <Icon name="alert" />
          <span>{gate.reason} Elle s'affiche ici en lecture seule — modifiez-la depuis le Studio de contenu.</span>
          <a className="lw-note-a" href="/teacher/studio/">Ouvrir le studio</a>
        </div>
      )}

      {palette && (
        <div className="lw-palette" role="dialog" aria-label="Symboles et figures" onMouseDown={keepSelection}>
          <SymbolPalette
            tab={palTab}
            onTab={setPalTab}
            query={query}
            onQuery={setQuery}
            onPick={pickSymbol}
            onInsertFigure={insertFromCatalogue}
            onClose={() => setPalette(false)}
            disabled={disabled || !gate.ok}
          />
        </div>
      )}

      {/* The accept list mirrors the server's magic-byte whitelist. It is a filter for
          the file dialog, not a check — the bytes are what the server trusts. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) insertPicture(f); }}
      />

      {findOpen && mode === "visual" && <FindReplacePanel editor={editor} onClose={() => { setFindOpen(false); editor?.commands.focus(); }} />}

      <div className={`lw-canvas${latexFull ? " full" : ""}`}>
        {latexFull ? (
          <LatexPanel
            tex={mathSel.tex}
            onChange={ed.updateMath}
            onClose={exitCtx}
            disabled={disabled}
            subjectSlug={subjectSlug}
            classLevel={classLevel}
          />
        ) : (
          <>
            {figSel && mode === "visual" && !disabled && (
              // Same node, same storage, two editors: an épure is geometry and a chart
              // is data, and a single panel that tried to be both would serve neither.
              isEpure(figSel.spec)
                ? <EpurePanel spec={figSel.spec} anchor={figSel.anchor} onChange={ed.updateFigure} onClose={() => ed.setFigSel(null)} />
                : <FigurePanel spec={figSel.spec} anchor={figSel.anchor} onChange={ed.updateFigure} onClose={() => ed.setFigSel(null)} />
            )}
            {mathSel && mode === "visual" && !disabled && (
              <FormulaEditor
                tex={mathSel.tex}
                display={mathSel.display}
                anchor={mathSel.anchor}
                onChange={ed.updateMath}
                onExpand={ed.openLatex}
                onClose={exitCtx}
              />
            )}
            <div className={`lw-page${mode === "split" ? " lw-page-split" : ""}`}>
              {mode === "visual" ? (
                <EditorContent editor={editor} />
              ) : (
                <textarea
                  ref={taRef}
                  className="lw-input"
                  value={value}
                  onChange={(e) => { ed.emitted.current = e.target.value; onChange(e.target.value); }}
                  readOnly={!gate.ok}
                  disabled={disabled}
                  spellCheck={spellcheck}
                  placeholder="Commencez à écrire votre leçon…"
                  style={{ minHeight: 560 }}
                />
              )}
              {/* The right half is the STUDENT renderer, not a second editor — same
                  <Markdown> the lesson page uses, so an épure or a table that survives
                  here is one that survives for the class. That is the whole point of
                  the mode: the visual editor cannot show an SVG figure, and this can. */}
              {mode === "split" && (
                <div className="lw-render prose-guard" aria-label="Aperçu élève">
                  <Markdown>{value}</Markdown>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* LaTeX preview strip (1a callout 8) — makes the round trip visible. */}
      {ctx === "math" && (
        <div className="lw-latex">
          <span className="lw-latex-l">LaTeX — Ctrl+Maj+J pour copier</span>
          <code>{mathSel.tex || "—"}</code>
        </div>
      )}

      {statusHost ? createPortal(status, statusHost) : status}
    </>
  );
}
