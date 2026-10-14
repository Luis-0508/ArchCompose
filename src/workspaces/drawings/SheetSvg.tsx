import { useId, type ReactNode } from "react";
import { textLines, TEXT_LINE_HEIGHT, underlaySizeMm } from "../../model/sheet";
import type { Drawing, DrawingElement, SheetPoint } from "../../model/types";
import { useAssetSource } from "../../state/assetCache";
import { useAppStore } from "../../state/store";

/*
 * Sheet content is paper and ink, so its colours are literal rather than design tokens.
 * Everything is drawn in paper millimetres: one SVG user unit is one millimetre.
 */
const PAPER = "#ffffff";
const GRID_MINOR = "#dfe4ea";
const GRID_MAJOR = "#c3cbd4";

function pointsAttr(points: readonly SheetPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/** One drawing element as SVG. `extra` props mark previews. */
export function ElementShape({ element }: { element: DrawingElement }) {
  const { color, widthMm, opacity } = element.stroke;
  const ink = {
    stroke: color,
    strokeWidth: widthMm,
    strokeOpacity: opacity,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
    "data-element-id": element.id,
  };
  switch (element.type) {
    case "path":
      // A single point is drawn as a dot by the round cap of a zero-length segment.
      return (
        <polyline
          {...ink}
          points={pointsAttr(
            element.points.length === 1 ? [element.points[0]!, element.points[0]!] : element.points,
          )}
        />
      );
    case "polyline":
      return element.closed ? (
        <polygon {...ink} points={pointsAttr(element.points)} />
      ) : (
        <polyline {...ink} points={pointsAttr(element.points)} />
      );
    case "line":
      return (
        <line
          {...ink}
          x1={element.from[0]}
          y1={element.from[1]}
          x2={element.to[0]}
          y2={element.to[1]}
        />
      );
    case "rect":
      return (
        <rect
          {...ink}
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      );
    case "ellipse":
      return <ellipse {...ink} cx={element.cx} cy={element.cy} rx={element.rx} ry={element.ry} />;
    case "text":
      return (
        <text
          data-element-id={element.id}
          x={element.x}
          y={element.y}
          fill={color}
          fillOpacity={opacity}
          fontSize={element.sizeMm}
          style={{ fontFamily: "inherit", whiteSpace: "pre" }}
        >
          {textLines(element.text).map((line, i) => (
            <tspan key={i} x={element.x} dy={i === 0 ? 0 : element.sizeMm * TEXT_LINE_HEIGHT}>
              {line || " "}
            </tspan>
          ))}
        </text>
      );
  }
}

function Underlay({ drawing }: { drawing: Drawing }) {
  const underlay = drawing.underlay;
  const asset = useAppStore((s) =>
    underlay ? s.history.present.assets[underlay.assetId] : undefined,
  );
  const source = useAssetSource(asset?.id);
  if (!underlay || !asset) return null;
  const size = underlaySizeMm(asset, underlay.dpi);
  if (source?.status !== "ready") {
    return (
      <g>
        <rect
          x={underlay.xMm}
          y={underlay.yMm}
          width={size.w}
          height={size.h}
          fill="#f3dddb"
          stroke="#8a2e2b"
          strokeWidth={0.5}
        />
        <text x={underlay.xMm + 4} y={underlay.yMm + 10} fontSize={6} fill="#8a2e2b">
          {source?.status === "loading" ? "Loading" : `Missing file: ${asset.name}`}
        </text>
      </g>
    );
  }
  return (
    <image
      href={source.url}
      x={underlay.xMm}
      y={underlay.yMm}
      width={size.w}
      height={size.h}
      opacity={underlay.opacity}
      preserveAspectRatio="none"
    />
  );
}

interface SheetSvgProps {
  drawing: Drawing;
  /** Draw the construction grid (never shown on boards or prints). */
  grid?: boolean;
  /** Elements to leave out, for example while they are being edited. */
  hiddenIds?: ReadonlySet<string>;
  /** Extra content on top, in paper millimetres (tool previews). */
  children?: ReactNode;
  className?: string;
  /** Fits the sheet into its box instead of sizing it to 1 px per millimetre. */
  fit?: boolean;
}

/** A drawing's sheet: white paper, optional grid, image underlay and elements. */
export function SheetSvg({
  drawing,
  grid = false,
  hiddenIds,
  children,
  className,
  fit,
}: SheetSvgProps) {
  const id = useId();
  const { widthMm: w, heightMm: h } = drawing.sheet.format;
  const spacing = drawing.sheet.grid.spacingMm;
  const major = spacing * 5;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      width={fit ? "100%" : w}
      height={fit ? "100%" : h}
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
      role="img"
      aria-label={`${drawing.number} ${drawing.title}`}
      data-testid={`sheet-${drawing.id}`}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width={w} height={h} />
        </clipPath>
        {grid ? (
          <>
            <pattern
              id={`${id}-minor`}
              width={spacing}
              height={spacing}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${spacing} 0 V ${spacing} H 0`}
                fill="none"
                stroke={GRID_MINOR}
                strokeWidth={0.12}
              />
            </pattern>
            <pattern id={`${id}-major`} width={major} height={major} patternUnits="userSpaceOnUse">
              <rect width={major} height={major} fill={`url(#${id}-minor)`} />
              <path
                d={`M ${major} 0 V ${major} H 0`}
                fill="none"
                stroke={GRID_MAJOR}
                strokeWidth={0.2}
              />
            </pattern>
          </>
        ) : null}
      </defs>
      <rect width={w} height={h} fill={PAPER} />
      {grid ? <rect width={w} height={h} fill={`url(#${id}-major)`} /> : null}
      <g clipPath={`url(#${id}-clip)`}>
        <Underlay drawing={drawing} />
        {drawing.elements.map((element) =>
          hiddenIds?.has(element.id) ? null : <ElementShape key={element.id} element={element} />,
        )}
        {children}
      </g>
    </svg>
  );
}
