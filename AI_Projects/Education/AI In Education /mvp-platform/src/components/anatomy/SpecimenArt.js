"use client";
import { useEffect, useState } from "react";

// The illustration plates that ship with the specimens, under
// /anatomy/<organ>/<slot>.webp. Five slots exist per organ:
//
//   thumb        the rail and card identity
//   organ        the drawn plate
//   microscopic  tissue view — the level the curriculum asks about
//   compare      this organ set against a related one
//   location     where it sits in the body
//
// `organ.illustrated` claims the whole set; `organ.illustrations` narrows it for
// specimens that only have some. Either way a missing file falls back to the
// accent glyph rather than a broken image, which is how the source app handles
// artwork that lands one piece at a time.

const SLOTS = [
  { id: "organ", label: "Organe" },
  { id: "microscopic", label: "Microscopique" },
  { id: "compare", label: "Comparer" },
  { id: "location", label: "Localisation" },
];

export function hasArt(organ, slot) {
  return Boolean(organ?.illustrated || organ?.illustrations?.includes(slot));
}

export function SpecimenThumb({ organ, className = "an-thumb" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [organ.id]);
  const show = hasArt(organ, "thumb") && !failed;
  return (
    <span className={className} style={{ "--accent": organ.accent }}>
      {show ? (
        <img
          src={`/anatomy/${organ.id}/thumb.webp`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="an-glyph" aria-hidden>
          {organ.icon}
        </span>
      )}
    </span>
  );
}

export function PlateViewer({ organ }) {
  const slots = SLOTS.filter((s) => hasArt(organ, s.id));
  const [active, setActive] = useState(slots[0]?.id ?? null);
  const [failed, setFailed] = useState({});

  useEffect(() => {
    setActive(slots[0]?.id ?? null);
    setFailed({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organ.id]);

  const usable = slots.filter((s) => !failed[s.id]);
  if (!usable.length || !active) return null;
  const current = usable.find((s) => s.id === active) ?? usable[0];

  return (
    <section className="an-plates">
      <div className="an-plate-tabs">
        {usable.map((s) => (
          <button key={s.id} className={current.id === s.id ? "is-on" : ""} onClick={() => setActive(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="an-plate" style={{ "--accent": organ.accent }}>
        <img
          key={`${organ.id}-${current.id}`}
          src={`/anatomy/${organ.id}/${current.id}.webp`}
          alt={`${current.label} — ${organ.name}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((f) => ({ ...f, [current.id]: true }))}
        />
      </div>
    </section>
  );
}
