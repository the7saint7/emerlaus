import type { DiceRollResult } from "./diceTypes";

const OVERLAY_ID = "dice-roll-overlay";
const CANVAS_HOST_ID = "dice-roll-canvas-host";
const RESULT_DELAY_MS = 650;
const HIDE_DELAY_MS = 1800;

interface DiceRollGroup {
  rollsArray?: Array<{ value?: number }>;
  value?: number;
}

function createOverlayMarkup(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.className = "dice-roll-overlay dice-roll-overlay--hidden";
  overlay.innerHTML = `
    <div class="dice-roll-stage">
      <div id="${CANVAS_HOST_ID}" class="dice-roll-canvas-host"></div>
      <div class="dice-roll-status" data-dice-status="true"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function readTotal(results: unknown): number {
  if (!Array.isArray(results)) {
    return 0;
  }

  return results.reduce((sum, group) => {
    const typedGroup = group as DiceRollGroup;
    if (typeof typedGroup.value === "number") {
      return sum + typedGroup.value;
    }

    const groupTotal =
      typedGroup.rollsArray?.reduce((groupSum, roll) => {
        return groupSum + (typeof roll.value === "number" ? roll.value : 0);
      }, 0) ?? 0;

    return sum + groupTotal;
  }, 0);
}

function readValues(results: unknown): number[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((group) => {
    const typedGroup = group as DiceRollGroup;
    return typedGroup.rollsArray?.flatMap((roll) =>
      typeof roll.value === "number" ? [roll.value] : []
    ) ?? [];
  });
}

class DiceController {
  private box: import("@3d-dice/dice-box").default | null = null;
  private hideTimer: number | null = null;
  private overlay: HTMLDivElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private rolling = false;

  private ensureOverlay(): HTMLDivElement {
    if (this.overlay != null && document.body.contains(this.overlay)) {
      return this.overlay;
    }

    this.overlay = createOverlayMarkup();
    return this.overlay;
  }

  private setStatus(content: string): void {
    const overlay = this.ensureOverlay();
    const status = overlay.querySelector<HTMLElement>("[data-dice-status='true']");
    if (status != null) {
      status.textContent = content;
    }
  }

  private showOverlay(): void {
    const overlay = this.ensureOverlay();
    overlay.classList.remove("dice-roll-overlay--hidden");
  }

  hide(): void {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    const overlay = this.ensureOverlay();
    overlay.classList.add("dice-roll-overlay--hidden");

    this.box?.clear();
    this.rolling = false;
  }

  async init(): Promise<void> {
    if (this.readyPromise != null) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      const { default: DiceBox } = await import("@3d-dice/dice-box");
      const overlay = this.ensureOverlay();
      const host = overlay.querySelector<HTMLElement>(`#${CANVAS_HOST_ID}`);
      if (host == null) {
        throw new Error("Dice overlay host element not found");
      }

      this.box = new DiceBox({
        container: `#${CANVAS_HOST_ID}`,
        assetPath: "/assets/dice-box/",
        scale: 8,
        theme: "default",
        themeColor: "#4b2a6f"
      });

      await this.box.init();
    })();

    return this.readyPromise;
  }

  async roll(notation: string): Promise<DiceRollResult> {
    if (this.rolling) {
      throw new Error("Dice are already rolling");
    }

    await this.init();
    this.showOverlay();
    this.setStatus(`Rolling ${notation}...`);
    this.box?.clear();
    this.rolling = true;

    return new Promise<DiceRollResult>((resolve) => {
      if (this.box == null) {
        resolve({ notation, total: 0, values: [] });
        return;
      }

      this.box.onRollComplete = (results: unknown) => {
        const total = readTotal(results);
        const values = readValues(results);

        window.setTimeout(() => {
          this.setStatus(`Total ${total}`);
          this.rolling = false;
          resolve({ notation, total, values });

          if (this.hideTimer != null) {
            window.clearTimeout(this.hideTimer);
          }

          this.hideTimer = window.setTimeout(() => {
            this.hide();
          }, HIDE_DELAY_MS);
        }, RESULT_DELAY_MS);
      };

      this.box.roll(notation);
    });
  }
}

export const diceController = new DiceController();
