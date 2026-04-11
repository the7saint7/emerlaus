import type { AppRenderer, RendererId, RendererSelectionResult } from "./types";

const RENDERER_STORAGE_KEY = "emerlaus.renderer";
const DEFAULT_RENDERER_ID: RendererId = "dom";

function isRendererId(value: string | null): value is RendererId {
  return value === "dom" || value === "pixi";
}

function readRendererIdFromQuery(): RendererId | null {
  const requested = new URLSearchParams(window.location.search).get("renderer");
  return isRendererId(requested) ? requested : null;
}

function readRendererIdFromStorage(): RendererId | null {
  try {
    const stored = window.localStorage.getItem(RENDERER_STORAGE_KEY);
    return isRendererId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistRendererId(rendererId: RendererId): boolean {
  try {
    window.localStorage.setItem(RENDERER_STORAGE_KEY, rendererId);
    return true;
  } catch {
    return false;
  }
}

export function resolveRendererSelection(renderers: Record<RendererId, AppRenderer>): RendererSelectionResult {
  const queryRendererId = readRendererIdFromQuery();
  const storageRendererId = readRendererIdFromStorage();
  const requestedRendererId = queryRendererId ?? storageRendererId ?? DEFAULT_RENDERER_ID;
  const requestedBy =
    queryRendererId != null ? "query"
    : storageRendererId != null ? "storage"
    : "default";
  const requestedRenderer = renderers[requestedRendererId];
  const actualRendererId =
    requestedRenderer?.available === true
      ? requestedRendererId
      : DEFAULT_RENDERER_ID;
  const persisted = persistRendererId(requestedRendererId);

  return {
    requestedRendererId,
    actualRendererId,
    requestedBy,
    persisted
  };
}

export function getRendererStorageKey(): string {
  return RENDERER_STORAGE_KEY;
}
