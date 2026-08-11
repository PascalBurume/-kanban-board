"use client";
import { useCallback, useEffect, useState } from "react";

// Fullscreen API hook. Pass a ref to the element you want to fill the screen.
// Returns { isFull, toggle, enter, exit } and keeps state in sync with the
// browser (covers Esc / F11 exits and the webkit-prefixed Safari API).
export function useFullscreen(ref) {
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement || null;
      setIsFull(!!el && (!ref.current || el === ref.current));
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [ref]);

  const enter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) req.call(el).catch(() => {});
  }, [ref]);

  const exit = useCallback(() => {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && (document.fullscreenElement || document.webkitFullscreenElement)) ex.call(document).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement || document.webkitFullscreenElement) exit();
    else enter();
  }, [enter, exit]);

  return { isFull, toggle, enter, exit };
}
