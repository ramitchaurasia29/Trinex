import { useMemo } from "react";
import manifest from "./screens.figr.json";

type ScreensManifest = {
  screens?: Record<string, { state?: Record<string, unknown> }>;
};

export function useScreenInit(): Record<string, unknown> {
  return useMemo(() => {
    if (typeof window === "undefined") return {};
    const screenId = new URLSearchParams(window.location.search).get(
      "figr_screen",
    );
    if (!screenId) return {};
    const screens = (manifest as ScreensManifest)?.screens;
    const state = screens?.[screenId]?.state;
    return state && typeof state === "object" ? state : {};
  }, []);
}
