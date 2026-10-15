import type { PointerEvent as ReactPointerEvent } from "react";

/** Tracks a pointer drag on the window until the button is released. */
export function trackDrag(
  start: ReactPointerEvent,
  onMove: (event: PointerEvent) => void,
  onEnd: (event: PointerEvent | null) => void,
) {
  const move = (event: PointerEvent) => onMove(event);
  const up = (event: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onEnd(event.type === "pointercancel" ? null : event);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  start.preventDefault();
}
