import { useEffect, useRef } from "react";
import { rulerStep, type Camera, type Point } from "./camera";
import styles from "./Viewport.module.css";

export const RULER_SIZE = 20;

interface RulersProps {
  camera: Camera;
  unit: "px" | "mm";
  pointer: Point | null;
}

function readColors(node: Element) {
  const css = getComputedStyle(node);
  return {
    bg: css.getPropertyValue("--c-panel").trim() || "#2d3034",
    tick: css.getPropertyValue("--c-line-strong").trim() || "#4b5057",
    text: css.getPropertyValue("--c-text-faint").trim() || "#737880",
    marker: css.getPropertyValue("--c-accent").trim() || "#e8c547",
  };
}

function formatTick(value: number, step: number): string {
  const rounded =
    step < 1 ? value.toFixed(Math.ceil(-Math.log10(step))) : String(Math.round(value));
  return rounded === "-0" ? "0" : rounded;
}

/**
 * Drafting-style rulers along the top and left edge. Ticks are drawn on canvas in
 * content units (pixels or millimetres) and follow the camera.
 */
export function Rulers({ camera, unit, pointer }: RulersProps) {
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = (canvas: HTMLCanvasElement | null, horizontal: boolean) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const length = horizontal ? rect.width : rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const colors = readColors(canvas);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, rect.width, rect.height);

      const step = rulerStep(camera.zoom);
      const minor = step / 5;
      // Screen position along the ruler, measured from the stage origin (after the corner).
      const offset = horizontal ? camera.x : camera.y;
      const startValue = Math.floor(-offset / camera.zoom / minor) * minor;
      const endValue = (length - offset) / camera.zoom;

      ctx.strokeStyle = colors.tick;
      ctx.fillStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.font = `500 9.5px ${getComputedStyle(canvas).fontFamily}`;
      ctx.textBaseline = "top";
      ctx.beginPath();
      for (let v = startValue; v <= endValue; v += minor) {
        const pos = Math.round(v * camera.zoom + offset) + 0.5;
        const isMajor = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        const len = isMajor ? RULER_SIZE : RULER_SIZE * 0.3;
        if (horizontal) {
          ctx.moveTo(pos, RULER_SIZE);
          ctx.lineTo(pos, RULER_SIZE - len);
        } else {
          ctx.moveTo(RULER_SIZE, pos);
          ctx.lineTo(RULER_SIZE - len, pos);
        }
        if (isMajor) {
          const label = formatTick(v, step);
          if (horizontal) {
            ctx.fillText(label, pos + 3, 2);
          } else {
            ctx.save();
            ctx.translate(2, pos + 3);
            ctx.rotate(Math.PI / 2);
            ctx.textBaseline = "bottom";
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
        }
      }
      ctx.stroke();

      // Bottom/right edge
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(0, RULER_SIZE - 0.5);
        ctx.lineTo(rect.width, RULER_SIZE - 0.5);
      } else {
        ctx.moveTo(RULER_SIZE - 0.5, 0);
        ctx.lineTo(RULER_SIZE - 0.5, rect.height);
      }
      ctx.stroke();

      if (pointer) {
        const pos = Math.round(horizontal ? pointer.x : pointer.y) + 0.5;
        ctx.strokeStyle = colors.marker;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(pos, 0);
          ctx.lineTo(pos, RULER_SIZE);
        } else {
          ctx.moveTo(0, pos);
          ctx.lineTo(RULER_SIZE, pos);
        }
        ctx.stroke();
      }
    };
    draw(top.current, true);
    draw(left.current, false);
  });

  return (
    <>
      <div className={styles.rulerCorner} aria-hidden>
        {unit}
      </div>
      <canvas ref={top} className={styles.rulerTop} aria-hidden />
      <canvas ref={left} className={styles.rulerLeft} aria-hidden />
    </>
  );
}
