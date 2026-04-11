import { domRenderer } from "./domRenderer";
import { pixiRenderer } from "./pixiRenderer";
import { resolveRendererSelection } from "./selection";
import type { AppRenderer, RendererId, RendererSelectionResult } from "./types";

const renderers: Record<RendererId, AppRenderer> = {
  dom: domRenderer,
  pixi: pixiRenderer
};

export function getRegisteredRenderers(): Record<RendererId, AppRenderer> {
  return renderers;
}

export function selectRenderer(): {
  renderer: AppRenderer;
  selection: RendererSelectionResult;
} {
  const selection = resolveRendererSelection(renderers);
  return {
    renderer: renderers[selection.actualRendererId],
    selection
  };
}
