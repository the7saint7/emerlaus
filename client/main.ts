import "./styles.css";
import { createApp } from "./src/app";
import { createCardBandMapperApp } from "./src/dev/cardBandMapperApp";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement == null) {
  throw new Error("App root element not found");
}

const isBandMapper = new URLSearchParams(window.location.search).get("dev") === "band-mapper";
const boot = isBandMapper ? createCardBandMapperApp : createApp;

boot(rootElement).catch((error) => {
  console.error(error);
  rootElement.innerHTML = `
    <main class="crash-screen">
      <h1>Emerlaus failed to boot</h1>
      <p>${error instanceof Error ? error.message : "Unknown startup error"}</p>
    </main>
  `;
});
