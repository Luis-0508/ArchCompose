import { useState } from "react";
import { importRenderAsComposeDoc, openProject, placeAssetInCompose } from "../../app/commands";
import { useShortcuts } from "../../app/shortcuts";
import { capability } from "../../engine/capabilities";
import { removeLayer, updateLayer } from "../../model/compose";
import { selectComposeDoc, useAppStore, type ComposeTool } from "../../state/store";
import { Button } from "../../ui/Button";
import { Tabs, ToolRail, type ChoiceOption } from "../../ui/Choice";
import { AssetLibrary } from "../shared/AssetLibrary";
import { ViewControls } from "../shared/ViewControls";
import { WorkspaceLayout } from "../WorkspaceLayout";
import styles from "../workspace.module.css";
import { ComposeCanvas, composeViewKey } from "./ComposeCanvas";
import { ComposeInspector } from "./ComposeInspector";
import { LayersPanel } from "./LayersPanel";
import local from "./compose.module.css";

const TOOLS: readonly ChoiceOption<ComposeTool>[] = [
  {
    value: "select",
    label: "Select and move",
    icon: "select",
    shortcut: "V",
    note: "Drag corners to scale. Shift locks the axis.",
  },
  {
    value: "hand",
    label: "Hand",
    icon: "hand",
    shortcut: "H",
    note: "Or hold Space, or drag with the middle button.",
  },
  {
    value: "zoom",
    label: "Zoom",
    icon: "zoom",
    shortcut: "Z",
    note: "Click to zoom in, Alt-click to zoom out.",
  },
  {
    value: "horizon",
    label: "Horizon guide",
    icon: "horizon",
    shortcut: "L",
    note: capability("compose.horizon").note,
  },
];

const PLANNED_TOOLS: readonly ChoiceOption<string>[] = (
  [
    ["compose.perspective", "perspective"],
    ["compose.mask", "mask"],
    ["compose.shadow", "shadow"],
    ["compose.segment", "segment"],
    ["compose.adjust", "adjust"],
  ] as const
).map(([id, icon]) => ({
  value: id,
  label: capability(id).label,
  icon,
  note: capability(id).note,
}));

const TOOL_HINT: Record<ComposeTool, string> = {
  select: "Click a layer to select it. Drag to move, drag a corner to scale.",
  hand: "Drag to pan the view.",
  zoom: "Click to zoom in. Alt-click to zoom out.",
  horizon: "Click or drag on the render to place the horizon guide at eye level.",
};

type LeftTab = "layers" | "library";

function ComposeEmpty() {
  return (
    <div className={styles.centered}>
      <div className={local.hero}>
        <svg className={local.heroDrawing} viewBox="0 0 360 150" aria-hidden>
          {/* One-point perspective construction: ground plane converging on the horizon. */}
          <line x1="0" y1="62" x2="360" y2="62" className={local.heroHorizon} />
          {[-160, -100, -50, -15, 15, 50, 100, 160].map((x) => (
            <line key={x} x1={180} y1={62} x2={180 + x * 3} y2={150} />
          ))}
          {[78, 96, 122].map((y) => (
            <line key={y} x1={0} y1={y} x2={360} y2={y} />
          ))}
          <line x1="128" y1="150" x2="128" y2="20" className={local.heroFigure} />
          <line x1="128" y1="20" x2="232" y2="20" className={local.heroFigure} />
          <line x1="232" y1="20" x2="232" y2="150" className={local.heroFigure} />
          <circle cx="180" cy="62" r="3" className={local.heroVanish} />
        </svg>
        <h1 className={local.heroTitle}>Start with a render</h1>
        <p className={local.heroBody}>
          Import a rendered view of your project. ArchCompose opens it as a compose view where you
          can place people, trees and objects as layers, and set the horizon at eye level.
        </p>
        <div className={local.heroActions}>
          <Button variant="primary" icon="import" onClick={() => void importRenderAsComposeDoc()}>
            Import render
          </Button>
          <Button icon="folder" onClick={() => void openProject()}>
            Open project
          </Button>
        </div>
        <p className={local.heroFoot}>
          PNG, JPEG, WebP or AVIF. You can also drop a file anywhere on the window.
        </p>
      </div>
    </div>
  );
}

