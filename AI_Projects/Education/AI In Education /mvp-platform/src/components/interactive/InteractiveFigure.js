"use client";
import { useEffect, useRef, useState } from "react";
import { INTERACTIVE_WIDGETS, normalizeInteractive, interactiveAlt } from "@/lib/interactive";
import "./InteractiveFigure.css";

// One widget on the page.
//
// JSXGraph is loaded on demand and only in the browser. It reaches for `document` at
// import time, so it cannot be part of the server render, and it is a quarter of a
// megabyte gzipped, so it must not be part of the bundle every lesson pays for — only
// the trigonometry lessons carry these fences, and only those lessons fetch it.
//
// Before it arrives (and for good, if it never does) the figure is the sentence from
// `interactiveAlt`. That is the same string screen readers get, so the non-visual and
// the failure paths are the same path and neither can rot unnoticed.

let counter = 0;

export default function InteractiveFigure({ spec }) {
  const holder = useRef(null);
  const boardRef = useRef(null);
  // useId() produces "«:r3:»", which is not a valid querySelector — and JSXGraph
  // looks its container up by id string, not by node.
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = `jxg-${(counter += 1)}`;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const def = INTERACTIVE_WIDGETS[spec.widget];
  const alt = interactiveAlt(spec);
  const norm = normalizeInteractive(spec);

  useEffect(() => {
    let live = true;
    let observer = null;

    /**
     * JSXGraph measures the container once, at initBoard, and keeps that geometry. So
     * building it while the container has no width produces a board two pixels wide:
     * the circle spills out of its frame and the readouts land on the lesson text.
     *
     * A zero width here is not a corner case. The lesson body renders inside a
     * collapsible panel, the studio previews it at phone and tablet widths, and a
     * background tab reports nothing at all. So: wait for a real width, then build.
     */
    const whenSized = (el) =>
      new Promise((resolve) => {
        if (el.clientWidth > 0) return resolve(true);
        observer = new ResizeObserver(() => {
          if (el.clientWidth > 0) {
            observer.disconnect();
            observer = null;
            resolve(true);
          }
        });
        observer.observe(el);
      });

    (async () => {
      try {
        const [{ default: JXG }, { buildBoard }] = await Promise.all([
          import("jsxgraph"),
          import("./boards"),
        ]);
        // The lesson may have been closed during the download.
        if (!live || !holder.current) return;
        await whenSized(holder.current);
        if (!live || !holder.current) return;
        const board = buildBoard(JXG, idRef.current, norm);
        boardRef.current = board;
        if (board) setReady(true);
        else setFailed(true);
      } catch {
        // A missing chunk on a flaky LAN is the expected failure, not a bug to surface.
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
      observer?.disconnect();
      const b = boardRef.current;
      boardRef.current = null;
      if (b?.containerObj) {
        try {
          // Frees the resize observer and the document-level pointer handlers; without
          // it, paging through lessons leaks one set per figure visited.
          const JXG = typeof window !== "undefined" ? window.JXG : null;
          if (JXG) JXG.JSXGraph.freeBoard(b);
        } catch {
          /* already torn down */
        }
      }
    };
    // The spec for a given fence never changes identity mid-lesson; rebuilding on every
    // render would throw away the point the pupil just dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="md-interactive">
      {/* The board container is ALWAYS laid out at its final size, never display:none.
          JSXGraph measures the element once at initBoard and keeps that geometry, so
          building it inside a hidden box produces a board sized to nothing — the circle
          spills out of the frame and the readouts land on top of the lesson text. The
          placeholder is therefore an overlay, not a replacement. */}
      <div className="md-interactive__frame" style={{ height: norm.height }}>
        <div
          id={idRef.current}
          ref={holder}
          className="md-interactive__board"
          role="img"
          aria-label={alt}
        />
        {!ready && (
          <div className="md-interactive__still">
            <p>{alt}</p>
          </div>
        )}
      </div>
      <p className="md-interactive__caption">
        {norm.caption || def.label}
        {ready && <span className="md-interactive__hint">Figure interactive — {def.hint}.</span>}
        {failed && <span className="md-interactive__hint">Figure fixe — la version interactive n'a pas pu être chargée.</span>}
      </p>
    </div>
  );
}
