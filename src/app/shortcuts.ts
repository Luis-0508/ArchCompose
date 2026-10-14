import { useEffect, useRef } from "react";

/**
 * Keyboard shortcuts. Combos are written like "Mod+Shift+Z", where Mod is Ctrl on
 * Windows/Linux and Cmd on macOS. Single-key shortcuts ("V", "Delete") are ignored
 * while the user types in a field; modifier shortcuts always work.
 */
export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function comboOf(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  let key = event.key;
  // Digits by physical key, so AltGr layouts (Ctrl+Alt) and shifted digits still match.
  if (/^(Digit|Numpad)\d$/.test(event.code)) key = event.code.slice(-1);
  else if (key === " ") key = "Space";
  else if (key === "+") key = "=";
  else if (key.length === 1) key = key.toUpperCase();
  // Shift+/ produces "?" on most layouts; keep the produced character.
  if (key === "?") return "?";
  parts.push(key);
  return parts.join("+");
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select"))
  );
}

/** Human-readable label for a combo, e.g. "Ctrl+Shift+Z". */
export function shortcutLabel(combo: string): string {
  return combo.replace("Mod", isMac ? "⌘" : "Ctrl");
}

export function useShortcuts(map: ShortcutMap, enabled = true) {
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.repeat && !/Arrow/.test(event.key))) return;
      const combo = comboOf(event);
      const handler = latest.current[combo];
      if (!handler) return;
      const hasModifier = combo.startsWith("Mod");
      if (!hasModifier && isTypingTarget(event.target)) return;
      if (document.querySelector("dialog[open]") && combo !== "Escape") return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Reference list shown in the shortcuts dialog. Keep in sync with the handlers. */
export const SHORTCUT_REFERENCE: readonly { group: string; items: readonly [string, string][] }[] =
  [
    {
      group: "Project",
      items: [
        ["Mod+N", "New project"],
        ["Mod+O", "Open project"],
        ["Mod+S", "Save project"],
        ["Mod+Shift+S", "Save project as"],
        ["Mod+I", "Import images"],
        ["Mod+Z", "Undo"],
        ["Mod+Shift+Z", "Redo"],
      ],
    },
    {
      group: "Workspaces",
      items: [
        ["Mod+1", "Compose"],
        ["Mod+2", "Drawings"],
        ["Mod+3", "Boards"],
        ["Mod+B", "Show or hide left panel"],
        ["Mod+Alt+B", "Show or hide inspector"],
      ],
    },
    {
      group: "View",
      items: [
        ["Mod+0", "Fit to window"],
        ["Mod+Alt+0", "Actual size"],
        ["Mod+=", "Zoom in"],
        ["Mod+-", "Zoom out"],
        ["Wheel", "Zoom at pointer"],
        ["Space + drag", "Pan"],
      ],
    },
    {
      group: "Compose",
      items: [
        ["V", "Select and move"],
        ["H", "Hand"],
        ["Z", "Zoom (Alt-click to zoom out)"],
        ["L", "Horizon guide"],
        ["Arrows", "Nudge layer (Shift for 10 px)"],
        ["Delete", "Remove layer"],
      ],
    },
    {
      group: "Drawings",
      items: [
        ["V", "Select and transform"],
        ["H", "Hand"],
        ["P", "Pen"],
        ["E", "Eraser"],
        ["L", "Line (Shift locks to 45°)"],
        ["R", "Rectangle (Shift for a square)"],
        ["C", "Circle"],
        ["Y", "Polyline (Enter finishes)"],
        ["T", "Text"],
        ["Arrows", "Nudge selection by 1 mm (Shift for 10 mm)"],
        ["Delete", "Delete selection"],
      ],
    },
  ];
