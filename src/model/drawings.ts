import { createId } from "./ids";
import { replaceById } from "./project";
import type { Drawing, DrawingId, DrawingKind, Project, Revision } from "./types";

export const DRAWING_KINDS: readonly { kind: DrawingKind; label: string; series: number }[] = [
  { kind: "site", label: "Site plans", series: 0 },
  { kind: "plan", label: "Plans", series: 1 },
  { kind: "section", label: "Sections", series: 2 },
  { kind: "elevation", label: "Elevations", series: 3 },
  { kind: "detail", label: "Details", series: 5 },
];

/** Common architectural scales, as denominators. */
export const COMMON_SCALES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500] as const;

export function kindLabel(kind: DrawingKind): string {
  return DRAWING_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

export function kindSingular(kind: DrawingKind): string {
  switch (kind) {
    case "site":
      return "Site plan";
    case "plan":
      return "Plan";
    case "section":
      return "Section";
    case "elevation":
      return "Elevation";
    case "detail":
      return "Detail";
  }
}

/**
 * Proposes the next free sheet number in a drawing series, following the common
 * "A-<series><nn>" convention: plans A-101, sections A-201, elevations A-301.
 */
export function nextSheetNumber(drawings: readonly Drawing[], kind: DrawingKind): string {
  const series = DRAWING_KINDS.find((k) => k.kind === kind)?.series ?? 9;
  const used = new Set(drawings.map((d) => d.number));
  for (let n = 1; n < 100; n++) {
    const candidate = `A-${series}${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return `A-${series}XX`;
}

export function defaultScale(kind: DrawingKind): number {
  switch (kind) {
    case "site":
      return 500;
    case "detail":
      return 10;
    default:
      return 100;
  }
}

export function addDrawing(
  project: Project,
  kind: DrawingKind,
  init: Partial<Omit<Drawing, "id" | "kind">> = {},
): [Project, Drawing] {
  const drawing: Drawing = {
    id: createId("drw"),
    number: init.number ?? nextSheetNumber(project.drawings, kind),
    title: init.title ?? `Untitled ${kindSingular(kind).toLowerCase()}`,
    kind,
    scale: init.scale ?? defaultScale(kind),
    level: init.level ?? "",
    sourceAssetId: init.sourceAssetId ?? null,
    revisions: init.revisions ?? [],
  };
  return [{ ...project, drawings: [...project.drawings, drawing] }, drawing];
}

export type DrawingPatch = Partial<Omit<Drawing, "id" | "revisions">>;

export function updateDrawing(project: Project, id: DrawingId, patch: DrawingPatch): Project {
  const normalized = { ...patch };
  if (normalized.scale !== undefined) {
    normalized.scale =
      Number.isFinite(normalized.scale) && normalized.scale > 0
        ? Math.round(normalized.scale)
        : 100;
  }
  return {
    ...project,
    drawings: replaceById(project.drawings, id, (d) => ({ ...d, ...normalized })),
  };
}

export function removeDrawing(project: Project, id: DrawingId): Project {
  return {
    ...project,
    drawings: project.drawings.filter((d) => d.id !== id),
    boards: project.boards.map((b) => ({
      ...b,
      frames: b.frames.map((f) =>
        f.content.type === "drawing" && f.content.drawingId === id
          ? { ...f, content: { type: "empty" as const } }
          : f,
      ),
    })),
  };
}

/** Proposes the next revision code: P01, P02 and so on, continuing from the latest one. */
export function nextRevisionCode(revisions: readonly Revision[]): string {
  const last = revisions.at(-1)?.code ?? "";
  const match = /^([A-Z]+)(\d+)$/.exec(last);
  if (!match) return "P01";
  const width = match[2]!.length;
  return `${match[1]}${String(Number(match[2]) + 1).padStart(width, "0")}`;
}

export function addRevision(
  project: Project,
  id: DrawingId,
  note: string,
  now = new Date(),
): Project {
  return {
    ...project,
    drawings: replaceById(project.drawings, id, (d) => ({
      ...d,
      revisions: [
        ...d.revisions,
        { code: nextRevisionCode(d.revisions), date: now.toISOString().slice(0, 10), note },
      ],
    })),
  };
}

/** Groups drawings by kind in series order, sorted by sheet number. */
export function groupDrawings(drawings: readonly Drawing[]) {
  return DRAWING_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    drawings: drawings
      .filter((d) => d.kind === kind)
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
  })).filter((g) => g.drawings.length > 0);
}

/**
 * A scale bar segment: picks a round real-world distance (1, 2, 5 × 10ⁿ metres)
 * whose length on paper is close to the requested length.
 */
export function scaleBarStep(
  scale: number,
  targetPaperMm = 20,
): { metres: number; paperMm: number } {
  const targetMetres = (targetPaperMm * scale) / 1000;
  const magnitude = 10 ** Math.floor(Math.log10(targetMetres));
  let metres = magnitude;
  for (const m of [1, 2, 5, 10]) {
    const candidate = m * magnitude;
    if (Math.abs(candidate - targetMetres) < Math.abs(metres - targetMetres)) metres = candidate;
  }
  return { metres, paperMm: (metres * 1000) / scale };
}