export function ComposeWorkspace() {
  const doc = useAppStore(selectComposeDoc);
  const docs = useAppStore((s) => s.history.present.composeDocs);
  const tool = useAppStore((s) => s.composeTool);
  const setTool = useAppStore((s) => s.setComposeTool);
  const layerId = useAppStore((s) => s.selection.layerId);
  const select = useAppStore((s) => s.select);
  const apply = useAppStore((s) => s.apply);
  const [tab, setTab] = useState<LeftTab>("layers");
  const selected = doc?.layers.find((l) => l.id === layerId) ?? null;

  const nudge = (dx: number, dy: number) => {
    if (!doc || !selected || selected.locked) return;
    apply("Nudge layer", (p) =>
      updateLayer(p, doc.id, selected.id, { x: selected.x + dx, y: selected.y + dy }),
    );
  };

  useShortcuts({
    V: () => setTool("select"),
    H: () => setTool("hand"),
    Z: () => setTool("zoom"),
    L: () => setTool("horizon"),
    Escape: () => select({ layerId: null }),
    Delete: () => {
      if (doc && selected && !selected.locked) {
        apply("Remove layer", (p) => removeLayer(p, doc.id, selected.id));
        select({ layerId: null });
      }
    },
    ArrowLeft: () => nudge(-1, 0),
    ArrowRight: () => nudge(1, 0),
    ArrowUp: () => nudge(0, -1),
    ArrowDown: () => nudge(0, 1),
    "Shift+ArrowLeft": () => nudge(-10, 0),
    "Shift+ArrowRight": () => nudge(10, 0),
    "Shift+ArrowUp": () => nudge(0, -10),
    "Shift+ArrowDown": () => nudge(0, 10),
  });

  const library = (
    <AssetLibrary
      importKind="cutout"
      placeLabel={doc ? `Place in ${doc.name}` : undefined}
      onPlace={doc ? (asset) => placeAssetInCompose(doc.id, asset) : undefined}
    />
  );

  return (
    <WorkspaceLayout
      rail={
        <ToolRail
          label="Compose tools"
          value={tool}
          tools={TOOLS}
          planned={PLANNED_TOOLS}
          onChange={setTool}
        />
      }
      leftLabel="Layers and library"
      left={
        <>
          <Tabs
            idPrefix="compose-left"
            label="Panel"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "layers", label: "Layers", count: doc?.layers.length ?? 0 },
              { value: "library", label: "Library" },
            ]}
          />
          <div
            role="tabpanel"
            id={`compose-left-panel-${tab}`}
            aria-labelledby={`compose-left-tab-${tab}`}
            className={local.leftBody}
          >
            {tab === "layers" ? (
              <LayersPanel doc={doc} onOpenLibrary={() => setTab("library")} />
            ) : (
              library
            )}
          </div>
        </>
      }
      context={
        <>
          <div className={styles.contextGroup}>
            <label className={styles.contextLabel} htmlFor="compose-doc">
              View
            </label>
            <select
              id="compose-doc"
              className={local.docSelect}
              value={doc?.id ?? ""}
              disabled={docs.length === 0}
              onChange={(e) => select({ composeDocId: e.target.value, layerId: null })}
            >
              {docs.length === 0 ? <option value="">No views yet</option> : null}
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              onClick={() => void importRenderAsComposeDoc()}
            >
              New view from render
            </Button>
          </div>
          <span className={styles.contextRule} aria-hidden />
          <span className={local.hint}>{doc ? TOOL_HINT[tool] : "Import a render to begin."}</span>
          <span className={styles.contextSpacer} />
          <ViewControls viewKey={doc ? composeViewKey(doc) : null} />
        </>
      }
      center={doc ? <ComposeCanvas key={doc.id} doc={doc} /> : <ComposeEmpty />}
      rightLabel="Inspector"
      right={<ComposeInspector doc={doc} layer={selected} />}
    />
  );
}
