import "./styles.css";
import { createCardBandMapperApp } from "./src/dev/cardBandMapperApp";
import { createCardEditorApp } from "./src/dev/cardEditorApp";
import { selectRenderer } from "./src/renderers";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement == null) {
  throw new Error("App root element not found");
}

const isBandMapper = new URLSearchParams(window.location.search).get("dev") === "band-mapper";
const isCardEditor = new URLSearchParams(window.location.search).get("dev") === "card-editor";
const rendererSelection = isBandMapper || isCardEditor ? null : selectRenderer();
const boot =
  isBandMapper ? createCardBandMapperApp
  : isCardEditor ? createCardEditorApp
  : rendererSelection!.renderer.boot;

if (rendererSelection != null) {
  document.documentElement.dataset.requestedRenderer = rendererSelection.selection.requestedRendererId;
  document.documentElement.dataset.activeRenderer = rendererSelection.selection.actualRendererId;

  if (rendererSelection.selection.requestedRendererId !== rendererSelection.selection.actualRendererId) {
    console.warn(
      `[renderer] Requested "${rendererSelection.selection.requestedRendererId}" via ${rendererSelection.selection.requestedBy}, `
      + `falling back to "${rendererSelection.selection.actualRendererId}" because the requested renderer is unavailable.`
    );
  } else {
    console.info(
      `[renderer] Booting "${rendererSelection.selection.actualRendererId}" renderer `
      + `(source: ${rendererSelection.selection.requestedBy}).`
    );
  }
}

boot(rootElement).catch((error) => {
  console.error(error);
  rootElement.innerHTML = `
    <main class="crash-screen">
      <h1>Emerlaus failed to boot</h1>
      ${rendererSelection != null ? `<p>Renderer: ${rendererSelection.selection.actualRendererId}</p>` : ""}
      <p>${error instanceof Error ? error.message : "Unknown startup error"}</p>
    </main>
  `;
});
