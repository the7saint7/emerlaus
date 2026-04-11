import { createApp } from "../app";
import type { AppRenderer } from "./types";

export const domRenderer: AppRenderer = {
  id: "dom",
  label: "Legacy DOM renderer",
  available: true,
  boot(rootElement) {
    return createApp(rootElement);
  }
};
