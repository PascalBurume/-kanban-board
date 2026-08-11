"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

// The word-processor menu bar: Fichier · Édition · Affichage · Insertion · Format ·
// Outils · Aide.
//
// A menu bar is a mouse idiom, and this page is used on tablets too — so the tablet
// chrome collapses it into a single sheet rather than shrinking it. What is here is
// the desktop one, and it carries the full keyboard model, because a teacher writing a
// lesson has both hands on the keyboard: ArrowLeft/Right walks the menus, Up/Down the
// items, Home/End jump, a letter key jumps to the next item starting with it, Escape
// closes and hands focus back to the document.
//
// Items are plain data (see MENUS in RedigerClient) so that "what the editor can do"
// is one list to read rather than a tree of JSX.

function itemsOf(menu) {
  return (menu.items ?? []).filter((i) => i && i.type !== "sep");
}

export default function DocMenuBar({ menus, onCommand }) {
  const [open, setOpen] = useState(-1); // index of the open menu, -1 = none
  const [active, setActive] = useState(-1); // index within the open menu
  const barRef = useRef(null);
  const typed = useRef("");

  const close = useCallback(
    (restoreFocus) => {
      setOpen(-1);
      setActive(-1);
      if (restoreFocus) document.querySelector(".lw-prose")?.focus?.();
    },
    []
  );

  // Clicking anywhere else closes the menu. Pointerdown rather than click so the menu
  // is gone before the click lands on whatever is underneath.
  useEffect(() => {
    if (open < 0) return undefined;
    const away = (e) => {
      if (!barRef.current?.contains(e.target)) close(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, close]);

  const run = useCallback(
    (item) => {
      if (item.disabled) return;
      close(true);
      onCommand(item.id, item);
    },
    [close, onCommand]
  );

  const onKeyDown = useCallback(
    (e) => {
      const count = menus.length;
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (open < 0) {
        // Closed: left/right move between titles only once one is open, so here we
        // only need to handle opening.
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          const i = menus.findIndex((_, idx) => document.activeElement === barRef.current?.children[idx]);
          if (i >= 0) {
            e.preventDefault();
            setOpen(i);
            setActive(0);
          }
        }
        return;
      }

      const items = itemsOf(menus[open]);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setOpen((o) => (o + 1) % count);
        setActive(0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setOpen((o) => (o - 1 + count) % count);
        setActive(0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActive(items.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (items[active]) run(items[active]);
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        // Type-ahead: jump to the next item starting with this letter.
        typed.current = e.key.toLowerCase();
        const from = active + 1;
        const hit = items.findIndex((it, i) => i >= from && it.label.toLowerCase().startsWith(typed.current));
        const wrapped = hit >= 0 ? hit : items.findIndex((it) => it.label.toLowerCase().startsWith(typed.current));
        if (wrapped >= 0) {
          e.preventDefault();
          setActive(wrapped);
        }
      }
    },
    [menus, open, active, close, run]
  );

  return (
    <nav className="rd-menubar" ref={barRef} role="menubar" aria-label="Menus du document" onKeyDown={onKeyDown}>
      {menus.map((menu, i) => {
        const items = itemsOf(menu);
        return (
          <div className="rd-menu-wrap" key={menu.label}>
            <button
              className={`rd-menu-btn${open === i ? " on" : ""}`}
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={open === i}
              tabIndex={i === 0 ? 0 : -1}
              onClick={() => {
                setOpen((o) => (o === i ? -1 : i));
                setActive(0);
              }}
              // Once one menu is open, sliding across the bar opens the next — the
              // behaviour every desktop menu bar has.
              onPointerEnter={() => {
                if (open >= 0 && open !== i) {
                  setOpen(i);
                  setActive(0);
                }
              }}
            >
              {menu.label}
            </button>

            {open === i && (
              <div className="rd-menu" role="menu" aria-label={menu.label}>
                {(menu.items ?? []).map((item, k) =>
                  !item || item.type === "sep" ? (
                    <div className="rd-menu-sep" key={`sep-${k}`} role="separator" />
                  ) : (
                    <button
                      key={item.id}
                      role="menuitem"
                      className={`rd-menu-item${items[active] === item ? " active" : ""}${item.checked ? " checked" : ""}`}
                      disabled={item.disabled}
                      title={item.hint}
                      onPointerEnter={() => setActive(items.indexOf(item))}
                      onClick={() => run(item)}
                    >
                      <span className="rd-menu-check" aria-hidden="true">
                        {item.checked ? "✓" : ""}
                      </span>
                      {/* The glyph carries the meaning for a teacher scanning the
                          list — twelve chart names read alike, twelve chart shapes
                          do not. The slot is always rendered so the labels stay on
                          one column whether or not an item has an icon. */}
                      <span className="rd-menu-icon" aria-hidden="true">
                        {item.icon ? <Icon name={item.icon} /> : null}
                      </span>
                      <span className="rd-menu-label">
                        {item.label}
                        {item.hint && <span className="rd-menu-hint">{item.hint}</span>}
                      </span>
                      {item.keys && <span className="rd-menu-keys">{item.keys}</span>}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
