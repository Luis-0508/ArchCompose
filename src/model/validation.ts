import { effectiveDpi, frameRect, framesOverlap, gridIsUsable } from "./boards";
import type { AssetId, Board, FrameId, Project } from "./types";

export type IssueSeverity = "error" | "warning" | "info";

export interface BoardIssue {
  severity: IssueSeverity;
  message: string;
  frameId?: FrameId;
}

export interface ValidationContext {
  /** Whether the asset's pixels could be loaded in this session (file exists and decodes). */
  isAssetAvailable: (id: AssetId) => boolean;
}

/**
 * Pre-submission checks for a board. Everything reported here is computed from the
 * document model; nothing is estimated from rendered output.
 */
export function validateBoard(
  project: Project,
  board: Board,
  context: ValidationContext,
): BoardIssue[] {
  const issues: BoardIssue[] = [];

  if (!gridIsUsable(board)) {
    issues.push({
      severity: "error",
      message: "Margins and gutters leave no room for the grid. Reduce them or use fewer cells.",
    });
  }
  if (board.frames.length === 0) {
    issues.push({ severity: "info", message: "The board has no frames yet." });
  }

  board.frames.forEach((frame, index) => {
    const content = frame.content;
    const rect = frameRect(board, frame);
    if (content.type === "empty") {
      issues.push({ severity: "info", frameId: frame.id, message: "Empty frame." });
    }
    if (content.type === "asset") {
      const asset = project.assets[content.assetId];
      if (!asset) {
        issues.push({
          severity: "error",
          frameId: frame.id,
          message: "Linked image no longer exists in the project.",
        });
      } else {
        if (!context.isAssetAvailable(asset.id)) {
          issues.push({
            severity: "error",
            frameId: frame.id,
            message: `“${asset.name}” cannot be loaded. Relink or re-import the file.`,
          });
        }
        const dpi = effectiveDpi(asset.width, asset.height, rect.w, rect.h, content.fit);
        if (dpi < board.targetDpi) {
          issues.push({
            severity: dpi < board.targetDpi / 2 ? "error" : "warning",
            frameId: frame.id,
            message: `“${asset.name}” prints at ${Math.round(dpi)} dpi, below the ${board.targetDpi} dpi target.`,
          });
        }
      }
    }
    if (content.type === "drawing") {
      const drawing = project.drawings.find((d) => d.id === content.drawingId);
      if (!drawing) {
        issues.push({
          severity: "error",
          frameId: frame.id,
          message: "Linked drawing no longer exists.",
        });
      } else if (!drawing.sourceAssetId) {
        issues.push({
          severity: "warning",
          frameId: frame.id,
          message: `${drawing.number} has no drawing file attached.`,
        });
      }
    }
    if (content.type === "text" && !content.text.trim()) {
      issues.push({ severity: "warning", frameId: frame.id, message: "Text frame is empty." });
    }
    for (const other of board.frames.slice(index + 1)) {
      if (framesOverlap(frame, other)) {
        issues.push({
          severity: "warning",
          frameId: frame.id,
          message: "Frame overlaps another frame.",
        });
      }
    }
  });

  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
