import { create } from "zustand";
import {
  commit,
  commitFrom,
  createHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from "../model/history";
import { createProject } from "../model/project";
import { DEFAULT_STROKE, normalizeStroke } from "../model/sheet";
import type {
  BoardId,
  ComposeDocId,
  DrawingId,
  ElementId,
  FrameId,
  LayerId,
  Project,
  StrokeStyle,
} from "../model/types";
import {
  fitCamera,
  stepZoom,
  zoomTo,
  type Camera,
  type Point,
  type Size,
} from "../viewport/camera";

export type WorkspaceId = "compose" | "drawings" | "boards";
export type ComposeTool = "select" | "hand" | "zoom" | "horizon";
export type DrawingTool =
  "select" | "hand" | "pen" | "eraser" | "line" | "rect" | "circle" | "polyline" | "text";

/** Settings the drawing tools use for new content. Not part of the document. */
export interface DrawingToolSettings {
  stroke: StrokeStyle;
  /** Eraser radius in paper millimetres. */
  eraserMm: number;
  /** Font size for new text in paper millimetres. */
  textMm: number;
}

export interface Selection {
  composeDocId: ComposeDocId | null;
  layerId: LayerId | null;
  drawingId: DrawingId | null;
  /** Selected elements of the selected drawing. */
  elementIds: ElementId[];
  boardId: BoardId | null;
  frameId: FrameId | null;
}

export interface ViewState {
  camera: Camera;
  /** While true the camera follows the viewport size and keeps the content fitted. */
  fit: boolean;
  view: Size;
  content: Size;
}

export interface Notice {
  id: number;
  tone: "info" | "success" | "error";
  message: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

export interface Cursor {
  x: number;
  y: number;
  unit: "px" | "mm";
}

interface AppState {
  history: History<Project>;
  /** State before the current pointer gesture; see beginGesture/endGesture. */
  gestureBase: Project | null;
  /** The project as last saved or opened, for the unsaved-changes indicator. */
  savedProject: Project | null;
  filePath: string | null;

  workspace: WorkspaceId;
  selection: Selection;
  composeTool: ComposeTool;
  drawingTool: DrawingTool;
  drawingSettings: DrawingToolSettings;
  panels: { left: boolean; right: boolean };
  views: Record<string, ViewState>;
  cursor: Cursor | null;
  notices: Notice[];
  confirm: ConfirmRequest | null;
  busy: string | null;
}

interface AppActions {
  apply(label: string, recipe: (project: Project) => Project): void;
  beginGesture(): void;
  applyTransient(recipe: (project: Project) => Project): void;
  endGesture(label: string): void;
  undo(): void;
  redo(): void;
  replaceProject(project: Project, filePath: string | null, saved: boolean): void;
  markSaved(filePath: string | null): void;

  setWorkspace(workspace: WorkspaceId): void;
  select(patch: Partial<Selection>): void;
  setComposeTool(tool: ComposeTool): void;
  setDrawingTool(tool: DrawingTool): void;
  setDrawingSettings(patch: Partial<DrawingToolSettings>): void;
  togglePanel(side: "left" | "right"): void;

  syncView(key: string, view: Size, content: Size): void;
  setCamera(key: string, camera: Camera): void;
  fitView(key: string): void;
  zoomStep(key: string, direction: 1 | -1, anchor?: Point): void;
  zoomToActual(key: string): void;
  setCursor(cursor: Cursor | null): void;

  notify(tone: Notice["tone"], message: string): void;
  dismissNotice(id: number): void;
  requestConfirm(request: Omit<ConfirmRequest, "resolve">): Promise<boolean>;
  resolveConfirm(confirmed: boolean): void;
  setBusy(label: string | null): void;
}

export type AppStore = AppState & AppActions;

const emptySelection: Selection = {
  composeDocId: null,
  layerId: null,
  drawingId: null,
  elementIds: [],
  boardId: null,
  frameId: null,
};

let noticeId = 0;

export function initialState(project: Project = createProject()): AppState {
  return {
    history: createHistory(project),
    gestureBase: null,
    savedProject: project,
    filePath: null,
    workspace: "compose",
    selection: emptySelection,
    composeTool: "select",
    drawingTool: "select",
    drawingSettings: { stroke: DEFAULT_STROKE, eraserMm: 2, textMm: 5 },
    panels: { left: true, right: true },
    views: {},
    cursor: null,
    notices: [],
    confirm: null,
    busy: null,
  };
}

export const useAppStore = create<AppStore>()((set, get) => ({
  ...initialState(),

  apply(label, recipe) {
    const { history, gestureBase } = get();
    if (gestureBase) {
      // A discrete edit during a gesture is folded into the gesture.
      set({ history: replacePresent(history, recipe(history.present)) });
      return;
    }
    set({ history: commit(history, recipe(history.present), label) });
  },

  beginGesture() {
    set((s) => ({ gestureBase: s.gestureBase ?? s.history.present }));
  },

  applyTransient(recipe) {
    set((s) => ({ history: replacePresent(s.history, recipe(s.history.present)) }));
  },

  endGesture(label) {
    const { gestureBase, history } = get();
    if (!gestureBase) return;
    set({ history: commitFrom(history, gestureBase, label), gestureBase: null });
  },

  undo() {
    if (get().gestureBase) return;
    set((s) => ({ history: undo(s.history) }));
  },

  redo() {
    if (get().gestureBase) return;
    set((s) => ({ history: redo(s.history) }));
  },

  replaceProject(project, filePath, saved) {
    set({
      history: createHistory(project),
      gestureBase: null,
      savedProject: saved ? project : null,
      filePath,
      selection: {
        ...emptySelection,
        composeDocId: project.composeDocs[0]?.id ?? null,
        drawingId: project.drawings[0]?.id ?? null,
        boardId: project.boards[0]?.id ?? null,
      },
      views: {},
    });
  },

  markSaved(filePath) {
    set((s) => ({ savedProject: s.history.present, filePath: filePath ?? s.filePath }));
  },

  setWorkspace(workspace) {
    set({ workspace, cursor: null });
  },

  select(patch) {
    set((s) => {
      const selection = { ...s.selection, ...patch };
      // Element selection belongs to one drawing.
      if (patch.drawingId !== undefined && patch.drawingId !== s.selection.drawingId) {
        selection.elementIds = patch.elementIds ?? [];
      }
      return { selection };
    });
  },

  setComposeTool(composeTool) {
    set({ composeTool });
  },

  setDrawingTool(drawingTool) {
    set({ drawingTool });
  },

  setDrawingSettings(patch) {
    set((s) => {
      const next = { ...s.drawingSettings, ...patch };
      return { drawingSettings: { ...next, stroke: normalizeStroke(next.stroke) } };
    });
  },

  togglePanel(side) {
    set((s) => ({ panels: { ...s.panels, [side]: !s.panels[side] } }));
  },

  syncView(key, view, content) {
    set((s) => {
      const current = s.views[key];
      const fit = current?.fit ?? true;
      const camera = fit || !current ? fitCamera(content, view) : current.camera;
      return { views: { ...s.views, [key]: { camera, fit, view, content } } };
    });
  },

  setCamera(key, camera) {
    set((s) => {
      const current = s.views[key];
      if (!current) return s;
      return { views: { ...s.views, [key]: { ...current, camera, fit: false } } };
    });
  },

  fitView(key) {
    set((s) => {
      const current = s.views[key];
      if (!current) return s;
      return {
        views: {
          ...s.views,
          [key]: { ...current, fit: true, camera: fitCamera(current.content, current.view) },
        },
      };
    });
  },

  zoomStep(key, direction, anchor) {
    const current = get().views[key];
    if (!current) return;
    const center = anchor ?? { x: current.view.width / 2, y: current.view.height / 2 };
    get().setCamera(key, zoomTo(current.camera, stepZoom(current.camera.zoom, direction), center));
  },

  zoomToActual(key) {
    const current = get().views[key];
    if (!current) return;
    const center = { x: current.view.width / 2, y: current.view.height / 2 };
    get().setCamera(key, zoomTo(current.camera, 1, center));
  },

  setCursor(cursor) {
    set({ cursor });
  },

  notify(tone, message) {
    const id = ++noticeId;
    set((s) => ({ notices: [...s.notices.slice(-3), { id, tone, message }] }));
    if (tone !== "error") {
      setTimeout(() => get().dismissNotice(id), 4000);
    }
  },

  dismissNotice(id) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
  },

  requestConfirm(request) {
    get().confirm?.resolve(false);
    return new Promise<boolean>((resolve) => set({ confirm: { ...request, resolve } }));
  },

  resolveConfirm(confirmed) {
    const request = get().confirm;
    set({ confirm: null });
    request?.resolve(confirmed);
  },

  setBusy(busy) {
    set({ busy });
  },
}));

// ---------------------------------------------------------------- selectors

export const selectProject = (s: AppStore) => s.history.present;
export const selectIsDirty = (s: AppStore) => s.history.present !== s.savedProject;

export function selectComposeDoc(s: AppStore) {
  const docs = s.history.present.composeDocs;
  return docs.find((d) => d.id === s.selection.composeDocId) ?? docs[0] ?? null;
}

export function selectDrawing(s: AppStore) {
  const drawings = s.history.present.drawings;
  return drawings.find((d) => d.id === s.selection.drawingId) ?? null;
}

export function selectBoard(s: AppStore) {
  const boards = s.history.present.boards;
  return boards.find((b) => b.id === s.selection.boardId) ?? boards[0] ?? null;
}
