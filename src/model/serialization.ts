import { migrateProjectData } from "./migrations";
import { PROJECT_SCHEMA_VERSION, type Project } from "./types";

export const PROJECT_FILE_EXTENSION = "archcompose";

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFileError";
  }
}

export function serializeProject(project: Project, now = new Date()): string {
  return JSON.stringify({ ...project, modifiedAt: now.toISOString() }, null, 2) + "\n";
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expect(condition: boolean, what: string): asserts condition {
  if (!condition) throw new ProjectFileError(`The project file is damaged: ${what}.`);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && isNumber(value[0]) && isNumber(value[1]);
}

function isElement(value: unknown): boolean {
  if (!isObject(value) || typeof value.id !== "string") return false;
  const stroke = value.stroke;
  if (
    !isObject(stroke) ||
    typeof stroke.color !== "string" ||
    !isNumber(stroke.widthMm) ||
    !isNumber(stroke.opacity)
  ) {
    return false;
  }
  const numbers = (...keys: string[]) => keys.every((k) => isNumber(value[k]));
  const points = (min: number) =>
    Array.isArray(value.points) && value.points.length >= min && value.points.every(isPoint);
  switch (value.type) {
    case "path":
      return points(1);
    case "polyline":
      return points(2) && typeof value.closed === "boolean";
    case "line":
      return isPoint(value.from) && isPoint(value.to);
    case "rect":
      return numbers("x", "y", "w", "h");
    case "ellipse":
      return numbers("cx", "cy", "rx", "ry");
    case "text":
      return numbers("x", "y", "sizeMm") && typeof value.text === "string";
    default:
      return false;
  }
}

/**
 * Parses and structurally validates a project file. The checks cover every field
 * the application dereferences, so a malformed file fails here with a clear message
 * instead of crashing a view later.
 */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError("This file is not an ArchCompose project (invalid JSON).");
  }
  expect(isObject(raw), "top level is not an object");
  let data: Json = raw;
  expect(typeof data.schemaVersion === "number", "missing schema version");
  if ((data.schemaVersion as number) > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFileError(
      `This project was saved by a newer version of ArchCompose (schema ${String(data.schemaVersion)}). Update the app to open it.`,
    );
  }
  expect(
    Number.isInteger(data.schemaVersion) && (data.schemaVersion as number) >= 1,
    "unsupported schema version",
  );
  data = migrateProjectData(data, PROJECT_SCHEMA_VERSION);
  expect(data.schemaVersion === PROJECT_SCHEMA_VERSION, "unsupported schema version");
  for (const key of ["id", "name", "createdAt", "modifiedAt"]) {
    expect(typeof data[key] === "string", `“${key}” is not text`);
  }
  expect(isObject(data.assets), "assets are missing");
  expect(Array.isArray(data.assetOrder), "asset order is missing");
  expect(Array.isArray(data.composeDocs), "compose documents are missing");
  expect(Array.isArray(data.drawings), "drawings are missing");
  expect(Array.isArray(data.boards), "boards are missing");

  const assets = data.assets as Json;
  for (const [id, asset] of Object.entries(assets)) {
    expect(isObject(asset) && asset.id === id, `asset ${id} is malformed`);
    expect(
      typeof asset.name === "string" &&
        typeof asset.width === "number" &&
        typeof asset.height === "number",
      `asset ${id} is incomplete`,
    );
  }
  for (const id of data.assetOrder as unknown[]) {
    expect(typeof id === "string" && id in assets, "asset order references an unknown asset");
  }
  for (const doc of data.composeDocs as unknown[]) {
    expect(isObject(doc) && typeof doc.id === "string", "a compose document is malformed");
    expect(Array.isArray(doc.layers), `compose document ${String(doc.id)} has no layers`);
    for (const layer of doc.layers as unknown[]) {
      expect(
        isObject(layer) && typeof layer.id === "string" && typeof layer.assetId === "string",
        "a layer is malformed",
      );
      expect(
        typeof layer.x === "number" && typeof layer.scale === "number",
        "a layer has no transform",
      );
      if (layer.adjust !== undefined) {
        const adjust = layer.adjust;
        expect(
          isObject(adjust) &&
            [
              "exposure",
              "brightness",
              "contrast",
              "saturation",
              "vibrance",
              "warmth",
              "blur",
              "sharpen",
            ].every((k) => typeof adjust[k] === "number" && Number.isFinite(adjust[k])),
          "a layer has malformed adjustments",
        );
      }
    }
  }
  for (const drawing of data.drawings as unknown[]) {
    expect(
      isObject(drawing) && typeof drawing.id === "string" && Array.isArray(drawing.revisions),
      "a drawing is malformed",
    );
    const sheet = drawing.sheet;
    expect(
      isObject(sheet) &&
        isObject(sheet.format) &&
        isNumber(sheet.format.widthMm) &&
        isNumber(sheet.format.heightMm) &&
        isObject(sheet.grid) &&
        isNumber(sheet.grid.spacingMm),
      `drawing ${String(drawing.id)} has no sheet`,
    );
    const underlay = drawing.underlay;
    expect(
      underlay === null ||
        (isObject(underlay) &&
          typeof underlay.assetId === "string" &&
          underlay.assetId in assets &&
          ["xMm", "yMm", "dpi", "opacity"].every((k) => isNumber(underlay[k])) &&
          (underlay.dpi as number) > 0),
      `drawing ${String(drawing.id)} has a malformed underlay`,
    );
    expect(Array.isArray(drawing.elements), `drawing ${String(drawing.id)} has no elements`);
    for (const element of drawing.elements as unknown[]) {
      expect(isElement(element), `drawing ${String(drawing.id)} has a malformed element`);
    }
  }
  for (const board of data.boards as unknown[]) {
    expect(isObject(board) && typeof board.id === "string", "a board is malformed");
    expect(
      isObject(board.format) && isObject(board.grid),
      `board ${String(board.id)} has no format`,
    );
    expect(Array.isArray(board.frames), `board ${String(board.id)} has no frames`);
    for (const frame of board.frames as unknown[]) {
      expect(isObject(frame) && isObject(frame.content), "a frame is malformed");
    }
  }
  return data as unknown as Project;
}
