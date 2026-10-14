import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useAppStore, type ViewState } from "../state/store";
import { screenToContent, stepZoom, zoomTo, type Camera, type Point, type Size } from "./camera";
import { Rulers, RULER_SIZE } from "./Rulers";
import styles from "./Viewport.module.css";

export interface ViewportPointer {
  /** Pointer position in content units. */
  content: Point;
  /** Pointer position relative to the viewport's top-left corner. */
  screen: Point;
  camera: Camera;
  event: ReactPointerEvent<HTMLDivElement>;
}

interface ViewportProps {
  viewKey: string;
  content: Size;
  unit: "px" | "mm";
  label: string;
  /** "hand" pans with the primary button, "zoom" zooms on click. Anything else is passed on. */
  mode?: "hand" | "zoom" | "tool";
  cursor?: string;
  /** Content-space children, positioned in content units at zoom 1. */
  children?: ReactNode;
  /** Screen-space overlay (handles, guides) whose strokes should not scale. */
  overlay?: (camera: Camera) => ReactNode;
  onToolPointerDown?: (pointer: ViewportPointer) => void;
  onBackgroundClick?: () => void;
  surface?: "well" | "desk";
  /** Rulers along the top and left edge; on by default. */
  rulers?: boolean;
}

/** True while the space bar is held outside of text inputs (temporary hand tool). */
function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return held;
}

/**
 * Zoomable, pannable document viewport shared by all workspaces. The camera lives
 * in the store under `viewKey` so toolbars and the title block can read and drive it.
 */
export function Viewport({
  viewKey,
  content,
  unit,
  label,
  mode = "tool",
  cursor,
  children,
  overlay,
  onToolPointerDown,
  onBackgroundClick,
  surface = "well",
  rulers = true,
}: ViewportProps) {
  const stage = useRef<HTMLDivElement>(null);
  const view = useAppStore((s) => s.views[viewKey]) as ViewState | undefined;
  const syncView = useAppStore((s) => s.syncView);
  const setCamera = useAppStore((s) => s.setCamera);
  const setCursor = useAppStore((s) => s.setCursor);
  const spaceHeld = useSpaceHeld();
  const [panning, setPanning] = useState(false);
  const [pointer, setPointer] = useState<Point | null>(null);
  const pan = useRef<{ x: number; y: number; camera: Camera } | null>(null);

  // Keep the store informed about viewport and content size. Opening a project clears the
  // stored views, so a view that disappears is measured again even if nothing else changed.
  const hasView = view !== undefined;
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        syncView(viewKey, { width, height }, { width: content.width, height: content.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewKey, content.width, content.height, syncView, hasView]);

  const camera = view?.camera;

  // Wheel zoom must be a non-passive listener to prevent page scrolling.
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = useAppStore.getState().views[viewKey];
      if (!current) return;
      const rect = node.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.shiftKey) {
        const c = current.camera;
        setCamera(viewKey, { ...c, x: c.x - (event.deltaY || event.deltaX) });
        return;
      }
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0016);
      setCamera(viewKey, zoomTo(current.camera, current.camera.zoom * factor, anchor));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [viewKey, setCamera]);

  const localPoint = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = stage.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const panActive = mode === "hand" || spaceHeld;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!camera) return;
    const screen = localPoint(event);
    const wantsPan = event.button === 1 || (event.button === 0 && panActive);
    if (wantsPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pan.current = { x: event.clientX, y: event.clientY, camera };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;
    if (mode === "zoom") {
      const direction = event.altKey ? -1 : 1;
      setCamera(viewKey, zoomTo(camera, stepZoom(camera.zoom, direction), screen));
      return;
    }
    const contentPoint = screenToContent(camera, screen);
    if (onToolPointerDown) {
      onToolPointerDown({ content: contentPoint, screen, camera, event });
    } else if (event.target === event.currentTarget) {
      onBackgroundClick?.();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const screen = localPoint(event);
    setPointer(screen);
    if (camera) {
      const c = screenToContent(camera, screen);
      setCursor({ x: c.x, y: c.y, unit });
    }
    const p = pan.current;
    if (p) {
      setCamera(viewKey, {
        ...p.camera,
        x: p.camera.x + event.clientX - p.x,
        y: p.camera.y + event.clientY - p.y,
      });
    }
  };

  const endPan = () => {
    pan.current = null;
    setPanning(false);
  };

  const resolvedCursor = panning
    ? "grabbing"
    : panActive
      ? "grab"
      : mode === "zoom"
        ? "zoom-in"
        : (cursor ?? "default");

  return (
    <div
      className={styles.frame}
      style={{ "--ruler": `${rulers ? RULER_SIZE : 0}px` } as CSSProperties}
    >
      {camera && rulers ? <Rulers camera={camera} unit={unit} pointer={pointer} /> : null}
      <div
        ref={stage}
        className={`${styles.stage} ${surface === "desk" ? styles.desk : styles.well}`}
        style={{ cursor: resolvedCursor }}
        role="application"
        aria-label={label}
        aria-roledescription="document viewport"
        data-testid={`viewport-${viewKey}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={() => {
          setPointer(null);
          setCursor(null);
        }}
        onAuxClick={(e) => e.preventDefault()}
      >
        {camera ? (
          <>
            <div
              className={styles.content}
              style={{
                width: content.width,
                height: content.height,
                transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
              }}
            >
              {children}
            </div>
            {overlay ? <div className={styles.overlay}>{overlay(camera)}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
