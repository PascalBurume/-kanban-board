"use client";
import { useCallback, useEffect, useRef } from "react";

// A drag handle for a side panel.
//
// Pointer capture rather than mousemove-on-window: the pointer crosses a textarea and
// an iframe-free but scroll-heavy document while dragging, and without capture the
// drag is dropped the moment it leaves the 6px strip.
//
// The live value is kept in a ref because React state lags one pointermove behind —
// reading it inside the handler makes the panel trail the cursor visibly.
//
// Keyboard is not an afterthought here: this is the only way to resize on a device
// with no mouse, and the school has tablets with keyboards attached.
export default function ResizeGrip({ value, min, max, onChange, onCommit, side = "left", label, step = 24 }) {
  const live = useRef(value);
  const origin = useRef(null);

  useEffect(() => {
    live.current = value;
  }, [value]);

  const clamp = useCallback((n) => Math.max(min, Math.min(max, Math.round(n))), [min, max]);

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      origin.current = { x: e.clientX, from: live.current };
    },
    []
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!origin.current) return;
      // Dragging the LEFT edge of a right-hand rail makes it wider as the pointer
      // moves left, hence the sign flip.
      const delta = side === "left" ? origin.current.x - e.clientX : e.clientX - origin.current.x;
      const next = clamp(origin.current.from + delta);
      live.current = next;
      onChange(next);
    },
    [clamp, onChange, side]
  );

  const end = useCallback(
    (e) => {
      if (!origin.current) return;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      origin.current = null;
      onCommit?.(live.current);
    },
    [onCommit]
  );

  const onKeyDown = useCallback(
    (e) => {
      const grow = side === "left" ? "ArrowLeft" : "ArrowRight";
      const shrink = side === "left" ? "ArrowRight" : "ArrowLeft";
      let next = null;
      if (e.key === grow) next = clamp(live.current + step);
      else if (e.key === shrink) next = clamp(live.current - step);
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      if (next == null) return;
      e.preventDefault();
      live.current = next;
      onChange(next);
      onCommit?.(next);
    },
    [clamp, min, max, onChange, onCommit, side, step]
  );

  return (
    <div
      className={`rz rz-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        const mid = clamp((min + max) / 2);
        live.current = mid;
        onChange(mid);
        onCommit?.(mid);
      }}
    />
  );
}
