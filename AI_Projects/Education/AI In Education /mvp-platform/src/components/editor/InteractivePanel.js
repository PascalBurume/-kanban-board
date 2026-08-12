"use client";
import { useMemo } from "react";
import Icon from "@/components/ui/Icon";
import {
  INTERACTIVE_WIDGETS, WIDGET_FAMILIES, normalizeInteractive, interactiveAlt,
} from "@/lib/interactive";
import { renderInteractiveStill } from "@/lib/interactiveStill";
import { compile } from "@/lib/figures";

// Editing panel for a figure the student can move.
//
// The preview here is the STILL, not a live board. That is deliberate and not a
// shortcut: the still is what the teacher's own editor, the print path and the
// server render all show, so previewing it is previewing the thing most likely to be
// wrong. The live version is one click away in the split view, which already renders
// lessons through the student's <Markdown>.
//
// Everything a teacher can change is a field on the spec. There is no free-text escape
// hatch, because the format deliberately has no place to put code.

const FIELD_LABELS = {
  cos: "Cosinus", sin: "Sinus", tan: "Tangente", cot: "Cotangente",
  angle: "Angle marqué", coords: "Coordonnées de M", labels: "Étiquettes −α, π−α, π+α",
  cercle: "Cercle générateur", grille: "Quadrillage",
  cotes: "Longueurs des côtés", angles: "Mesures des angles", sinus: "Loi des sinus",
  rapports: "Rapports sin / cos / tan",
  racines: "Racines", extremums: "Extremums", sommet: "Sommet",
  discriminant: "Discriminant", axe: "Axe de symétrie",
  pente: "Pente de la tangente", accroissement: "Triangle des accroissements",
  verticale: "Asymptotes verticales", oblique: "Asymptote oblique", ecart: "Écart à l'asymptote",
  escalier: "Construction en escalier", termes: "Premiers termes",
  mesures: "Mesures des angles", arc: "Arc intercepté",
  foyers: "Foyers", directrice: "Directrice", axes: "Asymptotes / axes", excentricite: "Excentricité",
  parallelogramme: "Parallélogramme", composantes: "Composantes", norme: "Normes", scalaire: "Produit scalaire",
  module: "Module", argument: "Argument", conjugue: "Conjugué", carre: "z²",
};

/** Which spec fields a given widget actually reads — the rest would be dead controls. */
function fieldsFor(widget) {
  const analysis = ["fonction", "tangente", "asymptotes", "suite"];
  return {
    angle: ["cercle-trigonometrique", "arcs-associes", "sinusoide"].includes(widget),
    fn: widget === "sinusoide",
    expr: analysis.includes(widget),
    window: [...analysis, "second-degre"].includes(widget),
    abc: widget === "second-degre",
    conic: widget === "conique",
    axes: widget === "conique",
  };
}

const num = (v, fallback) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

