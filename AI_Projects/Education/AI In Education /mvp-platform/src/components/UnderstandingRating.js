"use client";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { toast } from "@/lib/toast";

const LEVELS = [
  { v: 0, label: "Pas du tout", emoji: "😟" },
  { v: 25, label: "Un peu", emoji: "🙁" },
  { v: 50, label: "Moyennement", emoji: "😐" },
  { v: 75, label: "Bien", emoji: "🙂" },
  { v: 100, label: "Parfaitement", emoji: "😄" },
];

// Self-assessment of understanding (0/25/50/75/100). Below 100 reveals an
// optional message to the teacher. POSTs to /api/student/lessons/[id]/feedback.
export default function UnderstandingRating({ lessonId, initial, onSaved, autoSubmitFull = false }) {
  const [value, setValue] = useState(initial?.understanding ?? null);
  const [message, setMessage] = useState(initial?.message ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save(v, msg) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/student/lessons/${lessonId}/feedback/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ understanding: v, message: v < 100 ? (msg ?? message) : "" }),
      });
      if (res.ok) {
        setDone(true);
        toast("Merci pour ton retour !", { icon: "check" });
        onSaved?.({ understanding: v, message: v < 100 ? (msg ?? message) : "" });
      } else {
        toast("Impossible d’enregistrer ton retour.", { icon: "alert" });
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(v) {
    setValue(v);
    if (v === 100 && autoSubmitFull) save(v, "");
  }

  return (
    <div className="ur">
      <div className="ur-scale">
        {LEVELS.map((l) => (
          <button
            key={l.v}
            className={`ur-opt${value === l.v ? " on" : ""}`}
            onClick={() => pick(l.v)}
            type="button"
          >
            <span className="ur-emoji">{l.emoji}</span>
            <span className="ur-pct">{l.v}%</span>
            <span className="ur-lbl">{l.label}</span>
          </button>
        ))}
      </div>

      {value != null && value < 100 && (
        <div className="ur-msg">
          <label>Un message pour ton enseignant <span className="muted">(optionnel)</span></label>
          <textarea
            rows={3}
            placeholder="Qu’est-ce qui n’est pas clair ? De quoi as-tu besoin ?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      )}

      {value != null && (
        <button className="btn btn-primary ur-send" onClick={() => save(value)} disabled={busy || done}>
          {done ? <><Icon name="check" /> Envoyé</> : busy ? "Envoi…" : "Envoyer mon retour"}
        </button>
      )}
    </div>
  );
}
