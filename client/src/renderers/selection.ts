import type { AppRenderer, RendererId, RendererSelectionResult } from "./types";

const RENDERER_STORAGE_KEY = "emerlaus.renderer";
const DEFAULT_RENDERER_ID: RendererId = "pixi";

function isRendererId(value: string | null): value is RendererId {
  return value === "dom" || value === "pixi";
}

function readRendererIdFromQuery(): RendererId | null {
  const requested = new URLSearchParams(window.location.search).get("renderer");
  return isRendererId(requested) ? requested : null;
}

export function resolveRendererSelection(renderers: Record<RendererId, AppRenderer>): RendererSelectionResult {
  const queryRendererId = readRendererIdFromQuery();
  const requestedRendererId = queryRendererId ?? DEFAULT_RENDERER_ID;
  const requestedBy =
    queryRendererId != null ? "query" : "default";
  const requestedRenderer = renderers[requestedRendererId];
  const actualRendererId =
    requestedRenderer?.available === true
      ? requestedRendererId
      : DEFAULT_RENDERER_ID;

  return {
    requestedRendererId,
    actualRendererId,
    requestedBy,
    persisted: false
  };
}

export function getRendererStorageKey(): string {
  return RENDERER_STORAGE_KEY;
}
