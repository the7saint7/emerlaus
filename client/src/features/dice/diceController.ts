import type { DiceRollResult } from "./diceTypes";

const OVERLAY_ID_PREFIX = "dice-roll-overlay";
const CANVAS_HOST_ID_PREFIX = "dice-roll-canvas-host";
const RESULT_DELAY_MS = 1100;
const HIDE_DELAY_MS = 3200;
const ROLL_TIMEOUT_MS = 5000;
const DEFAULT_THEME_COLOR = "#4b2a6f";
const DEFAULT_SCALE = 15;

export interface DiceStagePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DiceRollGroup {
  rollsArray?: Array<{ value?: number }>;
  value?: number;
}

type ForcedDieNotation = Record<string, unknown>;

interface RollOptions {
  resolvedResult?: Partial<DiceRollResult>;
  themeColor?: string;
  placement?: DiceStagePlacement | null;
}

interface ActiveRollOverlay {
  overlay: HTMLDivElement;
  box: import("@3d-dice/dice-box").default;
  hideTimer: number | null;
}

interface DiceBoxResolvedRoll {
  value?: number;
}

interface DiceBoxResolvedGroup {
  value?: number;
  modifier?: number;
  rolls?: DiceBoxResolvedRoll[];
  rollsArray?: DiceBoxResolvedRoll[];
}

function logDiceDebug(message: string): void {
  const patchLogger = (
    window as typeof window & {
      __emerlausDicePatchLog?: (message: string) => void;
    }
  ).__emerlausDicePatchLog;

  patchLogger?.(message);
}

function stringifyRawPayload(payload: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      payload,
      (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular]";
          }

          seen.add(value);
        }

        return value;
      }
    ) ?? "null";
  } catch {
    return "[Unserializable payload]";
  }
}

