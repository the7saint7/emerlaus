import type { DiceRollResult } from "./diceTypes";

const SPIN_MS = 900;
const RESULT_DELAY_MS = 200;
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
  timeScale?: number;
}

interface ActiveRollOverlay {
  overlay: HTMLDivElement;
  hideTimer: number | null;
}

interface FaceRotation { x: number; y: number; z: number }

interface ParsedDieTerm {
  qty: number;
  sides: number;
  isD100: boolean;
}

interface AnimatedDieTarget {
  sides: number;
  value: number;
}

const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20]);

// Face rotations from deltacalculator.com — calibrated for their geometry and
// the per-type wrapper viewing angles (.die-shell--dN).
// x/y get extra 360° multiples added for the spin animation; z stays fixed.
const diceFaceRotations: Record<number, FaceRotation[]> = {
  4: [
    { x:   5, y:   0, z:    0 },  // face 1 ✓
    { x:   5, y:   0, z: -120 },  // face 2 (derived from 120° tetrahedron symmetry — verify)
    { x:   5, y:   0, z:  120 },  // face 3 (derived from 120° tetrahedron symmetry — verify)
    { x: 115, y:   0, z:   60 },  // face 4 ✓
  ],
  6: [
    { x:  90, y:   0, z:   0 },   // face 1
    { x: 270, y:   0, z: 180 },   // face 2
    { x: 180, y: 270, z:  90 },   // face 3
    { x:   0, y:  90, z:  90 },   // face 4
    { x: 180, y:   0, z:   0 },   // face 5
    { x:   0, y:   0, z:   0 },   // face 6 ✓
  ],
  8: [
    { x:  45, y: 180, z:   0 },   // face 1 ✓
    { x:  45, y:   0, z:   0 },   // face 2
    { x:  45, y:  90, z:   0 },   // face 3
    { x:  45, y: 270, z:   0 },   // face 4
    { x:  45, y: 180, z: 180 },   // face 5
    { x:  45, y:   0, z: 180 },   // face 6
    { x:  45, y: 270, z: 180 },   // face 7
    { x:  45, y:  90, z: 180 },   // face 8
  ],
  10: [
    { x:   5, y:  -36, z:   0 },
    { x:   5, y:  -36, z: 288 },
    { x:   5, y:  -36, z: 216 },
    { x:   5, y:  -36, z: 144 },
    { x:   5, y:  -36, z:  72 },
    { x:   5, y:  144, z: 324 },
    { x:   5, y:  144, z: 252 },
    { x:   5, y:  144, z: 180 },
    { x:   5, y:  144, z: 108 },
    { x:   5, y:  144, z:  36 },
  ],
  12: [
    { x:    0,   y:   0, z: 180 },  // face 1  ✓
    { x: 121.72, y:   0, z:   0 },  // face 2  ✓
    { x: 121.72, y: 288, z:   0 },  // face 3  ✓
    { x: 121.72, y: 216, z:   0 },  // face 4  ✓
    { x: 121.72, y: 144, z:   0 },  // face 5  ✓
    { x: 121.72, y:  72, z:   0 },  // face 6  ✓
    { x:    0,   y: 180, z:   0 },  // face 7  (was face 12)
    { x: -58.28, y:   0, z:   0 },  // face 8  ✓
    { x: -58.28, y:  72, z:   0 },  // face 9  ✓
    { x: -58.28, y: 144, z:   0 },  // face 10 ✓
    { x: -58.28, y: 288, z:   0 },  // face 11 ✓
    { x: -58.28, y: 216, z:   0 },  // face 12 (was face 7)
  ],
  20: [
    { x:  100, y:    0, z:   30 },
    { x:  100, y:    0, z:  -42 },
    { x:  100, y:    0, z:  244 },
    { x:  100, y:    0, z:  172 },
    { x:  100, y:    0, z:  102 },
    { x:  -15, y:  -25, z:  168 },
    { x:  -15, y:  160, z: -130 },
    { x:  -15, y:  -25, z: -120 },
    { x:  -15, y:  160, z:  -60 },
    { x:  -15, y:  -25, z:  -50 },
    { x:  -15, y:  160, z:   10 },
    { x:  -15, y:  -25, z:   25 },
    { x:  -15, y:  160, z:   85 },
    { x:  -15, y:  -25, z:   95 },
    { x:  -15, y:  160, z:  155 },
    { x:  -85, y:    0, z:  180 },
    { x:  -85, y:    0, z:  252 },
    { x:  -85, y:    0, z:  -33 },
    { x:  -85, y:    0, z:   39 },
    { x:  -85, y:    0, z:  111 },
  ],
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scaleDuration(ms: number, timeScale: number): number {
  const clampedScale = Math.max(0.1, timeScale);
  return Math.max(1, Math.round(ms / clampedScale));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseNotation(raw: string): ParsedDieTerm[] | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (normalized.length === 0) {
    return null;
  }

  const parsedTerms: ParsedDieTerm[] = [];
  for (const term of normalized.split("+")) {
    if (/^1?d100$/i.test(term)) {
      parsedTerms.push({ qty: 1, sides: 100, isD100: true });
      continue;
    }

    const match = term.match(/^(\d+)d(\d+)$/i);
    if (!match) {
      return null;
    }

    const qty = Number(match[1]);
    const sides = Number(match[2]);
    if (!Number.isInteger(qty) || !Number.isInteger(sides) || !SUPPORTED_SIDES.has(sides)) {
      return null;
    }

    parsedTerms.push({ qty, sides, isD100: false });
  }

  return parsedTerms;
}

// For D100: total 1-100 → [tens die face (1-10), units die face (1-10)]
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

// Creates a shell > solid > faces structure matching the CSS geometry.
// The shell provides the fixed viewing angle; the solid is what gets animated.
function createDieEl(sides: number, color: string): HTMLDivElement {
  const shell = document.createElement("div");
  shell.className = `die-shell die-shell--d${sides}`;
  shell.style.setProperty("--die-color", color);

  const solid = document.createElement("div");
  solid.className = `die-solid die-solid--d${sides}`;

  for (let i = 0; i < sides; i++) {
    const face = document.createElement("div");
    face.className = `die-face die-face--d${sides}`;
    const label = document.createElement("span");
    label.className = `die-label die-label--d${sides}`;
    label.textContent = String(i + 1);
    face.appendChild(label);
    solid.appendChild(face);
  }

  shell.appendChild(solid);
  return shell;
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
    const timeScale = options?.timeScale ?? 1;
    const spinMs = scaleDuration(SPIN_MS, timeScale);
    const resultDelayMs = scaleDuration(RESULT_DELAY_MS, timeScale);
    const hideDelayMs = scaleDuration(HIDE_DELAY_MS, timeScale);
    const hideFadeMs = scaleDuration(HIDE_FADE_MS, timeScale);
    const minStaggerMs = scaleDuration(60, timeScale);
    const maxStaggerMs = scaleDuration(MAX_STAGGER_MS, timeScale);
    const parsedTerms = parseNotation(normalized);

    if (!parsedTerms) {
      return {
        notation: normalized,
        total,
        values,
        animatedTotal: total,
        animatedValues: values,
        rawPayload: "{}"
      };
    }

    const faceTargets: AnimatedDieTarget[] = [];
    let valueIndex = 0;
    for (const term of parsedTerms) {
      if (term.isD100) {
        const d100Total = values[valueIndex] ?? 1;
        valueIndex += 1;
        const [tens, units] = d100Faces(d100Total);
        faceTargets.push(
          { sides: 10, value: tens },
          { sides: 10, value: units }
        );
        continue;
      }

      for (let index = 0; index < term.qty; index += 1) {
        faceTargets.push({
          sides: term.sides,
          value: values[valueIndex] ?? 1
        });
        valueIndex += 1;
      }
    }

    const idSuffix = crypto.randomUUID();
    const overlay = buildOverlay(idSuffix);
    overlay.style.setProperty("--dice-spin-ms", `${spinMs}ms`);
    overlay.style.setProperty("--dice-fade-ms", `${hideFadeMs}ms`);
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

      const shellEls = faceTargets.map((target) => createDieEl(target.sides, color));
      for (const el of shellEls) {
        dieArea.appendChild(el);
      }

      // Guarantee the browser paints the die in its initial state before applying
      // the transform, otherwise the CSS transition has nothing to animate from.
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { requestAnimationFrame(() => { resolve(); }); }); });

      await Promise.all(shellEls.map(async (shellEl, i) => {
        const stagger = i === 0 ? 0 : randomInt(minStaggerMs, maxStaggerMs);
        await delay(stagger);

        const faceIndex = faceTargets[i].value - 1;
        const rotTable = diceFaceRotations[faceTargets[i].sides];
        const solid = shellEl.querySelector<HTMLElement>(".die-solid");

        if (solid && rotTable?.[faceIndex]) {
          const rot = rotTable[faceIndex];
          // Add 1–2 extra full rotations on X and Y so the die visibly spins
          // before decelerating onto the target face (Z stays fixed per DeltaCalculator).
          const extraX = 360 * randomInt(1, 2);
          const extraY = 360 * randomInt(1, 2);
          solid.style.transform =
            `rotateX(${rot.x + extraX}deg) rotateY(${rot.y + extraY}deg) rotateZ(${rot.z}deg)`;
        }

        await delay(spinMs);
      }));
    }

    await delay(resultDelayMs);
    setStatus(overlay, `Total ${total}`);

    active.hideTimer = window.setTimeout(() => {
      overlay.classList.add("dice-roll-overlay--hidden");
      window.setTimeout(() => this.cleanupOverlay(active), hideFadeMs);
    }, hideDelayMs);

    return {
      notation: normalized,
      total,
      values,
      animatedTotal: total,
      animatedValues: faceTargets.map((target) => target.value),
      rawPayload: "{}"
    };
  }
}

export const diceController = new DiceController();
