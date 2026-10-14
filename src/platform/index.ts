import { isTauri } from "@tauri-apps/api/core";
import { browserPlatform } from "./browser";
import { desktopPlatform } from "./desktop";
import type { Platform } from "./types";

export const platform: Platform = isTauri() ? desktopPlatform : browserPlatform;

export type { EngineStatus, OpenedProjectFile, PickedFile, Platform } from "./types";
export { PlatformError } from "./types";
