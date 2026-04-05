import type { DiceRollResult } from "./diceTypes";

const ROLL_ANIM_MS = 2500;
const FACE_SETTLE_MS = 500;
const RESULT_DELAY_MS = 500;
const HIDE_DELAY_MS = 2000;
const HIDE_FADE_MS = 300;
const MAX_STAGGER_MS = 400;
const BASE_DIE_SIZE = 120;
const DIE_GAP = 14;

export interface DiceStagePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RollOptions {
  resolvedResult?: Partial<DiceRollResult>;
  themeColor?: string;
  placement?: DiceStagePlacement | null;
}

interface ActiveRollOverlay {
  overlay: HTMLDivElement;
  hideTimer: number | null;
}

const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseNotation(raw: string): { qty: number; sides: number; isD100: boolean } | null {
  if (/^1?d100$/i.test(raw)) {
    return { qty: 2, sides: 10, isD100: true };
  }

  const match = raw.match(/^(\d+)d(\d+)$/i);
  if (!match) {
    return null;
  }

  const qty = Number(match[1]);
  const sides = Number(match[2]);
  if (!Number.isInteger(qty) || !Number.isInteger(sides) || !SUPPORTED_SIDES.has(sides)) {
    return null;
  }

  return { qty, sides, isD100: false };
}

// For D100: total 1-100 → [tens die face (1-10), units die face (1-10)]
// Face 10 represents "0" on a D10
function d100Faces(total: number): [number, number] {
  const clamped = Math.max(1, Math.min(100, total));
  const tens = Math.floor(clamped / 10) % 10;
  const units = clamped % 10;
  return [tens === 0 ? 10 : tens, units === 0 ? 10 : units];
}

function computeScale(dieCount: number, stageWidth: number): number {
  const needed = dieCount * BASE_DIE_SIZE + Math.max(0, dieCount - 1) * DIE_GAP;
  return needed <= stageWidth ? 1 : stageWidth / needed;
}

function createDieEl(sides: number, color: string): HTMLDivElement {
  const die = document.createElement("div");
  die.className = `css-die css-die--d${sides}`;
  die.style.setProperty("--die-color", color);
  for (let i = 0; i < sides; i++) {
    die.appendChild(document.createElement("figure"));
  }

  return die;
}

function buildOverlay(idSuffix: string): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.id = `dice-roll-overlay-${idSuffix}`;
  overlay.className = "dice-roll-overlay dice-roll-overlay--hidden";
  overlay.innerHTML = `
    <div class="dice-roll-stage">
      <div class="dice-roll-die-area"></div>
      <div class="dice-roll-status" data-dice-status="true">\u00a0</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setStatus(overlay: HTMLDivElement, text: string): void {
  const el = overlay.querySelector<HTMLElement>("[data-dice-status='true']");
  if (el) {
    el.textContent = text;
  }
}

function applyStagePlacement(overlay: HTMLDivElement, placement: DiceStagePlacement | null | undefined): void {
  const stage = overlay.querySelector<HTMLElement>(".dice-roll-stage");
  if (!stage) {
    return;
  }

  if (!placement) {
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

class DiceController {
  private activeOverlays = new Set<ActiveRollOverlay>();

  init(): Promise<void> {
    return Promise.resolve();
  }

  hide(): void {
    for (const active of [...this.activeOverlays]) {
      this.cleanupOverlay(active);
    }
  }

  private cleanupOverlay(active: ActiveRollOverlay): void {
    if (active.hideTimer != null) {
      window.clearTimeout(active.hideTimer);
    }

    active.overlay.remove();
    this.activeOverlays.delete(active);
  }

  async roll(notation: string, options?: RollOptions): Promise<DiceRollResult> {
    const normalized = notation.trim().toLowerCase();
    const total = options?.resolvedResult?.total ?? 0;
    const values = options?.resolvedResult?.values ?? [];
    const color = options?.themeColor ?? "#4b2a6f";
    const parsed = parseNotation(normalized);

    if (!parsed) {
      return {
        notation: normalized,
        total,
        values,
        animatedTotal: total,
        animatedValues: values,
        rawPayload: "{}"
      };
    }

    const faceTargets: number[] = parsed.isD100
      ? d100Faces(total)
      : Array.from({ length: parsed.qty }, (_, i) => values[i] ?? 1);

    const idSuffix = crypto.randomUUID();
    const overlay = buildOverlay(idSuffix);
    applyStagePlacement(overlay, options?.placement);
    overlay.classList.remove("dice-roll-overlay--hidden");
    setStatus(overlay, `Rolling ${normalized.toUpperCase()}\u2026`);

    const active: ActiveRollOverlay = { overlay, hideTimer: null };
    this.activeOverlays.add(active);

    const dieArea = overlay.querySelector<HTMLElement>(".dice-roll-die-area");
    if (dieArea) {
      const stageWidth = options?.placement?.width ?? 260;
      const scale = computeScale(faceTargets.length, stageWidth);
      if (scale < 1) {
        dieArea.style.transformOrigin = "top center";
        dieArea.style.transform = `scale(${scale.toFixed(3)})`;
      }

      const dieEls = faceTargets.map(() => createDieEl(parsed.sides, color));
      for (const el of dieEls) {
        dieArea.appendChild(el);
      }

      await Promise.all(dieEls.map(async (dieEl, i) => {
        const stagger = i === 0 ? 0 : randomInt(60, MAX_STAGGER_MS);
        await delay(stagger);
        dieEl.classList.add("rolling");
        await delay(ROLL_ANIM_MS);
        dieEl.classList.remove("rolling");
        dieEl.setAttribute("data-face", String(faceTargets[i]));
        await delay(FACE_SETTLE_MS);
      }));
    }

    await delay(RESULT_DELAY_MS);
    setStatus(overlay, `Total ${total}`);

    active.hideTimer = window.setTimeout(() => {
      overlay.classList.add("dice-roll-overlay--hidden");
      window.setTimeout(() => this.cleanupOverlay(active), HIDE_FADE_MS);
    }, HIDE_DELAY_MS);

    return {
      notation: normalized,
      total,
      values,
      animatedTotal: total,
      animatedValues: faceTargets,
      rawPayload: "{}"
    };
  }
}

export const diceController = new DiceController();
