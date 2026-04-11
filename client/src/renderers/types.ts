export type RendererId = "dom" | "pixi";

export interface AppRenderer {
  id: RendererId;
  label: string;
  available: boolean;
  boot(rootElement: HTMLDivElement): Promise<void>;
}

export interface RendererSelectionResult {
  requestedRendererId: RendererId;
  actualRendererId: RendererId;
  requestedBy: "query" | "storage" | "default";
  persisted: boolean;
}