function createOverlayMarkup(idSuffix: string): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = `${OVERLAY_ID_PREFIX}-${idSuffix}`;
  overlay.className = "dice-roll-overlay dice-roll-overlay--hidden";
  overlay.innerHTML = `
    <div class="dice-roll-stage">
      <div id="${CANVAS_HOST_ID_PREFIX}-${idSuffix}" class="dice-roll-canvas-host"></div>
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

function normalizeResolvedResults(results: unknown): DiceBoxResolvedGroup[] {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.flatMap((group) => {
    if (group == null || typeof group !== "object") {
      return [];
    }

    const typedGroup = group as DiceBoxResolvedGroup;
    const rolls =
      Array.isArray(typedGroup.rollsArray)
        ? typedGroup.rollsArray
        : Array.isArray(typedGroup.rolls)
          ? typedGroup.rolls
          : [];

    const rollValues = rolls.flatMap((roll) =>
      typeof roll?.value === "number" ? [roll.value] : []
    );
    const modifier = typeof typedGroup.modifier === "number" ? typedGroup.modifier : 0;
    const fallbackValue =
      typeof typedGroup.value === "number"
        ? typedGroup.value
        : rollValues.reduce((sum, value) => sum + value, 0) + modifier;

    return [{
      value: fallbackValue,
      rollsArray: rollValues.map((value) => ({ value }))
    }];
  });
}

function buildForcedRollNotation(
  notation: string,
  values: number[]
): ForcedDieNotation[] | null {
  const match = notation.match(/^(\d+)d(\d+)$/i);
  if (match == null) {
    return null;
  }

  const quantity = Number(match[1]);
  const sides = Number(match[2]);
  if (!Number.isInteger(quantity) || !Number.isInteger(sides) || values.length !== quantity) {
    return null;
  }

  const groupId = Math.floor(Math.random() * 1_000_000_000);
  return values.map((value) => ({
    sides,
    qty: 1,
    value,
    groupId
  }));
}

class DiceController {
  private DiceBoxCtor: typeof import("@3d-dice/dice-box").default | null = null;
  private readyPromise: Promise<void> | null = null;
  private activeOverlays = new Set<ActiveRollOverlay>();

  async init(): Promise<void> {
    if (this.readyPromise != null) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      const imported = await import("@3d-dice/dice-box");
      this.DiceBoxCtor = imported.default;
    })();

    return this.readyPromise;
  }

  private setStatus(overlay: HTMLDivElement, content: string): void {
    const status = overlay.querySelector<HTMLElement>("[data-dice-status='true']");
    if (status != null) {
      status.textContent = content;
    }
  }

  private setStagePlacement(overlay: HTMLDivElement, placement?: DiceStagePlacement | null): void {
    const stage = overlay.querySelector<HTMLElement>(".dice-roll-stage");
    if (stage == null) {
      return;
    }

    if (placement == null) {
      stage.style.left = "";
      stage.style.top = "";
      stage.style.width = "";
      stage.style.height = "";
      return;
    }

    stage.style.left = `${placement.left}px`;
    stage.style.top = `${placement.top}px`;
    stage.style.width = `${placement.width}px`;
    stage.style.height = `${placement.height}px`;
  }

  private showOverlay(overlay: HTMLDivElement): void {
    overlay.classList.remove("dice-roll-overlay--hidden");
  }

  private cleanupOverlay(activeOverlay: ActiveRollOverlay): void {
    if (activeOverlay.hideTimer != null) {
      window.clearTimeout(activeOverlay.hideTimer);
    }

    activeOverlay.box.clear();
    activeOverlay.overlay.remove();
    this.activeOverlays.delete(activeOverlay);
  }

  hide(): void {
    for (const activeOverlay of [...this.activeOverlays]) {
      this.cleanupOverlay(activeOverlay);
    }
  }

  async roll(notation: string, options?: RollOptions): Promise<DiceRollResult> {
    const normalizedNotation = notation.trim().toLowerCase();
    await this.init();
    if (this.DiceBoxCtor == null) {
      return {
        notation: normalizedNotation,
        total: 0,
        values: [],
        animatedTotal: 0,
        animatedValues: [],
        rawPayload: "[]"
      };
    }

    const idSuffix = crypto.randomUUID();
    const overlay = createOverlayMarkup(idSuffix);
    const hostId = `${CANVAS_HOST_ID_PREFIX}-${idSuffix}`;
    this.setStagePlacement(overlay, options?.placement ?? null);
    this.showOverlay(overlay);
    this.setStatus(overlay, `Rolling ${normalizedNotation}...`);

    const box = new this.DiceBoxCtor({
      container: `#${hostId}`,
      assetPath: "/assets/dice-box/",
      offscreen: false,
      scale: DEFAULT_SCALE,
      theme: "default",
      themeColor: options?.themeColor ?? DEFAULT_THEME_COLOR
    });

    await box.init();
    box.updateConfig?.({
      themeColor: options?.themeColor ?? DEFAULT_THEME_COLOR
    });

    const activeOverlay: ActiveRollOverlay = {
      overlay,
      box,
      hideTimer: null
    };
    this.activeOverlays.add(activeOverlay);

    return new Promise<DiceRollResult>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;

      const finalizeResult = (result: DiceRollResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        if (timeoutId != null) {
          window.clearTimeout(timeoutId);
        }

        resolve(result);
        activeOverlay.hideTimer = window.setTimeout(() => {
          this.cleanupOverlay(activeOverlay);
        }, HIDE_DELAY_MS);
      };

      const forcedRollNotation =
        options?.resolvedResult?.values != null
          ? buildForcedRollNotation(normalizedNotation, options.resolvedResult.values)
          : null;

      logDiceDebug(
        `[diceController.roll] notation=${normalizedNotation} forced=${forcedRollNotation != null} expectedTotal=${options?.resolvedResult?.total ?? "n/a"} expectedValues=${options?.resolvedResult?.values?.join(",") ?? "n/a"} payload=${forcedRollNotation != null ? stringifyRawPayload(forcedRollNotation) : "\"string-notation\""}`
      );

      timeoutId = window.setTimeout(() => {
        const total = options?.resolvedResult?.total ?? 0;
        const values = options?.resolvedResult?.values ?? [];
        const timeoutPayload = stringifyRawPayload({
          timeout: true,
          expectedTotal: total,
          expectedValues: values
        });

        logDiceDebug(
          `[diceController.roll] timeout notation=${normalizedNotation} expectedTotal=${total} expectedValues=${values.join(",") || "n/a"}`
        );
        this.setStatus(overlay, `Total ${total}`);
        finalizeResult({
          notation: normalizedNotation,
          total,
          values,
          animatedTotal: total,
          animatedValues: values,
          rawPayload: timeoutPayload
        });
      }, ROLL_TIMEOUT_MS);

      void box.roll(forcedRollNotation ?? normalizedNotation)
        .then((results: unknown) => {
          const normalizedResults = normalizeResolvedResults(results);
          const animatedTotal = readTotal(normalizedResults);
          const animatedValues = readValues(normalizedResults);
          const rawPayload = stringifyRawPayload(results);
          const total = options?.resolvedResult?.total ?? animatedTotal;
          const values = options?.resolvedResult?.values ?? animatedValues;

          window.setTimeout(() => {
            this.setStatus(overlay, `Total ${total}`);
            finalizeResult({
              notation: normalizedNotation,
              total,
              values,
              animatedTotal,
              animatedValues,
              rawPayload
            });
          }, RESULT_DELAY_MS);
        })
        .catch((error: unknown) => {
          const total = options?.resolvedResult?.total ?? 0;
          const values = options?.resolvedResult?.values ?? [];
          const rawPayload = stringifyRawPayload({
            error: error instanceof Error ? error.message : String(error)
          });

          this.setStatus(overlay, `Total ${total}`);
          finalizeResult({
            notation: normalizedNotation,
            total,
            values,
            animatedTotal: total,
            animatedValues: values,
            rawPayload
          });
        });
    });
  }
}

export const diceController = new DiceController();
