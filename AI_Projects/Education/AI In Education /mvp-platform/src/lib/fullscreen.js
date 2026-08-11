"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Fullscreen for a panel, with a fallback that always works.
//
// The Fullscreen API is not dependable on the devices this ships to. iOS Safari
// has never supported requestFullscreen on an arbitrary element, an embedded
// webview can be denied it by permissions policy, and the call rejects with a
// bare "Permissions check failed" when it is refused. The previous version
// swallowed that rejection and left `isFull` false, so the button was simply
// dead — pressed, nothing happened, no explanation. That is the worst of the
// three possible outcomes.
//
// So: try the real thing, and if it is unavailable or refused, fall back to
// `position: fixed` over the page. The caller cannot tell the difference — it
// gets `isFull` either way and styles `.is-full` once — except that the browser
// chrome stays visible in the fallback, which also means the back button still
// works. Esc is wired up for the fallback since the browser will not do it.

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function useFullscreen(ref) {
  const [isFull, setIsFull] = useState(false);
  // True while we are faking it, so exit() knows not to call the browser API.
  const faking = useRef(false);

  useEffect(() => {
    const onChange = () => {
      if (faking.current) return; // browser events are not about our fallback
      const el = fullscreenElement();
      setIsFull(!!el && (!ref.current || el === ref.current));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [ref]);

  const exit = useCallback(() => {
    if (faking.current) {
      faking.current = false;
      setIsFull(false);
      return;
    }
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && fullscreenElement()) ex.call(document).catch(() => {});
  }, []);

  const enter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) {
      faking.current = true;
      setIsFull(true);
      return;
    }
    // requestFullscreen resolves/rejects async, so the fallback has to live in
    // the catch rather than behind a capability check — document.fullscreenEnabled
    // reports true in embedders that then refuse the actual call.
    Promise.resolve(req.call(el)).catch(() => {
      faking.current = true;
      setIsFull(true);
    });
  }, [ref]);

  const toggle = useCallback(() => {
    if (faking.current || fullscreenElement()) exit();
    else enter();
  }, [enter, exit]);

  // The browser handles Esc for real fullscreen; for the fallback we do.
  useEffect(() => {
    if (!isFull) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && faking.current) exit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFull, exit]);

  return { isFull, toggle, enter, exit };
}