export default function InteractivePanel({ spec, anchor, onChange, onClose }) {
  const def = INTERACTIVE_WIDGETS[spec.widget];
  const norm = useMemo(() => normalizeInteractive(spec), [spec]);
  const fields = fieldsFor(spec.widget);
  const preview = useMemo(() => {
    try {
      return renderInteractiveStill(spec);
    } catch {
      return "";
    }
  }, [spec]);

  // The expression is checked with the same compiler that will draw it, so "reconnue"
  // here means it will render — not that it merely looks plausible.
  const exprOk = useMemo(
    () => (fields.expr ? !!compile(norm.expr, ["a", "b", "c"]) : true),
    [fields.expr, norm.expr],
  );

  const set = (patch) => onChange({ ...spec, ...patch });
  const toggle = (key) => {
    const on = norm.show.includes(key);
    set({ show: on ? norm.show.filter((s) => s !== key) : [...norm.show, key] });
  };

  return (
    <div className="ip" style={anchor ? { top: anchor.top } : undefined} role="dialog" aria-label="Figure interactive">
      <div className="ip-head">
        <span className="ip-title"><Icon name={def.icon} /> {def.label}</span>
        <button className="ip-x" onClick={onClose} aria-label="Fermer">
          <Icon name="x" />
        </button>
      </div>

      <div className="ip-body">
        <div className="ip-preview" dangerouslySetInnerHTML={{ __html: preview }} />
        <p className="ip-note">
          Aperçu fixe. Dans la leçon, l'élève peut déplacer les points — utilisez le mode
          « Aperçu » pour l'essayer.
        </p>

        <label className="ip-field">
          <span>Type de figure</span>
          <select value={spec.widget} onChange={(e) => set({ widget: e.target.value, show: undefined })}>
            {WIDGET_FAMILIES.map((g) => (
              <optgroup key={g.family} label={g.label}>
                {g.widgets.map((w) => (
                  <option key={w} value={w}>{INTERACTIVE_WIDGETS[w].label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="ip-modules">Pour : {def.modules.join(" · ")}</p>

        <label className="ip-field">
          <span>Légende</span>
          <input
            type="text"
            value={spec.caption ?? ""}
            placeholder={def.still.slice(0, 60) + "…"}
            onChange={(e) => set({ caption: e.target.value })}
          />
        </label>

        {fields.expr && (
          <label className="ip-field">
            <span>Fonction f(x)</span>
            <input
              type="text"
              className={exprOk ? "" : "bad"}
              value={spec.expr ?? norm.expr}
              onChange={(e) => set({ expr: e.target.value })}
              spellCheck={false}
            />
            <em className="ip-hint">
              {exprOk
                ? "x, a, b, c, pi, e — sin, cos, tan, sqrt, ln, exp. a/b/c deviennent des curseurs."
                : "Expression non reconnue : la figure affichera un message à la place de la courbe."}
            </em>
          </label>
        )}

        {fields.abc && (
          <div className="ip-row">
            {["a", "b", "c"].map((k) => (
              <label key={k} className="ip-field sm">
                <span>{k}</span>
                <input type="number" step="0.1" value={norm[k]} onChange={(e) => set({ [k]: num(e.target.value, norm[k]) })} />
              </label>
            ))}
          </div>
        )}

        {fields.angle && (
          <label className="ip-field">
            <span>Angle de départ : {Math.round(norm.angle)}°</span>
            <input type="range" min="0" max="359" value={Math.round(norm.angle)} onChange={(e) => set({ angle: num(e.target.value, norm.angle) })} />
          </label>
        )}

        {fields.fn && (
          <label className="ip-field">
            <span>Fonction tracée</span>
            <select value={norm.fn} onChange={(e) => set({ fn: e.target.value })}>
              <option value="sin">Sinus</option>
              <option value="cos">Cosinus</option>
            </select>
          </label>
        )}

        {fields.conic && (
          <label className="ip-field">
            <span>Conique</span>
            <select value={norm.conic} onChange={(e) => set({ conic: e.target.value })}>
              <option value="ellipse">Ellipse</option>
              <option value="hyperbole">Hyperbole</option>
              <option value="parabole">Parabole</option>
            </select>
          </label>
        )}

        {fields.axes && (
          <div className="ip-row">
            <label className="ip-field sm"><span>a</span><input type="number" step="0.1" value={norm.a} onChange={(e) => set({ a: num(e.target.value, norm.a) })} /></label>
            <label className="ip-field sm"><span>b</span><input type="number" step="0.1" value={norm.b} onChange={(e) => set({ b: num(e.target.value, norm.b) })} /></label>
          </div>
        )}

        {fields.window && (
          <>
            <p className="ip-sub">Fenêtre visible</p>
            <div className="ip-row">
              {[["xmin", "x min"], ["xmax", "x max"], ["ymin", "y min"], ["ymax", "y max"]].map(([k, l]) => (
                <label key={k} className="ip-field sm">
                  <span>{l}</span>
                  <input type="number" step="0.5" value={norm[k]} onChange={(e) => set({ [k]: num(e.target.value, norm[k]) })} />
                </label>
              ))}
            </div>
          </>
        )}

        <p className="ip-sub">Ce que la figure affiche</p>
        <div className="ip-checks">
          {def.shows.map((key) => (
            <label key={key} className="ip-check">
              <input type="checkbox" checked={norm.show.includes(key)} onChange={() => toggle(key)} />
              <span>{FIELD_LABELS[key] ?? key}</span>
            </label>
          ))}
        </div>

        <label className="ip-field">
          <span>Hauteur : {norm.height} px</span>
          <input type="range" min="200" max="600" step="20" value={norm.height} onChange={(e) => set({ height: num(e.target.value, norm.height) })} />
        </label>

        {/* The alt text is not an afterthought here: it is what a pupil using a screen
            reader gets, what the RAG index stores, and what shows if the board fails to
            load — so the teacher is shown exactly what it will say. */}
        <p className="ip-alt"><strong>Texte de remplacement :</strong> {interactiveAlt(spec)}</p>
      </div>
    </div>
  );
}
