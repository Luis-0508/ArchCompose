import { shortcutLabel, useShortcuts } from "../../app/shortcuts";
import { useAppStore } from "../../state/store";
import { IconButton } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";
import { formatZoom } from "../../viewport/camera";
import styles from "../workspace.module.css";

/** Zoom controls for the active viewport, plus the matching keyboard shortcuts. */
export function ViewControls({ viewKey }: { viewKey: string | null }) {
  const view = useAppStore((s) => (viewKey ? s.views[viewKey] : undefined));
  const fitView = useAppStore((s) => s.fitView);
  const zoomStep = useAppStore((s) => s.zoomStep);
  const zoomToActual = useAppStore((s) => s.zoomToActual);
  const enabled = !!viewKey && !!view;

  useShortcuts(
    {
      "Mod+0": () => viewKey && fitView(viewKey),
      "Mod+Alt+0": () => viewKey && zoomToActual(viewKey),
      "Mod+=": () => viewKey && zoomStep(viewKey, 1),
      "Mod+Shift+0": () => viewKey && zoomStep(viewKey, 1),
      "Mod+-": () => viewKey && zoomStep(viewKey, -1),
    },
    enabled,
  );

  return (
    <div className={styles.contextGroup} role="group" aria-label="Zoom">
      <IconButton
        icon="minus"
        label="Zoom out"
        shortcut={shortcutLabel("Mod+-")}
        disabled={!enabled}
        onClick={() => viewKey && zoomStep(viewKey, -1)}
      />
      <Tooltip label="Actual size" shortcut={shortcutLabel("Mod+Alt+0")}>
        <button
          type="button"
          className={`${styles.zoomReadout} num`}
          disabled={!enabled}
          aria-label={`Zoom ${view ? formatZoom(view.camera.zoom) : ""}, set to actual size`}
          onClick={() => viewKey && zoomToActual(viewKey)}
        >
          {view ? formatZoom(view.camera.zoom) : "None"}
        </button>
      </Tooltip>
      <IconButton
        icon="plus"
        label="Zoom in"
        shortcut={shortcutLabel("Mod+=")}
        disabled={!enabled}
        onClick={() => viewKey && zoomStep(viewKey, 1)}
      />
      <IconButton
        icon="fit"
        label="Fit to window"
        shortcut={shortcutLabel("Mod+0")}
        pressed={view?.fit}
        disabled={!enabled}
        onClick={() => viewKey && fitView(viewKey)}
      />
    </div>
  );
}
