import "./styles.css";
import { createCardBandMapperApp } from "./src/dev/cardBandMapperApp";
import { createCardEditorApp } from "./src/dev/cardEditorApp";
import { createPixiApp } from "./src/pixi/pixiApp";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement == null) {
  throw new Error("App root element not found");
}

const isBandMapper = new URLSearchParams(window.location.search).get("dev") === "band-mapper";
const isCardEditor = new URLSearchParams(window.location.search).get("dev") === "card-editor";
const boot = isBandMapper ? createCardBandMapperApp : isCardEditor ? createCardEditorApp : createPixiApp;

boot(rootElement).catch((error) => {
  console.error(error);
  rootElement.innerHTML = `
    <main class="crash-screen">
      <h1>Emerlaus failed to boot</h1>
      <p>${error instanceof Error ? error.message : "Unknown startup error"}</p>
    </main>
  `;
});
