import type { AppRenderer } from "./types";
import { createPixiApp } from "../pixi/pixiApp";

export const pixiRenderer: AppRenderer = {
  id: "pixi",
  label: "Pixi renderer",
  available: true,
  async boot(rootElement): Promise<void> {
    await createPixiApp(rootElement);
  }
};
