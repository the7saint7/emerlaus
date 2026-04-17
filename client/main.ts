import "./styles.css";
import { fetchConfig } from "./src/api/gameApi";
import { createCardBandMapperApp } from "./src/dev/cardBandMapperApp";
import { createCardEditorApp } from "./src/dev/cardEditorApp";
import { createPixiApp } from "./src/pixi/pixiApp";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement == null) {
  throw new Error("App root element not found");
}

const appRoot = rootElement;

async function bootApp(): Promise<void> {
  const requestedDevMode = new URLSearchParams(window.location.search).get("dev");
  let enableDevTools = false;

  try {
    enableDevTools = (await fetchConfig()).enableDevTools;
  } catch (error) {
    console.error("Unable to load app config, defaulting dev tools to disabled", error);
  }

  const boot = enableDevTools
    ? requestedDevMode === "band-mapper"
      ? createCardBandMapperApp
      : requestedDevMode === "card-editor"
        ? createCardEditorApp
        : createPixiApp
    : createPixiApp;

  await boot(appRoot);
}

bootApp().catch((error) => {
  console.error(error);
  rootElement.innerHTML = `
    <main class="crash-screen">
      <h1>Emerlaus failed to boot</h1>
      <p>${error instanceof Error ? error.message : "Unknown startup error"}</p>
    </main>
  `;
});
