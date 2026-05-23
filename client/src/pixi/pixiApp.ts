import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { acknowledgePendingHandInspection, acknowledgePendingPublicHandReveal, devDrawCard, disconnectFromMatch, fetchMatch, fireObject, joinMatch, passForcedFollowUp, persistClientLogSnapshot, playCard, requestAddBot, requestKickPlayer, requestStartMatch, requestUpdateExpansion, resolvePendingBoardResetKeep, resolvePendingCurseRelease, resolvePendingDeathSearch, resolvePendingPickpocket, resolvePendingSacrificeChoice, resolvePendingSorcellerieSacrificeChoice, resolvePendingOrdreInterrupt, respondToPendingAction, selectPendingObject, submitBugReport } from "../api/gameApi";
import { createDiscordSession } from "../discord/session";
import {
  canDiscardCard,
  canDropIntoResponseSlot,
  canPassPendingResponse,
  canLoadMassAttackStaff,
  cardIsLiftPlayable,
  cardNeedsArrow,
  getEffectiveInteractionTargets,
  getCollectiveAnnulationPrompt,
  getResponseChoiceForCard,
  isSeatTargetable,
  objectCardMatchesSelectedTargeting,
  shouldHighlightOrdreDemmerlausResponse
} from "../gameplay/interactionRules";
import { getCardImageVariantUrl, getImportedCardImageUrl, getLocalizedCardImageUrl, getLocalizedCategoryLabel, loadStoredLanguage, localizeCardDisabledReason, localizeMatchState, localizeSeatState, persistLanguage, t, type AppLanguage, type CardImageVariant } from "../i18n";
import { diceController, type DiceStagePlacement } from "../features/dice/diceController";
import { getSeatDiceColor } from "../features/dice/diceSeatColors";
import { getOpponentAnchorsForPlayerCount } from "../render/opponentLayout";
import { buildEventLogEntries, type EventLogEntry } from "../render/eventLog";
import {
  allCardDefinitions,
  baseCardDefinitions,
  abondanceCardDefinitions,
  communionCardDefinitions,
  puissanceCardDefinitions,
  sorcellerieCardDefinitions
} from "../../../shared/cards";
import { getLocalSeat, getOpponentSeats } from "../../../shared/seating";
import type { ActionStartEvent, CardView, CombatPresentationEvent, DiceRollPlaybackEvent, ExpansionKey, ForcedFollowUpState, GameEvent, MatchState, PendingBoardResetKeepState, PendingCurseReleaseState, PendingDeathSearchState, PendingHandInspectionState, PendingObjectChoiceState, PendingPickpocketState, PendingPublicHandRevealState, PendingSacrificeChoiceState, PendingSorcellerieSacrificeChoiceState, PendingOrdreInterruptState, SeatSessionStats, SeatState, TelekinesieProjectCardEvent, TelekinesieSequenceEvent } from "../../../shared/types";

const STAGE_WIDTH = 1600;
const STAGE_HEIGHT = 900;
const SPECTATOR_SEAT_NUMBER = 0;
const SPECTATOR_LAYOUT_SEAT_NUMBER = 1;
const POLL_INTERVAL_MS = 2500;
const ATTACK_STAFF_CARD_ID = "baton-dattaque";
const SEEN_CHANGELOG_VERSION_STORAGE_KEY = "emerlaus:seenChangelogVersion";
const FROZEN_SEAT_FX_URL = "/assets/effects/frozen-seat-fx.png";
const SLEEP_STATUS_CARD_IDS = new Set<string>(["sommeil"]);
const FROZEN_STATUS_CARD_IDS = new Set<string>([
  "engelure",
  "flechette-glacee",
  "rayon-glacial",
  "refroidissement",
  "sculpture-de-glace",
  "zero-absolu"
]);

function isAttackStaffObjectCard(card: CardView | undefined): card is CardView {
  return card?.cardId === ATTACK_STAFF_CARD_ID && card.zone === "object";
}
function renderDefenseTooltip(card: CardView, language: AppLanguage): string {
  const defenseBand = card.defenseBand;
  if (defenseBand == null) {
    return "";
  }

  return `
    <div class="card-tooltip-defense">
      <span class="card-defense-pill card-defense-pill--${defenseBand.resistance.color}">
        ${t(language, "defense.resist")} ${defenseBand.resistance.color === "red" ? t(language, "defense.notAvailable") : `${Math.max(1, defenseBand.resistance.rollsRequired)}x`}
      </span>
      <span class="card-defense-pill ${defenseBand.resistanceAccrueAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        ${t(language, "defense.ra")} ${defenseBand.resistanceAccrueAllowed ? t(language, "defense.yes") : t(language, "defense.no")}
      </span>
      <span class="card-defense-pill ${defenseBand.annulationAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        ${t(language, "defense.cancel")} ${defenseBand.annulationAllowed ? `${Math.max(1, defenseBand.annulationCardsRequired)}x` : t(language, "defense.no")}
      </span>
      <span class="card-defense-pill ${defenseBand.mirrorAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        ${t(language, "defense.mirror")} ${defenseBand.mirrorAllowed ? t(language, "defense.yes") : t(language, "defense.no")}
      </span>
    </div>
  `;
}

const EXPANSION_DECKS: Array<{ key: ExpansionKey; label: string; available: boolean }> = [
  { key: "sorcellerie", label: "Sorcellerie", available: true },
  { key: "invocation", label: "Invocation", available: false },
  { key: "abondance", label: "Abondance", available: true },
  { key: "puissance", label: "Puissance", available: true },
  { key: "communion", label: "Communion", available: true },
  { key: "destin", label: "Destin", available: false },
  { key: "compagnons", label: "Compagnons", available: false },
  { key: "allies", label: "Allies", available: false }
];

const DEV_DRAW_SEPARATOR_PREFIX = "__separator__:";
const DEV_DRAW_GROUPS = [
  { key: "base", label: "Base", cards: baseCardDefinitions },
  { key: "sorcellerie", label: "Sorcellerie", cards: sorcellerieCardDefinitions },
  { key: "abondance", label: "Abondance", cards: abondanceCardDefinitions },
  { key: "puissance", label: "Puissance", cards: puissanceCardDefinitions },
  { key: "communion", label: "Communion", cards: communionCardDefinitions }
] as const;

interface PixiStageMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
  isLandscape: boolean;
}

interface StagePoint {
  x: number;
  y: number;
}

interface PixiDragHoverTarget {
  kind: "discard" | "play-slot" | "response-slot" | "seat" | "object";
  seatNumber?: number;
  objectInstanceId?: string;
}

interface PixiArrowDragState {
  source: "hand" | "object";
  cardInstanceId: string;
  originX: number;
  originY: number;
  pointerX: number;
  pointerY: number;
  nearestSeatNumber: number | null;
  nearestObjectInstanceId: string | null;
}

interface PixiInteractionState {
  hoveredCardInstanceId: string;
  draggingCardInstanceId: string;
  dragPointerX: number;
  dragPointerY: number;
  dragHoverTarget: PixiDragHoverTarget | null;
  arrowDrag: PixiArrowDragState | null;
}

interface HandCardLayout {
  card: CardView;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  zIndex: number;
  opacity?: number;
}

interface SeatTargetGeometry {
  seatNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface RectGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ObjectTargetGeometry extends RectGeometry {
  seatNumber: number;
  objectInstanceId: string;
  centerX: number;
  centerY: number;
}

interface RenderObjectRowResult {
  objectTargets: ObjectTargetGeometry[];
  inspectTargets: InspectTargetGeometry[];
}

interface InspectTargetGeometry extends RectGeometry {
  card: CardView;
  group: "center" | "response" | "object" | "status" | "hand";
}

interface TableInteractionGeometry {
  handLayouts: HandCardLayout[];
  seatTargets: SeatTargetGeometry[];
  objectTargets: ObjectTargetGeometry[];
  inspectTargets: InspectTargetGeometry[];
  playSlot: RectGeometry;
  responseSlot: RectGeometry | null;
  discardZone: RectGeometry;
  seatCenters: Map<number, StagePoint>;
  seatRects: Map<number, RectGeometry>;
}

interface CardInspectState {
  card: CardView;
  originRect: RectGeometry;
  originGroup: InspectTargetGeometry["group"] | "modal";
}

interface HandFocusTransition {
  fromCardInstanceId: string;
  toCardInstanceId: string;
  startedAt: number;
  durationMs: number;
}

interface PendingHandPress {
  cardInstanceId: string;
  startX: number;
  startY: number;
}

interface PendingObjectPress {
  cardInstanceId: string;
  startX: number;
  startY: number;
}

interface PendingAnnulationChoiceState {
  cardInstanceId: string;
  maxCount: number;
  neededCount: number;
}

interface PixiKickTarget {
  seatNumber: number;
  displayName: string;
  removesBotFromLobby: boolean;
}

interface PixiSeatKickActionTarget extends PixiKickTarget {
  leftPx: number;
  topPx: number;
}

type SeatVisualEffectId = "frozen";

interface ActiveCombatFxState {
  message: string;
  tone: "info" | "success" | "failure";
  seatNumber?: number;
}

type SeatResistancePillOutcome = "full" | "resist" | "half" | "fail" | "fail_double";

interface SeatResistancePillState {
  boxId: string;
  outcome: SeatResistancePillOutcome;
  updatedAt: number;
}

interface FloatingBurstState {
  amount: number;
  startedAt: number;
  durationMs: number;
  kind: "damage" | "heal";
}

interface ImpactFlashState {
  startedAt: number;
  durationMs: number;
}

interface CardFlightState {
  id: string;
  card: CardView | null;
  from: StagePoint;
  to: StagePoint;
  startedAt: number;
  durationMs: number;
  width: number;
  height: number;
  arcHeight: number;
  rotationFrom: number;
  rotationTo: number;
  tintColor?: string;
}

interface TelekinesieRevealCardLayout {
  card: CardView;
  x: number;
  y: number;
  width: number;
  height: number;
  isProjected: boolean;
}

interface ActiveTelekinesieRevealState {
  layouts: TelekinesieRevealCardLayout[];
  showNonProjected: boolean;
  displayMode: "large" | "thumbnail";
}

interface PlaybackArrowState {
  id: string;
  origin: StagePoint;
  target: StagePoint;
  color: string;
  width: number;
  startedAt: number;
  durationMs: number;
}

interface PendingActionPlaybackSnapshot {
  boxId: string;
  responderCardsBySeat: Record<number, CardView[]>;
}

interface SeatResponseThumbnailState {
  card: CardView;
  updatedAt: number;
}

interface ActiveActionVisualState {
  actorSeatNumber: number;
  turnSeatNumber: number;
  targetSeatNumbers: number[];
  targetObjectInstanceId?: string;
  card: CardView;
  summary: string;
  // seatNumber of mirror player → seatNumber they reflected to
  mirroredTargets?: Record<number, number>;
}

interface OpponentCursorState {
  targetSeatNumber: number | null;
  ts: number;
}

interface TurnPastilleAnimationState {
  displayedSeatNumber: number | null;
  transitionFromSeatNumber: number | null;
  transitionToSeatNumber: number | null;
  transitionStartedAt: number;
  transitionDurationMs: number;
}

interface TurnPastilleRenderState {
  x: number;
  y: number;
  progress: number;
  animating: boolean;
}

interface CachedTextureEntry {
  texture: Texture;
  lastUsedAt: number;
}

const loadedTextureByUrl = new Map<string, CachedTextureEntry>();
const requestedTextureUrls = new Set<string>();
const HAND_DRAG_START_DISTANCE = 16;
const OBJECT_DRAG_SNAP_DISTANCE = 110;
const CURSOR_THROTTLE_MS = 50;
const GHOST_TIMEOUT_MS = 500;
const TURN_PASTILLE_MOVE_MS = 540;
const POST_VICTORY_ACTIVITY_CLOSE_MS = 60_000;
const HAND_DEAL_ANIMATION_MS = 950;
const HAND_FOCUS_TRANSITION_MS = 150;
const HAND_DEAL_START_ROTATION = (-8 * Math.PI) / 180;
const LOCAL_HAND_CATEGORY_SORT_ORDER = ["A", "O", "CO", "AD", "AM", "SC", "SO", "ST", "S", "E", "CA"] as const;
const DEV_SEAT_VISUAL_EFFECT_IDS: SeatVisualEffectId[] = ["frozen"];
const MAX_RENDER_RESOLUTION = 1.25;
const MAX_TEXTURE_CACHE_SIZE = 72;
const TEXTURE_CACHE_IDLE_MS = 30_000;
let currentFrameTextureUsage = new Set<string>();
const localHandCategorySortRankByCode = new Map(LOCAL_HAND_CATEGORY_SORT_ORDER.map((code, index) => [code, index]));

function createRect(x: number, y: number, width: number, height: number, color: string, alpha = 1, radius = 0): Graphics {
  const rect = new Graphics();
  if (radius > 0) {
    rect.roundRect(x, y, width, height, radius);
  } else {
    rect.rect(x, y, width, height);
  }
  rect.fill({ color, alpha });
  return rect;
}

function createCircle(x: number, y: number, radius: number, color: string, alpha = 1): Graphics {
  return new Graphics().circle(x, y, radius).fill({ color, alpha });
}

function sortLocalHand(cards: CardView[] | undefined): CardView[] {
  if (cards == null || cards.length <= 1) {
    return cards == null ? [] : [...cards];
  }

  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const leftRank = localHandCategorySortRankByCode.get(left.card.categoryCode) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = localHandCategorySortRankByCode.get(right.card.categoryCode) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.card);
}

function createLabel(
  content: string,
  x: number,
  y: number,
  style: Partial<ConstructorParameters<typeof TextStyle>[0]>,
  anchorX = 0,
  anchorY = 0
): Text {
  const label = new Text({
    text: content,
    style: new TextStyle({
      fontFamily: "Trebuchet MS",
      fill: "#f7f0df",
      ...style
    })
  });
  label.anchor.set(anchorX, anchorY);
  label.position.set(x, y);
  return label;
}

function darkenHexColor(color: string, factor = 0.68): string {
  const normalized = color.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return color;
  }

  const red = Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(0, 2), 16) * factor)));
  const green = Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(2, 4), 16) * factor)));
  const blue = Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(4, 6), 16) * factor)));
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

function seededUnit(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isDevDrawSeparatorValue(value: string): boolean {
  return value.startsWith(DEV_DRAW_SEPARATOR_PREFIX);
}

function getEnabledDevDrawGroups(match: MatchState) {
  return DEV_DRAW_GROUPS.filter((group) =>
    group.key === "base" || match.enabledExpansions[group.key]
  );
}

function getLapidationTargetSeatNumbers(match: MatchState, localSeatNumber: number, card: CardView | undefined): number[] | undefined {
  if (card?.categoryCode !== "AD") {
    return undefined;
  }

  const markedSeats = match.seats.filter((seat) =>
    seat.isAlive !== false && (seat.statuses ?? []).some((status) => status.cardId === "lapidation")
  );
  if (markedSeats.length === 0) {
    return undefined;
  }

  return markedSeats
    .filter((seat) =>
      seat.seatNumber !== localSeatNumber
      && !(seat.objects ?? []).some((card) => card.cardId === "sanctuaire-demmerlaus")
      && !(seat.statuses ?? []).some((card) =>
        card.cardId === "potion-dinvincibilite"
        || card.cardId === "expulsion-temporaire"
        || card.cardId === "invisibilite"
      )
    )
    .map((seat) => seat.seatNumber);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getSeatInitials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// Truncates text to fit within maxPx, appending "…" if needed.
// Uses a conservative per-character estimate for bold Trebuchet MS.
function fitText(text: string, maxPx: number, fontSize: number): string {
  const charPx = fontSize * 0.62;
  const maxChars = Math.floor(maxPx / charPx);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(1, maxChars - 1)) + "…";
}

function getDisplayedHandCount(seat: SeatState): number {
  return Math.max(0, seat.handCount, seat.hand?.length ?? 0);
}

function renderHandCountTabs(
  scene: Container,
  centerX: number,
  bottomY: number,
  handCount: number,
  maxWidth: number,
  dimmed = false
): void {
  const count = Math.max(0, Math.trunc(handCount));
  const renderedCount = Math.max(1, count);
  const tabWidth = count === 0 ? 24 : 24;
  const tabHeight = count === 0 ? 24 : 24;
  const radius = 6;
  const availableWidth = Math.max(tabWidth, maxWidth);
  const minStep = tabWidth + 4;
  const step = renderedCount > 1
    ? Math.max(minStep, (availableWidth - tabWidth) / (renderedCount - 1))
    : 0;
  const totalWidth = tabWidth + Math.max(0, renderedCount - 1) * step;
  const startX = centerX - totalWidth / 2;
  const baseFill = dimmed ? "#2d3535" : "#204632";
  const innerFill = dimmed ? "#394444" : "#2d5a42";
  const borderColor = dimmed ? "#aab7b2" : "#e7d8ab";
  const lineColor = dimmed ? "#d6e1dc" : "#fff0c3";

  for (let index = 0; index < renderedCount; index += 1) {
    const x = startX + index * step;
    const tab = new Graphics();
    tab.roundRect(x, bottomY - tabHeight, tabWidth, tabHeight, radius);
    tab.fill({ color: baseFill, alpha: count === 0 ? 0.44 : 0.94 });
    tab.stroke({ color: borderColor, alpha: count === 0 ? 0.52 : 0.88, width: 1.4 });
    tab.roundRect(x + 2, bottomY - tabHeight + 2, tabWidth - 4, Math.max(8, tabHeight - 11), radius - 2);
    tab.fill({ color: innerFill, alpha: count === 0 ? 0.18 : 0.32 });
    scene.addChild(tab);
    scene.addChild(createRect(x + 4, bottomY - tabHeight + 6, tabWidth - 8, 1.4, lineColor, count === 0 ? 0.32 : 0.78, 999));
  }

  if (count === 0) {
    scene.addChild(createLabel("0", centerX, bottomY - 10, {
      fontSize: 11,
      fontWeight: "700",
      fill: "#f2ead6"
    }, 0.5, 0.5));
  }
}

function cardInstanceListsMatch(left: CardView[] | undefined, right: CardView[] | undefined): boolean {
  const leftIds = (left ?? []).map((card) => card.instanceId);
  const rightIds = (right ?? []).map((card) => card.instanceId);
  if (leftIds.length !== rightIds.length) {
    return false;
  }

  return leftIds.every((id, index) => id === rightIds[index]);
}

function cardCanHalfResist(cardId: string | undefined): boolean {
  if (cardId == null) {
    return false;
  }

  const definition = allCardDefinitions.find((candidate) => candidate.id === cardId);
  if (definition == null) {
    return false;
  }

  return definition.defenseBand?.resistance.color === "yellow"
    || definition.rules.effects.some((effect) =>
      effect.type === "damage" && effect.grantsHalfDamageOnResistance === true
    );
}

function getSeatResistancePillLabel(outcome: SeatResistancePillOutcome, language: AppLanguage): string {
  if (language === "fr") {
    switch (outcome) {
      case "full":
        return "TOTAL";
      case "resist":
        return "RESISTE";
      case "half":
        return "RESISTE 1/2";
      case "fail":
        return "RATE";
      case "fail_double":
        return "RATE x2";
    }
  }

  switch (outcome) {
    case "full":
      return "FULL";
    case "resist":
      return "RESIST";
    case "half":
      return "RESIST 1/2";
    case "fail":
      return "FAIL";
    case "fail_double":
      return "FAIL x2";
  }
}

function getSeatResistancePillColors(outcome: SeatResistancePillOutcome): { fill: string; text: string; shadow: string } {
  switch (outcome) {
    case "full":
      return { fill: "#1f8f8d", text: "#effffd", shadow: "#0d2f30" };
    case "resist":
      return { fill: "#2f6fbe", text: "#eef5ff", shadow: "#122846" };
    case "half":
      return { fill: "#b9862f", text: "#fff8e9", shadow: "#3f2910" };
    case "fail":
      return { fill: "#a43f45", text: "#fff2f2", shadow: "#391317" };
    case "fail_double":
      return { fill: "#701820", text: "#fff0f1", shadow: "#26070b" };
  }
}

function renderSeatResistancePill(
  scene: Container,
  seatRect: RectGeometry,
  isLocalSeat: boolean,
  pill: SeatResistancePillState,
  language: AppLanguage
): void {
  const label = getSeatResistancePillLabel(pill.outcome, language);
  const colors = getSeatResistancePillColors(pill.outcome);
  const pillHeight = isLocalSeat ? 34 : 28;
  const pillWidth = Math.max(isLocalSeat ? 92 : 78, Math.min(isLocalSeat ? 156 : 140, 28 + label.length * (isLocalSeat ? 9 : 8)));
  const pillX = seatRect.x + (isLocalSeat ? 18 : 12);
  const pillY = isLocalSeat
    ? seatRect.y - pillHeight - 10
    : seatRect.y - pillHeight - 12;
  const radius = pillHeight / 2;

  scene.addChild(createRect(pillX, pillY + 2, pillWidth, pillHeight, colors.shadow, 0.58, radius));
  scene.addChild(createRect(pillX, pillY, pillWidth, pillHeight, colors.fill, 0.98, radius));
  scene.addChild(createLabel(label, pillX + pillWidth / 2, pillY + pillHeight / 2, {
    fontSize: isLocalSeat ? 15 : 13,
    fontWeight: "700",
    fill: colors.text,
    letterSpacing: 0.5
  }, 0.5, 0.5));
}

function computeStageMetrics(hostElement: HTMLElement): PixiStageMetrics {
  const viewportWidth = Math.max(1, hostElement.clientWidth);
  const viewportHeight = Math.max(1, hostElement.clientHeight);
  const scale = Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT);
  const width = STAGE_WIDTH * scale;
  const height = STAGE_HEIGHT * scale;

  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height,
    scale,
    isLandscape: viewportWidth >= viewportHeight
  };
}

function pointInRect(point: StagePoint, rect: RectGeometry): boolean {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}

function rectEdgePoint(fromX: number, fromY: number, rect: RectGeometry): StagePoint {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const dx = centerX - fromX;
  const dy = centerY - fromY;
  let bestT = 1;

  const test = (t: number, x: number, y: number): void => {
    if (t > 0 && t < bestT && x >= rect.x - 1 && x <= rect.x + rect.width + 1 && y >= rect.y - 1 && y <= rect.y + rect.height + 1) {
      bestT = t;
    }
  };

  if (Math.abs(dx) > 0.1) {
    test((rect.x - fromX) / dx, rect.x, fromY + ((rect.x - fromX) / dx) * dy);
    test((rect.x + rect.width - fromX) / dx, rect.x + rect.width, fromY + ((rect.x + rect.width - fromX) / dx) * dy);
  }

  if (Math.abs(dy) > 0.1) {
    test((rect.y - fromY) / dy, fromX + ((rect.y - fromY) / dy) * dx, rect.y);
    test((rect.y + rect.height - fromY) / dy, fromX + ((rect.y + rect.height - fromY) / dy) * dx, rect.y + rect.height);
  }

  return {
    x: fromX + bestT * dx,
    y: fromY + bestT * dy
  };
}

function getLoadedTexture(imageUrl: string): Texture | null {
  if (imageUrl === "") {
    return null;
  }

  const cached = loadedTextureByUrl.get(imageUrl);
  if (cached == null) {
    return null;
  }

  cached.lastUsedAt = Date.now();
  currentFrameTextureUsage.add(imageUrl);
  return cached.texture;
}

function requestTextureLoad(imageUrl: string, onReady: () => void): void {
  if (imageUrl === "" || loadedTextureByUrl.has(imageUrl) || requestedTextureUrls.has(imageUrl)) {
    return;
  }

  requestedTextureUrls.add(imageUrl);
  void Assets.load<Texture>(imageUrl)
    .then((texture) => {
      loadedTextureByUrl.set(imageUrl, {
        texture,
        lastUsedAt: Date.now()
      });
      onReady();
    })
    .catch(() => {
      // Keep the card frame visible even if an asset path is broken.
    })
    .finally(() => {
      requestedTextureUrls.delete(imageUrl);
    });
}

function createAvatarDisplay(
  avatarUrl: string,
  cx: number,
  cy: number,
  radius: number,
  fallbackColor: string,
  fallbackInitials: string,
  onTextureReady: () => void
): Container {
  const container = new Container();
  const texture = getLoadedTexture(avatarUrl);
  if (texture != null) {
    const size = radius * 2;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(cx, cy);
    sprite.width = size;
    sprite.height = size;
    container.addChild(sprite);
  } else {
    requestTextureLoad(avatarUrl, onTextureReady);
    container.addChild(createCircle(cx, cy, radius, fallbackColor));
    container.addChild(createLabel(fallbackInitials, cx, cy, {
      fontSize: Math.round(radius * 0.55),
      fontWeight: "700"
    }, 0.5, 0.5));
  }
  return container;
}

function seatHasFrozenStatus(seat: SeatState | undefined): boolean {
  return (seat?.statuses ?? []).some((statusCard) => FROZEN_STATUS_CARD_IDS.has(statusCard.cardId));
}

function seatHasSleepStatus(seat: SeatState | undefined): boolean {
  return (seat?.statuses ?? []).some((statusCard) => SLEEP_STATUS_CARD_IDS.has(statusCard.cardId));
}

function renderFrozenSeatOverlay(
  scene: Container,
  rect: RectGeometry,
  isLocalSeat: boolean,
  _now: number,
  onTextureReady: () => void
): void {
  const pad = isLocalSeat ? 12 : 6;
  const texture = getLoadedTexture(FROZEN_SEAT_FX_URL);
  if (texture == null) {
    requestTextureLoad(FROZEN_SEAT_FX_URL, onTextureReady);
    return;
  }

  const sprite = new Sprite(texture);
  sprite.x = rect.x - pad;
  sprite.y = rect.y - pad;
  sprite.width = rect.width + pad * 2;
  sprite.height = rect.height + pad * 2;
  scene.addChild(sprite);
}

function renderSleepSeatOverlay(
  scene: Container,
  rect: RectGeometry,
  isLocalSeat: boolean,
  now: number
): void {
  const anchorX = rect.x + rect.width - (isLocalSeat ? 44 : 26);
  const anchorY = rect.y + (isLocalSeat ? 34 : 16);
  const bubble = createCircle(anchorX - (isLocalSeat ? 6 : 4), anchorY + (isLocalSeat ? 4 : 2), isLocalSeat ? 17 : 12, "#10281c", 0.88);
  scene.addChild(bubble);

  const glyphs = ["Z", "z", "z"] as const;
  for (let index = 0; index < glyphs.length; index += 1) {
    const progress = ((now + index * 260) % 1800) / 1800;
    const driftY = progress * (isLocalSeat ? 34 : 24);
    const driftX = index * (isLocalSeat ? 11 : 8) + Math.sin(progress * Math.PI) * (isLocalSeat ? 4 : 3);
    const glyph = createLabel(glyphs[index], anchorX + driftX, anchorY - driftY, {
      fontSize: isLocalSeat ? 22 - index * 2 : 16 - index,
      fontWeight: "700",
      fill: "#d9f6e5",
      stroke: { color: "#183829", width: 3 }
    }, 0.5, 0.5);
    glyph.alpha = 0.3 + (1 - progress) * 0.65;
    glyph.rotation = -0.16 + index * 0.08;
    glyph.scale.set(0.92 + progress * 0.26);
    scene.addChild(glyph);
  }
}

function getSeatVisualEffectLabel(effectId: SeatVisualEffectId, language: AppLanguage): string {
  switch (effectId) {
    case "frozen":
      return t(language, "seatFx.effect.frozen");
  }
}

function renderSeatVisualOverlay(
  scene: Container,
  rect: RectGeometry,
  isLocalSeat: boolean,
  effectId: SeatVisualEffectId,
  now: number,
  onTextureReady: () => void
): void {
  switch (effectId) {
    case "frozen":
      renderFrozenSeatOverlay(scene, rect, isLocalSeat, now, onTextureReady);
      return;
  }
}

function getSeatResponseThumbnailRect(rect: RectGeometry, isLocalSeat: boolean): RectGeometry {
  const width = isLocalSeat ? 56 : 48;
  const height = isLocalSeat ? 78 : 68;
  const x = Math.min(STAGE_WIDTH - width - 10, rect.x + rect.width + 12);
  const y = isLocalSeat
    ? rect.y + 10
    : rect.y + (rect.height - height) / 2;

  return { x, y, width, height };
}

function renderSeatResponseThumbnail(
  scene: Container,
  rect: RectGeometry,
  card: CardView,
  isLocalSeat: boolean,
  dimmed: boolean,
  onTextureReady: () => void,
  viergeReplayCard?: CardView | null
): void {
  const thumbRect = getSeatResponseThumbnailRect(rect, isLocalSeat);
  const alpha = dimmed ? 0.62 : 1;
  scene.addChild(createRect(thumbRect.x - 3, thumbRect.y - 3, thumbRect.width + 6, thumbRect.height + 6, "#0f1510", 0.46 * alpha, 14));
  scene.addChild(createRect(thumbRect.x, thumbRect.y, thumbRect.width, thumbRect.height, "#e7d8b4", alpha, 12));
  scene.addChild(createRect(thumbRect.x + 3, thumbRect.y + 3, thumbRect.width - 6, thumbRect.height - 6, "#201610", alpha, 9));

  const textureUrl = getCardTextureUrl(card, "thumb");
  const texture = getLoadedTexture(textureUrl);
  if (texture != null) {
    const sprite = new Sprite(texture);
    const fitted = fitSpriteToBox(texture, thumbRect.width - 10, thumbRect.height - 10);
    sprite.position.set(thumbRect.x + (thumbRect.width - fitted.width) / 2, thumbRect.y + (thumbRect.height - fitted.height) / 2);
    sprite.width = fitted.width;
    sprite.height = fitted.height;
    sprite.alpha = alpha;
    scene.addChild(sprite);
  } else {
    requestTextureLoad(textureUrl, onTextureReady);
    scene.addChild(createLabel("Loading", thumbRect.x + thumbRect.width / 2, thumbRect.y + thumbRect.height / 2, {
      fontSize: 8,
      fontWeight: "700",
      fill: "#d4c7ac"
    }, 0.5, 0.5));
  }

  if (card.cardId === "vierge" && viergeReplayCard != null) {
    const insetWidth = Math.max(18, thumbRect.width * 0.34);
    const insetHeight = insetWidth * 1.42;
    const insetX = thumbRect.x + thumbRect.width - insetWidth - 4;
    const insetY = thumbRect.y + 4;
    scene.addChild(
      createRect(insetX - 1.5, insetY - 1.5, insetWidth + 3, insetHeight + 3, "#eadbb8", 0.96 * alpha, 5),
      createRect(insetX, insetY, insetWidth, insetHeight, "#1a1411", alpha, 4)
    );
    const replayTextureUrl = getCardTextureUrl(viergeReplayCard, "thumb");
    const replayTexture = getLoadedTexture(replayTextureUrl);
    if (replayTexture != null) {
      const replaySprite = new Sprite(replayTexture);
      const fittedReplay = fitSpriteToBox(replayTexture, insetWidth - 4, insetHeight - 4);
      replaySprite.position.set(insetX + (insetWidth - fittedReplay.width) / 2, insetY + (insetHeight - fittedReplay.height) / 2);
      replaySprite.width = fittedReplay.width;
      replaySprite.height = fittedReplay.height;
      replaySprite.alpha = alpha;
      scene.addChild(replaySprite);
    } else {
      requestTextureLoad(replayTextureUrl, onTextureReady);
    }
  }
}

function fitSpriteToBox(texture: Texture, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const textureWidth = Math.max(1, texture.width);
  const textureHeight = Math.max(1, texture.height);
  const scale = Math.min(maxWidth / textureWidth, maxHeight / textureHeight);

  return {
    width: textureWidth * scale,
    height: textureHeight * scale
  };
}

function buildHandLayouts(
  hand: CardView[],
  interactionState: PixiInteractionState,
  focusFromCardInstanceId: string,
  focusToCardInstanceId: string,
  focusProgress: number,
  dealAnimatingUntilByCardInstanceId: ReadonlyMap<string, number>,
  now: number
): HandCardLayout[] {
  const total = hand.length;
  const centerX = STAGE_WIDTH / 2;
  const baseY = 786;
  const radius = 632;
  const spread = total <= 1 ? 0 : Math.min(34, 8 + (total - 2) * 4);
  const width = 222;
  const height = 309;
  const arrowDraggingHandCardInstanceId = interactionState.arrowDrag?.source === "hand"
    ? interactionState.arrowDrag.cardInstanceId
    : "";
  const effectiveFocusFromCardInstanceId = focusFromCardInstanceId === arrowDraggingHandCardInstanceId
    ? ""
    : focusFromCardInstanceId;
  const effectiveFocusToCardInstanceId = focusToCardInstanceId === arrowDraggingHandCardInstanceId
    ? ""
    : focusToCardInstanceId;
  const focusedCardInstanceId =
    interactionState.draggingCardInstanceId
    || effectiveFocusToCardInstanceId;

  const buildFocusModifiers = (focusCardInstanceId: string): Map<string, { offsetX: number; offsetY: number; scale: number }> => {
    const modifiers = new Map<string, { offsetX: number; offsetY: number; scale: number }>();
    const focusIndex = hand.findIndex((card) => card.instanceId === focusCardInstanceId);
    if (focusIndex < 0) {
      return modifiers;
    }

    const anglePerCard = total <= 1 ? 0 : (spread / (total - 1)) * (Math.PI / 180);
    const naturalSpacing = Math.sin(anglePerCard) * radius;
    const flatOffset = Math.max(0, (width / 2) * 1.75 + (width / 2) * 1.25 - naturalSpacing - 20);

    for (let index = 0; index < hand.length; index += 1) {
      const distance = index - focusIndex;
      const absDistance = Math.abs(distance);
      if (distance === 0) {
        modifiers.set(hand[index]!.instanceId, {
          offsetX: 0,
          offsetY: -210,
          scale: 1.75
        });
        continue;
      }

      const direction = Math.sign(distance);
      modifiers.set(hand[index]!.instanceId, {
        offsetX: direction * flatOffset,
        offsetY: absDistance === 1 ? 6 : 0,
        scale: 1.25
      });
    }

    return modifiers;
  };

  const fromModifiers = buildFocusModifiers(effectiveFocusFromCardInstanceId);
  const toModifiers = buildFocusModifiers(effectiveFocusToCardInstanceId);
  const blend = Math.max(0, Math.min(1, focusProgress));

  return hand.map((card, index) => {
    const angle = total <= 1 ? 0 : (-spread / 2 + (index / (total - 1)) * spread) * (Math.PI / 180);
    const dragging = interactionState.draggingCardInstanceId === card.instanceId;
    const fromModifier = fromModifiers.get(card.instanceId) ?? { offsetX: 0, offsetY: 0, scale: 1.25 };
    const toModifier = toModifiers.get(card.instanceId) ?? { offsetX: 0, offsetY: 0, scale: 1.25 };
    const offsetX = fromModifier.offsetX + (toModifier.offsetX - fromModifier.offsetX) * blend;
    const offsetY = fromModifier.offsetY + (toModifier.offsetY - fromModifier.offsetY) * blend;
    const focusScale = fromModifier.scale + (toModifier.scale - fromModifier.scale) * blend;
    const isFocused = focusedCardInstanceId === card.instanceId;
    const finalX = centerX + Math.sin(angle) * radius + offsetX;
    const finalY = baseY + ((1 - Math.cos(angle)) * radius) + offsetY + (dragging ? -18 : 0);
    const finalRotation = angle * 0.72;
    const dealAnimatingUntil = dealAnimatingUntilByCardInstanceId.get(card.instanceId);
    if (dealAnimatingUntil != null) {
      const progress = Math.max(0, Math.min(1, 1 - ((dealAnimatingUntil - now) / HAND_DEAL_ANIMATION_MS)));
      const eased = easeOutCubic(progress);
      const startX = -(width * 0.5) - 220;
      return {
        card,
        x: startX + ((finalX - startX) * eased),
        y: finalY + ((1 - eased) * 18),
        width,
        height,
        rotation: HAND_DEAL_START_ROTATION + ((finalRotation - HAND_DEAL_START_ROTATION) * eased),
        scale: dragging ? Math.max(1.25, focusScale) : focusScale,
        zIndex: isFocused ? 1000 : index,
        opacity: 0.16 + (0.84 * eased)
      };
    }

    return {
      card,
      x: finalX,
      y: finalY,
      width,
      height,
      rotation: finalRotation,
      scale: dragging ? Math.max(1.25, focusScale) : focusScale,
      zIndex: isFocused ? 1000 : index,
      opacity: 1
    };
  });
}

function createCardFace(
  layout: HandCardLayout,
  dimmed: boolean,
  imageVariant: CardImageVariant = "full",
  onTextureReady?: () => void,
  viergeReplayCard?: CardView | null,
  goldGlow = false,
  goldGlowPulse = 0
): Container {
  const cardContainer = new Container();
  cardContainer.position.set(layout.x, layout.y);
  cardContainer.rotation = layout.rotation;
  cardContainer.scale.set(layout.scale);
  cardContainer.alpha = (dimmed ? 0.42 : 1) * (layout.opacity ?? 1);

  if (goldGlow) {
    const pulse = Math.max(0, Math.min(1, goldGlowPulse));
    const glowExpand = 8 + pulse * 7;
    const innerExpand = 4 + pulse * 3;
    cardContainer.addChild(
      createRect(-layout.width / 2 - glowExpand, -layout.height / 2 - glowExpand, layout.width + glowExpand * 2, layout.height + glowExpand * 2, "#f5c842", 0.14 + pulse * 0.14, 24),
      createRect(-layout.width / 2 - innerExpand, -layout.height / 2 - innerExpand, layout.width + innerExpand * 2, layout.height + innerExpand * 2, "#ffd96a", 0.22 + pulse * 0.2, 20),
      createRect(-layout.width / 2 - 4, -layout.height / 2 - 4, layout.width + 8, layout.height + 8, "#f6b73c", 0.72 + pulse * 0.2, 18)
    );
  }

  const outer = createRect(-layout.width / 2, -layout.height / 2, layout.width, layout.height, "#eadbb8", 1, 16);
  const inner = createRect(-layout.width / 2 + 5, -layout.height / 2 + 5, layout.width - 10, layout.height - 10, "#271914", 1, 12);
  const artFrame = createRect(-layout.width / 2 + 8, -layout.height / 2 + 8, layout.width - 16, layout.height - 16, "#120f0d", 1, 10);
  const artContent = new Container();
  const textureUrl = getCardTextureUrl(layout.card, imageVariant);

  const texture = getLoadedTexture(textureUrl);
  if (texture != null) {
    const sprite = new Sprite(texture);
    const fitted = fitSpriteToBox(texture, layout.width - 18, layout.height - 18);
    sprite.anchor.set(0.5);
    sprite.position.set(0, 0);
    sprite.width = fitted.width;
    sprite.height = fitted.height;
    artContent.addChild(sprite);
  } else {
    requestTextureLoad(textureUrl, onTextureReady ?? (() => {}));
    artContent.addChild(createLabel("Loading", 0, 0, {
      fontSize: 12,
      fill: "#d4c7ac",
      fontWeight: "700"
    }, 0.5, 0.5));
  }

  cardContainer.addChild(outer, inner, artFrame, artContent);
  if (layout.card.cardId === "vierge" && viergeReplayCard != null) {
    const insetWidth = Math.max(34, layout.width * 0.32);
    const insetHeight = insetWidth * 1.42;
    const insetX = layout.width / 2 - insetWidth / 2 - 10;
    const insetY = -layout.height / 2 + insetHeight / 2 + 10;
    cardContainer.addChild(
      createRect(insetX - insetWidth / 2 - 2, insetY - insetHeight / 2 - 2, insetWidth + 4, insetHeight + 4, "#eadbb8", 0.96, 8),
      createRect(insetX - insetWidth / 2, insetY - insetHeight / 2, insetWidth, insetHeight, "#1a1411", 1, 6)
    );
    const replayTextureUrl = getCardTextureUrl(viergeReplayCard, "thumb");
    const replayTexture = getLoadedTexture(replayTextureUrl);
    if (replayTexture != null) {
      const replaySprite = new Sprite(replayTexture);
      const fittedReplay = fitSpriteToBox(replayTexture, insetWidth - 4, insetHeight - 4);
      replaySprite.anchor.set(0.5);
      replaySprite.position.set(insetX, insetY);
      replaySprite.width = fittedReplay.width;
      replaySprite.height = fittedReplay.height;
      cardContainer.addChild(replaySprite);
    } else {
      requestTextureLoad(replayTextureUrl, onTextureReady ?? (() => {}));
    }
  }
  return cardContainer;
}

function createCenterCardFace(
  card: CardView,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  imageVariant: CardImageVariant = "thumb",
  onTextureReady?: () => void,
  viergeReplayCard?: CardView | null
): Container {
  const layout: HandCardLayout = {
    card,
    x,
    y,
    width,
    height,
    rotation,
    scale: 1,
    zIndex: 0
  };

  return createCardFace(layout, false, imageVariant, onTextureReady, viergeReplayCard);
}

function createFlightCardFace(
  card: CardView | null,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  tintColor: string | undefined,
  onTextureReady?: () => void
): Container {
  if (card != null) {
    const flightCard = createCenterCardFace(card, x, y, width, height, rotation, "thumb", onTextureReady);
    if (tintColor != null) {
      flightCard.alpha = 0.98;
    }
    return flightCard;
  }

  const cardContainer = new Container();
  cardContainer.position.set(x, y);
  cardContainer.rotation = rotation;
  const outer = createRect(-width / 2, -height / 2, width, height, "#eadbb8", 1, 16);
  const inner = createRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, tintColor ?? "#1b2430", 1, 12);
  const artFrame = createRect(-width / 2 + 10, -height / 2 + 10, width - 20, height - 20, darkenHexColor(tintColor ?? "#5677ab", 0.64), 0.94, 10);
  const crest = createCircle(0, 0, Math.min(width, height) * 0.16, "#f5efde", 0.14);
  const stripeA = createRect(-width * 0.28, -height * 0.06, width * 0.56, height * 0.12, "#f5efde", 0.12, 999);
  const stripeB = createRect(-width * 0.12, -height * 0.29, width * 0.24, height * 0.58, "#f5efde", 0.08, 999);
  cardContainer.addChild(outer, inner, artFrame, stripeA, stripeB, crest);
  return cardContainer;
}

function renderObjectRow(
  scene: Container,
  seat: SeatState,
  centerX: number,
  topY: number,
  cardWidth: number,
  cardHeight: number,
  gap: number,
  localSeatNumber: number,
  selectedCard: CardView | undefined,
  hoverTarget: PixiDragHoverTarget | null,
  batonLoadScale?: number,
  onTextureReady?: () => void,
  viergeReplayCard?: CardView | null
): RenderObjectRowResult {
  const objects = seat.objects ?? [];
  const statuses = seat.statuses ?? [];
  const allCards: Array<{ card: CardView; isStatus: boolean }> = [
    ...objects.map((card) => ({ card, isStatus: false })),
    ...statuses.map((card) => ({ card, isStatus: true }))
  ];

  if (allCards.length === 0) {
    return {
      objectTargets: [],
      inspectTargets: []
    };
  }

  const totalWidth = allCards.length * cardWidth + Math.max(0, allCards.length - 1) * gap;
  const startX = centerX - totalWidth / 2;
  const objectTargets: ObjectTargetGeometry[] = [];
  const inspectTargets: InspectTargetGeometry[] = [];

  for (let index = 0; index < allCards.length; index += 1) {
    const { card, isStatus } = allCards[index]!;
    const x = startX + index * (cardWidth + gap);
    const y = topY;
    const cardCenterX = x + cardWidth / 2;
    const cardCenterY = y + cardHeight / 2;

    let dX = x;
    let dY = y;
    let dW = cardWidth;
    let dH = cardHeight;
    let isAmLoadHover = false;

    const targetable = objectCardMatchesSelectedTargeting(
      selectedCard,
      card,
      seat.seatNumber,
      localSeatNumber,
      seat.objects,
      viergeReplayCard ?? undefined
    );
    const hovered = hoverTarget?.kind === "object" && hoverTarget.objectInstanceId === card.instanceId;
    isAmLoadHover = !isStatus && hovered && canLoadMassAttackStaff(selectedCard, card, seat.seatNumber, localSeatNumber);
    const playableObject = !isStatus && card.canPlay === true;

    if (isAmLoadHover && batonLoadScale != null && batonLoadScale > 1) {
      dW = cardWidth * batonLoadScale;
      dH = cardHeight * batonLoadScale;
      const shiftProgress = (batonLoadScale - 1) / 0.45;
      const shiftX = -Math.round(180 * shiftProgress);
      dX = cardCenterX - dW / 2 + shiftX;
      dY = cardCenterY - dH / 2;
    }

    if (targetable) {
      if (isAmLoadHover) {
        scene.addChild(createRect(dX - 7, dY - 7, dW + 14, dH + 14, "#f5c842", 0.62, 18));
      } else {
        scene.addChild(createRect(x - 4, y - 4, cardWidth + 8, cardHeight + 8, "#f0c96d", hovered ? 0.26 : 0.12, 16));
      }
      objectTargets.push({
        seatNumber: seat.seatNumber,
        objectInstanceId: card.instanceId,
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        centerX: x + cardWidth / 2,
        centerY: y + cardHeight / 2
      });
    }

    if (playableObject) {
      scene.addChild(createRect(dX - 8, dY - 8, dW + 16, dH + 16, "#ffd34d", hovered ? 0.52 : 0.34, 18));
      scene.addChild(createRect(dX - 4, dY - 4, dW + 8, dH + 8, "#fff1a8", hovered ? 0.38 : 0.22, 14));
    }

    inspectTargets.push({
      card,
      group: isStatus ? "status" : "object",
      x,
      y,
      width: cardWidth,
      height: cardHeight
    });

    scene.addChild(createRect(dX, dY, dW, dH, "#e7d8b4", 1, 14));
    scene.addChild(createRect(dX + 4, dY + 4, dW - 8, dH - 8, "#201610", 1, 10));
    const textureUrl = getCardTextureUrl(card, "thumb");
    const texture = getLoadedTexture(textureUrl);
    if (texture != null) {
      const sprite = new Sprite(texture);
      const fitted = fitSpriteToBox(texture, dW - 12, dH - 12);
      sprite.position.set(dX + (dW - fitted.width) / 2, dY + (dH - fitted.height) / 2);
      sprite.width = fitted.width;
      sprite.height = fitted.height;
      scene.addChild(sprite);
    } else {
      requestTextureLoad(textureUrl, onTextureReady ?? (() => {}));
      scene.addChild(createLabel("Loading", cardCenterX, cardCenterY, {
        fontSize: 8,
        fontWeight: "700",
        fill: "#d4c7ac"
      }, 0.5, 0.5));
    }

    if (card.cardId === "vierge" && viergeReplayCard != null) {
      const insetWidth = Math.max(24, dW * 0.32);
      const insetHeight = insetWidth * 1.42;
      const insetX = dX + dW - insetWidth - 6;
      const insetY = dY + 6;
      scene.addChild(
        createRect(insetX - 2, insetY - 2, insetWidth + 4, insetHeight + 4, "#eadbb8", 0.96, 6),
        createRect(insetX, insetY, insetWidth, insetHeight, "#1a1411", 1, 4)
      );
      const replayTextureUrl = getCardTextureUrl(viergeReplayCard, "thumb");
      const replayTexture = getLoadedTexture(replayTextureUrl);
      if (replayTexture != null) {
        const replaySprite = new Sprite(replayTexture);
        const fittedReplay = fitSpriteToBox(replayTexture, insetWidth - 4, insetHeight - 4);
        replaySprite.position.set(insetX + (insetWidth - fittedReplay.width) / 2, insetY + (insetHeight - fittedReplay.height) / 2);
        replaySprite.width = fittedReplay.width;
        replaySprite.height = fittedReplay.height;
        scene.addChild(replaySprite);
      } else {
        requestTextureLoad(replayTextureUrl, onTextureReady ?? (() => {}));
      }
    }

    if (!isStatus && (card.attachedCardCount ?? 0) > 0) {
      scene.addChild(createRect(dX + dW - 26, dY + 6, 18, 18, "#94682a", 1, 999));
      scene.addChild(createLabel(`+${card.attachedCardCount}`, dX + dW - 17, dY + 15, {
        fontSize: 9,
        fontWeight: "700",
        fill: "#fff1c8"
      }, 0.5, 0.5));
    }

    if (isStatus && (card.remainingTurnTriggers ?? 0) > 0) {
      scene.addChild(createRect(dX + dW - 28, dY + 6, 20, 20, "#7a1f1f", 0.96, 999));
      scene.addChild(createLabel(`${card.remainingTurnTriggers}`, dX + dW - 18, dY + 16, {
        fontSize: 10,
        fontWeight: "800",
        fill: "#fff4e2"
      }, 0.5, 0.5));
    }

    if (isAmLoadHover) {
      const badgeR = Math.round(dH * 0.17);
      const badgeX = dX + dW + badgeR * 0.1;
      const badgeY = dY - badgeR * 0.1;
      scene.addChild(createRect(badgeX - badgeR, badgeY - badgeR, badgeR * 2, badgeR * 2, "#f5c842", 1, badgeR));
      scene.addChild(createLabel("+", badgeX, badgeY, {
        fontSize: Math.round(badgeR * 1.4),
        fontWeight: "900",
        fill: "#1a1200"
      }, 0.5, 0.5));
    }
  }

  return {
    objectTargets,
    inspectTargets
  };
}

function createCurvedArrow(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  color: string,
  width: number,
  centerHeadOnTarget = true
): Graphics {
  const arrow = new Graphics();
  const borderColor = darkenHexColor(color);
  const borderWidth = Math.max(3, Math.round(width * 0.34));
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const bend = Math.max(28, Math.min(104, distance * 0.16)) * (dy >= 0 ? -1 : 1);
  const midX = (originX + targetX) / 2 + normalX * bend;
  const midY = (originY + targetY) / 2 + normalY * bend;
  const control1X = originX + ((midX - originX) * 2 / 3);
  const control1Y = originY + ((midY - originY) * 2 / 3);
  const control2X = targetX + ((midX - targetX) * 2 / 3);
  const control2Y = targetY + ((midY - targetY) * 2 / 3);
  const tangentX = targetX - control2X;
  const tangentY = targetY - control2Y;
  const angle = Math.atan2(tangentY, tangentX);
  const headLength = (width >= 10 ? 30 : 24) * 3;
  const headSpread = 0.58;
  const unitX = Math.cos(angle);
  const unitY = Math.sin(angle);

  const baseCenterX = centerHeadOnTarget ? targetX - unitX * (headLength / 2) : targetX - unitX * headLength;
  const baseCenterY = centerHeadOnTarget ? targetY - unitY * (headLength / 2) : targetY - unitY * headLength;
  const tipX = centerHeadOnTarget ? targetX + unitX * (headLength / 2) : targetX;
  const tipY = centerHeadOnTarget ? targetY + unitY * (headLength / 2) : targetY;

  arrow
    .moveTo(originX, originY)
    .bezierCurveTo(control1X, control1Y, control2X, control2Y, baseCenterX, baseCenterY)
    .stroke({
      color: borderColor,
      width: width + borderWidth * 2,
      alpha: 0.96,
      cap: "round",
      join: "round"
    })
    .moveTo(originX, originY)
    .bezierCurveTo(control1X, control1Y, control2X, control2Y, baseCenterX, baseCenterY)
    .stroke({
      color,
      width,
      alpha: 0.94,
      cap: "round",
      join: "round"
    });

  const headPoint1X = tipX - Math.cos(angle - headSpread) * headLength;
  const headPoint1Y = tipY - Math.sin(angle - headSpread) * headLength;
  const headPoint2X = tipX - Math.cos(angle + headSpread) * headLength;
  const headPoint2Y = tipY - Math.sin(angle + headSpread) * headLength;
  const innerInset = Math.max(4, borderWidth * 1.35);
  const innerTipX = tipX - unitX * (innerInset * 0.35);
  const innerTipY = tipY - unitY * (innerInset * 0.35);
  const innerHeadPoint1X = headPoint1X + Math.cos(angle - headSpread) * innerInset;
  const innerHeadPoint1Y = headPoint1Y + Math.sin(angle - headSpread) * innerInset;
  const innerHeadPoint2X = headPoint2X + Math.cos(angle + headSpread) * innerInset;
  const innerHeadPoint2Y = headPoint2Y + Math.sin(angle + headSpread) * innerInset;

  arrow
    .poly([
      tipX, tipY,
      headPoint1X, headPoint1Y,
      headPoint2X, headPoint2Y
    ])
    .fill({ color: borderColor, alpha: 0.98 })
    .poly([
      innerTipX, innerTipY,
      innerHeadPoint1X, innerHeadPoint1Y,
      innerHeadPoint2X, innerHeadPoint2Y
    ])
    .fill({ color, alpha: 0.96 });

  return arrow;
}

function getRectCenter(rect: RectGeometry): StagePoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOutCubic(progress: number): number {
  const clamped = clamp01(progress);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function getTurnPastilleAnchor(
  seatNumber: number,
  localSeatNumber: number,
  seatRects: Map<number, RectGeometry>
): StagePoint | null {
  const rect = seatRects.get(seatNumber);
  if (rect == null) {
    return null;
  }

  if (seatNumber === localSeatNumber) {
    return {
      x: rect.x + 72,
      y: rect.y + rect.height / 2
    };
  }

  return {
    x: rect.x + 32,
    y: rect.y + rect.height / 2
  };
}

function getSeatHpBurstAnchor(
  seatNumber: number,
  localSeatNumber: number,
  rect: RectGeometry
): StagePoint {
  if (seatNumber === localSeatNumber) {
    const hpBadgeWidth = 112;
    const hpBadgeHeight = 38;
    const hpBadgeInsetRight = 18;
    const hpBadgeInsetTop = 14;
    return {
      x: rect.x + rect.width - hpBadgeInsetRight - hpBadgeWidth / 2,
      y: rect.y + hpBadgeInsetTop + hpBadgeHeight / 2
    };
  }

  return {
    x: rect.x + rect.width - 16,
    y: rect.y + rect.height / 2
  };
}

function getTurnPastilleRenderState(
  now: number,
  localSeatNumber: number,
  seatRects: Map<number, RectGeometry>,
  turnPastilleState: TurnPastilleAnimationState
): TurnPastilleRenderState | null {
  const activeSeatNumber = turnPastilleState.transitionToSeatNumber ?? turnPastilleState.displayedSeatNumber;
  if (activeSeatNumber == null) {
    return null;
  }

  const targetAnchor = getTurnPastilleAnchor(activeSeatNumber, localSeatNumber, seatRects);
  if (targetAnchor == null) {
    return null;
  }

  if (turnPastilleState.transitionToSeatNumber == null || turnPastilleState.transitionFromSeatNumber == null) {
    return {
      x: targetAnchor.x,
      y: targetAnchor.y,
      progress: 1,
      animating: false
    };
  }

  const originAnchor = getTurnPastilleAnchor(turnPastilleState.transitionFromSeatNumber, localSeatNumber, seatRects);
  if (originAnchor == null) {
    return {
      x: targetAnchor.x,
      y: targetAnchor.y,
      progress: 1,
      animating: false
    };
  }

  const progress = clamp01((now - turnPastilleState.transitionStartedAt) / turnPastilleState.transitionDurationMs);
  const eased = easeInOutCubic(progress);
  return {
    x: lerp(originAnchor.x, targetAnchor.x, eased),
    y: lerp(originAnchor.y, targetAnchor.y, eased) - Math.sin(progress * Math.PI) * 20,
    progress,
    animating: progress < 1
  };
}

function renderTurnPastille(
  scene: Container,
  state: TurnPastilleRenderState,
  insertIndex: number
): void {
  scene.addChildAt(createCircle(state.x, state.y, 54, "#8b6914", 1), Math.min(insertIndex, scene.children.length));
}

interface VictoryStatsSeatEntry {
  seat: SeatState;
  stats: SeatSessionStats;
}

interface VictoryAwardEntry {
  key: string;
  icon?: string;
  label: string;
  tooltip: string;
  winner: SeatState;
  value: string;
  detail?: string;
  tone?: "default" | "good" | "bad";
}

function getVictoryStatsSeatEntries(match: MatchState): VictoryStatsSeatEntry[] {
  const seatByNumber = new Map(match.seats.map((seat) => [seat.seatNumber, seat]));
  return (match.game?.sessionStats.seatStats ?? [])
    .flatMap((stats) => {
      const seat = seatByNumber.get(stats.seatNumber);
      return seat == null ? [] : [{ seat, stats }];
    });
}

function getCardTextureUrl(card: Pick<CardView, "imageUrl">, variant: CardImageVariant): string {
  return getCardImageVariantUrl(card.imageUrl, variant);
}

function pruneLoadedTextures(): void {
  const now = Date.now();
  const unloadUrls = new Set<string>();
  const removableEntries = Array.from(loadedTextureByUrl.entries())
    .filter(([url]) => !currentFrameTextureUsage.has(url) && !requestedTextureUrls.has(url));

  for (const [url, entry] of removableEntries) {
    if (now - entry.lastUsedAt >= TEXTURE_CACHE_IDLE_MS) {
      unloadUrls.add(url);
    }
  }

  if (loadedTextureByUrl.size - unloadUrls.size > MAX_TEXTURE_CACHE_SIZE) {
    const overflow = loadedTextureByUrl.size - unloadUrls.size - MAX_TEXTURE_CACHE_SIZE;
    const overflowCandidates = removableEntries
      .filter(([url]) => !unloadUrls.has(url))
      .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)
      .slice(0, overflow);

    for (const [url] of overflowCandidates) {
      unloadUrls.add(url);
    }
  }

  if (unloadUrls.size === 0) {
    return;
  }

  for (const url of unloadUrls) {
    loadedTextureByUrl.delete(url);
  }

  void Promise.all(Array.from(unloadUrls, async (url) => {
    try {
      await Assets.unload(url);
    } catch {
      // Ignore cache eviction failures and keep rendering.
    }
  }));
}

function pickMaxVictoryEntry(
  entries: VictoryStatsSeatEntry[],
  selector: (entry: VictoryStatsSeatEntry) => number,
  minValue = 1
): VictoryStatsSeatEntry | null {
  let winner: VictoryStatsSeatEntry | null = null;
  let winnerValue = minValue - 1;

  for (const entry of entries) {
    const value = selector(entry);
    if (value < minValue) {
      continue;
    }

    if (
      winner == null
      || value > winnerValue
      || (value === winnerValue && entry.seat.seatNumber < winner.seat.seatNumber)
    ) {
      winner = entry;
      winnerValue = value;
    }
  }

  return winner;
}

function pickMinVictoryEntry(
  entries: VictoryStatsSeatEntry[],
  selector: (entry: VictoryStatsSeatEntry) => number,
  maxValue = -1
): VictoryStatsSeatEntry | null {
  let winner: VictoryStatsSeatEntry | null = null;
  let winnerValue = maxValue + 1;

  for (const entry of entries) {
    const value = selector(entry);
    if (value > maxValue) {
      continue;
    }

    if (
      winner == null
      || value < winnerValue
      || (value === winnerValue && entry.seat.seatNumber < winner.seat.seatNumber)
    ) {
      winner = entry;
      winnerValue = value;
    }
  }

  return winner;
}

function buildVictoryStatsMarkup(match: MatchState, language: AppLanguage, enabled: boolean): string {
  if (!enabled || match.game?.sessionStats == null) {
    return "";
  }

  const entries = getVictoryStatsSeatEntries(match);
  if (entries.length === 0) {
    return "";
  }

  const numberFormat = new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-US");
  const turnLabel = language === "fr" ? "tour" : "turn";
  const turnsLabel = language === "fr" ? "tours" : "turns";
  const hpLabel = "HP";
  const awards: VictoryAwardEntry[] = [];
  const pushAward = (award: VictoryAwardEntry | null): void => {
    if (award != null) {
      awards.push(award);
    }
  };
  const buildCountValue = (value: number, suffix?: string): string =>
    suffix == null ? numberFormat.format(value) : `${numberFormat.format(value)} ${suffix}`;
  const buildLuckScore = (entry: VictoryStatsSeatEntry): number =>
    (entry.stats.luckyRolls - entry.stats.unluckyRolls)
    + (entry.stats.resistCriticalSuccesses - entry.stats.resistFatalFailures);

  const mostDamage = pickMaxVictoryEntry(entries, (entry) => entry.stats.damageDealt);
  pushAward(mostDamage == null ? null : {
    key: "most-damage",
    icon: language === "fr" ? "🔥" : undefined,
    label: language === "fr" ? "Machine à dégâts" : "Most Damage",
    tooltip: language === "fr"
      ? "Total des degats infliges pendant toute la partie."
      : "Total damage dealt across the entire match.",
    winner: mostDamage.seat,
    value: buildCountValue(mostDamage.stats.damageDealt)
  });

  const biggestHit = pickMaxVictoryEntry(entries, (entry) => entry.stats.biggestHit);
  pushAward(biggestHit == null ? null : {
    key: "biggest-hit",
    icon: language === "fr" ? "💥" : undefined,
    label: language === "fr" ? "Le coup qui fesse le plus" : "Biggest Hit",
    tooltip: language === "fr"
      ? "Le plus gros coup de degats fait en une seule attaque."
      : "The single biggest damage hit landed in one attack.",
    winner: biggestHit.seat,
    value: buildCountValue(biggestHit.stats.biggestHit)
  });

  const mostHealing = pickMaxVictoryEntry(entries, (entry) => entry.stats.healingDone);
  pushAward(mostHealing == null ? null : {
    key: "most-healing",
    icon: language === "fr" ? "❤️" : undefined,
    label: language === "fr" ? "Le doc de service" : "Most Healing",
    tooltip: language === "fr"
      ? "Total des points de vie rendus pendant la partie."
      : "Total HP restored over the course of the match.",
    winner: mostHealing.seat,
    value: buildCountValue(mostHealing.stats.healingDone)
  });

  const biggestHeal = pickMaxVictoryEntry(entries, (entry) => entry.stats.biggestHeal);
  pushAward(biggestHeal == null ? null : {
    key: "biggest-heal",
    icon: language === "fr" ? "💉" : undefined,
    label: language === "fr" ? "Le gros boost de vie" : "Biggest Heal",
    tooltip: language === "fr"
      ? "Le plus gros soin applique en une seule fois."
      : "The single largest heal applied at once.",
    winner: biggestHeal.seat,
    value: buildCountValue(biggestHeal.stats.biggestHeal)
  });

  const mostCards = pickMaxVictoryEntry(entries, (entry) => entry.stats.cardsPlayed);
  pushAward(mostCards == null ? null : {
    key: "most-cards",
    icon: language === "fr" ? "🃏" : undefined,
    label: language === "fr" ? "Le spammeur officiel" : "Most Cards Played",
    tooltip: language === "fr"
      ? "Nombre total de cartes jouees, actives et inactives incluses."
      : "Total number of cards played, including active and inactive cards.",
    winner: mostCards.seat,
    value: buildCountValue(mostCards.stats.cardsPlayed),
    detail: `${numberFormat.format(mostCards.stats.activeCardsPlayed)} active / ${numberFormat.format(mostCards.stats.inactiveCardsPlayed)} inactive`
  });

  const mostResponses = pickMaxVictoryEntry(entries, (entry) => entry.stats.responseCardsPlayed);
  pushAward(mostResponses == null ? null : {
    key: "most-responses",
    icon: language === "fr" ? "⚡" : undefined,
    label: language === "fr" ? "Le p'tit vite sur le trigger" : "Most Responses Used",
    tooltip: language === "fr"
      ? "Nombre total de cartes de reponse jouees en defense."
      : "Total response cards played while defending.",
    winner: mostResponses.seat,
    value: buildCountValue(mostResponses.stats.responseCardsPlayed)
  });

  const mostKills = pickMaxVictoryEntry(entries, (entry) => entry.stats.kills);
  pushAward(mostKills == null ? null : {
    key: "most-kills",
    icon: language === "fr" ? "☠️" : undefined,
    label: language === "fr" ? "Celui qui fait le ménage" : "Most Kills",
    tooltip: language === "fr"
      ? "Nombre d'adversaires elimines pendant la partie."
      : "Number of opponents eliminated during the match.",
    winner: mostKills.seat,
    value: buildCountValue(mostKills.stats.kills)
  });

  const mostTargeted = pickMaxVictoryEntry(entries, (entry) => entry.stats.timesTargeted);
  pushAward(mostTargeted == null ? null : {
    key: "most-targeted",
    icon: language === "fr" ? "🎯" : undefined,
    label: language === "fr" ? "Cible numéro un" : "Most Targeted",
    tooltip: language === "fr"
      ? "Nombre de fois ou ce joueur a ete vise par une action adverse."
      : "How many times this player was targeted by opposing actions.",
    winner: mostTargeted.seat,
    value: buildCountValue(mostTargeted.stats.timesTargeted)
  });

  const mostDamageTaken = pickMaxVictoryEntry(entries, (entry) => entry.stats.damageTaken);
  pushAward(mostDamageTaken == null ? null : {
    key: "most-damage-taken",
    icon: language === "fr" ? "🛡️" : undefined,
    label: language === "fr" ? "A tout encaissé" : "Most Damage Taken",
    tooltip: language === "fr"
      ? "Total des degats recus pendant toute la partie."
      : "Total damage received across the full match.",
    winner: mostDamageTaken.seat,
    value: buildCountValue(mostDamageTaken.stats.damageTaken)
  });

  const mostObjects = pickMaxVictoryEntry(entries, (entry) => entry.stats.objectsWorn);
  pushAward(mostObjects == null ? null : {
    key: "most-objects",
    icon: language === "fr" ? "🎒" : undefined,
    label: language === "fr" ? "Pris tout ce qui traînait" : "Most Objects Worn",
    tooltip: language === "fr"
      ? "Nombre total d'objets equipes au fil de la partie."
      : "Total number of objects equipped during the match.",
    winner: mostObjects.seat,
    value: buildCountValue(mostObjects.stats.objectsWorn)
  });

  const longestObjectHold = pickMaxVictoryEntry(entries, (entry) => entry.stats.longestObjectHoldTurns);
  pushAward(longestObjectHold == null ? null : {
    key: "longest-object-hold",
    icon: language === "fr" ? "📦" : undefined,
    label: language === "fr" ? "Fidèle à son objet" : "Longest Object Hold",
    tooltip: language === "fr"
      ? "Objet garde le plus longtemps sans le perdre."
      : "The object that stayed equipped for the most turns without being lost.",
    winner: longestObjectHold.seat,
    value: buildCountValue(
      longestObjectHold.stats.longestObjectHoldTurns,
      longestObjectHold.stats.longestObjectHoldTurns === 1 ? turnLabel : turnsLabel
    ),
    detail: longestObjectHold.stats.longestObjectHoldCardName ?? undefined
  });

  const lowestHpSurvived = entries
    .filter((entry) => entry.stats.lowestHpSurvived != null)
    .sort((left, right) => {
      const leftHp = left.stats.lowestHpSurvived ?? Number.POSITIVE_INFINITY;
      const rightHp = right.stats.lowestHpSurvived ?? Number.POSITIVE_INFINITY;
      return leftHp - rightHp || left.seat.seatNumber - right.seat.seatNumber;
    })[0] ?? null;
  pushAward(lowestHpSurvived == null ? null : {
    key: "closest-call",
    icon: language === "fr" ? "💀" : undefined,
    label: language === "fr" ? "Sauvé par la peau des fesses" : "Closest Call",
    tooltip: language === "fr"
      ? "Le plus bas total de PV atteint sans mourir."
      : "The lowest HP total survived without being eliminated.",
    winner: lowestHpSurvived.seat,
    value: `${numberFormat.format(lowestHpSurvived.stats.lowestHpSurvived ?? 0)} ${hpLabel}`
  });

  const resistanceCandidates = entries.filter((entry) => entry.stats.resistAttempts > 0);
  const bestResistance = resistanceCandidates.sort((left, right) => {
    const leftRate = left.stats.resistSuccesses / left.stats.resistAttempts;
    const rightRate = right.stats.resistSuccesses / right.stats.resistAttempts;
    return rightRate - leftRate
      || right.stats.resistAttempts - left.stats.resistAttempts
      || right.stats.resistSuccesses - left.stats.resistSuccesses
      || left.seat.seatNumber - right.seat.seatNumber;
  })[0] ?? null;
  pushAward(bestResistance == null ? null : {
    key: "best-resistance",
    icon: language === "fr" ? "🧱" : undefined,
    label: language === "fr" ? "Tank en esti" : "Best Resistance",
    tooltip: language === "fr"
      ? "Meilleur taux de reussite sur les jets de resistance, avec au moins une tentative."
      : "Highest resistance success rate among players who attempted at least one resistance roll.",
    winner: bestResistance.seat,
    value: `${numberFormat.format(Math.round((bestResistance.stats.resistSuccesses / bestResistance.stats.resistAttempts) * 100))}%`,
    detail: `${numberFormat.format(bestResistance.stats.resistSuccesses)} / ${numberFormat.format(bestResistance.stats.resistAttempts)}`
  });

  const luckCandidates = entries.filter((entry) =>
    entry.stats.luckyRolls > 0
    || entry.stats.unluckyRolls > 0
    || entry.stats.resistCriticalSuccesses > 0
    || entry.stats.resistFatalFailures > 0
  );
  const highRoller = pickMaxVictoryEntry(luckCandidates, (entry) => buildLuckScore(entry), 1);
  pushAward(highRoller == null ? null : {
    key: "high-roller",
    icon: language === "fr" ? "🎲" : undefined,
    label: language === "fr" ? "Béni des dieux du RNG" : "High Roller",
    tooltip: language === "fr"
      ? "Meilleur score de chance net: bons jets moins mauvais jets, en incluant les resists critiques et les echecs fatals."
      : "Best net luck score: good rolls minus bad rolls, including critical resists and fatal resistance failures.",
    winner: highRoller.seat,
    value: `${buildLuckScore(highRoller) > 0 ? "+" : ""}${numberFormat.format(buildLuckScore(highRoller))}`,
    detail: `+${numberFormat.format(highRoller.stats.luckyRolls)} / -${numberFormat.format(highRoller.stats.unluckyRolls)}`,
    tone: "good"
  });

  const unluckiest = pickMinVictoryEntry(luckCandidates, (entry) => buildLuckScore(entry), -1);
  pushAward(unluckiest == null ? null : {
    key: "unluckiest",
    icon: language === "fr" ? "💀" : undefined,
    label: language === "fr" ? "Le sort s'acharnait" : "Unluckiest",
    tooltip: language === "fr"
      ? "Pire score de chance net: mauvais jets et incidents critiques ont pese le plus lourd."
      : "Worst net luck score, where bad rolls and critical mishaps hurt the most.",
    winner: unluckiest.seat,
    value: `${buildLuckScore(unluckiest) > 0 ? "+" : ""}${numberFormat.format(buildLuckScore(unluckiest))}`,
    detail: `+${numberFormat.format(unluckiest.stats.luckyRolls)} / -${numberFormat.format(unluckiest.stats.unluckyRolls)}`,
    tone: "bad"
  });

  if (awards.length === 0) {
    return "";
  }

  return `
    <section class="victory-stats" aria-label="${escapeHtml(language === "fr" ? "Statistiques de partie" : "Match statistics")}">
      <div class="victory-stats__header">
        <strong>${escapeHtml(language === "fr" ? "Statistiques de la partie" : "Match Highlights")}</strong>
        <span>${escapeHtml(language === "fr" ? "Resume de la session" : "Session recap")}</span>
      </div>
      <div class="victory-stats__grid">
        ${awards.map((award) => `
          <article
            class="victory-stat victory-stat--${award.tone ?? "default"}"
            data-award-key="${award.key}"
            tabindex="0"
            aria-label="${escapeHtml(`${award.label}. ${award.tooltip}`)}"
            aria-describedby="victory-tooltip-${award.key}"
          >
            <span class="victory-stat__label">
              ${award.icon == null ? "" : `<span class="victory-stat__label-icon" aria-hidden="true">${escapeHtml(award.icon)}</span>`}
              <span class="victory-stat__label-text">${escapeHtml(award.label)}</span>
            </span>
            <div class="victory-stat__winner-row">
              <img class="victory-stat__avatar" src="${award.winner.avatarUrl}" alt="${escapeHtml(award.winner.displayName)}" />
              <strong class="victory-stat__winner">${escapeHtml(award.winner.displayName)}</strong>
            </div>
            <span class="victory-stat__value">${escapeHtml(award.value)}</span>
            ${award.detail == null ? "" : `<span class="victory-stat__detail">${escapeHtml(award.detail)}</span>`}
            <div class="victory-stat__tooltip" id="victory-tooltip-${award.key}" role="tooltip">
              ${escapeHtml(award.tooltip)}
            </div>
          </article>
        `).join("")}
      </div>
      <p class="victory-celebration__quit-hint">${escapeHtml(t(language, "victory.quitHint"))}</p>
    </section>
  `;
}

function buildVictoryCelebrationMarkup(match: MatchState, language: AppLanguage, enabled: boolean): string {
  if (!enabled) {
    return "";
  }

  const winnerSeatNumber = match.game?.winnerSeatNumber;
  if (winnerSeatNumber == null) {
    return "";
  }

  const winnerSeat = match.seats.find((seat) => seat.seatNumber === winnerSeatNumber);
  if (winnerSeat == null) {
    return "";
  }

  const winnerName = winnerSeat.displayName;
  const labelPool = [
    "GG",
    "GGEZ",
    `${winnerName} WINS!!!`,
    "WINNER!!!",
    winnerName
  ];
  const floatCount = 18;
  const heroText = language === "fr" ? `${winnerName} gagne !` : `${winnerName} wins!`;

  return `
    <div class="victory-celebration" aria-hidden="true">
      <div class="victory-celebration__hero">
        <img class="victory-celebration__avatar" src="${winnerSeat.avatarUrl}" alt="${escapeHtml(winnerName)}" />
        <div class="victory-celebration__hero-copy">
          <strong>${escapeHtml(winnerName)}</strong>
          <span>${escapeHtml(heroText)}</span>
        </div>
      </div>
      ${Array.from({ length: floatCount }, (_, index) => {
        const contentSeed = winnerSeatNumber * 100 + index;
        const label = labelPool[Math.floor(seededUnit(contentSeed + 1) * labelPool.length)] ?? "WINNER!!!";
        const useAvatar = seededUnit(contentSeed + 2) > 0.72;
        const x = (4 + seededUnit(contentSeed + 3) * 90).toFixed(2);
        const y = (14 + seededUnit(contentSeed + 4) * 70).toFixed(2);
        const driftX = (-70 + seededUnit(contentSeed + 5) * 140).toFixed(1);
        const travelY = (80 + seededUnit(contentSeed + 6) * 180).toFixed(1);
        const scale = (0.75 + seededUnit(contentSeed + 7) * 1.25).toFixed(2);
        const rotate = (seededUnit(contentSeed + 8) * 30).toFixed(1);
        const duration = (3.4 + seededUnit(contentSeed + 9) * 3.2).toFixed(2);
        const delay = (-seededUnit(contentSeed + 10) * 6.5).toFixed(2);
        const opacity = (0.54 + seededUnit(contentSeed + 11) * 0.36).toFixed(2);
        return `
          <div
            class="victory-float ${useAvatar ? "victory-float--avatar" : "victory-float--text"}"
            style="left:${x}%; top:${y}%; --victory-drift-x:${driftX}px; --victory-travel-y:${travelY}px; --victory-scale:${scale}; --victory-rotate:${rotate}deg; --victory-duration:${duration}s; --victory-delay:${delay}s; --victory-opacity:${opacity};"
          >
            ${useAvatar
              ? `
                <img src="${winnerSeat.avatarUrl}" alt="${escapeHtml(winnerName)}" />
                <span>${escapeHtml(winnerName)}</span>
              `
              : `<span>${escapeHtml(label)}</span>`}
          </div>
        `;
      }).join("")}
      ${buildVictoryStatsMarkup(match, language, enabled)}
    </div>
  `;
}

const LOBBY_CARD_W = 320;
const LOBBY_CARD_H = 160;
const LOBBY_CARD_GAP = 14;
const LOBBY_COLUMNS = 3;
const LOBBY_START_X = 70;
const LOBBY_START_Y = 166;

const LOBBY_EXP_X = 1090;
const LOBBY_EXP_Y = 70;
const LOBBY_EXP_W = 440;
const LOBBY_EXP_HEADER_H = 56;
const LOBBY_EXP_ROW_H = 85;
const LOBBY_EXP_ROW_GAP = 8;

function renderLobbyScene(
  scene: Container,
  match: MatchState,
  localSeatNumber: number,
  language: AppLanguage,
  sessionMode: "discord" | "browser",
  sessionChannelId: string | null,
  sessionGuildId: string | null,
  onTextureReady: () => void = () => {}
): void {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const hostSeat = match.seats.find((seat) => seat.isHost);
  const amHost = localSeat?.isHost === true;

  // ── Background ───────────────────────────────────────────────────────────────
  scene.addChild(createRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT, "#0f1f13"));
  scene.addChild(createRect(34, 34, STAGE_WIDTH - 68, STAGE_HEIGHT - 68, "#183a22", 1, 32));

  // ── Header bar ───────────────────────────────────────────────────────────────
  scene.addChild(createRect(70, 70, 980, 86, "#0d1910", 0.92, 16));
  scene.addChild(createLabel(t(language, "lobby.title"), 98, 80, { fontSize: 34, fontWeight: "700" }));
  const lobbyDiagnostics = [
    sessionMode === "discord" ? t(language, "lobby.discord") : t(language, "lobby.browser"),
    t(language, "lobby.instance", { instanceId: match.instanceId }),
    sessionChannelId != null ? t(language, "lobby.channel", { channelId: sessionChannelId }) : null,
    sessionGuildId != null ? t(language, "lobby.guild", { guildId: sessionGuildId }) : null
  ]
    .filter((value): value is string => value != null && value !== "")
    .join("  ·  ");
  scene.addChild(createLabel(
    t(language, "lobby.seatsFilled", { filled: match.seats.length, max: match.maxSeats })
    + "  ·  " + t(language, "seat.label", { seatNumber: localSeatNumber })
    + (hostSeat != null ? "  ·  " + t(language, "seat.host") + ": " + hostSeat.displayName : ""),
    98, 126, { fontSize: 14, fill: "#8aaa80" }
  ));
  scene.addChild(createLabel(lobbyDiagnostics, 98, 146, { fontSize: 12, fill: "#6f9176" }));

  // ── Seat grid (3 columns × 4 rows) ───────────────────────────────────────────
  // Row 0, col 0 = host seat; row 0, cols 1-2 = start-match button (drawn below).
  // Seats 2+ fill rows 1-3 left-to-right.
  Array.from({ length: match.maxSeats }, (_value, index) => index + 1).forEach((seatNumber) => {
    const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);
    const col = seatNumber === 1 ? 0 : (seatNumber - 2) % LOBBY_COLUMNS;
    const row = seatNumber === 1 ? 0 : 1 + Math.floor((seatNumber - 2) / LOBBY_COLUMNS);
    const x = LOBBY_START_X + col * (LOBBY_CARD_W + LOBBY_CARD_GAP);
    const y = LOBBY_START_Y + row * (LOBBY_CARD_H + LOBBY_CARD_GAP);
    const isEmpty = seat == null;

    scene.addChild(createRect(x, y, LOBBY_CARD_W, LOBBY_CARD_H, isEmpty ? "#131f15" : "#0f1a10", 0.95, 14));
    scene.addChild(createLabel(
      t(language, "seat.label", { seatNumber }),
      x + 14, y + 14,
      { fontSize: 12, fill: "#5a8060" }
    ));

    if (isEmpty) {
      if (amHost) {
        scene.addChild(createLabel("+", x + LOBBY_CARD_W / 2, y + LOBBY_CARD_H / 2 - 16, { fontSize: 40, fill: "#3a6040" }, 0.5, 0.5));
        scene.addChild(createLabel(t(language, "lobby.addBot"), x + LOBBY_CARD_W / 2, y + LOBBY_CARD_H / 2 + 24, { fontSize: 15, fill: "#4a7a52" }, 0.5, 0.5));
      } else {
        scene.addChild(createLabel(t(language, "lobby.openSeat"), x + LOBBY_CARD_W / 2, y + LOBBY_CARD_H / 2, { fontSize: 20, fill: "#2a3d2e" }, 0.5, 0.5));
      }
      return;
    }

    scene.addChild(createAvatarDisplay(
      seat.avatarUrl,
      x + 40, y + 80,
      28,
      seat.controllerType === "bot" ? "#8a4f2e" : "#326a8a",
      getSeatInitials(seat.displayName),
      onTextureReady
    ));

    // Name + status stacked on the right of the avatar
    scene.addChild(createLabel(fitText(seat.displayName, 218, 19), x + 82, y + 38, { fontSize: 19, fontWeight: "700" }));
    scene.addChild(createLabel(
      seat.controllerType === "bot"
        ? t(language, "seat.bot", { difficulty: seat.difficulty ?? "normal" })
        : seat.connected ? t(language, "seat.connected") : t(language, "seat.disconnected"),
      x + 82, y + 63,
      { fontSize: 13, fill: "#7a9a80" }
    ));

    // Badges on a row below the status label — never overlap the avatar
    let badgeX = x + 82;
    const badgeY = y + 96;
    if (seat.isHost) {
      scene.addChild(createRect(badgeX, badgeY, 50, 18, "#6b4d1a", 1, 5));
      scene.addChild(createLabel(t(language, "seat.host").toUpperCase(), badgeX + 25, badgeY + 9, { fontSize: 10, fill: "#f0d897", fontWeight: "700" }, 0.5, 0.5));
      badgeX += 56;
    }
    if (localSeat?.seatNumber === seat.seatNumber) {
      scene.addChild(createRect(badgeX, badgeY, 90, 18, "#1e3d6b", 1, 5));
      scene.addChild(createLabel(t(language, "lobby.localPlayer").toUpperCase(), badgeX + 45, badgeY + 9, { fontSize: 10, fill: "#b8d8ff", fontWeight: "700" }, 0.5, 0.5));
    }
  });

  // ── Row 0, cols 1-2: Start match button ──────────────────────────────────────
  const smX = LOBBY_START_X + (LOBBY_CARD_W + LOBBY_CARD_GAP);
  const smY = LOBBY_START_Y;
  const smW = 2 * LOBBY_CARD_W + LOBBY_CARD_GAP;
  const smH = LOBBY_CARD_H;
  scene.addChild(createRect(smX, smY, smW, smH, amHost ? "#132b1a" : "#0d1610", 0.95, 14));
  scene.addChild(createLabel(
    t(language, "lobby.startMatch"),
    smX + smW / 2, smY + smH / 2,
    { fontSize: 26, fontWeight: "700", fill: amHost ? "#5ad870" : "#253d2c" },
    0.5, 0.5
  ));

  // ── Expansion panel (full height) ────────────────────────────────────────────
  const expPanelH = STAGE_HEIGHT - LOBBY_EXP_Y - 34;
  scene.addChild(createRect(LOBBY_EXP_X, LOBBY_EXP_Y, LOBBY_EXP_W, expPanelH, "#182d1e", 0.96, 16));
  scene.addChild(createLabel(t(language, "lobby.expansions"), LOBBY_EXP_X + 22, LOBBY_EXP_Y + LOBBY_EXP_HEADER_H / 2, { fontSize: 20, fontWeight: "700" }, 0, 0.5));

  EXPANSION_DECKS.forEach((deck, index) => {
    const enabled = match.enabledExpansions[deck.key];
    const rowY = LOBBY_EXP_Y + LOBBY_EXP_HEADER_H + index * (LOBBY_EXP_ROW_H + LOBBY_EXP_ROW_GAP);
    const rowBg = !deck.available ? "#1e251f" : enabled ? "#1e3d28" : "#1a2e20";
    scene.addChild(createRect(LOBBY_EXP_X, rowY, LOBBY_EXP_W, LOBBY_EXP_ROW_H, rowBg, 0.97, 10));
    scene.addChild(createLabel(deck.label, LOBBY_EXP_X + 20, rowY + LOBBY_EXP_ROW_H / 2, {
      fontSize: 16,
      fill: deck.available ? "#f0eadc" : "#6a7a6c"
    }, 0, 0.5));

    // Toggle switch — always rendered so all rows have the same visual structure
    const trackW = 52; const trackH = 26;
    const trackX = LOBBY_EXP_X + LOBBY_EXP_W - trackW - 20;
    const trackY = rowY + (LOBBY_EXP_ROW_H - trackH) / 2;
    const thumbR = 10;
    const trackColor = !deck.available ? "#252e28" : enabled ? "#3a8a4e" : "#2e4a38";
    const thumbColor = !deck.available ? "#363e38" : enabled ? "#6aee8a" : "#587060";
    const thumbCx = (deck.available && enabled) ? trackX + trackW - thumbR - 3 : trackX + thumbR + 3;
    scene.addChild(createRect(trackX, trackY, trackW, trackH, trackColor, 1, trackH / 2));
    scene.addChild(createCircle(thumbCx, trackY + trackH / 2, thumbR, thumbColor));
    if (!deck.available) {
      scene.addChild(createLabel(t(language, "lobby.expansionDisabled"), trackX - 10, rowY + LOBBY_EXP_ROW_H / 2, { fontSize: 11, fill: "#6a7a6c" }, 1, 0.5));
    }
  });
}

function renderSeatNode(
  scene: Container,
  seat: SeatState,
  x: number,
  y: number,
  isCurrentTurn: boolean,
  isLocal = false,
  highlight = false,
  onTextureReady: () => void = () => {},
  displayedHp?: number,
  language: AppLanguage = "fr",
  displayedAlive?: boolean
): void {
  const hp = displayedHp ?? seat.hp;
  const isDead = (displayedAlive != null ? !displayedAlive : seat.isAlive === false);

  // ── Opponent seat: HP bar dominant ──────────────────────────────────────────
  // The seat IS a health bar. The filled portion shows remaining HP. Avatar sits
  // inside the bar on the left; name overlaid in the center; HP number on the right.
  // Color shifts green → yellow → red as HP drops.
  if (!isLocal) {
    const w = 252; const h = 62;
    const lx = x - w / 2; const ly = y - h / 2;
    renderHandCountTabs(scene, x, ly + 18, getDisplayedHandCount(seat), 146, isDead);
    // Decorative bar — fixed at the 38/50 look regardless of actual HP.
    // Only the HP number on the right is live.
    const decorFill = Math.round(w * (38 / 50));

    // Track (empty bar background)
    scene.addChild(createRect(lx, ly, w, h, "#0c160e", 0.96, 10));
    // Fixed green fill
    scene.addChild(createRect(lx, ly, decorFill, h, "#1e7a42", 0.88, 10));

    // Highlight border when turn or hovered
    if (isCurrentTurn) {
      scene.addChild(createRect(lx - 2, ly - 2, w + 4, h + 4, "#d6b058", 0.55, 11));
      scene.addChild(createRect(lx, ly, w, h, "#0c160e", 0.96, 10));
      scene.addChild(createRect(lx, ly, decorFill, h, "#1e7a42", 0.88, 10));
    }
    if (highlight) {
      scene.addChild(createRect(lx - 3, ly - 3, w + 6, h + 6, "#f0c96d", 0.35, 12));
    }

    // Avatar left side
    scene.addChild(createAvatarDisplay(seat.avatarUrl, lx + 32, y, 24,
      seat.controllerType === "bot" ? "#85573d" : "#2f6a88",
      getSeatInitials(seat.displayName), onTextureReady));

    // Name + power in center
    scene.addChild(createLabel(fitText(seat.displayName, 120, 17), lx + 68, ly + 12, { fontSize: 17, fontWeight: "700" }));
    scene.addChild(createLabel(`${t(language, "stat.power")} ${seat.powerLevel ?? 1}`, lx + 69, ly + 36, { fontSize: 11, fill: "#8aaa90" }));

    // Live HP number right side
    scene.addChild(createLabel(`${hp}`, lx + w - 16, y, { fontSize: 22, fontWeight: "700", fill: "#3ec86e" }, 1, 0.5));

    if (seat.isHost) {
      scene.addChild(createLabel("H", lx + w - 8, ly + 4, { fontSize: 10, fill: "#f0d070", fontWeight: "700" }, 1, 0));
    }
    if (isDead) {
      scene.addChild(createRect(lx, ly, w, h, "#c8d4cc", 0.55, 10));
    }
    return;
  }

  // ── Local seat ───────────────────────────────────────────────────────────────
  const seatWidth = 440;
  const seatHeight = 168;
  const seatPanel = createRect(x - (seatWidth / 2), y - (seatHeight / 2), seatWidth, seatHeight, "#101912", 0.96, 24);
  scene.addChild(seatPanel);

  if (highlight) {
    scene.addChild(createRect(x - (seatWidth / 2) - 4, y - (seatHeight / 2) - 4, seatWidth + 8, seatHeight + 8, "#f0c96d", 0.22, 28));
  }

  scene.addChild(createAvatarDisplay(
    seat.avatarUrl,
    x - (seatWidth / 2) + 54,
    y - 6,
    40,
    seat.controllerType === "bot" ? "#85573d" : "#2f6a88",
    getSeatInitials(seat.displayName),
    onTextureReady
  ));

  scene.addChild(createLabel(fitText(seat.displayName, 290, 28), x - (seatWidth / 2) + 104, y - 24, { fontSize: 28, fontWeight: "700" }));
  scene.addChild(createLabel(`${t(language, "stat.hp")} ${hp}  |  ${t(language, "stat.power")} ${seat.powerLevel ?? 1}`, x - (seatWidth / 2) + 104, y + 8, { fontSize: 18, fill: "#d0d9cf" }));

  if (seat.isHost) {
    scene.addChild(createRect(x + (seatWidth / 2) - 92, y - (seatHeight / 2) + 14, 70, 24, "#816024", 1, 999));
    scene.addChild(createLabel(t(language, "seat.host").toUpperCase(), x + (seatWidth / 2) - 57, y - (seatHeight / 2) + 26, { fontSize: 13, fill: "#fff0c1", fontWeight: "700" }, 0.5, 0.5));
  }

  if (isCurrentTurn) {
    const glow = createRect(x - (seatWidth / 2), y - (seatHeight / 2), seatWidth, seatHeight, "#d6b058", 0.16, 24);
    glow.tint = 0xffd879;
    scene.addChild(glow);
  }

  if (isDead) {
    scene.addChild(createRect(x - (seatWidth / 2), y - (seatHeight / 2), seatWidth, seatHeight, "#c8d4cc", 0.55, 24));
  }
}

function renderTableScene(
  scene: Container,
  match: MatchState,
  playerSeatNumber: number,
  layoutSeatNumber: number,
  language: AppLanguage,
  presentationLockActive: boolean,
  displayedTurnSeatNumber: number | null,
  turnPastilleState: TurnPastilleAnimationState,
  activeActionVisual: ActiveActionVisualState | null,
  centerResponseCards: CardView[],
  interactionState: PixiInteractionState,
  focusFromCardInstanceId: string,
  focusToCardInstanceId: string,
  focusProgress: number,
  activeDamageBursts: Record<number, FloatingBurstState>,
  activeHealBursts: Record<number, FloatingBurstState>,
  activeImpactFlashes: Record<number, ImpactFlashState>,
  activeTelekinesieReveal: ActiveTelekinesieRevealState | null,
  seatResponseThumbnailsBySeat: Record<number, SeatResponseThumbnailState>,
  seatResistancePills: Record<number, SeatResistancePillState>,
  devSeatVisualEffectsBySeat: Record<number, SeatVisualEffectId[]>,
  activeCardFlights: CardFlightState[],
  activePlaybackArrows: PlaybackArrowState[],
  opponentCursors: Record<number, OpponentCursorState>,
  onTextureReady: () => void,
  displayedHpBySeat: Record<number, number>,
  targetHintDismissed: boolean,
  batonLoadScale: number,
  replayNow: number,
  localHandDealAnimatingUntil: ReadonlyMap<string, number>,
  viergeReplayCard?: CardView | null
): TableInteractionGeometry {
  const now = Date.now();
  const ordreGlowPulse = 0.5 + Math.sin(now / 260) * 0.5;
  const playerSeat = getLocalSeat(match, playerSeatNumber);
  const layoutSeat = getLocalSeat(match, layoutSeatNumber);
  const spectatorMode = playerSeat == null && match.status === "in_progress";
  const sortedLocalHand = spectatorMode ? [] : sortLocalHand(playerSeat?.hand);
  const opponents = getOpponentSeats(match, layoutSeatNumber);
  const anchors = getOpponentAnchorsForPlayerCount(match.seats.length);
  const currentTurnSeatNumber = displayedTurnSeatNumber ?? undefined;
  const pendingAction = presentationLockActive ? undefined : match.game?.pendingAction;
  // While replay is locked to earlier boxes, ignore the live lastPlayedCard from the
  // freshly synced match state so the next action cannot leak into the center stack.
  const lastPlayedCard = presentationLockActive ? null : (match.game?.lastPlayedCard?.card ?? null);
  const centerSlotTopY = pendingAction == null ? 218 : 228;
  const centerSlotHeight = 278;
  const centerSlotCardCenterOffsetY = 0;
  const isLocalResponder = !spectatorMode
    && pendingAction != null
    && pendingAction.responderSeatNumbers.includes(playerSeatNumber);
  const responseSlot: RectGeometry | null = isLocalResponder
    ? { x: 538, y: centerSlotTopY - 16, width: 140, height: centerSlotHeight }
    : null;
  const visibleResponseSlot: RectGeometry | null = responseSlot
    ?? (centerResponseCards.length > 0 ? { x: 538, y: centerSlotTopY - 16, width: 140, height: centerSlotHeight } : null);
  const draggedCard = playerSeat?.hand?.find((card) =>
    card.instanceId === (interactionState.arrowDrag?.cardInstanceId ?? interactionState.draggingCardInstanceId)
  );
  const lapidationTargetSeatNumbers = getLapidationTargetSeatNumbers(match, playerSeatNumber, draggedCard);
  const activeObjectArrowCard = interactionState.arrowDrag?.source === "object"
    ? playerSeat?.objects?.find((card) => card.instanceId === interactionState.arrowDrag?.cardInstanceId)
    : undefined;
  const playSlot: RectGeometry = pendingAction == null
    ? { x: 700, y: centerSlotTopY - 16, width: 200, height: centerSlotHeight }
    : { x: 690, y: centerSlotTopY - 16, width: 212, height: centerSlotHeight };
  const handArea: RectGeometry = { x: 390, y: 660, width: 820, height: 180 };
  const discardZone: RectGeometry = spectatorMode
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: handArea.x - 198, y: handArea.y, width: 182, height: handArea.height };
  const seatTargets: SeatTargetGeometry[] = [];
  const objectTargets: ObjectTargetGeometry[] = [];
  const inspectTargets: InspectTargetGeometry[] = [];
  const seatCenters = new Map<number, StagePoint>();
  const seatRects = new Map<number, RectGeometry>();
  const seatShakeOffsets = new Map<number, number>();
  const responseCards = centerResponseCards.length > 0
    ? centerResponseCards
    : (pendingAction?.responders
    .flatMap((responder) => responder.cards ?? (responder.card == null ? [] : [responder.card]))
    .filter((card) => getResponseChoiceForCard(card) != null)
    ?? []);
  const displayedAction = activeActionVisual ?? pendingAction ?? null;
  const displayedCenterCard = displayedAction?.card ?? lastPlayedCard ?? null;
  const centerStackCards = [
    ...(displayedAction != null && lastPlayedCard != null && lastPlayedCard.instanceId !== displayedAction.card.instanceId
      ? [lastPlayedCard]
      : []),
    ...(displayedCenterCard != null ? [displayedCenterCard] : [])
  ].slice(-3);

  scene.addChild(createRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT, "#0b1710"));
  scene.addChild(createRect(32, 32, STAGE_WIDTH - 64, STAGE_HEIGHT - 64, "#4f3518", 1, 40));
  scene.addChild(createRect(58, 58, STAGE_WIDTH - 116, STAGE_HEIGHT - 116, "#1b5a29", 1, 34));
  scene.addChild(createCircle(STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 260, "#2d7a3d", 0.4));
  scene.addChild(createCircle(STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 180, "#0e2314", 0.32));
  const turnPastilleInsertIndex = scene.children.length;
  if (!spectatorMode && playerSeat != null) {
    scene.addChild(createRect(handArea.x, handArea.y, handArea.width, handArea.height, "#101812", 0.56, 34));
    if (playerSeat.seatNumber === currentTurnSeatNumber) {
    scene.addChild(createRect(handArea.x, handArea.y, handArea.width, handArea.height, "#c8900a", 0.24, 34));
    // Inner layer: bright yellow-gold centered, narrower — creates gradient impression
    const cw = handArea.width * 0.62;
    const cx = handArea.x + (handArea.width - cw) / 2;
    scene.addChild(createRect(cx, handArea.y, cw, handArea.height, "#f5d040", 0.14, 34));
    const border = new Graphics();
    border.roundRect(handArea.x, handArea.y, handArea.width, handArea.height, 34);
    border.stroke({ color: "#f5c820", alpha: 0.72, width: 2.5 });
    scene.addChild(border);
    }
    const powerBadgeWidth = 112;
    const powerBadgeHeight = 38;
    const powerBadgeX = handArea.x + 18;
    const powerBadgeY = handArea.y + 14;
    scene.addChild(createRect(powerBadgeX, powerBadgeY, powerBadgeWidth, powerBadgeHeight, "#121712", 0.94, 999));
    scene.addChild(createLabel(`${playerSeat.powerLevel ?? 1} ${t(language, "stat.powerShort")}`, powerBadgeX + powerBadgeWidth / 2, powerBadgeY + powerBadgeHeight / 2, {
      fontSize: 19,
      fontWeight: "700",
      fill: "#f5efde"
    }, 0.5, 0.5));

    const hpBadgeWidth = 112;
    const hpBadgeHeight = 38;
    const hpBadgeX = handArea.x + handArea.width - hpBadgeWidth - 18;
    const hpBadgeY = handArea.y + 14;
    scene.addChild(createRect(hpBadgeX, hpBadgeY, hpBadgeWidth, hpBadgeHeight, "#121712", 0.94, 999));
    scene.addChild(createLabel(`${t(language, "stat.hp")} ${displayedHpBySeat[playerSeat.seatNumber] ?? playerSeat.hp}`, hpBadgeX + hpBadgeWidth / 2, hpBadgeY + hpBadgeHeight / 2, {
      fontSize: 19,
      fontWeight: "700",
      fill: "#f5efde"
    }, 0.5, 0.5));
    const localDisplayedHp = displayedHpBySeat[playerSeat.seatNumber];
    const localIsDead = localDisplayedHp != null ? localDisplayedHp <= 0 : playerSeat.isAlive === false;
    if (localIsDead) {
      scene.addChild(createRect(handArea.x, handArea.y, handArea.width, handArea.height, "#c8d4cc", 0.55, 34));
    }
  }

  for (const seat of match.seats) {
    const damageBurst = activeDamageBursts[seat.seatNumber];
    if (damageBurst == null) {
      continue;
    }

    const progress = Math.max(0, Math.min(1, (replayNow - damageBurst.startedAt) / damageBurst.durationMs));
    const shake = Math.sin(progress * Math.PI * 9) * (1 - progress) * 14;
    seatShakeOffsets.set(seat.seatNumber, shake);
  }

  anchors.forEach((anchor, index) => {
    const seat = opponents[index];
    if (seat == null) {
      return;
    }

    const seatX = anchor.x * STAGE_WIDTH / 100 + (seatShakeOffsets.get(seat.seatNumber) ?? 0);
    const seatY = anchor.y * STAGE_HEIGHT / 100;
    const seatWidth = 252;
    const seatHeight = 62;
    seatCenters.set(seat.seatNumber, { x: seatX, y: seatY });
    seatRects.set(seat.seatNumber, {
      x: seatX - seatWidth / 2,
      y: seatY - seatHeight / 2,
      width: seatWidth,
      height: seatHeight
    });
      const targetable = isSeatTargetable(
        draggedCard,
        seat,
        playerSeatNumber,
        undefined,
        viergeReplayCard ?? undefined,
        lapidationTargetSeatNumbers
      )
        || (
          isAttackStaffObjectCard(activeObjectArrowCard)
          && activeObjectArrowCard.canPlay === true
          && activeObjectArrowCard.usedThisTurn !== true
          && playerSeat?.seatNumber === currentTurnSeatNumber
          && pendingAction == null
          && seat.seatNumber !== playerSeatNumber
          && seat.isAlive !== false
          && !(seat.objects ?? []).some((card) => card.cardId === "sanctuaire-demmerlaus")
          && !(seat.statuses ?? []).some((card) =>
            card.cardId === "potion-dinvincibilite"
            || card.cardId === "expulsion-temporaire"
            || card.cardId === "invisibilite"
          )
        );
    if (targetable) {
      seatTargets.push({
        seatNumber: seat.seatNumber,
        x: seatX - seatWidth / 2,
        y: seatY - seatHeight / 2,
        width: seatWidth,
        height: seatHeight,
        centerX: seatX,
        centerY: seatY
      });
    }

    renderSeatNode(
      scene,
      seat,
      seatX,
      seatY,
      seat.seatNumber === currentTurnSeatNumber,
      false,
      targetable && (
        interactionState.dragHoverTarget?.kind === "seat"
        || interactionState.arrowDrag?.nearestSeatNumber === seat.seatNumber
      ) && (
        interactionState.dragHoverTarget?.seatNumber === seat.seatNumber
        || interactionState.arrowDrag?.nearestSeatNumber === seat.seatNumber
      ),
      onTextureReady,
      displayedHpBySeat[seat.seatNumber],
      language,
      displayedHpBySeat[seat.seatNumber] != null ? displayedHpBySeat[seat.seatNumber] > 0 : undefined
    );

    if (interactionState.arrowDrag != null && targetable && !targetHintDismissed) {
      scene.addChild(createLabel(t(language, "table.hintTargetSeat"), seatX, seatY + seatHeight / 2 + 14, {
        fontSize: 13,
        fill: "#8aaa90",
        align: "center"
      }, 0.5, 0));
    }

    const opponentObjectRow = renderObjectRow(
      scene,
      seat,
      seatX,
      seatY + seatHeight / 2 - 8,
      62,
      84,
      10,
      playerSeatNumber,
      draggedCard,
      interactionState.dragHoverTarget,
      undefined,
      onTextureReady,
      viergeReplayCard
    );
    objectTargets.push(...opponentObjectRow.objectTargets);
    inspectTargets.push(...opponentObjectRow.inspectTargets);
  });

  if (!spectatorMode && playerSeat != null) {
    seatCenters.set(playerSeat.seatNumber, { x: STAGE_WIDTH / 2, y: 790 });
    seatRects.set(playerSeat.seatNumber, handArea);
    const localSelfTargetable = isSeatTargetable(
      draggedCard,
      playerSeat,
      playerSeatNumber,
      undefined,
      viergeReplayCard ?? undefined,
      lapidationTargetSeatNumbers
    );
    if (localSelfTargetable) {
      seatTargets.push({
        seatNumber: playerSeat.seatNumber,
        x: handArea.x,
        y: handArea.y,
        width: handArea.width,
        height: handArea.height,
        centerX: STAGE_WIDTH / 2,
        centerY: handArea.y + handArea.height / 2
      });
      const localSelfHovered = interactionState.arrowDrag?.nearestSeatNumber === playerSeat.seatNumber
        || (
          interactionState.dragHoverTarget?.kind === "seat"
          && interactionState.dragHoverTarget.seatNumber === playerSeat.seatNumber
        );
      scene.addChild(createRect(
        handArea.x - 7,
        handArea.y - 7,
        handArea.width + 14,
        handArea.height + 14,
        "#d23a3a",
        localSelfHovered ? 0.26 : 0.12,
        38
      ));
    }
    const localObjectRow = renderObjectRow(
      scene,
      playerSeat,
      STAGE_WIDTH / 2 + (seatShakeOffsets.get(playerSeat.seatNumber) ?? 0),
      500,
      72,
      98,
      12,
      playerSeatNumber,
      draggedCard,
      interactionState.dragHoverTarget,
      batonLoadScale,
      onTextureReady,
      viergeReplayCard
    );
    objectTargets.push(...localObjectRow.objectTargets);
    inspectTargets.push(...localObjectRow.inspectTargets);
  } else if (spectatorMode && layoutSeat != null) {
    const spectatorSeatX = STAGE_WIDTH / 2 + (seatShakeOffsets.get(layoutSeat.seatNumber) ?? 0);
    const spectatorSeatY = 790;
    const spectatorSeatWidth = 252;
    const spectatorSeatHeight = 62;
    seatCenters.set(layoutSeat.seatNumber, { x: spectatorSeatX, y: spectatorSeatY });
    seatRects.set(layoutSeat.seatNumber, {
      x: spectatorSeatX - spectatorSeatWidth / 2,
      y: spectatorSeatY - spectatorSeatHeight / 2,
      width: spectatorSeatWidth,
      height: spectatorSeatHeight
    });
    renderSeatNode(
      scene,
      layoutSeat,
      spectatorSeatX,
      spectatorSeatY,
      layoutSeat.seatNumber === currentTurnSeatNumber,
      false,
      false,
      onTextureReady,
      displayedHpBySeat[layoutSeat.seatNumber],
      language,
      displayedHpBySeat[layoutSeat.seatNumber] != null ? displayedHpBySeat[layoutSeat.seatNumber] > 0 : undefined
    );
    const spectatorObjectRow = renderObjectRow(
      scene,
      layoutSeat,
      spectatorSeatX,
      645,
      72,
      98,
      12,
      playerSeatNumber,
      draggedCard,
      interactionState.dragHoverTarget,
      undefined,
      onTextureReady,
      viergeReplayCard
    );
    objectTargets.push(...spectatorObjectRow.objectTargets);
    inspectTargets.push(...spectatorObjectRow.inspectTargets);
  }

  const turnPastilleRenderState = getTurnPastilleRenderState(now, playerSeatNumber, seatRects, turnPastilleState);
  if (turnPastilleRenderState != null) {
    renderTurnPastille(scene, turnPastilleRenderState, turnPastilleInsertIndex);
  }

  for (const [seatNumber, rect] of seatRects.entries()) {
    const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);
    const previewEffects = new Set(devSeatVisualEffectsBySeat[seatNumber] ?? []);
    const responseThumbnail = seatResponseThumbnailsBySeat[seatNumber];
    if (seatHasFrozenStatus(seat)) {
      previewEffects.add("frozen");
    }
    for (const effectId of DEV_SEAT_VISUAL_EFFECT_IDS) {
      if (!previewEffects.has(effectId)) {
        continue;
      }
      renderSeatVisualOverlay(scene, rect, seatNumber === playerSeatNumber, effectId, replayNow, onTextureReady);
    }
    if (responseThumbnail != null) {
      renderSeatResponseThumbnail(
        scene,
        rect,
        responseThumbnail.card,
        seatNumber === playerSeatNumber,
        seat?.isAlive === false,
        onTextureReady,
        viergeReplayCard
      );
    }

    if (seatHasSleepStatus(seat)) {
      renderSleepSeatOverlay(scene, rect, seatNumber === playerSeatNumber, replayNow);
    }

    const impactFlash = activeImpactFlashes[seatNumber];
    if (impactFlash != null) {
      const progress = Math.max(0, Math.min(1, (replayNow - impactFlash.startedAt) / impactFlash.durationMs));
      const pulse = Math.sin(progress * Math.PI);
      const spread = 6 + pulse * 22;
      scene.addChild(createRect(
        rect.x - spread,
        rect.y - spread,
        rect.width + spread * 2,
        rect.height + spread * 2,
        "#ff5b5b",
        0.08 + pulse * 0.12,
        28 + pulse * 8
      ));
    }

    const resistancePill = seatResistancePills[seatNumber];
    if (resistancePill != null) {
      renderSeatResistancePill(scene, rect, seatNumber === playerSeatNumber, resistancePill, language);
    }

    const damageBurst = activeDamageBursts[seatNumber];
    if (damageBurst != null) {
      const progress = Math.max(0, Math.min(1, (replayNow - damageBurst.startedAt) / damageBurst.durationMs));
      const burstAnchor = getSeatHpBurstAnchor(seatNumber, playerSeatNumber, rect);
      const lift = (seatNumber === playerSeatNumber ? 58 : 42) * (1 - Math.pow(1 - progress, 2));
      const burstX = burstAnchor.x;
      const burstY = burstAnchor.y - 4 - lift;
      const burst = createLabel(`-${damageBurst.amount} ${t(language, "stat.hp")}`, burstX, burstY, {
        fontSize: seatNumber === playerSeatNumber ? 30 : 22,
        fontWeight: "700",
        fill: "#ff5c5c",
        stroke: { color: "#8f1414", width: 3 }
      }, 0.5, 0.5);
      burst.scale.set(progress < 0.18 ? 0.78 + progress * 2.15 : 1.16 - (progress - 0.18) * 0.26);
      burst.alpha = progress < 0.72 ? 0.98 : Math.max(0, 1 - ((progress - 0.72) / 0.28));
      scene.addChild(burst);
    }

    const healBurst = activeHealBursts[seatNumber];
    if (healBurst != null) {
      const progress = Math.max(0, Math.min(1, (replayNow - healBurst.startedAt) / healBurst.durationMs));
      const burstAnchor = getSeatHpBurstAnchor(seatNumber, playerSeatNumber, rect);
      const lift = (seatNumber === playerSeatNumber ? 46 : 34) * (1 - Math.pow(1 - progress, 2));
      const driftX = Math.sin(progress * Math.PI) * 8;
      const burstX = burstAnchor.x + driftX;
      const burstY = burstAnchor.y - 4 - lift;
      const burst = createLabel(`+${healBurst.amount} ${t(language, "stat.hp")}`, burstX, burstY, {
        fontSize: seatNumber === playerSeatNumber ? 30 : 22,
        fontWeight: "700",
        fill: "#5df27d",
        stroke: { color: "#148033", width: 3 }
      }, 0.5, 0.5);
      burst.scale.set(progress < 0.2 ? 0.74 + progress * 1.85 : 1.11 - (progress - 0.2) * 0.16);
      burst.alpha = progress < 0.74 ? 0.98 : Math.max(0, 1 - ((progress - 0.74) / 0.26));
      scene.addChild(burst);
    }
  }

  if (visibleResponseSlot != null) {
    scene.addChild(createRect(visibleResponseSlot.x, visibleResponseSlot.y, visibleResponseSlot.width, visibleResponseSlot.height, "#102114", 0.92, 28));
    if (responseSlot != null && interactionState.dragHoverTarget?.kind === "response-slot") {
      scene.addChild(createRect(responseSlot.x - 4, responseSlot.y - 4, responseSlot.width + 8, responseSlot.height + 8, "#8ac8ff", 0.26, 32));
    }
    const visibleResponseCards = responseCards.slice(-3);
    if (responseSlot != null && visibleResponseCards.length === 0) {
      scene.addChild(createLabel(
        t(language, "table.dropDefense"),
        responseSlot.x + responseSlot.width / 2,
        responseSlot.y + responseSlot.height / 2,
        {
          fontSize: 14,
          fontWeight: "600",
          fill: "#a9b8b4",
          align: "center",
          wordWrap: true,
          wordWrapWidth: responseSlot.width - 28,
          lineHeight: 18
        },
        0.5,
        0.5
      ));
    }
    visibleResponseCards.forEach((card, index) => {
      scene.addChild(createCenterCardFace(
        card,
        visibleResponseSlot.x + visibleResponseSlot.width / 2,
        visibleResponseSlot.y + visibleResponseSlot.height / 2 + centerSlotCardCenterOffsetY - (visibleResponseCards.length - 1 - index) * 4,
        118,
        165,
        0,
        "thumb",
        onTextureReady,
        viergeReplayCard
      ));
      inspectTargets.push({
        card,
        group: "response",
        x: visibleResponseSlot.x + visibleResponseSlot.width / 2 - 59,
        y: visibleResponseSlot.y + visibleResponseSlot.height / 2 + centerSlotCardCenterOffsetY - (visibleResponseCards.length - 1 - index) * 4 - 82.5,
        width: 118,
        height: 165
      });
    });
  }

  scene.addChild(createRect(playSlot.x, playSlot.y, playSlot.width, playSlot.height, "#102114", 0.92, 28));
  if (interactionState.dragHoverTarget?.kind === "play-slot") {
    scene.addChild(createRect(playSlot.x - 4, playSlot.y - 4, playSlot.width + 8, playSlot.height + 8, "#f0c96d", 0.24, 32));
  }
  if (centerStackCards.length === 0) {
    scene.addChild(createLabel(t(language, "table.hintPlaySlot"), playSlot.x + playSlot.width / 2, playSlot.y + playSlot.height / 2, {
      fontSize: 16,
      fill: "#5a7a62",
      wordWrap: true,
      wordWrapWidth: playSlot.width - 16,
      align: "center"
    }, 0.5, 0.5));
  } else {
    centerStackCards.forEach((card, index) => {
      const liftOffset = (centerStackCards.length - 1 - index) * 10;
      const stackOffset = (centerStackCards.length - 1 - index) * 14;
      const isTop = index === centerStackCards.length - 1;
      scene.addChild(createCenterCardFace(
        card,
        playSlot.x + playSlot.width / 2 + stackOffset,
        playSlot.y + playSlot.height / 2 + centerSlotCardCenterOffsetY - liftOffset,
        isTop ? 156 : 142,
        isTop ? 220 : 200,
        isTop ? 0 : -0.08,
        "thumb",
        onTextureReady,
        viergeReplayCard
      ));
      inspectTargets.push({
        card,
        group: "center",
        x: playSlot.x + playSlot.width / 2 + stackOffset - (isTop ? 78 : 71),
        y: playSlot.y + playSlot.height / 2 + centerSlotCardCenterOffsetY - liftOffset - (isTop ? 110 : 100),
        width: isTop ? 156 : 142,
        height: isTop ? 220 : 200
      });
    });
  }

  if (displayedAction != null) {
    const playCenterX = playSlot.x + playSlot.width / 2;
    const playCenterY = playSlot.y + playSlot.height / 2;
    const animateSeatTargets = displayedAction.targetObjectInstanceId == null;
    const actorCenter = seatCenters.get(displayedAction.actorSeatNumber);
    const actorRect = seatRects.get(displayedAction.actorSeatNumber);
    if (actorCenter != null && actorRect != null) {
      const actorEdge = rectEdgePoint(playCenterX, playCenterY, actorRect);
      const centerEdgeFromActor = rectEdgePoint(actorCenter.x, actorCenter.y, playSlot);
      scene.addChild(createCurvedArrow(
        actorEdge.x,
        actorEdge.y,
        centerEdgeFromActor.x,
        centerEdgeFromActor.y,
        "#86cfff",
        6
      ));
    }

    if (animateSeatTargets) {
      for (const targetSeatNumber of displayedAction.targetSeatNumbers) {
        if (targetSeatNumber === displayedAction.actorSeatNumber) {
          continue;
        }

        const targetCenter = seatCenters.get(targetSeatNumber);
        const targetRect = seatRects.get(targetSeatNumber);
        if (targetCenter == null || targetRect == null) {
          continue;
        }

        const centerEdgeToTarget = rectEdgePoint(targetCenter.x, targetCenter.y, playSlot);
        const targetEdge = rectEdgePoint(playCenterX, playCenterY, targetRect);
        const reflectToSeatNumber = "mirroredTargets" in displayedAction
          ? displayedAction.mirroredTargets?.[targetSeatNumber]
          : undefined;
        const isMirrored = reflectToSeatNumber != null;

        scene.addChild(createCurvedArrow(
          centerEdgeToTarget.x,
          centerEdgeToTarget.y,
          targetEdge.x,
          targetEdge.y,
          isMirrored ? "#f5a030" : "#d23a3a",
          8
        ));

        if (isMirrored) {
          const reflectRect = seatRects.get(reflectToSeatNumber);
          if (reflectRect != null) {
            const reflectCenter = getRectCenter(reflectRect);
            const fromEdge = rectEdgePoint(reflectCenter.x, reflectCenter.y, targetRect);
            const toEdge = rectEdgePoint(targetCenter.x, targetCenter.y, reflectRect);
            scene.addChild(createCurvedArrow(fromEdge.x, fromEdge.y, toEdge.x, toEdge.y, "#d23a3a", 8));
          }
        }
      }
    }

    if (displayedAction.targetObjectInstanceId != null) {
      const objectInspectTarget = inspectTargets.find((target) =>
        target.card.instanceId === displayedAction.targetObjectInstanceId
      );
      if (objectInspectTarget != null) {
        scene.addChild(createCurvedArrow(
          playCenterX,
          playCenterY,
          objectInspectTarget.x + objectInspectTarget.width / 2,
          objectInspectTarget.y + objectInspectTarget.height / 2,
          "#d23a3a",
          8
        ));
      }
    }
  }

  for (const playbackArrow of activePlaybackArrows) {
    const progress = Math.max(0, Math.min(1, (replayNow - playbackArrow.startedAt) / playbackArrow.durationMs));
    const arrow = createCurvedArrow(
      playbackArrow.origin.x,
      playbackArrow.origin.y,
      playbackArrow.target.x,
      playbackArrow.target.y,
      playbackArrow.color,
      playbackArrow.width
    );
    arrow.alpha = progress < 0.78 ? 0.98 : Math.max(0, 1 - ((progress - 0.78) / 0.22));
    scene.addChild(arrow);
  }

  for (const [rawSeatNumber, cursor] of Object.entries(opponentCursors)) {
    if (now - cursor.ts > GHOST_TIMEOUT_MS || cursor.targetSeatNumber == null) {
      continue;
    }

    const actorSeatNumber = Number(rawSeatNumber);
    const actorRect = seatRects.get(actorSeatNumber);
    const targetRect = seatRects.get(cursor.targetSeatNumber);
    if (actorRect == null || targetRect == null) {
      continue;
    }

    const actorCenter = getRectCenter(actorRect);
    const targetCenter = getRectCenter(targetRect);
    const actorEdge = rectEdgePoint(targetCenter.x, targetCenter.y, actorRect);
    const targetEdge = rectEdgePoint(actorCenter.x, actorCenter.y, targetRect);
    const ghostArrow = createCurvedArrow(
      actorEdge.x,
      actorEdge.y,
      targetEdge.x,
      targetEdge.y,
      "#9ca6ad",
      8
    );
    ghostArrow.alpha = 0.44;
    scene.addChild(ghostArrow);
  }

  const handLayouts = spectatorMode
    ? []
    : buildHandLayouts(
      sortedLocalHand,
      interactionState,
      focusFromCardInstanceId,
      focusToCardInstanceId,
      focusProgress,
      localHandDealAnimatingUntil,
      now
    );
  if (!spectatorMode) {
    const arrowOverDiscard = interactionState.arrowDrag != null
      && pointInRect(
        {
          x: interactionState.arrowDrag.pointerX,
          y: interactionState.arrowDrag.pointerY
        },
        discardZone
      );
    scene.addChild(createRect(discardZone.x, discardZone.y, discardZone.width, discardZone.height, "#11110f", 0.9, 22));
    if (interactionState.dragHoverTarget?.kind === "discard" || arrowOverDiscard) {
      scene.addChild(createRect(discardZone.x - 4, discardZone.y - 4, discardZone.width + 8, discardZone.height + 8, "#e4795f", 0.24, 24));
    }
    scene.addChild(createLabel(t(language, "table.discard"), discardZone.x + discardZone.width / 2, discardZone.y + discardZone.height / 2, {
      fontSize: 18,
      fill: "#f7d7cd",
      fontWeight: "700"
    }, 0.5, 0.5));

    const handContainer = new Container();
    const handMask = new Graphics()
      .roundRect(58, 58, STAGE_WIDTH - 116, STAGE_HEIGHT - 116, 34)
      .fill({ color: 0xffffff });
    handContainer.addChild(handMask);
    handContainer.mask = handMask;
    scene.addChild(handContainer);

    const orderedHandLayouts = [...handLayouts].sort((left, right) => left.zIndex - right.zIndex);
    for (const layout of orderedHandLayouts) {
      const isDragging = interactionState.draggingCardInstanceId === layout.card.instanceId;
      if (isDragging) {
        continue;
      }

      handContainer.addChild(createCardFace(
        layout,
        false,
        "full",
        onTextureReady,
        viergeReplayCard,
        shouldHighlightOrdreDemmerlausResponse(match, playerSeatNumber, layout.card),
        ordreGlowPulse
      ));
    }

    if (interactionState.draggingCardInstanceId !== "") {
      const dragLayout = handLayouts.find((layout) => layout.card.instanceId === interactionState.draggingCardInstanceId);
      if (dragLayout != null) {
        const snappedObjectTarget = interactionState.dragHoverTarget?.kind === "object"
          ? objectTargets.find((target) => target.objectInstanceId === interactionState.dragHoverTarget?.objectInstanceId)
          : undefined;
        const snappedObjectCenter = snappedObjectTarget == null ? null : getRectCenter(snappedObjectTarget);
        const floatingLayout: HandCardLayout = {
          ...dragLayout,
          x: snappedObjectCenter?.x ?? interactionState.dragPointerX,
          y: snappedObjectCenter?.y ?? interactionState.dragPointerY,
          rotation: 0,
          scale: 1.14
        };
        scene.addChild(createCardFace(
          floatingLayout,
          false,
          "full",
          onTextureReady,
          viergeReplayCard,
          shouldHighlightOrdreDemmerlausResponse(match, playerSeatNumber, floatingLayout.card),
          ordreGlowPulse
        ));
      }
    }

    if (interactionState.arrowDrag != null) {
      const nearestSeat = seatTargets.find((target) => target.seatNumber === interactionState.arrowDrag?.nearestSeatNumber);
      const nearestObject = objectTargets.find((target) => target.objectInstanceId === interactionState.arrowDrag?.nearestObjectInstanceId);
      const nearestObjectCenter = nearestObject == null ? null : getRectCenter(nearestObject);
      const arrowOverDiscard = interactionState.arrowDrag.source === "hand" && pointInRect(
        {
          x: interactionState.arrowDrag.pointerX,
          y: interactionState.arrowDrag.pointerY
        },
        discardZone
      );
      const discardCenter = arrowOverDiscard ? getRectCenter(discardZone) : null;
      const tipX = discardCenter?.x ?? nearestObjectCenter?.x ?? nearestSeat?.centerX ?? interactionState.arrowDrag.pointerX;
      const tipY = discardCenter?.y ?? nearestObjectCenter?.y ?? nearestSeat?.centerY ?? interactionState.arrowDrag.pointerY;
      const originX = interactionState.arrowDrag.source === "hand"
        ? STAGE_WIDTH / 2
        : interactionState.arrowDrag.originX;
      const originY = interactionState.arrowDrag.source === "hand"
        ? STAGE_HEIGHT + 44
        : interactionState.arrowDrag.originY;
      const arrow = createCurvedArrow(
        originX,
        originY,
        tipX,
        tipY,
        nearestObject != null || nearestSeat != null || discardCenter != null ? "#d23a3a" : "#b45d5d",
        nearestObject != null || nearestSeat != null || discardCenter != null ? 12 : 8,
        nearestObject == null
      );
      scene.addChild(arrow);
      if (interactionState.arrowDrag.source === "hand") {
        const arrowCardLayout = handLayouts.find((layout) => layout.card.instanceId === interactionState.arrowDrag?.cardInstanceId);
        if (arrowCardLayout != null) {
          const lineDx = tipX - originX;
          const lineDy = tipY - originY;
          const lineLength = Math.max(1, Math.hypot(lineDx, lineDy));
          const unitX = lineDx / lineLength;
          const unitY = lineDy / lineLength;
          const thumbCenterX = tipX - unitX * 68;
          const thumbCenterY = tipY - unitY * 68 + 46;
          scene.addChild(createCardFace({
            ...arrowCardLayout,
            x: thumbCenterX,
            y: thumbCenterY,
            rotation: 0,
            scale: 0.34,
            zIndex: 1200
          }, false, "thumb", onTextureReady, viergeReplayCard));
        }
      }
    }
  }

  for (const flight of activeCardFlights) {
    const progress = Math.max(0, Math.min(1, (replayNow - flight.startedAt) / flight.durationMs));
    const eased = easeOutCubic(progress);
    const midX = (flight.from.x + flight.to.x) / 2;
    const midY = (flight.from.y + flight.to.y) / 2 - flight.arcHeight;
    const inv = 1 - eased;
    const flightX = inv * inv * flight.from.x + 2 * inv * eased * midX + eased * eased * flight.to.x;
    const flightY = inv * inv * flight.from.y + 2 * inv * eased * midY + eased * eased * flight.to.y;
    const rotation = flight.rotationFrom + (flight.rotationTo - flight.rotationFrom) * eased + Math.sin(progress * Math.PI) * 0.08;
    const scale = progress < 0.18
      ? 0.88 + progress * 1.06
      : progress > 0.84
        ? 1.07 - ((progress - 0.84) / 0.16) * 0.12
        : 1.07;
    const flightCard = createFlightCardFace(
      flight.card,
      flightX,
      flightY,
      flight.width,
      flight.height,
      rotation,
      flight.tintColor,
      onTextureReady
    );
    flightCard.scale.set(scale);
    flightCard.alpha = progress < 0.9 ? 0.98 : Math.max(0, 1 - ((progress - 0.9) / 0.1));
    scene.addChild(flightCard);
  }

  if (activeTelekinesieReveal != null) {
    const visibleLayouts = activeTelekinesieReveal.layouts.filter((layout) =>
      activeTelekinesieReveal.showNonProjected || layout.isProjected
    );
    if (visibleLayouts.length > 0) {
      if (activeTelekinesieReveal.displayMode === "large") {
        scene.addChild(createRect(238, 112, 1124, 610, "#050505", 0.58, 26));
        scene.addChild(createLabel("Telekinesie", STAGE_WIDTH / 2, 146, {
          fontSize: 28,
          fill: "#f2dfbe",
          fontWeight: "700"
        }, 0.5, 0.5));
      }
      for (const layout of visibleLayouts) {
        const cardFace = createCenterCardFace(
          layout.card,
          layout.x,
          layout.y,
          layout.width,
          layout.height,
          0,
          activeTelekinesieReveal.displayMode === "large" ? "full" : "thumb",
          onTextureReady
        );
        if (!layout.isProjected) {
          cardFace.alpha = 0.72;
        }
        scene.addChild(cardFace);
      }
    }
  }

  return {
    handLayouts,
    seatTargets,
    objectTargets,
    inspectTargets,
    playSlot,
    responseSlot,
    discardZone,
    seatCenters,
    seatRects
  };
}

function renderEventLogEntry(entry: EventLogEntry): string {
  return `
    <article class="pixi-event-log-entry">
      <p>${escapeHtml(entry.content).replaceAll("\n", "<br />")}</p>
    </article>
  `;
}

interface ReplayDebugPanelState {
  speedMultiplier: number;
  paused: boolean;
  canRewind: boolean;
}

interface PublicChangelogContent {
  title: string;
  items: string[];
}

interface PublicChangelog {
  version: string;
  releasedAt: string;
  en: PublicChangelogContent;
  fr: PublicChangelogContent;
}

interface PublicVersionInfo {
  version: string;
  releasedAt: string;
  commit: string;
  branch: string;
}

function renderEventLog(
  match: MatchState,
  language: AppLanguage,
  seenEventMessageIds: Set<string>,
  eventLogExpanded: boolean,
  eventLogWidth: number,
  eventLogHeight: number,
  enableDevTools: boolean,
  replayDebug: ReplayDebugPanelState
): string {
  const entries = buildEventLogEntries(match, language).filter(
    (entry) => seenEventMessageIds.has(entry.id)
  );
  const visibleEntries = eventLogExpanded ? entries : entries.slice(-3);
  const messageMarkup =
    visibleEntries.length > 0
      ? visibleEntries.map((entry) => renderEventLogEntry(entry)).join("")
      : `<p class="pixi-event-log-empty">${t(language, "eventLog.empty")}</p>`;

  const panelStyle = `style="--event-log-width:${eventLogWidth}px; --event-log-height:${eventLogHeight}px;"`;
  const speedLabel = Number(replayDebug.speedMultiplier.toFixed(2)).toString();
  const controlsMarkup = enableDevTools ? `
    <div class="pixi-replay-debug">
      <div class="pixi-replay-debug__header">
        <strong>${escapeHtml(t(language, "replayDebug.title"))}</strong>
        <span>${escapeHtml(`${t(language, "replayDebug.speed")} ${speedLabel}x | ${t(language, replayDebug.paused ? "replayDebug.paused" : "replayDebug.playing")}`)}</span>
      </div>
      <div class="pixi-replay-debug__controls">
        <button type="button" class="pixi-event-log-toggle" data-action="toggle-replay-pause">
          ${replayDebug.paused ? escapeHtml(t(language, "replayDebug.resume")) : escapeHtml(t(language, "replayDebug.pause"))}
        </button>
        <button type="button" class="pixi-event-log-toggle" data-action="rewind-replay" ${replayDebug.canRewind ? "" : "disabled"}>
          ${escapeHtml(t(language, "replayDebug.rewind"))}
        </button>
        <button type="button" class="pixi-event-log-toggle" data-action="set-replay-speed-preset" data-speed="0.25">
          ${escapeHtml(t(language, "replayDebug.slow"))}
        </button>
        <button type="button" class="pixi-event-log-toggle" data-action="set-replay-speed-preset" data-speed="1">
          ${escapeHtml(t(language, "replayDebug.normal"))}
        </button>
      </div>
      <label class="pixi-replay-debug__slider">
        <span>${escapeHtml(t(language, "replayDebug.speed"))}</span>
        <input
          type="range"
          min="0.1"
          max="2"
          step="0.05"
          value="${replayDebug.speedMultiplier.toFixed(2)}"
          data-action="set-replay-speed"
        />
      </label>
    </div>
  ` : "";

  return `
    <section class="pixi-event-log ${eventLogExpanded ? "pixi-event-log--expanded" : ""}" ${panelStyle}>
      <header class="pixi-event-log-header">
        <div class="pixi-event-log-title">
          <strong>${t(language, "eventLog.title")}</strong>
          ${eventLogExpanded ? `<span>${t(language, "eventLog.history")}</span>` : ""}
        </div>
        <button type="button" class="pixi-event-log-toggle" data-action="toggle-event-log">
          ${eventLogExpanded ? t(language, "eventLog.minimize") : t(language, "eventLog.expand")}
        </button>
      </header>

      ${controlsMarkup}

      <div class="pixi-event-log-history" data-event-log-history="true">
        ${messageMarkup}
      </div>

      ${eventLogExpanded ? `
        <button
          type="button"
          class="pixi-event-log-resize"
          data-action="resize-event-log"
          aria-label="Resize event log"
        ></button>
      ` : ""}
    </section>
  `;
}

function renderChangelogModal(
  changelog: PublicChangelog | null,
  versionInfo: PublicVersionInfo | null,
  language: AppLanguage
): string {
  const localized = changelog?.[language] ?? changelog?.en;
  const version = versionInfo?.version ?? changelog?.version ?? "";
  const releasedAt = versionInfo?.releasedAt ?? changelog?.releasedAt ?? "";
  const releaseDate = releasedAt === ""
    ? ""
    : new Date(releasedAt).toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });

  return `
    <div class="pixi-modal-backdrop">
      <article class="telepathy-panel telepathy-panel--compact changelog-panel" data-pixi-modal-card="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(t(language, "table.changelog"))}</p>
            <h2>${escapeHtml(localized?.title ?? t(language, "changelog.loading"))}</h2>
            ${version === "" ? "" : `<p>${escapeHtml(t(language, "changelog.version", { version }))}${releaseDate === "" ? "" : ` · ${escapeHtml(releaseDate)}`}</p>`}
          </div>
          <button type="button" class="pixi-overlay-button" data-action="close-changelog">${escapeHtml(t(language, "changelog.close"))}</button>
        </div>
        ${localized == null
          ? `<p class="telepathy-empty">${escapeHtml(t(language, "changelog.loading"))}</p>`
          : `<ul class="changelog-list">
              ${localized.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>`}
      </article>
    </div>
  `;
}

interface LobbyOverlayLayout {
  startMatchLeftPx: number;
  startMatchTopPx: number;
  startMatchWidthPx: number;
  startMatchHeightPx: number;
  addBotButtons: Array<{ leftPx: number; topPx: number; widthPx: number; heightPx: number }>;
  botKickButtons: Array<{ seatNumber: number; leftPx: number; topPx: number; widthPx: number; heightPx: number }>;
  expansionButtons: Array<{ key: string; leftPx: number; topPx: number; widthPx: number; heightPx: number; available: boolean; enabled: boolean }>;
}

interface OrdreInterruptArrowPath {
  from: StagePoint;
  to: StagePoint;
}

interface OrdreInterruptArrowLayout {
  actor: OrdreInterruptArrowPath | null;
  targets: OrdreInterruptArrowPath[];
}

function buildOverlayMarkup(
  match: MatchState,
  localSeatNumber: number,
  language: AppLanguage,
  errorMessage: string,
  confirmingLeave: boolean,
  confirmingDiscardCardInstanceId: string,
  confirmingCurseReleaseStatusInstanceId: string,
  kickTarget: PixiKickTarget | null,
  kickActionTarget: PixiSeatKickActionTarget | null,
  seatFxEditorOpen: boolean,
  devSeatVisualEffectsBySeat: Record<number, SeatVisualEffectId[]>,
  pendingAnnulationChoice: PendingAnnulationChoiceState | null,
  pendingObjectChoice: PendingObjectChoiceState | null,
  pendingHandInspection: PendingHandInspectionState | null,
  pendingPublicHandReveal: PendingPublicHandRevealState | null,
  telepathyPreviewCardInstanceId: string,
  pendingBoardResetKeep: PendingBoardResetKeepState | null,
  boardResetKeepPreviewCardInstanceId: string,
  pendingDeathSearch: PendingDeathSearchState | null,
  deathSearchPreviewCardInstanceId: string,
  deathSearchSelectedCardInstanceIds: string[],
  pendingPickpocket: PendingPickpocketState | null,
  pickpocketPreviewCardInstanceId: string,
  pickpocketSelectedCardInstanceIds: string[],
  pendingSacrificeChoice: PendingSacrificeChoiceState | null,
  pendingSorcellerieSacrificeChoice: PendingSorcellerieSacrificeChoiceState | null,
  pendingOrdreInterrupt: PendingOrdreInterruptState | null,
  pendingCurseRelease: PendingCurseReleaseState | undefined,
  sacrificeAmountInput: string,
  forcedFollowUp: ForcedFollowUpState | undefined,
  consumePreviewCardInstanceId: string,
  seenEventMessageIds: Set<string>,
  eventLogExpanded: boolean,
  eventLogWidth: number,
  eventLogHeight: number,
  replayDebug: ReplayDebugPanelState,
  cardReferenceOpen: boolean,
  cardReferencePreviewCardId: string,
  cardReferenceSearchQuery: string,
  cardReferenceShowBase: boolean,
  cardReferenceShowSorcellerie: boolean,
  cardReferenceShowAbondance: boolean,
  cardReferenceShowPuissance: boolean,
  cardReferenceShowCommunion: boolean,
  changelogOpen: boolean,
  changelog: PublicChangelog | null,
  versionInfo: PublicVersionInfo | null,
  bugReportOpen: boolean,
  bugReportDraft: string,
  bugReportSubmitting: boolean,
  bugReportErrorMessage: string,
  activeCombatFx: ActiveCombatFxState | null,
  playbackLocked: boolean,
  showVictoryCelebration: boolean,
  enableDevTools: boolean,
  canUseDevCardPicker: boolean,
  devCardPickerSeatNumber: number,
  sessionMode: "discord" | "browser",
  sessionChannelId: string | null,
  sessionGuildId: string | null,
  combatBannerLeftPx = 0,
  combatBannerTopPx = 0,
  playbackLockTopPx = 0,
  passButtonLeftPx = 0,
  passButtonTopPx = 0,
  lobbyLayout: LobbyOverlayLayout | null = null,
  ordreInterruptArrow: OrdreInterruptArrowLayout | null = null
): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const spectatorMode = match.status === "in_progress" && localSeat == null;
  const amHost = localSeat?.isHost === true;
  const confirmingCurseReleaseCard = confirmingCurseReleaseStatusInstanceId === ""
    ? undefined
    : localSeat?.statuses?.find((status) => status.instanceId === confirmingCurseReleaseStatusInstanceId);
  const confirmingCurseReleaseCount = Math.max(
    1,
    confirmingCurseReleaseCard?.defenseBand?.annulationCardsRequired ?? 2
  );
  const showPassButton =
    match.status === "in_progress"
    && localSeat != null
    && pendingOrdreInterrupt == null
    && canPassPendingResponse(match);
  const pendingResponseChoices = new Set((match.game?.pendingResponseOptions ?? []).map((option) => option.choice));
  const localResponder = match.game?.pendingAction?.responders.find((responder) => responder.seatNumber === localSeatNumber);
  const showOrdreResponseButton =
    match.status === "in_progress"
    && localSeat != null
    && pendingOrdreInterrupt == null
    && localResponder?.state === "pending"
    && pendingResponseChoices.has("ordre-demmerlaus")
    && (localSeat.hand ?? []).some((card) => card.cardId === "ordre-demmerlaus");
  const canResolveOrdreInterrupt =
    pendingOrdreInterrupt != null
    && (
      pendingOrdreInterrupt.hidden !== true
      || (localSeat?.hand ?? []).some((card) => card.cardId === "ordre-demmerlaus")
    );
  const showOrdreInterruptActions =
    pendingOrdreInterrupt != null
    && pendingOrdreInterrupt.hidden !== true
    && canResolveOrdreInterrupt;
  const ordreInterruptedActorName = pendingOrdreInterrupt?.actorSeatNumber == null
    ? ""
    : match.seats.find((seat) => seat.seatNumber === pendingOrdreInterrupt.actorSeatNumber)?.displayName
      ?? t(language, "seat.label", { seatNumber: pendingOrdreInterrupt.actorSeatNumber });
  const ordreTargetNames = (pendingOrdreInterrupt?.targetSeatNumbers ?? [])
    .map((seatNumber) =>
      match.seats.find((seat) => seat.seatNumber === seatNumber)?.displayName
        ?? t(language, "seat.label", { seatNumber })
    );
  const ordreTargetsLabel = ordreTargetNames.length === 0
    ? ""
    : language === "fr"
      ? `${ordreTargetNames.length === 1 ? "Cible" : "Cibles"} : ${ordreTargetNames.join(", ")}`
      : `${ordreTargetNames.length === 1 ? "Target" : "Targets"}: ${ordreTargetNames.join(", ")}`;
  const formatOrdreArrowPath = (path: OrdreInterruptArrowPath): string =>
    `M ${path.from.x.toFixed(1)} ${path.from.y.toFixed(1)} Q ${((path.from.x + path.to.x) / 2).toFixed(1)} ${((path.from.y + path.to.y) / 2 - 42).toFixed(1)} ${path.to.x.toFixed(1)} ${path.to.y.toFixed(1)}`;
  const localForcedFollowUp = forcedFollowUp?.actorSeatNumber === localSeatNumber ? forcedFollowUp : null;
  const forcedFollowUpTargetName = localForcedFollowUp == null
    ? ""
    : match.seats.find((seat) => seat.seatNumber === localForcedFollowUp.targetSeatNumber)?.displayName
      ?? t(language, "seat.label", { seatNumber: localForcedFollowUp.targetSeatNumber });
  const forcedFollowUpPlayableCards = localForcedFollowUp == null || localSeat?.hand == null
    ? []
    : localSeat.hand.filter((card) =>
        localForcedFollowUp.allowedCategories.includes(card.categoryCode)
        && card.canPlay
      );
  const forcedFollowUpPrompt = localForcedFollowUp == null || localForcedFollowUp.consumeMode === true
    ? ""
    : language === "fr"
      ? `${localForcedFollowUp.sourceCardName} : jouez une carte ${localForcedFollowUp.allowedCategories.join("/")} sur ${forcedFollowUpTargetName} ou passez si aucune n'est jouable.`
      : `${localForcedFollowUp.sourceCardName}: play a ${localForcedFollowUp.allowedCategories.join("/")} card against ${forcedFollowUpTargetName}, or pass if none is playable.`;
  const annulationChoice = pendingAnnulationChoice;
  const sessionDiagnostics = [
    sessionMode === "discord" ? t(language, "lobby.discord") : t(language, "lobby.browser"),
    t(language, "lobby.instance", { instanceId: match.instanceId }),
    sessionChannelId != null ? t(language, "lobby.channel", { channelId: sessionChannelId }) : null,
    sessionGuildId != null ? t(language, "lobby.guild", { guildId: sessionGuildId }) : null
  ]
    .filter((value): value is string => value != null && value !== "")
    .join("  ·  ");
  const spectatorNamesMarkup = match.spectators
    .map((spectator) => escapeHtml(spectator.displayName))
    .join(" Â· ");
  void spectatorNamesMarkup;
  const spectatorSummaryMarkup = match.spectators.length === 0
    ? ""
    : `
      <div class="pixi-spectator-panel">
        <div class="pixi-spectator-panel__header">
          ${spectatorMode ? `<span class="pixi-spectator-panel__mode">${escapeHtml(t(language, "spectator.mode"))}</span>` : ""}
          <span class="pixi-spectator-panel__label">${escapeHtml(`${t(language, "spectator.list")} ${match.spectators.length}`)}</span>
        </div>
        <div class="pixi-spectator-panel__list">
          ${match.spectators.map((spectator) => `
            <div class="pixi-spectator-panel__item">
              <img
                class="pixi-spectator-panel__avatar"
                src="${escapeHtml(spectator.avatarUrl)}"
                alt="${escapeHtml(spectator.displayName)}"
              />
              <span class="pixi-spectator-panel__name">${escapeHtml(spectator.displayName)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  const devDrawOptionsMarkup = getEnabledDevDrawGroups(match)
    .flatMap(({ label, cards }) => {
      const separatorMarkup = `<option value="${DEV_DRAW_SEPARATOR_PREFIX}${label}">--------------- ${escapeHtml(label)} ---------------</option>`;
      const cardOptionsMarkup = [...cards]
        .sort((left, right) => {
          const leftName = left.localization?.[language]?.name ?? left.name;
          const rightName = right.localization?.[language]?.name ?? right.name;
          return leftName.localeCompare(rightName);
        })
        .map((card) => {
          const localizedName = card.localization?.[language]?.name ?? card.name;
          const devLabel = card.id === "annulation"
            ? `${localizedName} / ${language === "fr" ? "Cancel" : "Cancel"}`
            : localizedName;
          return `<option value="${escapeHtml(card.id)}">[${card.category.code}] ${escapeHtml(devLabel)}</option>`;
        });

      return [separatorMarkup, ...cardOptionsMarkup];
    })
    .join("");
  const devCardPickerTargetSeat =
    canUseDevCardPicker && match.status === "in_progress" && devCardPickerSeatNumber > 0
      ? match.seats.find((seat) => seat.seatNumber === devCardPickerSeatNumber)
      : undefined;
  const devSeatDrawModalMarkup = devCardPickerTargetSeat == null
    ? ""
    : `
      <div class="pixi-modal-backdrop">
        <article class="modal-card pixi-dev-seat-card-picker">
          <header class="telepathy-panel__header">
            <div>
              <p class="eyebrow">Dev</p>
              <h2>${escapeHtml(language === "fr" ? "Ajouter une carte" : "Add a card")}</h2>
              <p>${escapeHtml(language === "fr"
                ? `Choisissez une carte a ajouter a ${devCardPickerTargetSeat.displayName}.`
                : `Choose a card to add to ${devCardPickerTargetSeat.displayName}.`)}</p>
            </div>
            <button type="button" class="action-button action-button--secondary" data-action="close-dev-seat-card-picker">
              ${escapeHtml(language === "fr" ? "Fermer" : "Close")}
            </button>
          </header>
          <div class="pixi-dev-seat-card-picker__body">
            <select
              class="pixi-dev-select pixi-dev-seat-card-picker__select"
              data-action="dev-draw-seat-card"
              data-target-seat-number="${devCardPickerTargetSeat.seatNumber}"
            >
              <option value="">+ ${escapeHtml(t(language, "table.draw"))}</option>
              ${devDrawOptionsMarkup}
            </select>
          </div>
        </article>
      </div>
    `;
  const seatFxRowsMarkup = !enableDevTools || !amHost
    ? ""
    : match.seats.map((seat) => {
      const activeEffects = new Set(devSeatVisualEffectsBySeat[seat.seatNumber] ?? []);
      const seatMeta = [
        t(language, "seat.label", { seatNumber: seat.seatNumber }),
        seat.seatNumber === localSeatNumber ? t(language, "seat.you") : null,
        seat.isHost ? t(language, "seat.host") : null
      ]
        .filter((value): value is string => value != null && value !== "")
        .join(" • ");
      return `
        <div class="pixi-seat-fx__row">
          <div>
            <strong class="pixi-seat-fx__seat-name">${escapeHtml(seat.displayName)}</strong>
            <span class="pixi-seat-fx__seat-meta">${escapeHtml(seatMeta)}</span>
          </div>
          <div class="pixi-seat-fx__buttons">
            ${DEV_SEAT_VISUAL_EFFECT_IDS.map((effectId) => `
              <button
                type="button"
                class="pixi-chip-button ${activeEffects.has(effectId) ? "pixi-chip-button--active" : ""}"
                data-action="toggle-seat-fx"
                data-seat-number="${seat.seatNumber}"
                data-effect-id="${effectId}"
              >
                ${escapeHtml(getSeatVisualEffectLabel(effectId, language))}
              </button>
            `).join("")}
            <button
              type="button"
              class="pixi-overlay-button"
              data-action="clear-seat-fx"
              data-seat-number="${seat.seatNumber}"
              ${activeEffects.size === 0 ? "disabled" : ""}
            >
              ${escapeHtml(t(language, "seatFx.clearSeat"))}
            </button>
          </div>
        </div>
      `;
    }).join("");

  return `
    ${match.shortId ? `<div class="pixi-session-id">${escapeHtml(match.shortId)}</div>` : ""}
    <div class="pixi-frame-topbar">
      <div class="pixi-frame-topbar__left">
        <div class="pixi-frame-meta">${escapeHtml(sessionDiagnostics)}</div>
        ${spectatorSummaryMarkup}
      </div>
      <div class="pixi-frame-actions">
        <button type="button" class="pixi-overlay-button ${changelogOpen ? "pixi-overlay-button--accent" : ""}" data-action="open-changelog">${t(language, "table.changelog")}</button>
        ${match.status === "in_progress"
          ? `<button type="button" class="pixi-overlay-button" data-action="open-card-reference">${t(language, "table.cardReference")}</button>`
          : ""}
        ${localSeat != null
          ? `<button type="button" class="pixi-overlay-button ${bugReportOpen ? "pixi-overlay-button--accent" : ""}" data-action="open-bug-report">${t(language, "table.reportBug")}</button>`
          : ""}
        ${enableDevTools && match.status === "in_progress" && amHost
          ? `<button type="button" class="pixi-overlay-button ${seatFxEditorOpen ? "pixi-overlay-button--accent" : ""}" data-action="open-seat-fx">${t(language, "table.seatFx")}</button>`
          : ""}
        ${match.status === "in_progress" || match.status === "lobby" ? "" : ""}
        ${canUseDevCardPicker && match.status === "in_progress" && localSeat != null
          ? `
            <div class="pixi-dev-draw">
              <select class="pixi-dev-select" data-action="dev-draw-card" title="Dev: draw card">
                <option value="">+ ${t(language, "table.draw")}</option>
                ${devDrawOptionsMarkup}
              </select>
            </div>
          `
          : ""}
      </div>
    </div>
    ${devSeatDrawModalMarkup}
    ${errorMessage === "" ? "" : `<div class="pixi-error-banner">${errorMessage}</div>`}
    ${showOrdreInterruptActions
      ? `
        <div class="ordre-interrupt-panel" data-ordre-interrupt-panel="true">
          ${ordreInterruptArrow == null
            ? ""
            : `
              <svg class="ordre-interrupt-panel__arrow" viewBox="0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}" aria-hidden="true">
                <defs>
                  <marker id="ordre-interrupt-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 8 4 L 0 8 z"></path>
                  </marker>
                  <marker id="ordre-interrupt-target-arrowhead" markerWidth="7" markerHeight="7" refX="6.2" refY="3.5" orient="auto" markerUnits="strokeWidth">
                    <path d="M 0 0 L 7 3.5 L 0 7 z"></path>
                  </marker>
                </defs>
                ${ordreInterruptArrow.actor == null
                  ? ""
                  : `<path class="ordre-interrupt-panel__arrow-line ordre-interrupt-panel__arrow-line--actor" d="${formatOrdreArrowPath(ordreInterruptArrow.actor)}"></path>`}
                ${ordreInterruptArrow.targets.map((targetArrow) =>
                  `<path class="ordre-interrupt-panel__arrow-line ordre-interrupt-panel__arrow-line--target" d="${formatOrdreArrowPath(targetArrow)}"></path>`
                ).join("")}
              </svg>
            `}
          <article class="ordre-interrupt-panel__card">
            ${pendingOrdreInterrupt.card == null
              ? ""
              : `
                <div class="ordre-interrupt-panel__thumb">
                  <img src="${escapeHtml(pendingOrdreInterrupt.card.imageUrl)}" alt="" />
                </div>
              `}
            <div class="ordre-interrupt-panel__copy">
              <p class="eyebrow">${escapeHtml(t(language, "ordreInterrupt.title"))}</p>
              <h2>${escapeHtml(pendingOrdreInterrupt.cardName ?? "")}</h2>
              ${ordreInterruptedActorName === ""
                ? ""
                : `<p class="ordre-interrupt-panel__actor">${escapeHtml(ordreInterruptedActorName)}</p>`}
              ${ordreTargetsLabel === ""
                ? ""
                : `<p class="ordre-interrupt-panel__targets">${escapeHtml(ordreTargetsLabel)}</p>`}
              <p>${escapeHtml(t(language, "ordreInterrupt.body", { cardName: pendingOrdreInterrupt.cardName ?? "" }))}</p>
            </div>
            <div class="ordre-interrupt-panel__actions">
              <button type="button" class="pixi-overlay-button pixi-overlay-button--accent" data-action="ordre-interrupt-cancel">${escapeHtml(t(language, "ordreInterrupt.cancelAction"))}</button>
              <button type="button" class="pixi-overlay-button" data-action="ordre-interrupt-pass">${escapeHtml(t(language, "ordreInterrupt.passAction"))}</button>
            </div>
          </article>
        </div>
      `
      : ""}
    ${match.status === "lobby" && lobbyLayout != null ? `
      <button
        class="pixi-lobby-cell-btn"
        style="left:${lobbyLayout.startMatchLeftPx}px; top:${lobbyLayout.startMatchTopPx}px; width:${lobbyLayout.startMatchWidthPx}px; height:${lobbyLayout.startMatchHeightPx}px;"
        data-action="start-match"
        ${amHost ? "" : "disabled"}
      ></button>
      ${lobbyLayout.addBotButtons.map((btn) => `
        <button
          class="pixi-lobby-cell-btn"
          style="left:${btn.leftPx}px; top:${btn.topPx}px; width:${btn.widthPx}px; height:${btn.heightPx}px;"
          data-action="add-bot"
          ${amHost ? "" : "disabled"}
        ></button>
      `).join("")}
      ${lobbyLayout.botKickButtons.map((btn) => `
        <button
          type="button"
          class="pixi-overlay-button pixi-overlay-button--danger pixi-lobby-remove-bot-button"
          style="position:absolute; left:${btn.leftPx}px; top:${btn.topPx}px; width:${btn.widthPx}px; height:${btn.heightPx}px; padding:0 10px; z-index:2;"
          data-action="kick-seat"
          data-seat-number="${btn.seatNumber}"
          data-remove-lobby-bot="true"
          ${amHost ? "" : "disabled"}
        >
          ${t(language, "table.removeBot")}
        </button>
      `).join("")}
      ${lobbyLayout.expansionButtons.map((btn) => `
        <button
          class="pixi-lobby-cell-btn"
          style="left:${btn.leftPx}px; top:${btn.topPx}px; width:${btn.widthPx}px; height:${btn.heightPx}px;"
          data-action="toggle-expansion"
          data-expansion-key="${btn.key}"
          ${amHost && btn.available ? "" : "disabled"}
        ></button>
      `).join("")}
    ` : ""}
    ${activeCombatFx == null
      ? ""
      : `<div class="pixi-combat-banner pixi-combat-banner--${activeCombatFx.tone}" style="left:${combatBannerLeftPx}px; top:${combatBannerTopPx}px;">${escapeHtml(activeCombatFx.message)}</div>`}
    ${playbackLocked && match.status === "in_progress"
      ? `<div class="pixi-playback-lock" style="left:${combatBannerLeftPx}px; top:${playbackLockTopPx}px;">${escapeHtml(t(language, "table.resolving"))}</div>`
      : ""}
    ${pendingOrdreInterrupt?.hidden === true
      ? `<div class="pixi-playback-lock" style="left:${combatBannerLeftPx}px; top:${playbackLockTopPx}px;">${escapeHtml(t(language, "table.resolving"))}</div>`
      : ""}
    ${buildVictoryCelebrationMarkup(match, language, showVictoryCelebration)}
    ${showPassButton || showOrdreResponseButton
      ? `
        <div class="pixi-center-actions" style="left:${passButtonLeftPx}px; top:${passButtonTopPx}px;">
          ${showOrdreResponseButton
            ? `<button type="button" class="pixi-overlay-button pixi-overlay-button--accent" data-action="ordre-response">${escapeHtml(t(language, "response.ordre_demmerlaus"))}</button>`
            : ""}
          ${showPassButton
            ? `<button type="button" class="pixi-overlay-button" data-action="pass-response">${escapeHtml(t(language, "response.pass"))}</button>`
            : ""}
        </div>
      `
      : ""}
    ${localForcedFollowUp == null || localForcedFollowUp.consumeMode === true
      ? ""
      : `
        <div class="pixi-center-actions" style="left:${passButtonLeftPx}px; top:${passButtonTopPx}px;">
          <div class="pixi-frame-pill">${escapeHtml(forcedFollowUpPrompt)}</div>
          <button
            type="button"
            class="pixi-overlay-button"
            data-action="pass-forced-follow-up"
            ${forcedFollowUpPlayableCards.length > 0 ? "disabled" : ""}
          >${t(language, "response.pass")}</button>
        </div>
      `}
    ${amHost && kickActionTarget != null
      ? `
        <div class="pixi-seat-action" style="left:${kickActionTarget.leftPx}px; top:${kickActionTarget.topPx}px;">
          <button
            type="button"
            class="pixi-overlay-button pixi-overlay-button--danger"
            data-action="kick-seat"
            data-seat-number="${kickActionTarget.seatNumber}"
          >
            ${t(language, "table.kickPlayer")}
          </button>
        </div>
      `
      : ""}
    <div class="pixi-frame-footer">
      <div class="pixi-language-switch">
        <button type="button" class="pixi-lang-button ${language === "fr" ? "pixi-lang-button--active" : ""}" data-action="set-language" data-language="fr">FR</button>
        <button type="button" class="pixi-lang-button ${language === "en" ? "pixi-lang-button--active" : ""}" data-action="set-language" data-language="en">EN</button>
      </div>
      ${match.status !== "lobby"
        ? renderEventLog(match, language, seenEventMessageIds, eventLogExpanded, eventLogWidth, eventLogHeight, enableDevTools, replayDebug)
        : ""}
    </div>
    ${annulationChoice == null
      ? ""
      : `
        <div class="pixi-modal-backdrop" data-action="annulation-choice-cancel">
          <section class="modal-card pixi-annulation-choice__card" data-annulation-choice-card="true">
            <h2>${escapeHtml(t(language, "annulationChoice.title"))}</h2>
            <p>${escapeHtml(t(language, "annulationChoice.body", {
              neededCount: Math.max(1, annulationChoice.neededCount),
              maxCount: Math.max(1, annulationChoice.maxCount)
            }))}</p>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="annulation-choice-cancel">${t(language, "common.cancel")}</button>
              ${Array.from({ length: Math.max(1, annulationChoice.maxCount) }, (_, index) => index + 1)
                .map((count) => `
                  <button
                    type="button"
                    class="pixi-overlay-button ${count >= annulationChoice.neededCount ? "pixi-overlay-button--accent" : ""}"
                    data-action="annulation-choice-confirm"
                    data-annulation-count="${count}"
                  >
                    ${count === 1
                      ? t(language, "annulationChoice.playOne")
                      : count === 2
                        ? t(language, "annulationChoice.playTwo")
                        : `Annulation x${count}`}
                  </button>
                `)
                .join("")}
            </div>
          </section>
        </div>
      `}
    ${confirmingLeave
      ? `
        <div class="pixi-modal-backdrop">
          <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
            <h2>${escapeHtml(t(language, "leave.confirm.title"))}</h2>
            <p>${escapeHtml(t(language, "leave.confirm.body"))}</p>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="leave-cancel">${t(language, "common.cancel")}</button>
              <button type="button" class="pixi-overlay-button pixi-overlay-button--danger" data-action="leave-confirm">${t(language, "leave.confirm.action")}</button>
            </div>
          </section>
        </div>
      `
      : ""}
    ${confirmingDiscardCardInstanceId !== ""
      ? `
        <div class="pixi-modal-backdrop">
          <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
            <h2>${escapeHtml(t(language, "discard.confirm.title"))}</h2>
            <p>${escapeHtml(t(language, "discard.confirm.body"))}</p>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="discard-cancel">${t(language, "defense.no")}</button>
              <button type="button" class="pixi-overlay-button pixi-overlay-button--danger" data-action="discard-confirm">${t(language, "defense.yes")}</button>
            </div>
          </section>
        </div>
      `
      : ""}
    ${confirmingCurseReleaseCard == null
      ? ""
      : `
        <div class="pixi-modal-backdrop">
          <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
            <h2>${escapeHtml(
              confirmingCurseReleaseCard.cardId === "lapidation"
                ? confirmingCurseReleaseCard.name
                : language === "fr" ? "Retirer la malediction" : "Remove curse"
            )}</h2>
            <p>${escapeHtml(language === "fr"
              ? `Defausser ${confirmingCurseReleaseCount} ${confirmingCurseReleaseCount === 1 ? "Annulation" : "Annulations"} pour retirer ${confirmingCurseReleaseCard.name}. Cela utilise votre action du tour.`
              : `Discard ${confirmingCurseReleaseCount} ${confirmingCurseReleaseCount === 1 ? "Annulation" : "Annulations"} to remove ${confirmingCurseReleaseCard.name}. This uses your turn action.`)}</p>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="curse-release-cancel">${t(language, "common.cancel")}</button>
              <button
                type="button"
                class="pixi-overlay-button pixi-overlay-button--accent"
                data-action="curse-release-confirm"
                data-status-instance-id="${escapeHtml(confirmingCurseReleaseCard.instanceId)}"
              >
                ${escapeHtml(language === "fr" ? "Retirer" : "Remove")}
              </button>
            </div>
          </section>
        </div>
      `}
    ${kickTarget == null
      ? ""
      : `
        <div class="pixi-modal-backdrop">
          <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
            <h2>${escapeHtml(t(language, "kick.confirm.title"))}</h2>
            <p>${escapeHtml(t(
              language,
              kickTarget.removesBotFromLobby ? "kick.confirm.removeBotBody" : "kick.confirm.body",
              { playerName: kickTarget.displayName }
            ))}</p>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="kick-cancel">${t(language, "defense.no")}</button>
              <button type="button" class="pixi-overlay-button pixi-overlay-button--danger" data-action="kick-confirm">${t(language, "defense.yes")}</button>
            </div>
          </section>
        </div>
      `}
    ${!bugReportOpen || localSeat == null
      ? ""
      : `
        <div class="pixi-modal-backdrop">
          <article class="telepathy-panel telepathy-panel--compact bug-report-panel" data-pixi-modal-card="true">
            <div class="telepathy-panel__header">
              <div>
                <p class="eyebrow">${escapeHtml(t(language, "table.reportBug"))}</p>
                <h2>${escapeHtml(t(language, "bugReport.title"))}</h2>
                <p>${escapeHtml(t(language, "bugReport.body", { shortId: match.shortId }))}</p>
              </div>
            </div>
            <div class="bug-report-form">
              <label class="bug-report-form__label" for="bug-report-description">${escapeHtml(t(language, "bugReport.descriptionLabel"))}</label>
              <textarea
                id="bug-report-description"
                class="bug-report-form__textarea"
                data-action="edit-bug-report-description"
                placeholder="${escapeHtml(t(language, "bugReport.placeholder"))}"
                ${bugReportSubmitting ? "disabled" : ""}
              >${escapeHtml(bugReportDraft)}</textarea>
              <p class="bug-report-form__meta">${escapeHtml(t(language, "bugReport.session", { shortId: match.shortId }))}</p>
              ${bugReportErrorMessage === ""
                ? ""
                : `<p class="bug-report-form__error">${escapeHtml(bugReportErrorMessage)}</p>`}
            </div>
            <div class="modal-actions pixi-annulation-choice__actions">
              <button type="button" class="pixi-overlay-button" data-action="close-bug-report" ${bugReportSubmitting ? "disabled" : ""}>${escapeHtml(t(language, "bugReport.cancel"))}</button>
              <button type="button" class="pixi-overlay-button pixi-overlay-button--accent" data-action="send-bug-report" ${bugReportSubmitting ? "disabled" : ""}>
                ${escapeHtml(t(language, bugReportSubmitting ? "bugReport.sending" : "bugReport.send"))}
              </button>
            </div>
          </article>
        </div>
      `}
    ${changelogOpen ? renderChangelogModal(changelog, versionInfo, language) : ""}
    ${!enableDevTools || !amHost || !seatFxEditorOpen
      ? ""
      : `
        <div class="pixi-modal-backdrop" data-action="close-seat-fx">
          <section class="modal-card pixi-seat-fx__card" data-pixi-modal-card="true">
            <h2>${escapeHtml(t(language, "seatFx.title"))}</h2>
            <p class="pixi-seat-fx__body">${escapeHtml(t(language, "seatFx.body"))}</p>
            <div class="pixi-seat-fx__rows">
              ${seatFxRowsMarkup}
            </div>
            <div class="modal-actions pixi-annulation-choice__actions pixi-seat-fx__actions">
              <button type="button" class="pixi-overlay-button" data-action="close-seat-fx">${t(language, "common.cancel")}</button>
              <button
                type="button"
                class="pixi-overlay-button"
                data-action="clear-all-seat-fx"
                ${Object.keys(devSeatVisualEffectsBySeat).length === 0 ? "disabled" : ""}
              >
                ${escapeHtml(t(language, "seatFx.clearAll"))}
              </button>
            </div>
          </section>
        </div>
      `}
    ${pendingObjectChoice == null
      ? ""
      : (() => {
          const isLocalChooser = pendingObjectChoice.chooserSeatNumber === localSeatNumber;
          const chooserName = match.seats.find((s) => s.seatNumber === pendingObjectChoice.chooserSeatNumber)?.displayName
            ?? t(language, "seat.label", { seatNumber: pendingObjectChoice.chooserSeatNumber });
          const ownerName = match.seats.find((s) => s.seatNumber === pendingObjectChoice.ownerSeatNumber)?.displayName
            ?? t(language, "seat.label", { seatNumber: pendingObjectChoice.ownerSeatNumber });
          if (pendingObjectChoice.mode === "choice_hp_or_object" || pendingObjectChoice.mode === "choice_hp_or_redraw" || pendingObjectChoice.mode === "choice_swap_hand_or_objects") {
            if (pendingObjectChoice.mode === "choice_swap_hand_or_objects") {
              const title = isLocalChooser
                ? (language === "fr" ? "Choisissez un échange" : "Choose a swap")
                : t(language, "objectChoice.chooserWaiting", { chooserName });
              const body = isLocalChooser
                ? (language === "fr"
                    ? `Vous pouvez échanger votre main avec ${ownerName}, ou échanger vos objets équipés avec ${ownerName}.`
                    : `You can swap your hand with ${ownerName}, or swap your equipped objects with ${ownerName}.`)
                : t(language, "objectChoice.waitingBody", { chooserName, ownerName });
              return `
                <div class="pixi-modal-backdrop">
                  <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
                    <p class="eyebrow">${escapeHtml(pendingObjectChoice.cardName)}</p>
                    <h2>${escapeHtml(title)}</h2>
                    <p>${escapeHtml(body)}</p>
                    <div class="modal-actions pixi-annulation-choice__actions">
                      <button
                        type="button"
                        class="pixi-overlay-button"
                        data-action="select-pending-object"
                        data-object-instance-id="__option_hand"
                        ${isLocalChooser ? "" : "disabled"}
                      >${escapeHtml(language === "fr" ? "Échanger les mains" : "Swap hands")}</button>
                      <button
                        type="button"
                        class="pixi-overlay-button"
                        data-action="select-pending-object"
                        data-object-instance-id="__option_objects"
                        ${isLocalChooser ? "" : "disabled"}
                      >${escapeHtml(language === "fr" ? "Échanger les objets" : "Swap objects")}</button>
                    </div>
                  </section>
                </div>
              `;
            }
            const isRedrawChoice = pendingObjectChoice.mode === "choice_hp_or_redraw";
            const title = isLocalChooser
              ? (language === "fr" ? "Choisissez une perte" : "Choose a loss")
              : t(language, "objectChoice.chooserWaiting", { chooserName });
            const body = isLocalChooser
              ? isRedrawChoice
                ? (language === "fr"
                    ? "Vous pouvez perdre 25 points de vie, ou jeter votre main et repiger."
                    : "You can lose 25 HP, or discard your hand and redraw.")
                : (language === "fr"
                    ? "Vous pouvez perdre 25 points de vie, ou laisser l'attaquant retirer un de vos objets."
                    : "You can lose 25 HP, or let the attacker remove one of your objects.")
              : t(language, "objectChoice.waitingBody", { chooserName, ownerName });
            const hpChoiceId = isRedrawChoice ? "__decision_hp" : "__choix_hp";
            const otherChoiceId = isRedrawChoice ? "__decision_redraw" : "__choix_object";
            const otherChoiceLabel = isRedrawChoice
              ? (language === "fr" ? "Jeter et repiger" : "Discard and redraw")
              : (language === "fr" ? "Perdre un objet" : "Lose an object");
            return `
              <div class="pixi-modal-backdrop">
                <section class="modal-card pixi-annulation-choice__card" data-pixi-modal-card="true">
                  <p class="eyebrow">${escapeHtml(pendingObjectChoice.cardName)}</p>
                  <h2>${escapeHtml(title)}</h2>
                  <p>${escapeHtml(body)}</p>
                  <div class="modal-actions pixi-annulation-choice__actions">
                    <button
                      type="button"
                      class="pixi-overlay-button pixi-overlay-button--danger"
                      data-action="select-pending-object"
                      data-object-instance-id="${hpChoiceId}"
                      ${isLocalChooser ? "" : "disabled"}
                    >${escapeHtml(language === "fr" ? "Perdre 25 PV" : "Lose 25 HP")}</button>
                    <button
                      type="button"
                      class="pixi-overlay-button"
                      data-action="select-pending-object"
                      data-object-instance-id="${otherChoiceId}"
                      ${isLocalChooser ? "" : "disabled"}
                    >${escapeHtml(otherChoiceLabel)}</button>
                  </div>
                </section>
              </div>
            `;
          }
          if (pendingObjectChoice.mode === "mass_attack_staff_turn") {
            const staffCard = pendingObjectChoice.objectOptions[0];
            const loadOptions = pendingObjectChoice.objectOptions.filter((card) => card.zone === "hand");
            const loadCategory: string = loadOptions[0]?.categoryCode
              ?? pendingObjectChoice.prompt.match(/\b(AD|AM)\b/)?.[1]
              ?? "";
            const title = isLocalChooser
              ? t(language, "objectChoice.massAttackStaffTitle")
              : t(language, "objectChoice.chooserWaiting", { chooserName });
            const body = isLocalChooser
              ? loadCategory === ""
                ? t(language, "objectChoice.massAttackStaffBody")
                : t(language, "objectChoice.massAttackStaffBodyWithCategory", { category: loadCategory })
              : t(language, "objectChoice.massAttackStaffWaitingBody", { chooserName, ownerName });
            return `
              <div class="pixi-modal-backdrop">
                <article class="telepathy-panel telepathy-panel--compact" data-pixi-modal-card="true" style="max-width:1240px; width:min(1240px, calc(100vw - 72px));">
                  <div class="telepathy-panel__header">
                    <div>
                      <p class="eyebrow">${escapeHtml(pendingObjectChoice.cardName)}</p>
                      <h2>${escapeHtml(title)}</h2>
                      <p>${escapeHtml(body)}</p>
                    </div>
                  </div>
                  <div style="display:flex; gap:1.25rem; align-items:center;">
                    <section style="width:170px; flex:0 0 170px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.7rem;">
                      ${staffCard == null ? "" : `
                        <img
                          src="${getCardTextureUrl(staffCard, "full")}"
                          alt="${escapeHtml(staffCard.name)}"
                          style="display:block; width:118px; max-width:100%; border-radius:14px; box-shadow:0 14px 30px rgba(0,0,0,0.28);"
                        />
                        <button
                          type="button"
                          class="action-button"
                          data-action="select-pending-object"
                          data-object-instance-id="${staffCard.instanceId}"
                          ${!isLocalChooser || staffCard.canPlay === false ? "disabled" : ""}
                        >${escapeHtml(t(language, "objectChoice.massAttackStaffFire"))}</button>
                        ${staffCard.canPlay === false && staffCard.disabledReason != null
                          ? `<p class="telepathy-empty" style="margin:0; text-align:center;">${escapeHtml(t(language, "objectChoice.massAttackStaffCannotFire"))}</p>`
                          : ""}
                      `}
                    </section>
                    <div style="width:2px; align-self:stretch; flex:0 0 2px; background:linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.32), rgba(255,255,255,0.08)); border-radius:999px; box-shadow:0 0 0 1px rgba(255,255,255,0.04);"></div>
                    <section style="min-width:0; flex:1; display:flex; flex-direction:column; justify-content:center;">
                      <div style="display:flex; gap:0.7rem; align-items:flex-start; flex-wrap:nowrap; overflow:visible;">
                        ${loadOptions.map((card) => `
                          <button
                            type="button"
                            class="telepathy-card"
                            data-action="select-pending-object"
                            data-object-instance-id="${card.instanceId}"
                            ${isLocalChooser ? "" : "disabled"}
                            title="${escapeHtml(`${card.name}\n\n${card.description}`)}"
                            style="width:118px; min-width:118px; padding:0; background:transparent; border:none; box-shadow:none;"
                          >
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" style="display:block; width:118px; border-radius:14px; box-shadow:0 14px 30px rgba(0,0,0,0.28);" />
                          </button>
                        `).join("")}
                      </div>
                      ${loadOptions.length === 0
                        ? `<p class="telepathy-empty" style="margin:0;">${escapeHtml(t(language, "objectChoice.massAttackStaffNoLoadCards"))}</p>`
                        : ""}
                    </section>
                  </div>
                </article>
              </div>
            `;
          }
          const title = isLocalChooser
            ? (pendingObjectChoice.prompt.toLowerCase().includes("steal")
                ? t(language, "objectChoice.stealTitle")
                : pendingObjectChoice.prompt.toLowerCase().includes("discard")
                ? t(language, "objectChoice.discardRingTitle")
                : t(language, "objectChoice.removeTitle"))
            : t(language, "objectChoice.chooserWaiting", { chooserName });
          const body = isLocalChooser
            ? title
            : t(language, "objectChoice.waitingBody", { chooserName, ownerName });
          return `
            <div class="pixi-modal-backdrop">
              <section class="object-choice-panel" data-pixi-modal-card="true">
                <p class="eyebrow">${escapeHtml(pendingObjectChoice.cardName)}</p>
                <h2>${escapeHtml(title)}</h2>
                <p>${escapeHtml(body)}</p>
                <div class="object-choice-grid">
                  ${pendingObjectChoice.objectOptions.map((card) => `
                    <button
                      type="button"
                      class="object-choice-card"
                      data-action="select-pending-object"
                      data-object-instance-id="${card.instanceId}"
                      ${isLocalChooser ? "" : "disabled"}
                    >
                      <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                      <span>${escapeHtml(card.name)}</span>
                    </button>
                  `).join("")}
                </div>
              </section>
            </div>
          `;
        })()}
    ${pendingHandInspection == null
      ? ""
      : (() => {
          const isLocalViewer = pendingHandInspection.viewerSeatNumber === localSeatNumber;
          const viewerName = match.seats.find((s) => s.seatNumber === pendingHandInspection.viewerSeatNumber)?.displayName
            ?? t(language, "seat.label", { seatNumber: pendingHandInspection.viewerSeatNumber });
          const targetSeat = match.seats.find((s) => s.seatNumber === pendingHandInspection.targetSeatNumber);
          const revealedHand = isLocalViewer ? (targetSeat?.hand ?? []) : [];
          const previewCard = revealedHand.find((c) => c.instanceId === telepathyPreviewCardInstanceId) ?? revealedHand[0];
          const defenseBandHtml = (card: CardView): string => {
            if (card.defenseBand == null) return "";
            const db = card.defenseBand;
            return `
              <div class="card-tooltip-defense">
                <span class="card-defense-pill card-defense-pill--${db.resistance.color}">
                  ${t(language, "defense.resist")} ${db.resistance.color === "red" ? t(language, "defense.notAvailable") : `${Math.max(1, db.resistance.rollsRequired)}x`}
                </span>
                <span class="card-defense-pill ${db.resistanceAccrueAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
                  ${t(language, "defense.ra")} ${db.resistanceAccrueAllowed ? t(language, "defense.yes") : t(language, "defense.no")}
                </span>
                <span class="card-defense-pill ${db.annulationAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
                  ${t(language, "defense.cancel")} ${db.annulationAllowed ? `${Math.max(1, db.annulationCardsRequired)}x` : t(language, "defense.no")}
                </span>
                <span class="card-defense-pill ${db.mirrorAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
                  ${t(language, "defense.mirror")} ${db.mirrorAllowed ? t(language, "defense.yes") : t(language, "defense.no")}
                </span>
              </div>`;
          };
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingHandInspection.cardName)}</p>
                    <h2>${escapeHtml(isLocalViewer
                      ? t(language, "telepathy.viewerTitle", { targetName: targetSeat?.displayName ?? "" })
                      : t(language, "telepathy.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalViewer
                      ? t(language, "telepathy.viewerBody")
                      : t(language, "telepathy.waitingBody", { viewerName, targetName: targetSeat?.displayName ?? "" }))}</p>
                  </div>
                  ${isLocalViewer ? `<button type="button" class="action-button action-button--secondary" data-action="dismiss-telepathy">${escapeHtml(t(language, "telepathy.close"))}</button>` : ""}
                </div>
                <div class="telepathy-grid">
                  ${!isLocalViewer
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "telepathy.blocked"))}</p>`
                    : revealedHand.length === 0
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "telepathy.empty"))}</p>`
                    : `
                      <div class="telepathy-preview">
                        ${previewCard == null ? "" : `
                          <img class="telepathy-preview__image" src="${getCardTextureUrl(previewCard, "full")}" alt="${escapeHtml(previewCard.name)}" />
                          <div class="telepathy-preview__meta">
                            <strong>${escapeHtml(previewCard.name)}</strong>
                            <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                            <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                            ${defenseBandHtml(previewCard)}
                          </div>
                        `}
                      </div>
                      <div class="telepathy-list">
                        ${revealedHand.map((card) => `
                          <button
                            type="button"
                            class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""}"
                            data-action="preview-telepathy-card"
                            data-card-instance-id="${card.instanceId}"
                          >
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                            <div class="telepathy-card__meta">
                              <strong>${escapeHtml(card.name)}</strong>
                              <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                            </div>
                          </button>
                        `).join("")}
                      </div>
                    `}
                </div>
              </article>
            </div>
          `;
        })()}
    ${pendingPublicHandReveal == null
      ? ""
      : (() => {
          const revealedSeats = pendingPublicHandReveal.targetSeatNumbers
            .map((seatNumber) => match.seats.find((seat) => seat.seatNumber === seatNumber))
            .filter((seat): seat is SeatState => seat != null);
          const remainingSeconds = Math.max(0, Math.ceil((new Date(pendingPublicHandReveal.expiresAt).getTime() - Date.now()) / 1000));
          const requiredReadySeatNumbers = pendingPublicHandReveal.requiredReadySeatNumbers;
          const readyCount = pendingPublicHandReveal.readySeatNumbers.filter((seatNumber) => requiredReadySeatNumbers.includes(seatNumber)).length;
          const totalSeatCount = requiredReadySeatNumbers.length;
          const localSeatReady = pendingPublicHandReveal.readySeatNumbers.includes(localSeatNumber);
          const localSeatCanAcknowledge = requiredReadySeatNumbers.includes(localSeatNumber);
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel sous-grades-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingPublicHandReveal.cardName)}</p>
                    <h2>${escapeHtml(t(language, "sousGrades.title"))}</h2>
                    <p>${escapeHtml(t(language, "sousGrades.body"))}</p>
                  </div>
                  <div class="sous-grades-panel__status">
                    <div class="card-defense-pill card-defense-pill--allowed">${escapeHtml(t(language, "sousGrades.remaining", { seconds: remainingSeconds }))}</div>
                    <button
                      type="button"
                      class="action-button ${localSeatReady ? "action-button--secondary" : ""}"
                      data-action="ack-public-hand-reveal"
                      ${localSeatReady || !localSeatCanAcknowledge ? "disabled" : ""}
                    >${escapeHtml(`${t(language, localSeatReady ? "sousGrades.ready" : "sousGrades.done")} ${readyCount}/${totalSeatCount}`)}</button>
                  </div>
                </div>
                <div class="sous-grades-grid" data-modal-list-scroll="true">
                  ${revealedSeats.map((seat) => `
                    <section class="sous-grades-seat">
                      <div class="sous-grades-seat__header">
                        <div>
                          <p class="eyebrow">${escapeHtml(seat.displayName)}</p>
                          <h2>${escapeHtml(t(language, "seat.label", { seatNumber: seat.seatNumber }))}</h2>
                        </div>
                        <span>${escapeHtml(`${seat.hand?.length ?? 0} ${language === "fr" ? "cartes" : "cards"}`)}</span>
                      </div>
                      ${(seat.hand ?? []).length === 0
                        ? `<p class="telepathy-empty">${escapeHtml(t(language, "sousGrades.empty"))}</p>`
                        : `
                          <div class="sous-grades-hand">
                            ${(seat.hand ?? []).map((card) => `
                              <button
                                type="button"
                                class="sous-grades-card"
                                title="${escapeHtml(card.name)}"
                                data-action="inspect-public-hand-card"
                                data-seat-number="${seat.seatNumber}"
                                data-card-instance-id="${card.instanceId}"
                              >
                                <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                              </button>
                            `).join("")}
                          </div>
                        `}
                    </section>
                  `).join("")}
                </div>
              </article>
            </div>
          `;
        })()}
    ${forcedFollowUp == null || forcedFollowUp.consumeMode !== true || forcedFollowUp.actorSeatNumber !== localSeatNumber
      ? ""
      : (() => {
          const localSeatState = match.seats.find((s) => s.seatNumber === localSeatNumber);
          const eligibleCards = localSeatState?.hand?.filter((c) => forcedFollowUp.allowedCategories.includes(c.categoryCode)) ?? [];
          const previewCard = eligibleCards.find((c) => c.instanceId === consumePreviewCardInstanceId) ?? eligibleCards[0];
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(forcedFollowUp.sourceCardName)}</p>
                    <h2>${escapeHtml(t(language, "consume.title"))}</h2>
                    <p>${escapeHtml(t(language, "consume.body", { categories: forcedFollowUp.allowedCategories.join("/"), cardName: forcedFollowUp.sourceCardName }))}</p>
                  </div>
                  <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0">
                    <button type="button" class="action-button action-button--secondary" data-action="pass-forced-follow-up">${escapeHtml(t(language, "response.pass"))}</button>
                    <button type="button" class="action-button" data-action="confirm-consume-card" data-card-instance-id="${previewCard?.instanceId ?? ""}" ${previewCard == null ? "disabled" : ""}>${escapeHtml(t(language, "consume.confirm"))}</button>
                  </div>
                </div>
                <div class="telepathy-grid">
                  ${eligibleCards.length === 0
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "response.pass"))}</p>`
                    : `
                      <div class="telepathy-preview">
                        ${previewCard == null ? "" : `
                          <img class="telepathy-preview__image" src="${getCardTextureUrl(previewCard, "full")}" alt="${escapeHtml(previewCard.name)}" />
                          <div class="telepathy-preview__meta">
                            <strong>${escapeHtml(previewCard.name)}</strong>
                            <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                            <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                          </div>
                        `}
                      </div>
                      <div class="telepathy-list" data-modal-list-scroll="true">
                        ${eligibleCards.map((card) => `
                          <button
                            type="button"
                            class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""}"
                            data-action="preview-consume-card"
                            data-card-instance-id="${card.instanceId}"
                          >
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                            <div class="telepathy-card__meta">
                              <strong>${escapeHtml(card.name)}</strong>
                              <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                            </div>
                          </button>
                        `).join("")}
                      </div>
                    `}
                </div>
              </article>
            </div>
          `;
        })()}
    ${pendingBoardResetKeep == null
      ? ""
      : (() => {
          const isLocalChooser = pendingBoardResetKeep.chooserSeatNumber === localSeatNumber;
          const chooserSeat = match.seats.find((s) => s.seatNumber === pendingBoardResetKeep.chooserSeatNumber);
          const cardOptions = !isLocalChooser || chooserSeat == null
            ? []
            : [
                ...(chooserSeat.hand ?? []),
                ...(chooserSeat.objects ?? []),
                ...(chooserSeat.statuses ?? [])
              ];
          const count = pendingBoardResetKeep.keepCardCount;
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel board-reset-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingBoardResetKeep.cardName)}</p>
                    <h2>${escapeHtml(isLocalChooser
                      ? t(language, "boardReset.title", { count, plural: count === 1 ? "" : "s" })
                      : t(language, "boardReset.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalChooser
                      ? t(language, "boardReset.body")
                      : t(language, "boardReset.waitingBody", { chooserName: chooserSeat?.displayName ?? "" }))}</p>
                  </div>
                </div>
                ${!isLocalChooser
                  ? `<p class="telepathy-empty">${escapeHtml(t(language, "boardReset.blocked"))}</p>`
                  : cardOptions.length === 0
                  ? `<p class="telepathy-empty">${escapeHtml(t(language, "boardReset.empty"))}</p>`
                  : `
                    <div class="board-reset-card-grid">
                      ${cardOptions.map((card) => {
                        const sourceLabel =
                          card.zone === "object"
                            ? t(language, "boardReset.sourceObject")
                            : card.zone === "status"
                              ? t(language, "boardReset.sourceStatus")
                              : t(language, "boardReset.sourceHand");
                        const tooltip = `${card.name}\n[${card.categoryCode}] ${card.categoryLabel}\n${card.description}`;
                        return `
                          <button
                            type="button"
                            class="board-reset-card-option"
                            data-action="preview-board-reset-card"
                            data-card-instance-id="${card.instanceId}"
                            data-card-name="${escapeHtml(card.name)}"
                            title="${escapeHtml(tooltip)}"
                          >
                            <span class="board-reset-card-option__badge">${escapeHtml(sourceLabel)}</span>
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                          </button>
                        `;
                      }).join("")}
                    </div>
                  `}
              </article>
            </div>
          `;
        })()}
    ${pendingDeathSearch == null
      ? ""
      : (() => {
          const isLocalChooser = pendingDeathSearch.chooserSeatNumber === localSeatNumber;
          const selectedCorpse = pendingDeathSearch.corpseOptions.find((c) => c.seatNumber === pendingDeathSearch.selectedCorpseSeatNumber);
          const selectedIdSet = new Set(deathSearchSelectedCardInstanceIds);
          const keepReady = deathSearchSelectedCardInstanceIds.length === pendingDeathSearch.keepCardCount;
          const previewCard = pendingDeathSearch.cardOptions.find((c) => c.instanceId === deathSearchPreviewCardInstanceId)
            ?? pendingDeathSearch.cardOptions[0];
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingDeathSearch.cardName)}</p>
                    <h2>${escapeHtml(isLocalChooser ? t(language, "deathSearch.title") : t(language, "deathSearch.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalChooser
                      ? selectedCorpse == null
                        ? t(language, "deathSearch.chooseCorpseBody")
                        : t(language, "deathSearch.keepBody", { corpseName: selectedCorpse.displayName, count: pendingDeathSearch.keepCardCount })
                      : t(language, "deathSearch.waitingBody"))}</p>
                  </div>
                  ${!isLocalChooser
                    ? ""
                    : `<div class="telepathy-panel__actions">
                        ${selectedCorpse != null
                          ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-death-search-keep" ${keepReady ? "" : "disabled"}>${escapeHtml(t(language, "deathSearch.keepAction"))}</button>`
                          : ""}
                        <button type="button" class="action-button action-button--secondary" data-action="decline-death-search">${escapeHtml(t(language, "deathSearch.declineAction"))}</button>
                      </div>`}
                </div>
                <div class="telepathy-grid">
                  ${!isLocalChooser
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "deathSearch.blocked"))}</p>`
                    : selectedCorpse == null
                    ? `
                      <div class="death-search-corpse-list">
                        ${pendingDeathSearch.corpseOptions.map((corpse) => `
                          <button
                            type="button"
                            class="telepathy-card telepathy-card--text-only"
                            data-action="choose-death-search-corpse"
                            data-seat-number="${corpse.seatNumber}"
                          >
                            <div class="telepathy-card__meta">
                              <strong>${escapeHtml(corpse.displayName)}</strong>
                              <span>${escapeHtml(t(language, "deathSearch.corpseCardCount", { count: corpse.cardCount }))}</span>
                            </div>
                          </button>
                        `).join("")}
                      </div>
                    `
                    : pendingDeathSearch.cardOptions.length === 0
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "deathSearch.empty"))}</p>`
                    : `
                      <div class="telepathy-preview">
                        ${previewCard == null ? "" : `
                          <img class="telepathy-preview__image" src="${getCardTextureUrl(previewCard, "full")}" alt="${escapeHtml(previewCard.name)}" />
                          <div class="telepathy-preview__meta">
                            <strong>${escapeHtml(previewCard.name)}</strong>
                            <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                            <span>${escapeHtml(t(language, previewCard.source === "self" ? "deathSearch.sourceSelf" : "deathSearch.sourceCorpse", { ownerName: previewCard.ownerDisplayName }))}</span>
                            <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                          </div>
                        `}
                      </div>
                      <div class="telepathy-list">
                        ${pendingDeathSearch.cardOptions.map((card) => `
                          <button
                            type="button"
                            class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""} ${selectedIdSet.has(card.instanceId) ? "telepathy-card--selected" : ""}"
                            data-action="toggle-death-search-card"
                            data-card-instance-id="${card.instanceId}"
                          >
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                            <div class="telepathy-card__meta">
                              <strong>${escapeHtml(card.name)}</strong>
                              <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                              <span>${escapeHtml(t(language, card.source === "self" ? "deathSearch.sourceSelf" : "deathSearch.sourceCorpse", { ownerName: card.ownerDisplayName }))}</span>
                            </div>
                          </button>
                        `).join("")}
                      </div>
                    `}
                </div>
                ${isLocalChooser && selectedCorpse != null && pendingDeathSearch.cardOptions.length > 0
                  ? `<div class="death-search-tray">
                      <p class="death-search-tray__label">${escapeHtml(t(language, "deathSearch.selectedTray", { count: deathSearchSelectedCardInstanceIds.length, total: pendingDeathSearch.keepCardCount }))}</p>
                      <div class="death-search-tray__slots">
                        ${Array.from({ length: pendingDeathSearch.keepCardCount }).map((_, i) => {
                          const selectedId = deathSearchSelectedCardInstanceIds[i];
                          const card = selectedId != null ? pendingDeathSearch.cardOptions.find((c) => c.instanceId === selectedId) : undefined;
                          return card != null
                            ? `<button type="button" class="death-search-tray__slot death-search-tray__slot--filled" data-action="toggle-death-search-card" data-card-instance-id="${card.instanceId}">
                                <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                                <span>${escapeHtml(card.name)}</span>
                              </button>`
                            : `<div class="death-search-tray__slot death-search-tray__slot--empty"></div>`;
                        }).join("")}
                      </div>
                    </div>`
                  : ""}
              </article>
            </div>
          `;
        })()}
    ${pendingPickpocket == null
      ? ""
      : (() => {
          const isLocalChooser = pendingPickpocket.chooserSeatNumber === localSeatNumber;
          const chooserSeat = match.seats.find((s) => s.seatNumber === pendingPickpocket.chooserSeatNumber);
          const targetSeat = match.seats.find((s) => s.seatNumber === pendingPickpocket.targetSeatNumber);
          const selectedIdSet = new Set(pickpocketSelectedCardInstanceIds);
          const takeReady = pickpocketSelectedCardInstanceIds.length === pendingPickpocket.takeCardCount;
          const previewCard = pendingPickpocket.cardOptions.find((c) => c.instanceId === pickpocketPreviewCardInstanceId)
            ?? pendingPickpocket.cardOptions[0];
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingPickpocket.cardName)}</p>
                    <h2>${escapeHtml(isLocalChooser ? t(language, "pickpocket.title") : t(language, "pickpocket.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalChooser
                      ? t(language, "pickpocket.body", { count: pendingPickpocket.takeCardCount, targetName: targetSeat?.displayName ?? "" })
                      : t(language, "pickpocket.waitingBody", { chooserName: chooserSeat?.displayName ?? "" }))}</p>
                  </div>
                  ${isLocalChooser
                    ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-pickpocket-take" ${takeReady ? "" : "disabled"}>${escapeHtml(t(language, "pickpocket.takeAction"))}</button>`
                    : ""}
                </div>
                <div class="telepathy-grid">
                  ${!isLocalChooser
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "pickpocket.blocked"))}</p>`
                    : pendingPickpocket.cardOptions.length === 0
                    ? `<p class="telepathy-empty">${escapeHtml(t(language, "pickpocket.empty"))}</p>`
                    : `
                      <div class="telepathy-preview">
                        ${previewCard == null ? "" : `
                          <img class="telepathy-preview__image" src="${getCardTextureUrl(previewCard, "full")}" alt="${escapeHtml(previewCard.name)}" />
                          <div class="telepathy-preview__meta">
                            <strong>${escapeHtml(previewCard.name)}</strong>
                            <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                            <span>${escapeHtml(t(language, previewCard.source === "hand" ? "pickpocket.sourceHand" : "pickpocket.sourceObject", { ownerName: previewCard.ownerDisplayName }))}</span>
                            <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                          </div>
                        `}
                      </div>
                      <div class="telepathy-list">
                        ${pendingPickpocket.cardOptions.map((card) => `
                          <button
                            type="button"
                            class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""} ${selectedIdSet.has(card.instanceId) ? "telepathy-card--selected" : ""}"
                            data-action="toggle-pickpocket-card"
                            data-card-instance-id="${card.instanceId}"
                          >
                            <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                            <div class="telepathy-card__meta">
                              <strong>${escapeHtml(card.name)}</strong>
                              <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                              <span>${escapeHtml(t(language, card.source === "hand" ? "pickpocket.sourceHand" : "pickpocket.sourceObject", { ownerName: card.ownerDisplayName }))}</span>
                            </div>
                          </button>
                        `).join("")}
                      </div>
                    `}
                </div>
              </article>
            </div>
          `;
        })()}
    ${pendingSacrificeChoice == null
      ? ""
      : (() => {
          const isLocalActor = pendingSacrificeChoice.actorSeatNumber === localSeatNumber;
          const actorSeat = match.seats.find((s) => s.seatNumber === pendingSacrificeChoice.actorSeatNumber);
          const sacrificeAmountText = sacrificeAmountInput.trim();
          const parsedAmount = Number(sacrificeAmountText);
          const isValidAmount = /^\d+$/.test(sacrificeAmountText) && parsedAmount >= 0 && parsedAmount <= pendingSacrificeChoice.maxAmount;
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel telepathy-panel--compact" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingSacrificeChoice.cardName)}</p>
                    <h2>${escapeHtml(isLocalActor ? t(language, "sacrifice.title") : t(language, "sacrifice.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalActor
                      ? t(language, "sacrifice.body", { maxAmount: pendingSacrificeChoice.maxAmount })
                      : t(language, "sacrifice.waitingBody", { playerName: actorSeat?.displayName ?? "" }))}</p>
                  </div>
                </div>
                ${!isLocalActor
                  ? `<p class="telepathy-empty">${escapeHtml(t(language, "telepathy.blocked"))}</p>`
                  : `
                    <div class="sacrifice-choice-form">
                      <label class="sacrifice-choice-form__label" for="sacrifice-amount-input">${escapeHtml(t(language, "sacrifice.label"))}</label>
                      <input
                        id="sacrifice-amount-input"
                        class="sacrifice-choice-form__input"
                        data-action="edit-sacrifice-amount"
                        type="text"
                        pattern="[0-9]*"
                        inputmode="numeric"
                        value="${escapeHtml(sacrificeAmountInput)}"
                      />
                      <p class="sacrifice-choice-form__hint">${escapeHtml(t(language, "sacrifice.hint", { maxAmount: pendingSacrificeChoice.maxAmount }))}</p>
                      <button
                        type="button"
                        class="action-button action-button--secondary"
                        data-action="confirm-sacrifice-amount"
                        ${isValidAmount ? "" : "disabled"}
                      >${escapeHtml(t(language, "sacrifice.confirm"))}</button>
                    </div>
                  `}
              </article>
            </div>
          `;
        })()}
    ${pendingSorcellerieSacrificeChoice == null
      ? ""
      : (() => {
          const isLocalActor = pendingSorcellerieSacrificeChoice.actorSeatNumber === localSeatNumber;
          const actorSeat = match.seats.find((s) => s.seatNumber === pendingSorcellerieSacrificeChoice.actorSeatNumber);
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel telepathy-panel--compact" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(pendingSorcellerieSacrificeChoice.cardName)}</p>
                    <h2>${escapeHtml(isLocalActor ? t(language, "sorcellerieSacrifice.title") : t(language, "sorcellerieSacrifice.inProgress"))}</h2>
                    <p>${escapeHtml(isLocalActor
                      ? t(language, "sorcellerieSacrifice.body", { cardName: pendingSorcellerieSacrificeChoice.cardName })
                      : t(language, "sorcellerieSacrifice.waitingBody", { playerName: actorSeat?.displayName ?? "" }))}</p>
                  </div>
                </div>
                ${!isLocalActor
                  ? `<p class="telepathy-empty">${escapeHtml(t(language, "sorcellerieSacrifice.blocked"))}</p>`
                  : `
                    <div class="telepathy-card-grid">
                      <button type="button" class="telepathy-card telepathy-card--active" data-action="sorcellerie-sacrifice-waive">
                        <img src="${escapeHtml(pendingSorcellerieSacrificeChoice.duplicateCard.imageUrl)}" alt="" />
                        <div>
                          <strong>${escapeHtml(pendingSorcellerieSacrificeChoice.duplicateCard.name)}</strong>
                          <span>${escapeHtml(t(language, "sorcellerieSacrifice.discardAction"))}</span>
                        </div>
                      </button>
                    </div>
                    <div class="modal-actions">
                      <button type="button" class="action-button action-button--secondary" data-action="sorcellerie-sacrifice-pay">${escapeHtml(t(language, "sorcellerieSacrifice.payAction"))}</button>
                    </div>
                  `}
              </article>
            </div>
          `;
        })()}
    ${!cardReferenceOpen ? "" : (() => {
        const collator = new Intl.Collator(language, { sensitivity: "base" });
        const normalizedSearch = cardReferenceSearchQuery.trim().toLocaleLowerCase(language);
        const catalogCards = allCardDefinitions.map((definition) => {
          const localizedText = definition.localization?.[language];
          return {
            cardId: definition.id,
            name: localizedText?.name ?? definition.name,
            description: localizedText?.description ?? definition.description,
            imageUrl: getLocalizedCardImageUrl(
              definition.id,
              `/${(definition.image.importedAssetPath ?? "").replace(/^client[\\/]+public[\\/]+/, "").replace(/\\/g, "/")}`,
              language
            ),
            categoryCode: definition.category.code,
            categoryLabel: getLocalizedCategoryLabel(definition.category.code, language),
            defenseBand: definition.defenseBand,
            includedDecks: definition.includedDecks
          };
        }).filter((card) => {
          const inBase = card.includedDecks.includes("Jeu de base");
          const inSorcellerie = card.includedDecks.includes("Sorcellerie");
          const inAbondance = card.includedDecks.includes("Abondance");
          const inPuissance = card.includedDecks.includes("Puissance");
          const inCommunion = card.includedDecks.includes("Communion");
          if ((!cardReferenceShowBase || !inBase) && (!cardReferenceShowSorcellerie || !inSorcellerie) && (!cardReferenceShowAbondance || !inAbondance) && (!cardReferenceShowPuissance || !inPuissance) && (!cardReferenceShowCommunion || !inCommunion)) return false;
          if (normalizedSearch === "") return true;
          return card.name.toLocaleLowerCase(language).includes(normalizedSearch);
        }).sort((a, b) => {
          const cat = collator.compare(a.categoryLabel, b.categoryLabel);
          return cat !== 0 ? cat : collator.compare(a.name, b.name);
        });

        const previewCard = catalogCards.find((c) => c.cardId === cardReferencePreviewCardId) ?? catalogCards[0];
        const searchBar = `
          <div class="card-reference-search">
            <label class="card-reference-search__label" for="card-reference-search-input">${escapeHtml(t(language, "reference.searchLabel"))}</label>
            <input
              id="card-reference-search-input"
              class="card-reference-search__input"
              data-action="edit-reference-search"
              type="text"
              value="${escapeHtml(cardReferenceSearchQuery)}"
              placeholder="${escapeHtml(t(language, "reference.searchPlaceholder"))}"
            />
          </div>
          <div class="card-reference-filters">
            <span class="card-reference-filters__label">${escapeHtml(t(language, "reference.decksLabel"))}</span>
            <div class="card-reference-filters__row">
              <button type="button" class="card-reference-filter ${cardReferenceShowBase ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="base">${escapeHtml(t(language, "reference.deckBase"))}</button>
              <button type="button" class="card-reference-filter ${cardReferenceShowSorcellerie ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="sorcellerie">${escapeHtml(t(language, "reference.deckSorcellerie"))}</button>
              <button type="button" class="card-reference-filter ${cardReferenceShowAbondance ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="abondance">${escapeHtml(t(language, "reference.deckAbondance"))}</button>
              <button type="button" class="card-reference-filter ${cardReferenceShowPuissance ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="puissance">${escapeHtml(t(language, "reference.deckPuissance"))}</button>
              <button type="button" class="card-reference-filter ${cardReferenceShowCommunion ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="communion">${escapeHtml(t(language, "reference.deckCommunion"))}</button>
            </div>
          </div>
        `;

        if (previewCard == null) {
          return `
            <div class="pixi-modal-backdrop">
              <article class="telepathy-panel card-reference-panel" data-pixi-modal-card="true">
                <div class="telepathy-panel__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(t(language, "reference.title"))}</p>
                    <h2>${escapeHtml(t(language, "reference.title"))}</h2>
                    <p>${escapeHtml(t(language, "reference.body"))}</p>
                  </div>
                  <button type="button" class="action-button action-button--secondary" data-action="close-card-reference">${escapeHtml(t(language, "reference.close"))}</button>
                </div>
                ${searchBar}
                <p class="telepathy-empty">${escapeHtml(t(language, "reference.empty"))}</p>
              </article>
            </div>
          `;
        }

        return `
          <div class="pixi-modal-backdrop">
            <article class="telepathy-panel card-reference-panel" data-pixi-modal-card="true">
              <div class="telepathy-panel__header">
                <div>
                  <p class="eyebrow">${escapeHtml(t(language, "reference.title"))}</p>
                  <h2>${escapeHtml(t(language, "reference.title"))}</h2>
                  <p>${escapeHtml(t(language, "reference.body"))}</p>
                </div>
                <button type="button" class="action-button action-button--secondary" data-action="close-card-reference">${escapeHtml(t(language, "reference.close"))}</button>
              </div>
              ${searchBar}
              <div class="card-reference-grid">
                <div class="card-reference-list telepathy-list">
                  ${catalogCards.map((card) => `
                    <button
                      type="button"
                      class="telepathy-card ${previewCard.cardId === card.cardId ? "telepathy-card--active" : ""}"
                      data-action="preview-reference-card"
                      data-card-id="${card.cardId}"
                    >
                      <img src="${getCardTextureUrl(card, "thumb")}" alt="${escapeHtml(card.name)}" />
                      <div class="telepathy-card__meta">
                        <strong>${escapeHtml(card.name)}</strong>
                        <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                      </div>
                    </button>
                  `).join("")}
                </div>
                <div class="telepathy-preview card-reference-preview">
                  <img class="telepathy-preview__image" src="${getCardTextureUrl(previewCard, "full")}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip({
                      instanceId: previewCard.cardId,
                      cardId: previewCard.cardId,
                      name: previewCard.name,
                      description: previewCard.description,
                      imageUrl: previewCard.imageUrl,
                      categoryCode: previewCard.categoryCode,
                      categoryLabel: previewCard.categoryLabel,
                      selectionMode: "confirm",
                      targets: "none",
                      defenseBand: previewCard.defenseBand,
                      canPlay: false,
                      zone: "discard"
                    }, language)}
                  </div>
                </div>
              </div>
            </article>
          </div>
        `;
      })()}
  `;
}

function buildShellMarkup(): string {
  return `
    <main class="pixi-app-shell">
      <div class="pixi-stage-host" data-pixi-stage-host="true"></div>
      <div class="pixi-stage-overlay" data-pixi-stage-overlay="true">
        <div class="pixi-stage-frame" data-pixi-stage-frame="true">
          <div class="pixi-frame-center-card">
            <h1>Emerlaus</h1>
            <p>Loading Pixi preview...</p>
          </div>
        </div>
      </div>
      <div class="pixi-inspect-layer" data-pixi-inspect-layer="true"></div>
      <div class="pixi-landscape-warning" data-pixi-landscape-warning="true">
        <div class="pixi-landscape-warning__card">
          <strong>Landscape Required</strong>
          <p>The Pixi preview currently supports the fixed 16:9 stage in landscape orientation only.</p>
        </div>
      </div>
    </main>
  `;
}

export async function createPixiApp(rootElement: HTMLDivElement): Promise<void> {
  rootElement.innerHTML = buildShellMarkup();

  const hostElement = rootElement.querySelector<HTMLElement>("[data-pixi-stage-host='true']");
  const overlayElement = rootElement.querySelector<HTMLElement>("[data-pixi-stage-overlay='true']");
  const frameElement = rootElement.querySelector<HTMLElement>("[data-pixi-stage-frame='true']");
  const inspectLayerElement = rootElement.querySelector<HTMLElement>("[data-pixi-inspect-layer='true']");
  const warningElement = rootElement.querySelector<HTMLElement>("[data-pixi-landscape-warning='true']");

  if (hostElement == null || overlayElement == null || frameElement == null || inspectLayerElement == null || warningElement == null) {
    throw new Error("Pixi shell failed to initialize");
  }

  const app = new Application();
  await app.init({
    antialias: false,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION),
    backgroundAlpha: 0,
    renderableGCActive: true,
    renderableGCMaxUnusedTime: 15_000,
    renderableGCFrequency: 5_000
  });
  hostElement.appendChild(app.canvas);

  const scene = new Container();
  app.stage.addChild(scene);

  let destroyed = false;
  let language = loadStoredLanguage();
  let errorMessage = "";
  let leftMessage = "";
  let lastOverlayMarkup = "";
  let currentMetrics = computeStageMetrics(hostElement);
  let currentGeometry: TableInteractionGeometry | null = null;
  let rendererWidth = 0;
  let rendererHeight = 0;
  let redrawQueued = false;
  let handFocusTransition: HandFocusTransition | null = null;
  let cardInspectState: CardInspectState | null = null;
  let inspectLayerActive = false;
  let inspectCloseTimer: number | null = null;
  let inspectTouchStartX: number | null = null;
  let pendingHandPress: PendingHandPress | null = null;
  let pendingObjectPress: PendingObjectPress | null = null;
  const modalDragOffsets = new Map<string, { x: number; y: number }>();
  let modalDragActive = false;
  let modalDragRedrawQueued = false;
  let handHoverLockedUntil = 0;
  let handHoverLockedCardInstanceId = "";
  let confirmingLeave = false;
  let confirmingDiscardCardInstanceId = "";
  let confirmingCurseReleaseStatusInstanceId = "";
  let selectedKickSeatNumber = 0;
  let confirmingKickSeatNumber = 0;
  let devCardPickerSeatNumber = 0;
  let seatFxEditorOpen = false;
  let devSeatVisualEffectsBySeat: Record<number, SeatVisualEffectId[]> = {};
  let telepathyPreviewCardInstanceId = "";
  let publicHandRevealRefreshTimer: number | null = null;
  let publicHandRevealRefreshKey = "";
  let boardResetKeepPreviewCardInstanceId = "";
  let consumePreviewCardInstanceId = "";
  let deathSearchPreviewCardInstanceId = "";
  let deathSearchSelectedCardInstanceIds: string[] = [];
  let pickpocketPreviewCardInstanceId = "";
  let pickpocketSelectedCardInstanceIds: string[] = [];
  let sacrificeAmountInput = "";
  let eventLogExpanded = false;
  let eventLogWidth = 380;
  let eventLogHeight = 420;
  let cardReferenceOpen = false;
  let cardReferencePreviewCardId = "";
  let cardReferenceSearchQuery = "";
  let cardReferenceShowBase = true;
  let cardReferenceShowSorcellerie = true;
  let cardReferenceShowAbondance = true;
  let cardReferenceShowPuissance = true;
  let cardReferenceShowCommunion = true;
  let changelogOpen = false;
  let publicChangelog: PublicChangelog | null = null;
  let publicVersionInfo: PublicVersionInfo | null = null;
  let bugReportOpen = false;
  let bugReportDraft = "";
  let bugReportSubmitting = false;
  let bugReportErrorMessage = "";
  let pendingAnnulationChoice: PendingAnnulationChoiceState | null = null;
  let activeCombatFx: ActiveCombatFxState | null = null;
  let activeDamageBursts: Record<number, FloatingBurstState> = {};
  let activeHealBursts: Record<number, FloatingBurstState> = {};
  let activeTurnStartSeatNumber: number | null = null;
  let activeTelekinesieReveal: ActiveTelekinesieRevealState | null = null;
  let displayedHpBySeat: Record<number, number> = {};
  let displayedSeatsBySeat: Record<number, SeatState> = {};
  let displayedSeatReleaseBoxIndexBySeat: Record<number, number> = {};
  let displayedSeatSnapshotTimelineBySeat: Record<number, Array<{ boxIndex: number; seat: SeatState }>> = {};
  let pendingPostDeathSeatsBySeat: Record<number, SeatState> = {};
  let preUpdateLocalizedSeatsBySeat: Record<number, SeatState> = {};
  let seatResponseThumbnailsBySeat: Record<number, SeatResponseThumbnailState> = {};
  let seatResponseThumbnailTurnSeatNumber: number | null = null;
  let seatResistancePills: Record<number, SeatResistancePillState> = {};
  let batonLoadHoverTs: number | null = null;
  let activeImpactFlashes: Record<number, ImpactFlashState> = {};
  let activeCardFlights: CardFlightState[] = [];
  let activePlaybackArrows: PlaybackArrowState[] = [];
  let eventPlaybackActive = false;
  let replaySpeedMultiplier = 1;
  let replayPaused = false;
  let replayTimelineMs = 0;
  let replayTimelineWallAt = performance.now();
  let activeActionVisual: ActiveActionVisualState | null = null;
  let centerResponseCards: CardView[] = [];
  let overlayInteractionLocked = false;
  let interactionState: PixiInteractionState = {
    hoveredCardInstanceId: "",
    draggingCardInstanceId: "",
    dragPointerX: 0,
    dragPointerY: 0,
    dragHoverTarget: null,
    arrowDrag: null
  };
  const session = await createDiscordSession();
  let joined = await joinMatch(session.instanceId, session.currentUser, {
    discordAccessToken: session.discordAccessToken,
    guildId: session.guildId
  });
  let match = joined.match;
  seatResponseThumbnailTurnSeatNumber = match.game?.currentTurnSeatNumber ?? null;
  let localSeatNumber = joined.localSeatNumber ?? SPECTATOR_SEAT_NUMBER;
  const playerSessionToken = joined.playerSessionToken;
  let canUseDevCardPicker = joined.canUseDevCardPicker;
  let targetHintDismissed = false;
  let seenGameEventIds = new Set((match.game?.eventLog ?? []).map((event) => event.id));
  let seenEventMessageIds = new Set(buildEventLogEntries(match, language).map((entry) => entry.id));
  let eventReplayChain: Promise<void> = Promise.resolve();
  let replayQueueToken = 0;
  let replayRunId = 0;
  let pendingReplayBatchCount = 0;
  let latestReplayBatch: GameEvent[] = [];
  let latestReplayPreUpdateLocalizedSeatsBySeat: Record<number, SeatState> = {};
  let clientLogPersistTimer: number | null = null;
  const pendingActionPlaybackSnapshots = new Map<string, PendingActionPlaybackSnapshot>();
  const actionCardIdByBox = new Map<string, string>();
  let syncInFlight = false;
  let syncQueued = false;
  let pollInterval: number | null = null;
  let sseEventSource: EventSource | null = null;
  let cursorSendAt = 0;
  let victoryCelebrationVisible = false;
  let victoryRevealTimer: number | null = null;
  let victoryRevealWinnerSeatNumber: number | null = null;
  let postVictoryCloseTimer: number | null = null;
  let postVictoryCloseFinishedAt = "";
  let opponentCursors: Record<number, OpponentCursorState> = {};
  let turnPastilleState: TurnPastilleAnimationState = {
    displayedSeatNumber: match.game?.currentTurnSeatNumber ?? null,
    transitionFromSeatNumber: null,
    transitionToSeatNumber: null,
    transitionStartedAt: 0,
    transitionDurationMs: TURN_PASTILLE_MOVE_MS
  };
  const knownLocalHandCardInstanceIds = new Set<string>();
  const localHandDealAnimatingUntil = new Map<string, number>();
  let localHandDealInitialized = false;
  let localHandDealSeatNumber = localSeatNumber;

  const isSpectatorModeForMatch = (candidateMatch: MatchState): boolean =>
    candidateMatch.status === "in_progress" && getLocalSeat(candidateMatch, localSeatNumber) == null;

  const getLayoutSeatNumber = (candidateMatch: MatchState): number => {
    if (!isSpectatorModeForMatch(candidateMatch)) {
      return localSeatNumber;
    }

    return getLocalSeat(candidateMatch, SPECTATOR_LAYOUT_SEAT_NUMBER)?.seatNumber
      ?? candidateMatch.seats[0]?.seatNumber
      ?? SPECTATOR_SEAT_NUMBER;
  };

  const syncLocalSeatNumberFromMatch = (nextMatch: MatchState): void => {
    const resolvedSeatNumber = nextMatch.seats.find((seat) => seat.userId === session.currentUser.userId)?.seatNumber
      ?? SPECTATOR_SEAT_NUMBER;
    if (resolvedSeatNumber === localSeatNumber) {
      return;
    }

    localSeatNumber = resolvedSeatNumber;
    targetHintDismissed = false;
    opponentCursors = {};
    clearInteractionState();
  };

  const resetLocalHandDealAnimations = (): void => {
    knownLocalHandCardInstanceIds.clear();
    localHandDealAnimatingUntil.clear();
    localHandDealInitialized = false;
    localHandDealSeatNumber = localSeatNumber;
  };

  const readSeenChangelogVersion = (): string => {
    try {
      return window.localStorage.getItem(SEEN_CHANGELOG_VERSION_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  };

  const markChangelogSeen = (): void => {
    const version = publicVersionInfo?.version ?? publicChangelog?.version ?? "";
    if (version === "") {
      return;
    }

    try {
      window.localStorage.setItem(SEEN_CHANGELOG_VERSION_STORAGE_KEY, version);
    } catch {
      // Discord webviews can restrict storage. If that happens, showing again next launch is acceptable.
    }
  };

  const isPublicChangelog = (value: unknown): value is PublicChangelog => {
    if (value == null || typeof value !== "object") {
      return false;
    }
    const candidate = value as Partial<PublicChangelog>;
    return (
      typeof candidate.version === "string"
      && typeof candidate.releasedAt === "string"
      && candidate.en != null
      && typeof candidate.en.title === "string"
      && Array.isArray(candidate.en.items)
      && candidate.fr != null
      && typeof candidate.fr.title === "string"
      && Array.isArray(candidate.fr.items)
    );
  };

  const isPublicVersionInfo = (value: unknown): value is PublicVersionInfo => {
    if (value == null || typeof value !== "object") {
      return false;
    }
    const candidate = value as Partial<PublicVersionInfo>;
    return (
      typeof candidate.version === "string"
      && typeof candidate.releasedAt === "string"
      && typeof candidate.commit === "string"
      && typeof candidate.branch === "string"
    );
  };

  const loadReleaseInfo = async (): Promise<void> => {
    try {
      const [changelogResponse, versionResponse] = await Promise.all([
        fetch("/changelog.json", { cache: "no-store" }),
        fetch("/version.json", { cache: "no-store" })
      ]);
      const [changelogJson, versionJson] = await Promise.all([
        changelogResponse.ok ? changelogResponse.json() as Promise<unknown> : Promise.resolve(null),
        versionResponse.ok ? versionResponse.json() as Promise<unknown> : Promise.resolve(null)
      ]);
      publicChangelog = isPublicChangelog(changelogJson) ? changelogJson : null;
      publicVersionInfo = isPublicVersionInfo(versionJson) ? versionJson : null;
      const currentVersion = publicVersionInfo?.version ?? publicChangelog?.version ?? "";
      if (currentVersion !== "" && currentVersion !== readSeenChangelogVersion()) {
        changelogOpen = true;
      }
      redraw();
    } catch {
      publicChangelog = null;
      publicVersionInfo = null;
    }
  };

  const syncLocalHandDealAnimations = (displayMatch: MatchState): boolean => {
    const localSeat = getLocalSeat(displayMatch, localSeatNumber);
    const localHand = localSeat?.hand;
    const now = Date.now();

    if (displayMatch.status !== "in_progress" || localSeat == null || localHand == null) {
      resetLocalHandDealAnimations();
      return false;
    }

    if (localHandDealSeatNumber !== localSeatNumber) {
      resetLocalHandDealAnimations();
    }

    const currentCardInstanceIds = new Set(localHand.map((card) => card.instanceId));
    if (localHandDealInitialized) {
      for (const card of localHand) {
        if (!knownLocalHandCardInstanceIds.has(card.instanceId)) {
          localHandDealAnimatingUntil.set(card.instanceId, now + HAND_DEAL_ANIMATION_MS);
        }
      }
    }
    localHandDealInitialized = true;

    for (const knownCardInstanceId of [...knownLocalHandCardInstanceIds]) {
      if (!currentCardInstanceIds.has(knownCardInstanceId)) {
        knownLocalHandCardInstanceIds.delete(knownCardInstanceId);
      }
    }
    for (const currentCardInstanceId of currentCardInstanceIds) {
      knownLocalHandCardInstanceIds.add(currentCardInstanceId);
    }
    for (const [cardInstanceId, animatingUntil] of [...localHandDealAnimatingUntil.entries()]) {
      if (now > animatingUntil || !currentCardInstanceIds.has(cardInstanceId)) {
        localHandDealAnimatingUntil.delete(cardInstanceId);
      }
    }

    return localHandDealAnimatingUntil.size > 0;
  };

  const rememberActionCardId = (boxId: string | undefined, cardId: string | undefined): void => {
    if (boxId == null || cardId == null) {
      return;
    }

    actionCardIdByBox.set(boxId, cardId);
    while (actionCardIdByBox.size > 32) {
      const oldestKey = actionCardIdByBox.keys().next().value;
      if (oldestKey == null) {
        break;
      }
      actionCardIdByBox.delete(oldestKey);
    }
  };

  const setSeatResistancePill = (
    seatNumber: number | undefined,
    boxId: string | undefined,
    outcome: SeatResistancePillOutcome
  ): void => {
    if (seatNumber == null || boxId == null) {
      return;
    }

    seatResistancePills = {
      ...seatResistancePills,
      [seatNumber]: {
        boxId,
        outcome,
        updatedAt: getReplayNow()
      }
    };
  };

  const clearSeatResistancePill = (seatNumber: number | undefined, boxId?: string): void => {
    if (seatNumber == null) {
      return;
    }

    const pill = seatResistancePills[seatNumber];
    if (pill == null || (boxId != null && pill.boxId !== boxId)) {
      return;
    }

    const nextPills = { ...seatResistancePills };
    delete nextPills[seatNumber];
    seatResistancePills = nextPills;
  };

  const clearSeatResistancePillsForBox = (boxId: string | null): void => {
    if (boxId == null) {
      return;
    }

    const nextPills: Record<number, SeatResistancePillState> = {};
    let changed = false;
    for (const [seatNumber, pill] of Object.entries(seatResistancePills)) {
      if (pill.boxId === boxId) {
        changed = true;
        continue;
      }
      nextPills[Number(seatNumber)] = pill;
    }

    if (changed) {
      seatResistancePills = nextPills;
    }
  };

  const getSeatResistanceOutcome = (event: CombatPresentationEvent): SeatResistancePillOutcome | null => {
    if (event.boxId == null) {
      return null;
    }

    if (event.success === false) {
      return event.fatalFailure ? "fail_double" : "fail";
    }

    if (event.criticalSuccess) {
      return "full";
    }

    return cardCanHalfResist(actionCardIdByBox.get(event.boxId)) ? "half" : "resist";
  };

  const resetTurnPastilleState = (seatNumber: number | null): void => {
    turnPastilleState = {
      displayedSeatNumber: seatNumber,
      transitionFromSeatNumber: null,
      transitionToSeatNumber: null,
      transitionStartedAt: 0,
      transitionDurationMs: TURN_PASTILLE_MOVE_MS
    };
  };

  const resolveDisplayedTurnSeatNumber = (presentationLockActive: boolean): number | null => {
    if (match.status !== "in_progress") {
      return null;
    }

    if (activeTurnStartSeatNumber != null) {
      return activeTurnStartSeatNumber;
    }

    if (presentationLockActive && activeActionVisual != null) {
      return activeActionVisual.turnSeatNumber;
    }

    if (presentationLockActive) {
      return turnPastilleState.transitionToSeatNumber ?? turnPastilleState.displayedSeatNumber;
    }

    return match.game?.currentTurnSeatNumber ?? null;
  };

  const syncTurnPastilleTarget = (seatNumber: number | null): void => {
    if (seatNumber == null) {
      resetTurnPastilleState(null);
      return;
    }

    const activeSeatNumber = turnPastilleState.transitionToSeatNumber ?? turnPastilleState.displayedSeatNumber;
    if (activeSeatNumber == null) {
      resetTurnPastilleState(seatNumber);
      return;
    }

    if (activeSeatNumber === seatNumber) {
      if (turnPastilleState.transitionToSeatNumber == null && turnPastilleState.displayedSeatNumber !== seatNumber) {
        turnPastilleState.displayedSeatNumber = seatNumber;
      }
      return;
    }

    turnPastilleState = {
      displayedSeatNumber: turnPastilleState.transitionToSeatNumber ?? turnPastilleState.displayedSeatNumber,
      transitionFromSeatNumber: turnPastilleState.transitionToSeatNumber ?? turnPastilleState.displayedSeatNumber,
      transitionToSeatNumber: seatNumber,
      transitionStartedAt: Date.now(),
      transitionDurationMs: TURN_PASTILLE_MOVE_MS
    };
  };

  const advanceTurnPastilleAnimation = (): boolean => {
    if (turnPastilleState.transitionToSeatNumber == null) {
      return false;
    }

    const progress = (Date.now() - turnPastilleState.transitionStartedAt) / turnPastilleState.transitionDurationMs;
    if (progress < 1) {
      return true;
    }

    turnPastilleState = {
      displayedSeatNumber: turnPastilleState.transitionToSeatNumber,
      transitionFromSeatNumber: null,
      transitionToSeatNumber: null,
      transitionStartedAt: 0,
      transitionDurationMs: TURN_PASTILLE_MOVE_MS
    };
    return false;
  };

  const cleanupScene = (): void => {
    const children = scene.removeChildren();
    for (const child of children) {
      child.destroy({ children: true, context: true, style: true });
    }
  };

  const connectSSE = (instanceId: string): void => {
    sseEventSource?.close();
    sseEventSource = new EventSource(`/api/matches/${instanceId}/events`);

    sseEventSource.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type?: string; seatNumber?: number; targetSeatNumber?: number | null };
        if (msg.type === "cursor_move" && msg.seatNumber != null) {
          if (msg.seatNumber !== localSeatNumber) {
            opponentCursors[msg.seatNumber] = {
              targetSeatNumber: msg.targetSeatNumber ?? null,
              ts: Date.now()
            };
            scheduleRedraw();
          }
          return;
        }
      } catch {
        // Fall through to state sync for non-cursor messages.
      }

      void requestSync();
    });

    sseEventSource.addEventListener("error", () => {
      if (sseEventSource?.readyState === EventSource.CLOSED) {
        sseEventSource = null;
      }
    });
  };

  const syncReplayClock = (): void => {
    const now = performance.now();
    const elapsed = now - replayTimelineWallAt;
    if (!replayPaused && elapsed > 0) {
      replayTimelineMs += elapsed * replaySpeedMultiplier;
    }
    replayTimelineWallAt = now;
  };

  const getReplayNow = (): number => {
    syncReplayClock();
    return replayTimelineMs;
  };

  const resetReplayClock = (): void => {
    replayTimelineMs = 0;
    replayTimelineWallAt = performance.now();
  };

  const setReplaySpeed = (nextSpeed: number): void => {
    syncReplayClock();
    replaySpeedMultiplier = Math.max(0.1, Math.min(2, nextSpeed));
    replayTimelineWallAt = performance.now();
    redraw();
  };

  const setReplayPaused = (nextPaused: boolean): void => {
    syncReplayClock();
    replayPaused = nextPaused;
    replayTimelineWallAt = performance.now();
    redraw();
    if (!nextPaused) {
      scheduleRedraw();
    }
  };

  const isReplayRunActive = (runId: number): boolean => runId === replayRunId;

  const waitForReplayMs = (ms: number, runId: number): Promise<boolean> => new Promise((resolve) => {
    const startedAt = getReplayNow();

    const tick = (): void => {
      if (!isReplayRunActive(runId)) {
        resolve(false);
        return;
      }

      if (getReplayNow() - startedAt >= ms) {
        resolve(true);
        return;
      }

      window.requestAnimationFrame(tick);
    };

    tick();
  });

  const clearReplayPresentationState = (): void => {
    logClient(
      "replay_clear",
      `action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()} pendingBatches=${pendingReplayBatchCount} eventPlayback=${eventPlaybackActive}`
    );
    activeCombatFx = null;
    activeDamageBursts = {};
    activeHealBursts = {};
    activeImpactFlashes = {};
    activeTurnStartSeatNumber = null;
    activeTelekinesieReveal = null;
    seatResponseThumbnailsBySeat = {};
    seatResponseThumbnailTurnSeatNumber = match.game?.currentTurnSeatNumber ?? null;
    seatResistancePills = {};
    activeCardFlights = [];
    activePlaybackArrows = [];
    displayedHpBySeat = {};
    displayedSeatsBySeat = {};
    displayedSeatReleaseBoxIndexBySeat = {};
    displayedSeatSnapshotTimelineBySeat = {};
    pendingPostDeathSeatsBySeat = {};
    activeActionVisual = null;
    centerResponseCards = [];
    eventPlaybackActive = false;
    resetReplayClock();
  };

  const syncSeatResponseThumbnailTurn = (displayedTurnSeatNumber: number | null): void => {
    if (displayedTurnSeatNumber == null) {
      seatResponseThumbnailsBySeat = {};
      seatResponseThumbnailTurnSeatNumber = null;
      return;
    }

    if (seatResponseThumbnailTurnSeatNumber == null) {
      seatResponseThumbnailTurnSeatNumber = displayedTurnSeatNumber;
      return;
    }

    if (seatResponseThumbnailTurnSeatNumber !== displayedTurnSeatNumber) {
      seatResponseThumbnailsBySeat = {};
      seatResponseThumbnailTurnSeatNumber = displayedTurnSeatNumber;
    }
  };

  const cloneLocalizedSeatSnapshot = (source: Record<number, SeatState>): Record<number, SeatState> =>
    Object.fromEntries(
      Object.entries(source).map(([seatNumber, seat]) => [
        Number(seatNumber),
        {
          ...seat,
          hand: [...(seat.hand ?? [])],
          objects: [...(seat.objects ?? [])],
          statuses: [...(seat.statuses ?? [])]
        }
      ])
    );

  const mergeReplaySeatSnapshot = (snapshotSeat: SeatState, fallbackSeat?: SeatState): SeatState => {
    const localizedSnapshot = localizeSeatState(snapshotSeat, language);
    if (snapshotSeat.seatNumber !== localSeatNumber) {
      return localizedSnapshot;
    }

    return {
      ...localizedSnapshot,
      hand: [...(fallbackSeat?.hand ?? localizedSnapshot.hand ?? [])]
    };
  };

  const getReplayEventSeatNumbers = (event: GameEvent): number[] => {
    const seatNumbers = new Set<number>();
    if ("seatNumber" in event && event.seatNumber != null) {
      seatNumbers.add(event.seatNumber);
    }
    if ("actorSeatNumber" in event && event.actorSeatNumber != null) {
      seatNumbers.add(event.actorSeatNumber);
    }
    if ("targetSeatNumber" in event && event.targetSeatNumber != null) {
      seatNumbers.add(event.targetSeatNumber);
    }
    if (event.type === "action_start") {
      for (const targetSeatNumber of event.targetSeatNumbers) {
        seatNumbers.add(targetSeatNumber);
      }
    }
    return [...seatNumbers];
  };

  const buildReplayBoxOrder = (replayableEvents: GameEvent[]): Map<string, number> => {
    const boxOrder = new Map<string, number>();
    let nextBoxIndex = 0;
    for (const event of replayableEvents) {
      const boxId = "boxId" in event ? event.boxId ?? null : null;
      if (boxId == null || boxOrder.has(boxId)) {
        continue;
      }
      boxOrder.set(boxId, nextBoxIndex);
      nextBoxIndex += 1;
    }
    return boxOrder;
  };

  const buildDisplayedSeatReleaseMap = (
    replayableEvents: GameEvent[],
    changedSeatNumbers: Set<number>
  ): Record<number, number> => {
    const boxOrder = buildReplayBoxOrder(replayableEvents);

    const releaseBoxIndexBySeat: Record<number, number> = {};
    for (const seatNumber of changedSeatNumbers) {
      releaseBoxIndexBySeat[seatNumber] = -1;
    }

    for (const event of replayableEvents) {
      const boxId = "boxId" in event ? event.boxId ?? null : null;
      if (boxId == null) {
        continue;
      }
      const boxIndex = boxOrder.get(boxId);
      if (boxIndex == null) {
        continue;
      }
      for (const seatNumber of getReplayEventSeatNumbers(event)) {
        if (!changedSeatNumbers.has(seatNumber)) {
          continue;
        }
        releaseBoxIndexBySeat[seatNumber] = Math.max(releaseBoxIndexBySeat[seatNumber] ?? -1, boxIndex);
      }
    }

    return releaseBoxIndexBySeat;
  };

  const getLastReplayBoxIndex = (replayableEvents: GameEvent[]): number => {
    const boxOrder = buildReplayBoxOrder(replayableEvents);
    if (boxOrder.size === 0) {
      return -1;
    }

    return Math.max(...boxOrder.values());
  };

  const replayBatchStartsWithActionVisualReset = (replayableEvents: GameEvent[]): boolean => {
    const firstVisualEvent = replayableEvents.find((event) =>
      event.type !== "dealer_message"
      && event.type !== "seat_snapshot"
    );
    return firstVisualEvent?.type === "action_start" || firstVisualEvent?.type === "turn_start";
  };

  const releaseDisplayedSeatsThroughBox = (boxIndex: number): void => {
    if (
      boxIndex < 0 ||
      (Object.keys(displayedSeatReleaseBoxIndexBySeat).length === 0
        && Object.keys(displayedSeatSnapshotTimelineBySeat).length === 0)
    ) {
      return;
    }

    let nextDisplayedSeatsBySeat: Record<number, SeatState> = { ...displayedSeatsBySeat };
    const nextReleaseBoxIndexBySeat: Record<number, number> = {};
    const nextSeatSnapshotTimelineBySeat: Record<number, Array<{ boxIndex: number; seat: SeatState }>> = {};
    let changed = false;

    for (const [seatNumberStr, timeline] of Object.entries(displayedSeatSnapshotTimelineBySeat)) {
      const seatNumber = Number(seatNumberStr);
      let latestSnapshot: SeatState | null = null;
      let nextTimelineIndex = 0;

      while (nextTimelineIndex < timeline.length && timeline[nextTimelineIndex]!.boxIndex <= boxIndex) {
        latestSnapshot = timeline[nextTimelineIndex]!.seat;
        nextTimelineIndex += 1;
      }

      if (latestSnapshot != null) {
        nextDisplayedSeatsBySeat[seatNumber] = latestSnapshot;
        changed = true;
      }

      if (nextTimelineIndex < timeline.length) {
        nextSeatSnapshotTimelineBySeat[seatNumber] = timeline.slice(nextTimelineIndex);
      }
    }

    for (const [seatNumberStr, snapshot] of Object.entries(displayedSeatsBySeat)) {
      const seatNumber = Number(seatNumberStr);
      const releaseBoxIndex = displayedSeatReleaseBoxIndexBySeat[seatNumber];
      if (releaseBoxIndex != null && releaseBoxIndex <= boxIndex) {
        changed = true;
        delete nextDisplayedSeatsBySeat[seatNumber];
        continue;
      }

      if (releaseBoxIndex != null) {
        nextReleaseBoxIndexBySeat[seatNumber] = releaseBoxIndex;
      }
      if (nextDisplayedSeatsBySeat[seatNumber] == null) {
        nextDisplayedSeatsBySeat[seatNumber] = snapshot;
      }
    }

    if (changed) {
      displayedSeatsBySeat = nextDisplayedSeatsBySeat;
      displayedSeatReleaseBoxIndexBySeat = nextReleaseBoxIndexBySeat;
      displayedSeatSnapshotTimelineBySeat = nextSeatSnapshotTimelineBySeat;
    }
  };

  const broadcastCursorTarget = (targetSeatNumber: number | null): void => {
    if (localSeatNumber === SPECTATOR_SEAT_NUMBER) {
      return;
    }

    void fetch(`/api/matches/${session.instanceId}/cursor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seatNumber: localSeatNumber,
        targetSeatNumber
      })
    }).catch(() => undefined);
  };

  const clearVictoryRevealTimer = (): void => {
    if (victoryRevealTimer != null) {
      window.clearTimeout(victoryRevealTimer);
      victoryRevealTimer = null;
    }
  };

  const clearPostVictoryCloseTimer = (): void => {
    if (postVictoryCloseTimer != null) {
      window.clearTimeout(postVictoryCloseTimer);
      postVictoryCloseTimer = null;
    }
    postVictoryCloseFinishedAt = "";
  };

  const clearInteractionState = (): void => {
    handHoverLockedCardInstanceId = "";
    handHoverLockedUntil = 0;
    pendingObjectPress = null;
    interactionState = {
      hoveredCardInstanceId: "",
      draggingCardInstanceId: "",
      dragPointerX: 0,
      dragPointerY: 0,
      dragHoverTarget: null,
      arrowDrag: null
    };
  };

  const getHandFocusBlendState = (): { fromCardInstanceId: string; toCardInstanceId: string; progress: number } => {
    if (handFocusTransition == null) {
      return {
        fromCardInstanceId: interactionState.hoveredCardInstanceId,
        toCardInstanceId: interactionState.hoveredCardInstanceId,
        progress: 1
      };
    }

    const elapsed = Date.now() - handFocusTransition.startedAt;
    const progress = Math.max(0, Math.min(1, elapsed / handFocusTransition.durationMs));
    if (progress >= 1) {
      handFocusTransition = null;
      return {
        fromCardInstanceId: interactionState.hoveredCardInstanceId,
        toCardInstanceId: interactionState.hoveredCardInstanceId,
        progress: 1
      };
    }

    return {
      fromCardInstanceId: handFocusTransition.fromCardInstanceId,
      toCardInstanceId: handFocusTransition.toCardInstanceId,
      progress
    };
  };

  const downloadTextFile = (filename: string, content: string): void => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  let clientDebugLog: string[] = [];
  let clientLogDirty = false;

  const formatReplayEventForLog = (event: GameEvent): string => {
    const boxId = "boxId" in event ? event.boxId ?? "n/a" : "n/a";
    if (event.type === "action_start") {
      return `${event.type}:${event.card.name}:${event.card.instanceId}:box=${boxId}`;
    }
    if (event.type === "hp_gain" || event.type === "hp_loss") {
      return `${event.type}:seat=${event.seatNumber ?? "n/a"}:amount=${event.amount ?? 0}:box=${boxId}`;
    }
    if (event.type === "response_choice") {
      return `${event.type}:seat=${event.seatNumber ?? "n/a"}:choice=${event.responseChoice ?? "n/a"}:box=${boxId}`;
    }
    if (event.type === "ordre_interrupt") {
      return `${event.type}:owner=${event.seatNumber ?? "n/a"}:actor=${event.actorSeatNumber ?? "n/a"}:card=${event.interruptedCard?.cardId ?? event.cardName ?? "n/a"}:box=${boxId}`;
    }
    if (event.type === "turn_start") {
      return `${event.type}:seat=${event.seatNumber}:box=${boxId}`;
    }
    if (event.type === "cards_discarded") {
      return `${event.type}:seat=${event.seatNumber}:cards=${event.cards.map((card) => card.cardId).join(",")}:box=${boxId}`;
    }
    if (event.type === "telekinesie_sequence") {
      return `${event.type}:target=${event.targetSeatNumber}:revealed=${event.revealedCards.length}:projected=${event.projectedCards.map((card) => card.cardId).join(",")}:box=${boxId}`;
    }
    if (event.type === "telekinesie_project_card") {
      return `${event.type}:target=${event.targetSeatNumber}:card=${event.card.cardId}:box=${boxId}`;
    }
    return `${event.type}:box=${boxId}`;
  };

  const summarizeReplayEventsForLog = (events: GameEvent[]): string =>
    events.map(formatReplayEventForLog).join(" | ");

  const summarizeActionVisualForLog = (): string =>
    activeActionVisual == null
      ? "none"
      : `${activeActionVisual.card.name}:${activeActionVisual.card.instanceId}:actor=${activeActionVisual.actorSeatNumber}`;

  const summarizeFlightsForLog = (): string =>
    activeCardFlights.length === 0
      ? "none"
      : activeCardFlights.map((flight) => `${flight.id}:${flight.card?.name ?? "blank"}:${flight.card?.instanceId ?? "n/a"}`).join(",");

  const scheduleClientLogPersist = (): void => {
    if (clientLogPersistTimer != null) {
      return;
    }

    clientLogPersistTimer = window.setTimeout(() => {
      clientLogPersistTimer = null;
      void persistClientLogNow();
    }, 900);
  };

  const logClient = (scope: string, message: string): void => {
    const entry = `${new Date().toISOString()} [client:${scope}] ${message}`;
    clientDebugLog.push(entry);
    if (clientDebugLog.length > 1000) {
      clientDebugLog = clientDebugLog.slice(-1000);
    }
    clientLogDirty = true;
    scheduleClientLogPersist();
  };
  logClient(
    "session",
    `mode=${session.mode} instance=${session.instanceId} channel=${session.channelId ?? "n/a"} guild=${session.guildId ?? "n/a"}`
  );

  const persistClientLogNow = async (): Promise<void> => {
    if (playerSessionToken.trim() === "" || !clientLogDirty) {
      return;
    }

    try {
      await persistClientLogSnapshot(session.instanceId, playerSessionToken, clientDebugLog);
      clientLogDirty = false;
    } catch (error) {
      console.warn("Unable to persist client log snapshot", error);
    }
  };

  const setHoveredCardInstanceId = (nextCardInstanceId: string): void => {
    if (nextCardInstanceId === "") {
      handHoverLockedCardInstanceId = "";
      handHoverLockedUntil = 0;
    }

    if (nextCardInstanceId === interactionState.hoveredCardInstanceId) {
      return;
    }

    const currentFocus = handFocusTransition == null
      ? interactionState.hoveredCardInstanceId
      : getHandFocusBlendState().toCardInstanceId;

    handFocusTransition = {
      fromCardInstanceId: currentFocus,
      toCardInstanceId: nextCardInstanceId,
      startedAt: Date.now(),
      durationMs: HAND_FOCUS_TRANSITION_MS
    };
    interactionState.hoveredCardInstanceId = nextCardInstanceId;
    scheduleRedraw();
  };

  const setHoveredHandCardFromPointer = (nextCardInstanceId: string): void => {
    const now = Date.now();
    if (
      handHoverLockedCardInstanceId !== ""
      && now < handHoverLockedUntil
      && nextCardInstanceId !== handHoverLockedCardInstanceId
    ) {
      return;
    }

    const previousCardInstanceId = interactionState.hoveredCardInstanceId;
    setHoveredCardInstanceId(nextCardInstanceId);
    if (previousCardInstanceId === "" && nextCardInstanceId !== "") {
      handHoverLockedCardInstanceId = nextCardInstanceId;
      handHoverLockedUntil = now + HAND_FOCUS_TRANSITION_MS + 30;
    } else if (nextCardInstanceId === "" || now >= handHoverLockedUntil) {
      handHoverLockedCardInstanceId = "";
      handHoverLockedUntil = 0;
    }
  };

  const hasActiveLocalInteraction = (): boolean =>
    interactionState.draggingCardInstanceId !== ""
    || interactionState.arrowDrag != null
    || overlayInteractionLocked
    || eventPlaybackActive
    || modalDragActive;

  const scheduleRedraw = (): void => {
    if (modalDragActive) {
      modalDragRedrawQueued = true;
      return;
    }
    if (redrawQueued) {
      return;
    }

    redrawQueued = true;
    window.requestAnimationFrame(() => {
      redrawQueued = false;
      redraw();
    });
  };

  const syncPublicHandRevealRefreshTimer = (force = false): void => {
    const pendingReveal = match.game?.pendingPublicHandReveal ?? null;
    const nextKey = pendingReveal == null ? "" : pendingReveal.expiresAt;
    if (!force && nextKey === publicHandRevealRefreshKey) {
      return;
    }

    publicHandRevealRefreshKey = nextKey;
    if (publicHandRevealRefreshTimer != null) {
      window.clearTimeout(publicHandRevealRefreshTimer);
      publicHandRevealRefreshTimer = null;
    }

    if (pendingReveal == null) {
      if (cardInspectState?.originGroup === "modal") {
        cardInspectState = null;
        inspectLayerActive = false;
        renderInspectOverlay();
      }
      return;
    }

    const msRemaining = new Date(pendingReveal.expiresAt).getTime() - Date.now();
    const nextTickMs = msRemaining <= 0
      ? 120
      : Math.max(100, Math.min(msRemaining, (msRemaining % 1000) || 1000));
    publicHandRevealRefreshTimer = window.setTimeout(() => {
      publicHandRevealRefreshTimer = null;
      redraw();
      if (match.game?.pendingPublicHandReveal != null && new Date(match.game.pendingPublicHandReveal.expiresAt).getTime() <= Date.now()) {
        void requestSync();
      }
      syncPublicHandRevealRefreshTimer(true);
    }, nextTickMs);
  };

  const viewportToStage = (clientX: number, clientY: number): StagePoint | null => {
    currentMetrics = computeStageMetrics(hostElement);
    if (
      clientX < currentMetrics.left
      || clientX > currentMetrics.left + currentMetrics.width
      || clientY < currentMetrics.top
      || clientY > currentMetrics.top + currentMetrics.height
    ) {
      return null;
    }

    return {
      x: (clientX - currentMetrics.left) / currentMetrics.scale,
      y: (clientY - currentMetrics.top) / currentMetrics.scale
    };
  };

  const stageRectToViewport = (rect: RectGeometry): RectGeometry => ({
    x: currentMetrics.left + rect.x * currentMetrics.scale,
    y: currentMetrics.top + rect.y * currentMetrics.scale,
    width: rect.width * currentMetrics.scale,
    height: rect.height * currentMetrics.scale
  });

  const viewportRectToStageRect = (rect: DOMRect): RectGeometry => ({
    x: (rect.left - currentMetrics.left) / currentMetrics.scale,
    y: (rect.top - currentMetrics.top) / currentMetrics.scale,
    width: rect.width / currentMetrics.scale,
    height: rect.height / currentMetrics.scale
  });

  const getLocalHand = (): CardView[] =>
    sortLocalHand(getLocalSeat(match, localSeatNumber)?.hand);

  const getKickTarget = (): PixiKickTarget | null => {
    if (confirmingKickSeatNumber === 0) {
      return null;
    }

    const seat = match.seats.find((candidate) => candidate.seatNumber === confirmingKickSeatNumber);
    if (seat == null) {
      return null;
    }

    return {
      seatNumber: seat.seatNumber,
      displayName: seat.displayName,
      removesBotFromLobby: match.status === "lobby" && seat.controllerType === "bot"
    };
  };

  const getSeatKickActionTarget = (): PixiSeatKickActionTarget | null => {
    if (selectedKickSeatNumber === 0) {
      return null;
    }

    const seat = match.seats.find((candidate) =>
      candidate.seatNumber === selectedKickSeatNumber
      && candidate.seatNumber !== localSeatNumber
      && candidate.controllerType === "human"
    );
    const rect = currentGeometry?.seatRects.get(selectedKickSeatNumber);
    if (seat == null || rect == null) {
      return null;
    }

    return {
      seatNumber: seat.seatNumber,
      displayName: seat.displayName,
      removesBotFromLobby: false,
      leftPx: (rect.x + rect.width / 2) * currentMetrics.scale,
      topPx: (rect.y + rect.height + 8) * currentMetrics.scale
    };
  };

  const normalizeSeatVisualEffects = (effects: Iterable<SeatVisualEffectId>): SeatVisualEffectId[] => {
    const unique = new Set(effects);
    return DEV_SEAT_VISUAL_EFFECT_IDS.filter((effectId) => unique.has(effectId));
  };

  const pruneSeatVisualEffects = (): void => {
    const validSeats = new Set(match.seats.map((seat) => seat.seatNumber));
    const nextSeatEffects: Record<number, SeatVisualEffectId[]> = {};
    for (const [seatNumberRaw, effects] of Object.entries(devSeatVisualEffectsBySeat)) {
      const seatNumber = Number(seatNumberRaw);
      if (!validSeats.has(seatNumber) || effects.length === 0) {
        continue;
      }
      nextSeatEffects[seatNumber] = normalizeSeatVisualEffects(effects);
    }
    devSeatVisualEffectsBySeat = nextSeatEffects;
  };

  const hasBlockingModalOpen = (): boolean =>
    pendingAnnulationChoice != null
    || confirmingLeave
    || confirmingDiscardCardInstanceId !== ""
    || confirmingCurseReleaseStatusInstanceId !== ""
    || confirmingKickSeatNumber !== 0
    || devCardPickerSeatNumber !== 0
    || bugReportOpen
    || seatFxEditorOpen
    || match.game?.pendingObjectChoice != null
    || match.game?.pendingHandInspection != null
    || match.game?.pendingPublicHandReveal != null
    || match.game?.pendingBoardResetKeep != null
    || match.game?.pendingDeathSearch != null
    || match.game?.pendingPickpocket != null
    || match.game?.pendingSacrificeChoice != null
    || match.game?.pendingSorcellerieSacrificeChoice != null
    || match.game?.pendingOrdreInterrupt != null
    || changelogOpen
    || cardReferenceOpen;

  const getDraggedCard = (): CardView | undefined => {
    const activeId = interactionState.arrowDrag?.cardInstanceId ?? interactionState.draggingCardInstanceId;
    return getLocalHand().find((card) => card.instanceId === activeId);
  };

  const getLocalizedDisabledReason = (cardInstanceId: string): string | undefined =>
    getLocalSeat(localizeMatchState(match, language), localSeatNumber)?.hand?.find((card) => card.instanceId === cardInstanceId)?.disabledReason;

  const showBlockedCardMessage = (card: CardView): void => {
    errorMessage = getLocalizedDisabledReason(card.instanceId) ?? card.disabledReason ?? t(language, "error.playCard");
    clearInteractionState();
    redraw();
  };

  const canAttemptResponseSlotDrop = (): boolean => {
    const pendingAction = match.game?.pendingAction;
    if (pendingAction == null) {
      return false;
    }

    const localResponder = pendingAction.responders.find((responder) => responder.seatNumber === localSeatNumber);
    return localResponder?.state === "pending";
  };

  const syncPendingAnnulationChoice = (): void => {
    if (pendingAnnulationChoice == null) {
      return;
    }

    const currentChoice = pendingAnnulationChoice;
    const pendingCard = getLocalHand().find((card) => card.instanceId === currentChoice.cardInstanceId);
    const nextPrompt = getCollectiveAnnulationPrompt(match, localSeatNumber, getLocalHand(), pendingCard);
    if (nextPrompt == null) {
      pendingAnnulationChoice = null;
      return;
    }

    pendingAnnulationChoice = {
      cardInstanceId: currentChoice.cardInstanceId,
      maxCount: nextPrompt.maxCount,
      neededCount: nextPrompt.neededCount
    };
  };

  const syncTelepathyPreview = (): void => {
    const inspection = match.game?.pendingHandInspection;
    if (inspection == null || inspection.viewerSeatNumber !== localSeatNumber) {
      telepathyPreviewCardInstanceId = "";
      return;
    }

    const targetHand = match.seats.find((s) => s.seatNumber === inspection.targetSeatNumber)?.hand ?? [];
    if (telepathyPreviewCardInstanceId === "" || !targetHand.some((c) => c.instanceId === telepathyPreviewCardInstanceId)) {
      telepathyPreviewCardInstanceId = targetHand[0]?.instanceId ?? "";
    }
  };

  const syncBoardResetKeepPreview = (): void => {
    const keep = match.game?.pendingBoardResetKeep;
    if (keep == null || keep.chooserSeatNumber !== localSeatNumber) {
      boardResetKeepPreviewCardInstanceId = "";
      return;
    }

    const localSeatState = match.seats.find((seat) => seat.seatNumber === localSeatNumber);
    const localKeepableCards = localSeatState == null
      ? []
      : [
          ...(localSeatState.hand ?? []),
          ...(localSeatState.objects ?? []),
          ...(localSeatState.statuses ?? [])
        ];

    if (
      boardResetKeepPreviewCardInstanceId === ""
      || !localKeepableCards.some((c) => c.instanceId === boardResetKeepPreviewCardInstanceId)
    ) {
      boardResetKeepPreviewCardInstanceId = localKeepableCards[0]?.instanceId ?? "";
    }
  };

  const syncConsumePreview = (): void => {
    const ffu = match.game?.forcedFollowUp;
    if (ffu == null || ffu.consumeMode !== true || ffu.actorSeatNumber !== localSeatNumber) {
      consumePreviewCardInstanceId = "";
      return;
    }
    const localSeatState = match.seats.find((s) => s.seatNumber === localSeatNumber);
    const eligibleCards = localSeatState?.hand?.filter((c) => ffu.allowedCategories.includes(c.categoryCode)) ?? [];
    if (consumePreviewCardInstanceId === "" || !eligibleCards.some((c) => c.instanceId === consumePreviewCardInstanceId)) {
      consumePreviewCardInstanceId = eligibleCards[0]?.instanceId ?? "";
    }
  };

  const syncDeathSearchState = (): void => {
    const ds = match.game?.pendingDeathSearch;
    if (ds == null || ds.chooserSeatNumber !== localSeatNumber) {
      deathSearchPreviewCardInstanceId = "";
      deathSearchSelectedCardInstanceIds = [];
      return;
    }

    const cards = ds.cardOptions;
    if (!cards.some((c) => c.instanceId === deathSearchPreviewCardInstanceId)) {
      deathSearchPreviewCardInstanceId = cards[0]?.instanceId ?? "";
    }
    deathSearchSelectedCardInstanceIds = deathSearchSelectedCardInstanceIds.filter((id) =>
      cards.some((c) => c.instanceId === id)
    );
  };

  const syncPickpocketState = (): void => {
    const pp = match.game?.pendingPickpocket;
    if (pp == null || pp.chooserSeatNumber !== localSeatNumber) {
      pickpocketPreviewCardInstanceId = "";
      pickpocketSelectedCardInstanceIds = [];
      return;
    }

    const cards = pp.cardOptions;
    if (!cards.some((c) => c.instanceId === pickpocketPreviewCardInstanceId)) {
      pickpocketPreviewCardInstanceId = cards[0]?.instanceId ?? "";
    }
    pickpocketSelectedCardInstanceIds = pickpocketSelectedCardInstanceIds.filter((id) =>
      cards.some((c) => c.instanceId === id)
    );
  };

  const pruneExpiredCombatVisuals = (): boolean => {
    const now = getReplayNow();
    activeDamageBursts = Object.fromEntries(
      Object.entries(activeDamageBursts).filter(([, burst]) => now - burst.startedAt < burst.durationMs)
    );
    activeHealBursts = Object.fromEntries(
      Object.entries(activeHealBursts).filter(([, burst]) => now - burst.startedAt < burst.durationMs)
    );
    activeImpactFlashes = Object.fromEntries(
      Object.entries(activeImpactFlashes).filter(([, flash]) => now - flash.startedAt < flash.durationMs)
    );
    const unexpiredCardFlights = activeCardFlights.filter((flight) => now - flight.startedAt < flight.durationMs);
    if (unexpiredCardFlights.length !== activeCardFlights.length) {
      const expiredFlightIds = activeCardFlights
        .filter((flight) => now - flight.startedAt >= flight.durationMs)
        .map((flight) => `${flight.id}:${flight.card?.name ?? "blank"}:${flight.card?.instanceId ?? "n/a"}`);
      logClient("replay_prune", `expiredFlights=${expiredFlightIds.join(",")} action=${summarizeActionVisualForLog()}`);
    }
    activeCardFlights = unexpiredCardFlights;
    activePlaybackArrows = activePlaybackArrows.filter((arrow) => now - arrow.startedAt < arrow.durationMs);

    return Object.keys(activeDamageBursts).length > 0
      || Object.keys(activeHealBursts).length > 0
      || Object.keys(activeImpactFlashes).length > 0
      || activeCardFlights.length > 0
      || activePlaybackArrows.length > 0;
  };

  const getSeatDisplayName = (seatNumber?: number): string => {
    if (seatNumber == null) {
      return t(language, "fallback.unknownPlayer");
    }
    return match.seats.find((seat) => seat.seatNumber === seatNumber)?.displayName
      ?? t(language, "fallback.unknownPlayer");
  };

  const hasUnseenReplayableEvents = (): boolean =>
    (match.game?.eventLog ?? []).some((event) => event.type !== "dice_roll" && !seenGameEventIds.has(event.id));

  const updateVictoryCelebrationState = (): void => {
    const winnerSeatNumber = match.game?.winnerSeatNumber ?? null;
    const canReveal = winnerSeatNumber != null && !eventPlaybackActive && !hasUnseenReplayableEvents();

    if (winnerSeatNumber == null) {
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = null;
      return;
    }

    if (!canReveal) {
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = winnerSeatNumber;
      return;
    }

    if (victoryCelebrationVisible && victoryRevealWinnerSeatNumber === winnerSeatNumber) {
      return;
    }

    if (victoryRevealTimer != null && victoryRevealWinnerSeatNumber === winnerSeatNumber) {
      return;
    }

    clearVictoryRevealTimer();
    victoryCelebrationVisible = false;
    victoryRevealWinnerSeatNumber = winnerSeatNumber;
    victoryRevealTimer = window.setTimeout(() => {
      victoryRevealTimer = null;
      if (match.game?.winnerSeatNumber === winnerSeatNumber && !eventPlaybackActive && !hasUnseenReplayableEvents()) {
        victoryCelebrationVisible = true;
        redraw();
      }
    }, 1000);
  };

  const updatePostVictoryCloseTimer = (): void => {
    if (match.status !== "finished") {
      clearPostVictoryCloseTimer();
      return;
    }

    const finishedAt = match.finishedAt ?? "";
    if (finishedAt === "") {
      return;
    }

    if (postVictoryCloseTimer != null && postVictoryCloseFinishedAt === finishedAt) {
      return;
    }

    clearPostVictoryCloseTimer();
    postVictoryCloseFinishedAt = finishedAt;
    const finishedAtMs = Date.parse(finishedAt);
    const remainingMs = Number.isFinite(finishedAtMs)
      ? Math.max(0, finishedAtMs + POST_VICTORY_ACTIVITY_CLOSE_MS - Date.now())
      : POST_VICTORY_ACTIVITY_CLOSE_MS;

    postVictoryCloseTimer = window.setTimeout(() => {
      postVictoryCloseTimer = null;
      if (match.status === "finished" && match.finishedAt === finishedAt) {
        session.closeActivity();
      }
    }, remainingMs);
  };

  const addCardFlight = async (
    card: CardView | null,
    from: StagePoint,
    to: StagePoint,
    runId: number,
    options?: Partial<Pick<CardFlightState, "durationMs" | "width" | "height" | "arcHeight" | "rotationFrom" | "rotationTo" | "tintColor">>
  ): Promise<boolean> => {
    const startedAt = getReplayNow();
    const flightId = `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const durationMs = options?.durationMs ?? 520;
    activeCardFlights = [
      ...activeCardFlights,
      {
        id: flightId,
        card,
        from,
        to,
        startedAt,
        durationMs,
        width: options?.width ?? 114,
        height: options?.height ?? 160,
        arcHeight: options?.arcHeight ?? 76,
        rotationFrom: options?.rotationFrom ?? -0.06,
        rotationTo: options?.rotationTo ?? 0.04,
        tintColor: options?.tintColor
      }
    ];
    logClient(
      "flight_add",
      `id=${flightId} card=${card?.name ?? "blank"} instance=${card?.instanceId ?? "n/a"} duration=${durationMs} activeAction=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
    );
    redraw();
    const completed = await waitForReplayMs(durationMs, runId);
    if (!completed) {
      logClient("flight_cancel", `id=${flightId} run=${runId} activeAction=${summarizeActionVisualForLog()}`);
      return false;
    }
    activeCardFlights = activeCardFlights.filter((flight) => flight.id !== flightId);
    logClient("flight_remove", `id=${flightId} card=${card?.name ?? "blank"} instance=${card?.instanceId ?? "n/a"} activeAction=${summarizeActionVisualForLog()} remaining=${summarizeFlightsForLog()}`);
    redraw();
    return true;
  };

  const addPlaybackArrow = async (
    origin: StagePoint,
    target: StagePoint,
    color: string,
    width: number,
    durationMs: number,
    runId: number
  ): Promise<boolean> => {
    const startedAt = getReplayNow();
    const arrowId = `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    activePlaybackArrows = [
      ...activePlaybackArrows,
      {
        id: arrowId,
        origin,
        target,
        color,
        width,
        startedAt,
        durationMs
      }
    ];
    redraw();
    const completed = await waitForReplayMs(durationMs, runId);
    if (!completed) {
      return false;
    }
    activePlaybackArrows = activePlaybackArrows.filter((arrow) => arrow.id !== arrowId);
    redraw();
    return true;
  };

  const getResponsePlaybackCards = (event: CombatPresentationEvent): CardView[] => {
    if (event.seatNumber != null && event.boxId != null) {
      const snapshot = pendingActionPlaybackSnapshots.get(event.boxId);
      const exactCards = snapshot?.responderCardsBySeat[event.seatNumber] ?? [];
      if (exactCards.length > 0) {
        return exactCards;
      }
    }

    const fallbackCard = getResponsePresentationCard(event.responseChoice);
    if (fallbackCard == null) {
      return [];
    }

    const responseCardCount = Math.max(1, event.responseCardCount ?? 1);
    return Array.from({ length: responseCardCount }, (_, index) => ({
      ...fallbackCard,
      instanceId: `${fallbackCard.instanceId}:${event.id}:${index}`
    }));
  };

  const getSeatCenterPoint = (seatNumber: number): StagePoint | null => currentGeometry?.seatCenters.get(seatNumber) ?? null;

  const getSeatEdgePointTowardRect = (seatNumber: number, targetRect: RectGeometry): StagePoint | null => {
    const center = currentGeometry?.seatCenters.get(seatNumber);
    const rect = currentGeometry?.seatRects.get(seatNumber);
    if (center == null || rect == null) {
      return null;
    }
    const targetCenter = getRectCenter(targetRect);
    return rectEdgePoint(targetCenter.x, targetCenter.y, rect);
  };

  const rememberPendingActionSnapshot = (sourceMatch: MatchState): void => {
    const pendingAction = sourceMatch.game?.pendingAction;
    if (pendingAction == null) {
      return;
    }

    rememberActionCardId(pendingAction.boxId, pendingAction.card.cardId);

    const responderCardsBySeat: Record<number, CardView[]> = {};
    for (const responder of pendingAction.responders) {
      const responseCards = responder.cards ?? (responder.card == null ? [] : [responder.card]);
      if (responseCards.length > 0) {
        responderCardsBySeat[responder.seatNumber] = responseCards;
      }
    }

    pendingActionPlaybackSnapshots.set(pendingAction.boxId, {
      boxId: pendingAction.boxId,
      responderCardsBySeat
    });

    while (pendingActionPlaybackSnapshots.size > 12) {
      const oldestKey = pendingActionPlaybackSnapshots.keys().next().value;
      if (oldestKey == null) {
        break;
      }
      pendingActionPlaybackSnapshots.delete(oldestKey);
    }
  };

  const buildPresentationCard = (cardId: string): CardView | null => {
    const definition = allCardDefinitions.find((candidate) => candidate.id === cardId);
    if (definition == null) {
      return null;
    }

    const localized = definition.localization?.[language];
    return {
      instanceId: `presentation:${cardId}`,
      cardId: definition.id,
      name: localized?.name ?? definition.name,
      description: localized?.description ?? definition.description,
      imageUrl: getImportedCardImageUrl(definition.image.importedAssetPath),
      categoryCode: definition.category.code,
      categoryLabel: definition.category.label,
      selectionMode: definition.rules.selectionMode,
      targets: definition.rules.targets,
      defenseBand: definition.defenseBand,
      canPlay: false,
      zone: "discard"
    };
  };

  const getResponsePresentationCard = (choice?: string): CardView | null => {
    switch (choice) {
      case "annulation":
        return buildPresentationCard("annulation");
      case "ordre-demmerlaus":
        return buildPresentationCard("ordre-demmerlaus");
      case "resistance_accrue":
        return buildPresentationCard("resistance-accrue");
      case "mirror":
        return buildPresentationCard("miroir");
      default:
        return null;
    }
  };

  const getPlaybackResponseSlotRect = (): RectGeometry =>
    currentGeometry?.responseSlot
    ?? { x: 544, y: 290, width: 128, height: 214 };

  const getPlaybackDiscardTarget = (): StagePoint | null => {
    const discardZone = currentGeometry?.discardZone;
    if (discardZone == null || discardZone.width <= 0 || discardZone.height <= 0) {
      return null;
    }

    return getRectCenter(discardZone);
  };

  rememberPendingActionSnapshot(match);
  updateVictoryCelebrationState();
  updatePostVictoryCloseTimer();

  const replayActionStartPresentation = async (event: ActionStartEvent, runId: number): Promise<boolean> => {
    centerResponseCards = [];
    const playSlot = currentGeometry?.playSlot;
    logClient(
      "action_start_begin",
      `card=${event.card.name} instance=${event.card.instanceId} box=${event.boxId} actor=${event.actorSeatNumber} targets=${event.targetSeatNumbers.join(",") || "none"} previousAction=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
    );
    if (event.fromMirror === true && activeActionVisual != null) {
      // Mirror bounce: preserve the original multi-target visual but record which seat
      // mirrored and where they reflected to, so arrows can be recoloured.
      const mirrorPlayer = event.actorSeatNumber;
      const reflectTarget = event.targetSeatNumbers[0] ?? event.mirrorOriginActorSeatNumber;
      activeActionVisual = {
        ...activeActionVisual,
        mirroredTargets: {
          ...(activeActionVisual.mirroredTargets ?? {}),
          ...(reflectTarget != null ? { [mirrorPlayer]: reflectTarget } : {})
        }
      };
    } else {
      const currentTurnSeatNumber =
        turnPastilleState.transitionToSeatNumber
        ?? turnPastilleState.displayedSeatNumber
        ?? match.game?.currentTurnSeatNumber
        ?? event.actorSeatNumber;
      activeActionVisual = {
        actorSeatNumber: event.actorSeatNumber,
        turnSeatNumber: currentTurnSeatNumber,
        targetSeatNumbers: [...event.targetSeatNumbers],
        targetObjectInstanceId: event.targetObjectInstanceId,
        card: event.card,
        summary: event.summary
      };
    }
    logClient("action_visual_set", `action=${summarizeActionVisualForLog()} playSlot=${playSlot == null ? "missing" : "ready"}`);
    if (playSlot == null) {
      return showCombatFx(
        t(language, "combat.actionPlayed", {
          playerName: getSeatDisplayName(event.actorSeatNumber),
          cardName: event.card.name
        }),
        "info",
        1000,
        runId,
        { seatNumber: event.actorSeatNumber, showBanner: false }
      );
    }

    const playCenter = getRectCenter(playSlot);
    const actorStart = getSeatEdgePointTowardRect(event.actorSeatNumber, playSlot);
    const bannerPromise = showCombatFx(
      t(language, "combat.actionPlayed", {
        playerName: getSeatDisplayName(event.actorSeatNumber),
        cardName: event.card.name
      }),
      "info",
      1000,
      runId,
      { seatNumber: event.actorSeatNumber, showBanner: false }
    );

    if (actorStart != null) {
      const [arrowCompleted, cardCompleted] = await Promise.all([
        addPlaybackArrow(actorStart, rectEdgePoint(actorStart.x, actorStart.y, playSlot), "#86cfff", 10, 560, runId),
        addCardFlight(event.card, actorStart, playCenter, runId, {
          durationMs: 560,
          width: 116,
          height: 162,
          arcHeight: 88,
          rotationFrom: -0.12,
          rotationTo: 0.02
        })
      ]);
      if (!arrowCompleted || !cardCompleted) {
        logClient("action_start_abort", `stage=inbound card=${event.card.name} box=${event.boxId}`);
        return false;
      }
      logClient("action_inbound_done", `card=${event.card.name} box=${event.boxId} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`);
    }

    const outgoingFlights: Array<Promise<boolean>> = [];
    if (event.targetObjectInstanceId == null) {
      for (const targetSeatNumber of event.targetSeatNumbers) {
        if (targetSeatNumber === event.actorSeatNumber) {
          continue;
        }

        const targetRect = currentGeometry?.seatRects.get(targetSeatNumber);
        if (targetRect == null) {
          continue;
        }

        const originPoint = rectEdgePoint(
          targetRect.x + targetRect.width / 2,
          targetRect.y + targetRect.height / 2,
          playSlot
        );
        const targetPoint = rectEdgePoint(playCenter.x, playCenter.y, targetRect);
        outgoingFlights.push(addPlaybackArrow(originPoint, targetPoint, "#d23a3a", 10, 620, runId));
        outgoingFlights.push(addCardFlight(event.card, playCenter, targetPoint, runId, {
          durationMs: 620,
          width: 108,
          height: 150,
          arcHeight: 68,
          rotationFrom: 0.04,
          rotationTo: -0.06
        }));
      }
    }

    if (event.targetObjectInstanceId != null) {
      const targetObject = currentGeometry?.inspectTargets.find((target) =>
        target.card.instanceId === event.targetObjectInstanceId
      );
      if (targetObject != null) {
        const objectCenter = getRectCenter(targetObject);
        outgoingFlights.push(addPlaybackArrow(playCenter, objectCenter, "#d23a3a", 10, 620, runId));
        outgoingFlights.push(addCardFlight(event.card, playCenter, objectCenter, runId, {
          durationMs: 620,
          width: 102,
          height: 142,
          arcHeight: 54,
          rotationFrom: 0.04,
          rotationTo: -0.08
      }));
    }
    }

    if (outgoingFlights.length > 0) {
      const results = await Promise.all(outgoingFlights);
      if (results.some((result) => result === false)) {
        logClient("action_start_abort", `stage=outgoing card=${event.card.name} box=${event.boxId}`);
        return false;
      }
    }

    const bannerCompleted = await bannerPromise;
    logClient("action_start_done", `card=${event.card.name} box=${event.boxId} completed=${bannerCompleted} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`);
    return bannerCompleted;
  };

  const replayResponseChoicePresentation = async (event: CombatPresentationEvent, runId: number): Promise<boolean> => {
    const key =
      event.responseChoice === "pass"
        ? "combat.response.pass"
        : event.responseChoice === "resist"
          ? "combat.response.resist"
          : event.responseChoice === "resistance_accrue"
            ? "combat.response.resistance_accrue"
            : event.responseChoice === "annulation"
              ? (event.responseCardCount ?? 0) > 1
                ? "combat.response.annulation_multi"
                : "combat.response.annulation"
              : event.responseChoice === "ordre-demmerlaus"
                ? "combat.response.ordre_demmerlaus"
                : "combat.response.mirror";
    const messagePromise = showCombatFx(
      t(language, key, {
        playerName: getSeatDisplayName(event.seatNumber),
        cardName: event.cardName ?? "",
        count: event.responseCardCount ?? 1
      }),
      "info",
      900,
      runId,
      { seatNumber: event.seatNumber, showBanner: event.responseChoice !== "pass" }
    );

    if (event.responseChoice !== "pass" && event.seatNumber != null) {
      const responseSlotRect = getPlaybackResponseSlotRect();
      const responderStart = getSeatEdgePointTowardRect(event.seatNumber, responseSlotRect);
      const responseCenter = getRectCenter(responseSlotRect);
      const discardTarget = getPlaybackDiscardTarget() ?? responseCenter;
      const responseCards = getResponsePlaybackCards(event);
      const responseCard = responseCards.at(-1) ?? null;
      if (responseCards.length > 0) {
        centerResponseCards = responseCards;
      }
      if (responseCard != null) {
        seatResponseThumbnailTurnSeatNumber = activeActionVisual?.actorSeatNumber
          ?? seatResponseThumbnailTurnSeatNumber
          ?? match.game?.currentTurnSeatNumber
          ?? null;
        seatResponseThumbnailsBySeat = {
          ...seatResponseThumbnailsBySeat,
          [event.seatNumber]: {
            card: responseCard,
            updatedAt: getReplayNow()
          }
        };
        redraw();
      }
      if (responderStart != null && responseCards.length > 0) {
        const spreadCenterCards = responseCards.map((card, index) => {
          const centeredOffset = index - (responseCards.length - 1) / 2;
          return {
            card,
            responsePoint: {
              x: responseCenter.x + centeredOffset * 20,
              y: responseCenter.y - Math.abs(centeredOffset) * 10
            },
            discardPoint: {
              x: discardTarget.x + centeredOffset * 18,
              y: discardTarget.y - Math.abs(centeredOffset) * 8
            }
          };
        });
        const cardFlights = spreadCenterCards.map(({ card, responsePoint, discardPoint }, index) => (async () => {
          if (index > 0) {
            const delayed = await waitForReplayMs(110 * index, runId);
            if (!delayed) {
              return false;
            }
          }
          const reachedCenter = await addCardFlight(card, responderStart, responsePoint, runId, {
            durationMs: 420,
            width: 98,
            height: 138,
            arcHeight: 64,
            rotationFrom: -0.1,
            rotationTo: 0.02,
            tintColor: "#243a54"
          });
          if (!reachedCenter) {
            return false;
          }
          return addCardFlight(card, responsePoint, discardPoint, runId, {
            durationMs: 340,
            width: 94,
            height: 132,
            arcHeight: 24,
            rotationFrom: 0.02,
            rotationTo: 0.08,
            tintColor: "#243a54"
          });
        })());
        const [arrowCompleted, ...cardCompleted] = await Promise.all([
          addPlaybackArrow(responderStart, rectEdgePoint(responderStart.x, responderStart.y, responseSlotRect), "#8ac8ff", 9, 520, runId),
          ...cardFlights
        ]);
        if (!arrowCompleted || cardCompleted.some((completed) => completed === false)) {
          return false;
        }
      }
    }

    return messagePromise;
  };

  const replayOrdreInterruptPresentation = async (event: CombatPresentationEvent, runId: number): Promise<boolean> => {
    const ordreCard = event.ordreCard ?? buildPresentationCard("ordre-demmerlaus");
    const interruptedCard = event.interruptedCard ?? null;
    const responseSlotRect = getPlaybackResponseSlotRect();
    const responseCenter = getRectCenter(responseSlotRect);
    const discardTarget = getPlaybackDiscardTarget() ?? responseCenter;
    const targetRect = currentGeometry?.discardZone ?? responseSlotRect;
    const ordreStart = event.seatNumber == null
      ? responseCenter
      : getSeatEdgePointTowardRect(event.seatNumber, targetRect) ?? getSeatCenterPoint(event.seatNumber) ?? responseCenter;
    const interruptedStart = event.actorSeatNumber == null
      ? responseCenter
      : getSeatEdgePointTowardRect(event.actorSeatNumber, targetRect) ?? getSeatCenterPoint(event.actorSeatNumber) ?? responseCenter;

    const shownCards = [ordreCard, interruptedCard].filter((card): card is CardView => card != null);
    if (shownCards.length > 0) {
      centerResponseCards = shownCards;
      redraw();
    }

    const messagePromise = showCombatFx(
      t(language, "combat.response.ordre_demmerlaus", {
        playerName: getSeatDisplayName(event.seatNumber),
        cardName: event.cardName ?? interruptedCard?.name ?? "",
        count: 1
      }),
      "info",
      1050,
      runId,
      { seatNumber: event.seatNumber, showBanner: true }
    );

    const flights: Array<Promise<boolean>> = [];
    if (ordreCard != null) {
      flights.push(addCardFlight(ordreCard, ordreStart, { x: discardTarget.x - 26, y: discardTarget.y - 8 }, runId, {
        durationMs: 660,
        width: 100,
        height: 140,
        arcHeight: 76,
        rotationFrom: -0.12,
        rotationTo: -0.04,
        tintColor: "#233553"
      }));
    }
    if (interruptedCard != null) {
      flights.push(addCardFlight(interruptedCard, interruptedStart, { x: discardTarget.x + 26, y: discardTarget.y + 8 }, runId, {
        durationMs: 660,
        width: 100,
        height: 140,
        arcHeight: 76,
        rotationFrom: 0.12,
        rotationTo: 0.04,
        tintColor: "#4b2634"
      }));
    }

    const [messageCompleted, ...flightCompleted] = await Promise.all([messagePromise, ...flights]);
    return messageCompleted && flightCompleted.every((completed) => completed);
  };

  const showCombatFx = async (
    message: string,
    tone: ActiveCombatFxState["tone"],
    durationMs: number,
    runId: number,
    options?: {
      seatNumber?: number;
      damageAmount?: number;
      healAmount?: number;
      impactTargetSeatNumber?: number;
      showBanner?: boolean;
    }
  ): Promise<boolean> => {
    const startedAt = getReplayNow();
    const showBanner = options?.showBanner ?? true;
    if (showBanner) {
      activeCombatFx = { message, tone, seatNumber: options?.seatNumber };
    }
    if (options?.damageAmount != null && options.seatNumber != null) {
      activeDamageBursts[options.seatNumber] = {
        amount: options.damageAmount,
        startedAt,
        durationMs: 950,
        kind: "damage"
      };
    }
    if (options?.healAmount != null && options.seatNumber != null) {
      activeHealBursts[options.seatNumber] = {
        amount: options.healAmount,
        startedAt,
        durationMs: 1100,
        kind: "heal"
      };
    }
    if (options?.impactTargetSeatNumber != null) {
      activeImpactFlashes[options.impactTargetSeatNumber] = {
        startedAt,
        durationMs: 520
      };
    }
    redraw();
    const completed = await waitForReplayMs(durationMs, runId);
    if (!completed) {
      return false;
    }
    if (showBanner && activeCombatFx?.message === message) {
      activeCombatFx = null;
    }
    if (options?.seatNumber != null && options.damageAmount != null && activeDamageBursts[options.seatNumber]?.startedAt === startedAt) {
      const { [options.seatNumber]: _removed, ...rest } = activeDamageBursts;
      activeDamageBursts = rest;
    }
    if (options?.seatNumber != null && options.healAmount != null && activeHealBursts[options.seatNumber]?.startedAt === startedAt) {
      const { [options.seatNumber]: _removed, ...rest } = activeHealBursts;
      activeHealBursts = rest;
    }
    if (options?.impactTargetSeatNumber != null && activeImpactFlashes[options.impactTargetSeatNumber]?.startedAt === startedAt) {
      const { [options.impactTargetSeatNumber]: _removed, ...rest } = activeImpactFlashes;
      activeImpactFlashes = rest;
    }
    redraw();
    return true;
  };

  const buildTelekinesieRevealLayouts = (event: TelekinesieSequenceEvent): TelekinesieRevealCardLayout[] => {
    const cards = event.revealedCards;
    if (cards.length === 0) {
      return [];
    }

    const maxAreaWidth = 1120;
    const gap = cards.length > 7 ? 14 : 22;
    const cardWidth = Math.max(86, Math.min(178, (maxAreaWidth - gap * (cards.length - 1)) / cards.length));
    const cardHeight = cardWidth * 1.4;
    const totalWidth = cards.length * cardWidth + (cards.length - 1) * gap;
    const startX = STAGE_WIDTH / 2 - totalWidth / 2 + cardWidth / 2;
    const y = 405;
    const projectedIds = new Set(event.projectedCards.map((card) => card.instanceId));

    return cards.map((card, index) => ({
      card,
      x: startX + index * (cardWidth + gap),
      y,
      width: cardWidth,
      height: cardHeight,
      isProjected: projectedIds.has(card.instanceId)
    }));
  };

  const buildTelekinesieThumbnailLayouts = (cards: CardView[]): TelekinesieRevealCardLayout[] => {
    if (cards.length === 0) {
      return [];
    }

    const cardWidth = 92;
    const cardHeight = 128;
    const gap = 18;
    const totalWidth = cards.length * cardWidth + (cards.length - 1) * gap;
    const startX = STAGE_WIDTH / 2 - totalWidth / 2 + cardWidth / 2;
    const y = 548;

    return cards.map((card, index) => ({
      card,
      x: startX + index * (cardWidth + gap),
      y,
      width: cardWidth,
      height: cardHeight,
      isProjected: true
    }));
  };

  const replayTelekinesieSequencePresentation = async (
    event: TelekinesieSequenceEvent,
    runId: number
  ): Promise<boolean> => {
    const layouts = buildTelekinesieRevealLayouts(event);
    const targetCenter = getSeatCenterPoint(event.targetSeatNumber) ?? { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
    if (layouts.length === 0) {
      return waitForReplayMs(400, runId);
    }

    activeTelekinesieReveal = null;
    const incomingFlights = layouts.map((layout, index) =>
      addCardFlight(layout.card, targetCenter, { x: layout.x, y: layout.y }, runId, {
        durationMs: 580 + index * 35,
        width: layout.width,
        height: layout.height,
        arcHeight: 84,
        rotationFrom: -0.14,
        rotationTo: 0
      })
    );
    const arrived = await Promise.all(incomingFlights);
    if (!arrived.every(Boolean)) {
      return false;
    }

    activeTelekinesieReveal = { layouts, showNonProjected: true, displayMode: "large" };
    redraw();
    if (!await waitForReplayMs(5000, runId)) {
      return false;
    }

    activeTelekinesieReveal = { layouts, showNonProjected: false, displayMode: "large" };
    redraw();
    if (!await waitForReplayMs(420, runId)) {
      return false;
    }

    const projectedLayouts = buildTelekinesieThumbnailLayouts(event.projectedCards);
    activeTelekinesieReveal = projectedLayouts.length === 0
      ? null
      : { layouts: projectedLayouts, showNonProjected: false, displayMode: "thumbnail" };
    redraw();
    return waitForReplayMs(320, runId);
  };

  const replayTelekinesieProjectCardPresentation = async (
    event: TelekinesieProjectCardEvent,
    runId: number
  ): Promise<boolean> => {
    const playSlot = currentGeometry?.playSlot;
    const playCenter = playSlot == null ? { x: STAGE_WIDTH / 2, y: 362 } : getRectCenter(playSlot);
    const thumbnailLayout = activeTelekinesieReveal?.layouts.find((layout) => layout.card.instanceId === event.card.instanceId);
    const start = thumbnailLayout == null
      ? getSeatCenterPoint(event.targetSeatNumber) ?? playCenter
      : { x: thumbnailLayout.x, y: thumbnailLayout.y };

    if (activeTelekinesieReveal != null) {
      const remainingLayouts = activeTelekinesieReveal.layouts.filter((layout) => layout.card.instanceId !== event.card.instanceId);
      activeTelekinesieReveal = remainingLayouts.length === 0
        ? null
        : { ...activeTelekinesieReveal, layouts: remainingLayouts };
    }

    activeActionVisual = {
      actorSeatNumber: event.actorSeatNumber,
      turnSeatNumber: match.game?.currentTurnSeatNumber ?? event.actorSeatNumber,
      targetSeatNumbers: [event.targetSeatNumber],
      card: event.card,
      summary: `${event.card.name} is projected by Telekinesie.`
    };
    redraw();

    const completed = await addCardFlight(event.card, start, playCenter, runId, {
      durationMs: 520,
      width: 116,
      height: 162,
      arcHeight: 60,
      rotationFrom: 0,
      rotationTo: 0.02
    });
    if (!completed) {
      return false;
    }

    return waitForReplayMs(240, runId);
  };

  const getPixiDiceStagePlacement = (event: DiceRollPlaybackEvent): DiceStagePlacement | null => {
    if (currentGeometry == null) {
      return null;
    }

    const anchoredCard = event.anchorCardInstanceId == null
      ? null
      : currentGeometry.inspectTargets.find((target) => target.card.instanceId === event.anchorCardInstanceId) ?? null;
    const rect = anchoredCard ?? (event.seatNumber == null ? null : currentGeometry.seatRects.get(event.seatNumber));
    if (rect == null) {
      return null;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isLocalSeat = event.seatNumber === localSeatNumber;
    const isCardAnchor = anchoredCard != null;
    
    // Scale the stage-relative coordinates to viewport pixels
    const scaledX = currentMetrics.left + rect.x * currentMetrics.scale;
    const scaledY = currentMetrics.top + rect.y * currentMetrics.scale;
    const scaledWidth = rect.width * currentMetrics.scale;
    const scaledHeight = rect.height * currentMetrics.scale;

    const desiredWidth = isCardAnchor
      ? Math.min(220, Math.max(150, scaledWidth + 80))
      : Math.min(isLocalSeat ? 300 : 240, Math.max(180, scaledWidth + (isLocalSeat ? 40 : 60)));
    const desiredHeight = isCardAnchor
      ? Math.min(180, Math.max(130, scaledHeight + 60))
      : Math.min(isLocalSeat ? 220 : 180, Math.max(140, scaledHeight + (isLocalSeat ? 24 : 36)));
    const centeredLeft = scaledX + (scaledWidth / 2) - (desiredWidth / 2);
    const centeredTop = scaledY + (scaledHeight / 2) - (desiredHeight / 2);

    return {
      left: Math.max(8, Math.min(centeredLeft, viewportWidth - desiredWidth - 8)),
      top: Math.max(8, Math.min(centeredTop, viewportHeight - desiredHeight - 8)),
      width: desiredWidth,
      height: desiredHeight
    };
  };

  const replayDiceRollPresentation = async (event: DiceRollPlaybackEvent, runId: number): Promise<boolean> => {
    await diceController.roll(event.notation, {
      resolvedResult: {
        total: event.total,
        values: event.values
      },
      themeColor: getSeatDiceColor(event.seatNumber),
      placement: getPixiDiceStagePlacement(event),
      timeScale: replaySpeedMultiplier
    });
    return waitForReplayMs(250, runId);
  };

  const replayCardsDiscardedPresentation = async (
    event: Extract<GameEvent, { type: "cards_discarded" }>,
    runId: number
  ): Promise<boolean> => {
    const discardTarget = getPlaybackDiscardTarget();
    if (discardTarget == null || event.cards.length === 0) {
      return waitForReplayMs(300, runId);
    }

    const discardRect = currentGeometry?.discardZone ?? {
      x: discardTarget.x - 1,
      y: discardTarget.y - 1,
      width: 2,
      height: 2
    };
    const start = getSeatEdgePointTowardRect(event.seatNumber, discardRect) ?? getSeatCenterPoint(event.seatNumber);
    if (start == null) {
      return waitForReplayMs(300, runId);
    }

    const flights = event.cards.map((card, index) => {
      const centeredOffset = index - (event.cards.length - 1) / 2;
      return addCardFlight(card, start, {
        x: discardTarget.x + centeredOffset * 18,
        y: discardTarget.y - Math.abs(centeredOffset) * 8
      }, runId, {
        durationMs: 520 + index * 80,
        width: 92,
        height: 128,
        arcHeight: 64,
        rotationFrom: -0.08,
        rotationTo: 0.06
      });
    });

    const completed = await Promise.all(flights);
    return completed.every(Boolean);
  };

  const applyCardsDiscardedToDisplayedSeat = (event: Extract<GameEvent, { type: "cards_discarded" }>): void => {
    const displayedSeat = displayedSeatsBySeat[event.seatNumber];
    if (displayedSeat == null || event.cards.length === 0) {
      return;
    }

    const discardedInstanceIds = new Set(event.cards.map((card) => card.instanceId));
    displayedSeatsBySeat = {
      ...displayedSeatsBySeat,
      [event.seatNumber]: {
        ...displayedSeat,
        hand: displayedSeat.hand?.filter((card) => !discardedInstanceIds.has(card.instanceId)),
        objects: displayedSeat.objects?.filter((card) => !discardedInstanceIds.has(card.instanceId)),
        statuses: displayedSeat.statuses?.filter((card) => !discardedInstanceIds.has(card.instanceId))
      }
    };
    redraw();
  };

  const replayTurnStartPresentation = async (event: Extract<GameEvent, { type: "turn_start" }>, runId: number): Promise<boolean> => {
    activeActionVisual = null;
    centerResponseCards = [];
    activeTurnStartSeatNumber = event.seatNumber;
    syncTurnPastilleTarget(event.seatNumber);
    redraw();
    return waitForReplayMs(TURN_PASTILLE_MOVE_MS, runId);
  };

  const prepareReplayBatchState = (
    replayableEvents: GameEvent[],
    preUpdateSeats: Record<number, SeatState>
  ): void => {
    const clearsActionVisual = replayBatchStartsWithActionVisualReset(replayableEvents);
    const preservedActionVisual = clearsActionVisual ? null : activeActionVisual;
    const preservedCenterResponseCards = clearsActionVisual ? [] : [...centerResponseCards];
    logClient(
      "replay_prepare",
      `events=${replayableEvents.length} clearsAction=${clearsActionVisual} beforeAction=${summarizeActionVisualForLog()} beforeFlights=${summarizeFlightsForLog()} summary=${summarizeReplayEventsForLog(replayableEvents)}`
    );
    clearReplayPresentationState();
    if (preservedActionVisual != null) {
      activeActionVisual = preservedActionVisual;
      centerResponseCards = preservedCenterResponseCards;
    }
    const changedSeatNumbers = new Set<number>();
    const seatNumbersWithTimelineSnapshots = new Set<number>();
    const replayBoxOrder = buildReplayBoxOrder(replayableEvents);
    const dyingSeatNumbers = new Set<number>();
    const hpSeededFromPreUpdate = new Set<number>();

    // Seed displayedHpBySeat from the last fully rendered seat snapshot when
    // available. Reverse-applying from the already-updated match state breaks
    // on lethal hits because dead seats are clamped to 0 in public state.
    for (const event of replayableEvents) {
      if ((event.type === "hp_loss" || event.type === "hp_gain") && event.seatNumber != null) {
        if (displayedHpBySeat[event.seatNumber] == null) {
          const preUpdateHp = preUpdateSeats[event.seatNumber]?.hp;
          if (preUpdateHp != null) {
            displayedHpBySeat[event.seatNumber] = preUpdateHp;
            hpSeededFromPreUpdate.add(event.seatNumber);
          } else {
            displayedHpBySeat[event.seatNumber] =
              match.seats.find((s) => s.seatNumber === event.seatNumber)?.hp ?? 0;
          }
        }
        if (hpSeededFromPreUpdate.has(event.seatNumber)) {
          continue;
        }
        if (event.type === "hp_loss") {
          displayedHpBySeat[event.seatNumber] += event.amount ?? 0;
        } else {
          displayedHpBySeat[event.seatNumber] -= event.amount ?? 0;
        }
      }
    }

    // Snapshot pre-death seat data for seats dying in this animation batch.
    // Their hand/objects are already cleared in the new match state, but we keep
    // them visible until displayedHpBySeat actually animates down to 0.
    for (const [key, startingHp] of Object.entries(displayedHpBySeat)) {
      const seatNumber = Number(key);
      if (startingHp > 0 && match.seats.find((s) => s.seatNumber === seatNumber)?.isAlive === false) {
        dyingSeatNumbers.add(seatNumber);
        const preDeath = preUpdateSeats[seatNumber];
        if (preDeath != null) {
          displayedSeatsBySeat[seatNumber] = preDeath;
        }
        const postDeathSeat = match.seats.find((s) => s.seatNumber === seatNumber);
        if (postDeathSeat != null) {
          pendingPostDeathSeatsBySeat[seatNumber] = localizeSeatState(postDeathSeat, language);
        }
      }
    }

    for (const event of replayableEvents) {
      if (event.type !== "seat_snapshot") {
        continue;
      }

      if (dyingSeatNumbers.has(event.seatNumber)) {
        continue;
      }

      const boxIndex = replayBoxOrder.get(event.boxId);
      if (boxIndex == null) {
        continue;
      }

      seatNumbersWithTimelineSnapshots.add(event.seatNumber);
      if (displayedSeatsBySeat[event.seatNumber] == null) {
        displayedSeatsBySeat[event.seatNumber] = preUpdateSeats[event.seatNumber]
          ?? mergeReplaySeatSnapshot(event.seat);
      }

      const fallbackSeat = displayedSeatsBySeat[event.seatNumber] ?? preUpdateSeats[event.seatNumber];
      displayedSeatSnapshotTimelineBySeat[event.seatNumber] = [
        ...(displayedSeatSnapshotTimelineBySeat[event.seatNumber] ?? []),
        {
          boxIndex,
          seat: mergeReplaySeatSnapshot(event.seat, fallbackSeat)
        }
      ];
    }

    // Freeze any seat row whose public row or local hand changed in this batch so cards
    // do not appear or disappear before the owning action replay finishes.
    for (const [seatNumberStr, preSeat] of Object.entries(preUpdateSeats)) {
      const seatNumber = Number(seatNumberStr);
      const newSeat = match.seats.find((s) => s.seatNumber === seatNumber);
      if (newSeat == null) continue;
      if (seatNumbersWithTimelineSnapshots.has(seatNumber)) {
        continue;
      }
      const handChanged = seatNumber === localSeatNumber && !cardInstanceListsMatch(preSeat.hand, newSeat.hand);
      const objectsChanged = !cardInstanceListsMatch(preSeat.objects, newSeat.objects);
      const statusesChanged = !cardInstanceListsMatch(preSeat.statuses, newSeat.statuses);
      if (handChanged || objectsChanged || statusesChanged) {
        changedSeatNumbers.add(seatNumber);
        const existing = displayedSeatsBySeat[seatNumber];
        displayedSeatsBySeat[seatNumber] = existing != null
          ? {
              ...existing,
              hand: handChanged ? preSeat.hand : existing.hand,
              objects: preSeat.objects,
              statuses: preSeat.statuses
            }
          : preSeat;
      }
    }

    displayedSeatReleaseBoxIndexBySeat = buildDisplayedSeatReleaseMap(replayableEvents, changedSeatNumbers);
    const localReleaseBoxIndex = displayedSeatReleaseBoxIndexBySeat[localSeatNumber];
    const localDisplaySeat = displayedSeatsBySeat[localSeatNumber];
    if (localDisplaySeat != null && localReleaseBoxIndex != null) {
      displayedSeatReleaseBoxIndexBySeat[localSeatNumber] = Math.max(
        localReleaseBoxIndex,
        getLastReplayBoxIndex(replayableEvents)
      );
    }
    logClient(
      "replay_prepare_done",
      `release=${JSON.stringify(displayedSeatReleaseBoxIndexBySeat)} snapshots=${Object.keys(displayedSeatSnapshotTimelineBySeat).join(",") || "none"} action=${summarizeActionVisualForLog()}`
    );
  };

  const finishReplayBatch = (): void => {
    logClient(
      "replay_finish",
      `pendingBefore=${pendingReplayBatchCount} matchPendingAction=${match.game?.pendingAction == null ? "no" : "yes"} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
    );
    eventPlaybackActive = false;
    displayedHpBySeat = {};
    displayedSeatsBySeat = {};
    displayedSeatReleaseBoxIndexBySeat = {};
    displayedSeatSnapshotTimelineBySeat = {};
    pendingPostDeathSeatsBySeat = {};
    if (match.game?.pendingAction == null && pendingReplayBatchCount === 0) {
      activeActionVisual = null;
      centerResponseCards = [];
    }
    updateVictoryCelebrationState();
    updatePostVictoryCloseTimer();
    redraw();
    if (syncQueued && !syncInFlight) {
      syncQueued = false;
      void requestSync();
    }
  };

  const runReplayBatch = async (
    replayableEvents: GameEvent[],
    preUpdateSeats: Record<number, SeatState>,
    runId: number
  ): Promise<void> => {
    const lastDiceTotalBySeat = new Map<number, number>();
    let activeReplayBoxId: string | null = null;
    const boxOrder = new Map<string, number>();
    let nextBoxIndex = 0;
    for (const replayEvent of replayableEvents) {
      const replayBoxId = "boxId" in replayEvent ? replayEvent.boxId ?? null : null;
      if (replayBoxId == null || boxOrder.has(replayBoxId)) {
        continue;
      }
      boxOrder.set(replayBoxId, nextBoxIndex);
      nextBoxIndex += 1;
    }

    for (const event of replayableEvents) {
      if (!isReplayRunActive(runId)) {
        return;
      }

      const eventBoxId = "boxId" in event ? event.boxId ?? null : null;
      if (activeReplayBoxId != null && eventBoxId != null && eventBoxId !== activeReplayBoxId) {
        logClient(
          "replay_box_switch",
          `from=${activeReplayBoxId} to=${eventBoxId} releaseIndex=${boxOrder.get(activeReplayBoxId) ?? -1} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
        );
        releaseDisplayedSeatsThroughBox(boxOrder.get(activeReplayBoxId) ?? -1);
        clearSeatResistancePillsForBox(activeReplayBoxId);
        redraw();
      }
      if (eventBoxId != null) {
        activeReplayBoxId = eventBoxId;
      }

      if (event.type === "dice_roll") {
        if (event.seatNumber != null) {
          lastDiceTotalBySeat.set(event.seatNumber, event.total);
        }
        const completed = await replayDiceRollPresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      revealEventLogEntriesForEvent(event);
      redraw();

      if (event.type === "dealer_message") {
        continue;
      }

      if (event.type === "seat_snapshot") {
        continue;
      }

      if (event.type === "cards_discarded") {
        const completed = await replayCardsDiscardedPresentation(event, runId);
        if (!completed) {
          return;
        }
        applyCardsDiscardedToDisplayedSeat(event);
        continue;
      }

      if (event.type === "telekinesie_sequence") {
        const completed = await replayTelekinesieSequencePresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "telekinesie_project_card") {
        const completed = await replayTelekinesieProjectCardPresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "turn_start") {
        const completed = await replayTurnStartPresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "action_start") {
        rememberActionCardId(event.boxId, event.card.cardId);
        const completed = await replayActionStartPresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "response_choice") {
        const completed = await replayResponseChoicePresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "ordre_interrupt") {
        const completed = await replayOrdreInterruptPresentation(event, runId);
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "resistance_start") {
        const bonus = event.bonus == null || event.bonus === 0 ? "" : ` ${event.bonus > 0 ? `+${event.bonus}` : `${event.bonus}`}`;
        const completed = await showCombatFx(
          t(language, "combat.resistance.prepare", {
            playerName: getSeatDisplayName(event.seatNumber),
            bonus,
            threshold: event.threshold ?? 10
          }),
          "info",
          850,
          runId,
          { seatNumber: event.seatNumber, showBanner: false }
        );
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "resistance_result") {
        const resistanceOutcome = getSeatResistanceOutcome(event);
        if (resistanceOutcome != null) {
          setSeatResistancePill(event.seatNumber, event.boxId, resistanceOutcome);
          redraw();
        }
        const diceTotal = event.seatNumber != null ? lastDiceTotalBySeat.get(event.seatNumber) : undefined;
        const totalStr = diceTotal != null ? String(diceTotal) : "?";
        const message = event.success === false
          ? event.fatalFailure
            ? t(language, "combat.resistance.failedCritical", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: totalStr
              })
            : t(language, "combat.resistance.failed", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: totalStr
              })
          : event.criticalSuccess
            ? t(language, "combat.resistance.critical", {
                playerName: getSeatDisplayName(event.seatNumber)
              })
            : t(language, "combat.resistance.success", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: totalStr
              });
        const completed = await showCombatFx(
          message,
          event.success === false ? "failure" : "success",
          1100,
          runId,
          { seatNumber: event.seatNumber, showBanner: false }
        );
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "attack_impact") {
        const completed = await showCombatFx(
          t(language, "combat.attackIncoming", {
            cardName: event.cardName ?? (language === "fr" ? "Attaque" : "Attack"),
            targetName: getSeatDisplayName(event.targetSeatNumber)
          }),
          "failure",
          500,
          runId,
          {
            seatNumber: event.targetSeatNumber,
            impactTargetSeatNumber: event.targetSeatNumber,
            showBanner: false
          }
        );
        if (!completed) {
          return;
        }
        continue;
      }

      if (event.type === "hp_loss" && (event.amount ?? 0) > 0) {
        let becameDead = false;
        if (event.seatNumber != null) {
          displayedHpBySeat[event.seatNumber] =
            (displayedHpBySeat[event.seatNumber] ??
              (match.seats.find((s) => s.seatNumber === event.seatNumber)?.hp ?? 0))
            - (event.amount ?? 0);
          becameDead = displayedHpBySeat[event.seatNumber]! <= 0 && pendingPostDeathSeatsBySeat[event.seatNumber] != null;
        }
        clearSeatResistancePill(event.seatNumber, event.boxId);
        redraw();
        const completed = await showCombatFx(
          t(language, "combat.tookDamage", {
            playerName: getSeatDisplayName(event.seatNumber),
            amount: event.amount ?? 0
          }),
          "failure",
          1250,
          runId,
          {
            seatNumber: event.seatNumber,
            damageAmount: event.amount,
            impactTargetSeatNumber: event.seatNumber,
            showBanner: false
          }
        );
        if (!completed) {
          return;
        }
        if (becameDead && event.seatNumber != null) {
          displayedSeatsBySeat[event.seatNumber] = pendingPostDeathSeatsBySeat[event.seatNumber]!;
          const { [event.seatNumber]: _removed, ...rest } = pendingPostDeathSeatsBySeat;
          pendingPostDeathSeatsBySeat = rest;
          redraw();
        }
        continue;
      }

      if (event.type === "hp_gain" && (event.amount ?? 0) > 0) {
        logClient(
          "hp_gain_begin",
          `seat=${event.seatNumber ?? "n/a"} amount=${event.amount ?? 0} box=${event.boxId ?? "n/a"} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
        );
        if (event.seatNumber != null) {
          displayedHpBySeat[event.seatNumber] =
            (displayedHpBySeat[event.seatNumber] ??
              (match.seats.find((s) => s.seatNumber === event.seatNumber)?.hp ?? 0))
            + (event.amount ?? 0);
        }
        const completed = await showCombatFx(
          t(language, "combat.gainsHp", {
            playerName: getSeatDisplayName(event.seatNumber),
            amount: event.amount ?? 0
          }),
          "success",
          1100,
          runId,
          {
            seatNumber: event.seatNumber,
            healAmount: event.amount,
            showBanner: false
          }
        );
        if (!completed) {
          return;
        }
        logClient(
          "hp_gain_done",
          `seat=${event.seatNumber ?? "n/a"} amount=${event.amount ?? 0} box=${event.boxId ?? "n/a"} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
        );
      }
    }

    if (!isReplayRunActive(runId)) {
      return;
    }

    clearSeatResistancePillsForBox(activeReplayBoxId);
    finishReplayBatch();
  };

  const queueReplayBatch = (
    replayableEvents: GameEvent[],
    preUpdateSeats: Record<number, SeatState>
  ): void => {
    if (replayableEvents.length === 0) {
      return;
    }

    latestReplayBatch = [...replayableEvents];
    latestReplayPreUpdateLocalizedSeatsBySeat = cloneLocalizedSeatSnapshot(preUpdateSeats);
    const preparedImmediately = !eventPlaybackActive && pendingReplayBatchCount === 0;
    pendingReplayBatchCount += 1;
    logClient(
      "replay_queue",
      `events=${replayableEvents.length} preparedImmediately=${preparedImmediately} pending=${pendingReplayBatchCount} playback=${eventPlaybackActive} summary=${summarizeReplayEventsForLog(replayableEvents)}`
    );
    if (preparedImmediately) {
      prepareReplayBatchState(replayableEvents, preUpdateSeats);
      eventPlaybackActive = true;
      redraw();
    }
    const queueToken = replayQueueToken;

    eventReplayChain = eventReplayChain
      .catch(() => undefined)
      .then(async () => {
        if (queueToken !== replayQueueToken) {
          return;
        }
        pendingReplayBatchCount = Math.max(0, pendingReplayBatchCount - 1);
        logClient(
          "replay_batch_start",
          `events=${replayableEvents.length} preparedImmediately=${preparedImmediately} pending=${pendingReplayBatchCount} action=${summarizeActionVisualForLog()} flights=${summarizeFlightsForLog()}`
        );
        if (!preparedImmediately) {
          prepareReplayBatchState(replayableEvents, preUpdateSeats);
          eventPlaybackActive = true;
          redraw();
        }

        const runId = ++replayRunId;
        await runReplayBatch(replayableEvents, preUpdateSeats, runId);
      })
      .catch(() => {
        if (queueToken !== replayQueueToken) {
          return;
        }

        clearReplayPresentationState();
        pendingReplayBatchCount = 0;
        updateVictoryCelebrationState();
        updatePostVictoryCloseTimer();
        redraw();
      });
  };

  const replayLatestBatch = (): void => {
    if (latestReplayBatch.length === 0) {
      return;
    }

    replayQueueToken += 1;
    replayRunId += 1;
    pendingReplayBatchCount = 0;
    clearReplayPresentationState();
    updateVictoryCelebrationState();
    updatePostVictoryCloseTimer();
    redraw();
    eventReplayChain = Promise.resolve();
    queueReplayBatch(latestReplayBatch, latestReplayPreUpdateLocalizedSeatsBySeat);
  };

  const replayCombatPresentationEvents = (): void => {
    const unseenEvents = (match.game?.eventLog ?? []).filter((event) => !seenGameEventIds.has(event.id));
    if (unseenEvents.length === 0) {
      return;
    }

    unseenEvents.forEach((event) => seenGameEventIds.add(event.id));
    const replayableEvents = unseenEvents.filter((event) =>
      event.type === "action_start" ||
      event.type === "dealer_message" ||
      event.type === "seat_snapshot" ||
      event.type === "cards_discarded" ||
      event.type === "telekinesie_sequence" ||
      event.type === "telekinesie_project_card" ||
      event.type === "turn_start" ||
      event.type === "response_choice" ||
      event.type === "ordre_interrupt" ||
      event.type === "resistance_start" ||
      event.type === "resistance_result" ||
      event.type === "attack_impact" ||
      event.type === "hp_loss" ||
      event.type === "hp_gain" ||
      event.type === "dice_roll"
    );
    if (replayableEvents.length === 0) {
      return;
    }

    logClient(
      "replay_unseen",
      `unseen=${unseenEvents.length} replayable=${replayableEvents.length} playback=${eventPlaybackActive} pending=${pendingReplayBatchCount} summary=${summarizeReplayEventsForLog(replayableEvents)}`
    );
    queueReplayBatch(replayableEvents, preUpdateLocalizedSeatsBySeat);
  };

  const canStartInteractionForCard = (card: CardView): boolean => {
    if (match.status !== "in_progress" || match.game == null) {
      return false;
    }

    if (match.game.pendingCurseRelease != null) {
      return false;
    }

    const forcedFollowUp = match.game.forcedFollowUp;
    if (
      forcedFollowUp != null
      && (forcedFollowUp.consumeMode === true || forcedFollowUp.actorSeatNumber !== localSeatNumber)
    ) {
      return false;
    }

    return true;
  };

  const getCurseReleaseAnnulationCount = (card: CardView): number =>
    card.cardId === "lapidation" ? 1 : Math.max(1, card.defenseBand?.annulationCardsRequired ?? 1);

  const canOfferCurseRelease = (card: CardView): boolean => {
    const localSeat = getLocalSeat(match, localSeatNumber);
    const isLapidation = card.cardId === "lapidation";
    if (
      match.status !== "in_progress"
      || match.game == null
      || localSeat == null
      || card.zone !== "status"
      || match.game.currentTurnSeatNumber !== localSeatNumber
      || (!isLapidation && card.categoryCode !== "SO")
      || (!isLapidation && card.defenseBand?.annulationAllowed !== true)
    ) {
      return false;
    }

    const requiredCount = getCurseReleaseAnnulationCount(card);
    const availableAnnulations = localSeat.hand?.filter((handCard) => handCard.cardId === "annulation").length ?? 0;
    return requiredCount > 0 && availableAnnulations >= requiredCount;
  };

  const getHoveredHandCard = (point: StagePoint): HandCardLayout | null => {
    if (currentGeometry == null) {
      return null;
    }

    const candidates: Array<{ layout: HandCardLayout; score: number }> = [];
    for (const layout of currentGeometry.handLayouts) {
      const hitRect: RectGeometry = {
        x: layout.x - (layout.width * layout.scale) / 2,
        y: layout.y - (layout.height * layout.scale) / 2,
        width: layout.width * layout.scale,
        height: layout.height * layout.scale
      };
      if (pointInRect(point, hitRect)) {
        candidates.push({
          layout,
          // Prefer the card whose center is closest to the pointer.
          // This avoids overlap gaps in the hand fan where a neighboring
          // card's bounding box would otherwise steal hover.
          score: Math.hypot(point.x - layout.x, point.y - layout.y)
        });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => left.score - right.score);
    return candidates[0]?.layout ?? null;
  };

  const getInspectTargetAtPoint = (point: StagePoint): InspectTargetGeometry | null => {
    if (currentGeometry == null) {
      return null;
    }

    for (let index = currentGeometry.inspectTargets.length - 1; index >= 0; index -= 1) {
      const target = currentGeometry.inspectTargets[index]!;
      if (pointInRect(point, target)) {
        return target;
      }
    }

    return null;
  };

  const getHandInspectTarget = (cardInstanceId: string): InspectTargetGeometry | null => {
    const layout = currentGeometry?.handLayouts.find((candidate) => candidate.card.instanceId === cardInstanceId);
    if (layout == null) {
      return null;
    }

    return {
      card: layout.card,
      group: "hand",
      x: layout.x - (layout.width * layout.scale) / 2,
      y: layout.y - (layout.height * layout.scale) / 2,
      width: layout.width * layout.scale,
      height: layout.height * layout.scale
    };
  };

  const syncEventLogSeenState = (): void => {
    // Event log visibility now follows the unified game.eventLog stream.
    // New entries are revealed through replayCombatPresentationEvents.
  };

  const revealEventLogEntriesForEvent = (event: GameEvent): void => {
    switch (event.type) {
      case "action_start":
        seenEventMessageIds.add(`action:${event.id}`);
        return;
      case "response_choice":
        seenEventMessageIds.add(`response:${event.id}`);
        return;
      case "ordre_interrupt":
        seenEventMessageIds.add(`ordre:${event.id}`);
        return;
      case "resistance_start":
        seenEventMessageIds.add(`resistance-start:${event.id}`);
        return;
      case "resistance_result":
        seenEventMessageIds.add(`resistance:${event.id}`);
        return;
      case "attack_impact":
        seenEventMessageIds.add(`impact:${event.id}`);
        return;
      case "hp_loss":
        seenEventMessageIds.add(`damage:${event.id}`);
        return;
      case "hp_gain":
        seenEventMessageIds.add(`heal:${event.id}`);
        return;
      case "dealer_message":
        seenEventMessageIds.add(`dealer:${event.id}`);
        return;
      case "turn_start":
        return;
      default:
        return;
    }
  };

  const handleResizeEventLog = (e: MouseEvent): void => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = eventLogWidth;
    const startHeight = eventLogHeight;

    const onMouseMove = (moveEvent: MouseEvent): void => {
      // Bottom-right anchor: dragging left increases width, dragging up increases height
      const deltaX = startX - moveEvent.clientX;
      const deltaY = startY - moveEvent.clientY;
      eventLogWidth = Math.max(280, startWidth + deltaX);
      eventLogHeight = Math.max(200, startHeight + deltaY);
      redraw();
    };

    const onMouseUp = (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const renderInspectOverlay = (): void => {
    if (cardInspectState == null) {
      inspectLayerElement.className = "pixi-inspect-layer";
      inspectLayerElement.innerHTML = "";
      return;
    }

    const originRect = stageRectToViewport(cardInspectState.originRect);
    if (inspectLayerElement.childElementCount === 0) {
      inspectLayerElement.innerHTML = `
        <div class="pixi-inspect-backdrop" data-action="close-inspect"></div>
        <div class="pixi-inspect-card" data-action="close-inspect">
          <img alt="" />
        </div>
        <button class="pixi-inspect-nav pixi-inspect-nav--prev" type="button" data-action="inspect-prev" aria-label="Previous card">‹</button>
        <button class="pixi-inspect-nav pixi-inspect-nav--next" type="button" data-action="inspect-next" aria-label="Next card">›</button>
      `;

      inspectLayerElement.querySelectorAll<HTMLElement>("[data-action='close-inspect']").forEach((element) => {
        element.onclick = () => {
          closeCardInspect();
        };
      });
      inspectLayerElement.querySelectorAll<HTMLButtonElement>("[data-action='inspect-prev'], [data-action='inspect-next']").forEach((button) => {
        button.onclick = (event) => {
          event.stopPropagation();
          navigateHandInspect(button.dataset.action === "inspect-prev" ? -1 : 1);
        };
      });
      inspectLayerElement.ontouchstart = (event) => {
        inspectTouchStartX = cardInspectState?.originGroup === "hand"
          ? event.touches[0]?.clientX ?? null
          : null;
      };
      inspectLayerElement.ontouchend = (event) => {
        if (inspectTouchStartX == null || cardInspectState?.originGroup !== "hand") {
          inspectTouchStartX = null;
          return;
        }
        const endX = event.changedTouches[0]?.clientX;
        if (endX == null) {
          inspectTouchStartX = null;
          return;
        }
        const deltaX = endX - inspectTouchStartX;
        inspectTouchStartX = null;
        if (Math.abs(deltaX) < 48) {
          return;
        }
        navigateHandInspect(deltaX > 0 ? -1 : 1);
      };
    }

    const handCards = getLocalHand();
    const canNavigateHand = cardInspectState.originGroup === "hand" && handCards.length > 1;
    inspectLayerElement.className = `pixi-inspect-layer pixi-inspect-layer--visible${inspectLayerActive ? " pixi-inspect-layer--active" : ""}${canNavigateHand ? " pixi-inspect-layer--hand-nav" : ""}`;
    const cardElement = inspectLayerElement.querySelector<HTMLElement>(".pixi-inspect-card");
    const imageElement = inspectLayerElement.querySelector<HTMLImageElement>(".pixi-inspect-card img");
    const navButtons = inspectLayerElement.querySelectorAll<HTMLButtonElement>(".pixi-inspect-nav");
    if (cardElement != null) {
      cardElement.style.left = `${originRect.x}px`;
      cardElement.style.top = `${originRect.y}px`;
      cardElement.style.width = `${originRect.width}px`;
      cardElement.style.height = `${originRect.height}px`;
    }
    if (imageElement != null) {
      imageElement.src = getCardTextureUrl(cardInspectState.card, "full");
      imageElement.alt = cardInspectState.card.name;
    }
    navButtons.forEach((button) => {
      button.hidden = !canNavigateHand;
    });
  };

  const closeCardInspect = (): void => {
    if (inspectCloseTimer != null) {
      window.clearTimeout(inspectCloseTimer);
    }
    inspectLayerActive = false;
    renderInspectOverlay();
    inspectCloseTimer = window.setTimeout(() => {
      cardInspectState = null;
      inspectCloseTimer = null;
      renderInspectOverlay();
    }, 220);
  };

  const showCardInspect = (card: CardView, originRect: RectGeometry, originGroup: CardInspectState["originGroup"]): void => {
    if (inspectCloseTimer != null) {
      window.clearTimeout(inspectCloseTimer);
      inspectCloseTimer = null;
    }
    cardInspectState = {
      card,
      originRect,
      originGroup
    };
    inspectLayerActive = false;
    renderInspectOverlay();
    window.requestAnimationFrame(() => {
      inspectLayerActive = true;
      renderInspectOverlay();
    });
  };

  const navigateHandInspect = (direction: -1 | 1): void => {
    if (cardInspectState?.originGroup !== "hand") {
      return;
    }

    const handCards = getLocalHand();
    if (handCards.length < 2) {
      return;
    }

    const currentIndex = handCards.findIndex((card) => card.instanceId === cardInspectState?.card.instanceId);
    if (currentIndex === -1) {
      return;
    }

    const nextCard = handCards[(currentIndex + direction + handCards.length) % handCards.length];
    if (nextCard == null) {
      return;
    }

    const nextTarget = getHandInspectTarget(nextCard.instanceId);
    showCardInspect(
      nextCard,
      nextTarget ?? cardInspectState.originRect,
      "hand"
    );
  };

  const openCardInspect = (target: InspectTargetGeometry): void => {
    showCardInspect(target.card, {
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height
    }, target.group);
  };

  const openCardInspectFromElement = (card: CardView, element: HTMLElement): void => {
    const isSameCard =
      cardInspectState != null
      && cardInspectState.card.instanceId === card.instanceId
      && cardInspectState.originGroup === "modal";
    if (isSameCard && inspectLayerActive) {
      closeCardInspect();
      return;
    }

    currentMetrics = computeStageMetrics(hostElement);
    showCardInspect(card, viewportRectToStageRect(element.getBoundingClientRect()), "modal");
  };

  const beginHandCardInteraction = (layout: HandCardLayout, point: StagePoint): void => {
    setHoveredCardInstanceId(layout.card.instanceId);
    const arrowCanTargetObjects = layout.card.cardId !== "depouillement";

    if (cardNeedsArrow(layout.card, match.game?.viergeReplayCard)) {
      interactionState.arrowDrag = {
        source: "hand",
        cardInstanceId: layout.card.instanceId,
        originX: STAGE_WIDTH / 2,
        originY: STAGE_HEIGHT + 44,
        pointerX: point.x,
        pointerY: point.y,
        nearestSeatNumber: resolveArrowNearestSeatNumber(point, layout.card),
        nearestObjectInstanceId: arrowCanTargetObjects ? resolveArrowNearestObjectInstanceId(point) : null
      };
      interactionState.draggingCardInstanceId = "";
      interactionState.dragHoverTarget = null;
    } else {
      interactionState.draggingCardInstanceId = layout.card.instanceId;
      interactionState.dragPointerX = point.x;
      interactionState.dragPointerY = point.y;
      interactionState.dragHoverTarget = resolveDragHoverTarget(point, layout.card);
      interactionState.arrowDrag = null;
    }
  };

  const beginObjectCardInteraction = (target: InspectTargetGeometry, point: StagePoint): void => {
    closeCardInspect();
    interactionState.arrowDrag = {
      source: "object",
      cardInstanceId: target.card.instanceId,
      originX: target.x + target.width / 2,
      originY: target.y + target.height / 2,
      pointerX: point.x,
      pointerY: point.y,
      nearestSeatNumber: resolveArrowNearestSeatNumber(point, target.card),
      nearestObjectInstanceId: null
    };
    interactionState.draggingCardInstanceId = "";
    interactionState.dragHoverTarget = null;
  };

  const resolveDragHoverTarget = (point: StagePoint, card: CardView): PixiDragHoverTarget | null => {
    if (currentGeometry == null) {
      return null;
    }

    for (const objectTarget of currentGeometry.objectTargets) {
      if (pointInRect(point, objectTarget)) {
        return {
          kind: "object",
          seatNumber: objectTarget.seatNumber,
          objectInstanceId: objectTarget.objectInstanceId
        };
      }
    }

    const effectiveTargets = getEffectiveInteractionTargets(card, match.game?.viergeReplayCard);
    if (effectiveTargets === "target_object" || effectiveTargets === "single_player_or_object") {
      let nearestObjectTarget: ObjectTargetGeometry | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const objectTarget of currentGeometry.objectTargets) {
        const distance = Math.hypot(point.x - objectTarget.centerX, point.y - objectTarget.centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestObjectTarget = objectTarget;
        }
      }

      if (nearestObjectTarget != null && nearestDistance <= OBJECT_DRAG_SNAP_DISTANCE) {
        return {
          kind: "object",
          seatNumber: nearestObjectTarget.seatNumber,
          objectInstanceId: nearestObjectTarget.objectInstanceId
        };
      }
    }

    for (const seatTarget of currentGeometry.seatTargets) {
      if (pointInRect(point, seatTarget)) {
        return { kind: "seat", seatNumber: seatTarget.seatNumber };
      }
    }

    if (canAttemptResponseSlotDrop() && currentGeometry.responseSlot != null && pointInRect(point, currentGeometry.responseSlot)) {
      return { kind: "response-slot" };
    }

    if (cardIsLiftPlayable(card, match.game?.viergeReplayCard) && pointInRect(point, currentGeometry.playSlot)) {
      return { kind: "play-slot" };
    }

    if (canDiscardCard(match, localSeatNumber) && pointInRect(point, currentGeometry.discardZone)) {
      return { kind: "discard" };
    }

    return null;
  };

  const resolveArrowNearestSeatNumber = (point: StagePoint, card?: CardView): number | null => {
    if (currentGeometry == null) {
      return null;
    }

    const lapidationTargetSeatNumbers = getLapidationTargetSeatNumbers(match, localSeatNumber, card);
    if (lapidationTargetSeatNumbers?.length === 1) {
      return lapidationTargetSeatNumbers[0] ?? null;
    }

    let nearestSeatNumber: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const seatTarget of currentGeometry.seatTargets) {
      const distance = Math.hypot(point.x - seatTarget.centerX, point.y - seatTarget.centerY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSeatNumber = seatTarget.seatNumber;
      }
    }

    return nearestDistance <= 130 ? nearestSeatNumber : null;
  };

  const resolveArrowNearestObjectInstanceId = (point: StagePoint): string | null => {
    if (currentGeometry == null) {
      return null;
    }

    let nearestObjectInstanceId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const objectTarget of currentGeometry.objectTargets) {
      const distance = Math.hypot(point.x - objectTarget.centerX, point.y - objectTarget.centerY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestObjectInstanceId = objectTarget.objectInstanceId;
      }
    }

    return nearestDistance <= OBJECT_DRAG_SNAP_DISTANCE ? nearestObjectInstanceId : null;
  };

  const applyImmediateMatchUpdate = (nextMatch: MatchState): void => {
    const unseenCount = (nextMatch.game?.eventLog ?? []).filter((event) => !seenGameEventIds.has(event.id)).length;
    const ordreInterrupt = nextMatch.game?.pendingOrdreInterrupt;
    logClient(
      "match_update",
      `source=immediate unseen=${unseenCount} playback=${eventPlaybackActive} pending=${pendingReplayBatchCount} currentTurn=${nextMatch.game?.currentTurnSeatNumber ?? "n/a"} localSeat=${localSeatNumber} hasLocal=${getLocalSeat(nextMatch, localSeatNumber) != null} ordre=${ordreInterrupt == null ? "none" : `hidden=${ordreInterrupt.hidden} card=${ordreInterrupt.cardName ?? "n/a"}`}`
    );
    preUpdateLocalizedSeatsBySeat = Object.fromEntries(
      localizeMatchState(match, language).seats.map((seat) => [seat.seatNumber, seat])
    );
    rememberPendingActionSnapshot(nextMatch);
    match = nextMatch;
    syncLocalSeatNumberFromMatch(nextMatch);
    if (
      devCardPickerSeatNumber !== 0
      && (
        getLocalSeat(nextMatch, localSeatNumber) == null
        || !nextMatch.seats.some((seat) => seat.seatNumber === devCardPickerSeatNumber)
      )
    ) {
      devCardPickerSeatNumber = 0;
    }
    if (
      confirmingCurseReleaseStatusInstanceId !== ""
      && !getLocalSeat(nextMatch, localSeatNumber)?.statuses?.some((status) => status.instanceId === confirmingCurseReleaseStatusInstanceId)
    ) {
      confirmingCurseReleaseStatusInstanceId = "";
    }
    updateVictoryCelebrationState();
    updatePostVictoryCloseTimer();
    replayCombatPresentationEvents();
  };

  const performCardPlay = async (request: Parameters<typeof playCard>[2]): Promise<void> => {
    try {
      rememberPendingActionSnapshot(match);
      const nextMatch = await playCard(session.instanceId, playerSessionToken, request);
      applyImmediateMatchUpdate(nextMatch);
      errorMessage = "";
      confirmingDiscardCardInstanceId = "";
      syncConsumePreview();
    } catch (error) {
      errorMessage = error instanceof Error
        ? (localizeCardDisabledReason(error.message, language) ?? error.message)
        : t(language, "error.playCard");
    } finally {
      clearInteractionState();
      redraw();
    }
  };

  const performObjectFire = async (request: Parameters<typeof fireObject>[2]): Promise<void> => {
    try {
      rememberPendingActionSnapshot(match);
      const nextMatch = await fireObject(session.instanceId, playerSessionToken, request);
      applyImmediateMatchUpdate(nextMatch);
      errorMessage = "";
      syncConsumePreview();
    } catch (error) {
      errorMessage = error instanceof Error
        ? (localizeCardDisabledReason(error.message, language) ?? error.message)
        : t(language, "error.playCard");
    } finally {
      clearInteractionState();
      redraw();
    }
  };

  const performPendingResponse = async (
    request: Parameters<typeof respondToPendingAction>[2]
  ): Promise<void> => {
    try {
      rememberPendingActionSnapshot(match);
      const nextMatch = await respondToPendingAction(session.instanceId, playerSessionToken, request);
      applyImmediateMatchUpdate(nextMatch);
      errorMessage = "";
      pendingAnnulationChoice = null;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : t(language, "error.playCard");
    } finally {
      clearInteractionState();
      redraw();
    }
  };

  const redraw = (): void => {
    if (destroyed) {
      return;
    }

    syncLocalSeatNumberFromMatch(match);

    currentMetrics = computeStageMetrics(hostElement);
    const nextRendererWidth = Math.max(1, hostElement.clientWidth);
    const nextRendererHeight = Math.max(1, hostElement.clientHeight);
    if (nextRendererWidth !== rendererWidth || nextRendererHeight !== rendererHeight) {
      rendererWidth = nextRendererWidth;
      rendererHeight = nextRendererHeight;
      app.renderer.resize(nextRendererWidth, nextRendererHeight);
    }
    scene.position.set(currentMetrics.left, currentMetrics.top);
    scene.scale.set(currentMetrics.scale);
    currentFrameTextureUsage = new Set<string>();
    frameElement.style.left = `${currentMetrics.left}px`;
    frameElement.style.top = `${currentMetrics.top}px`;
    frameElement.style.width = `${STAGE_WIDTH}px`;
    frameElement.style.height = `${STAGE_HEIGHT}px`;
    frameElement.style.transform = `scale(${currentMetrics.scale})`;
    frameElement.style.transformOrigin = "top left";
    warningElement.classList.toggle("pixi-landscape-warning--visible", !currentMetrics.isLandscape);
    const combatVisualsActive = pruneExpiredCombatVisuals();
    const localizedMatch = localizeMatchState(match, language);
    const localizedLocalSeat = getLocalSeat(localizedMatch, localSeatNumber);
    const spectatorMode = localizedMatch.status === "in_progress" && localizedLocalSeat == null;
    if (localizedLocalSeat?.isHost !== true) {
      seatFxEditorOpen = false;
      devSeatVisualEffectsBySeat = {};
    } else {
      pruneSeatVisualEffects();
    }
    if (spectatorMode) {
      bugReportOpen = false;
      confirmingDiscardCardInstanceId = "";
    }
    const displayMatch = Object.keys(displayedSeatsBySeat).length > 0
      ? {
          ...localizedMatch,
          seats: localizedMatch.seats.map((seat) => {
            const snapshot = displayedSeatsBySeat[seat.seatNumber];
            if (snapshot == null) return seat;
            return {
              ...seat,
              hand: snapshot.hand,
              objects: snapshot.objects,
              statuses: snapshot.statuses,
              powerLevel: snapshot.powerLevel,
              isAlive: snapshot.isAlive,
              hp: displayedHpBySeat[seat.seatNumber] ?? snapshot.hp ?? seat.hp
            };
          })
        }
      : localizedMatch;
    const sleepOverlayActive = displayMatch.seats.some((seat) => seatHasSleepStatus(seat));
    const displayLayoutSeatNumber = getLayoutSeatNumber(displayMatch);
    const handDealAnimationsActive = syncLocalHandDealAnimations(displayMatch);
    const handFocusBlend = getHandFocusBlendState();
    cleanupScene();
    const presentationLockActive = eventPlaybackActive || hasUnseenReplayableEvents();
    const displayedTurnSeatNumber = resolveDisplayedTurnSeatNumber(presentationLockActive);
    syncSeatResponseThumbnailTurn(displayedTurnSeatNumber);
    syncTurnPastilleTarget(displayedTurnSeatNumber);
    const turnPastilleAnimating = advanceTurnPastilleAnimation();
    if (leftMessage !== "") {
      resetTurnPastilleState(null);
      pendingAnnulationChoice = null;
      activeCombatFx = null;
      activeDamageBursts = {};
      activeHealBursts = {};
      activeImpactFlashes = {};
      activeTurnStartSeatNumber = null;
      seatResponseThumbnailsBySeat = {};
      seatResponseThumbnailTurnSeatNumber = null;
      seatResistancePills = {};
      activeCardFlights = [];
      activePlaybackArrows = [];
      eventPlaybackActive = false;
      activeActionVisual = null;
      centerResponseCards = [];
      confirmingLeave = false;
      confirmingDiscardCardInstanceId = "";
      selectedKickSeatNumber = 0;
      confirmingKickSeatNumber = 0;
      opponentCursors = {};
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = null;
      cardInspectState = null;
      inspectLayerActive = false;
      scene.addChild(createRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT, "#08110b"));
      scene.addChild(createRect(360, 270, 880, 260, "#101912", 0.96, 30));
      scene.addChild(createLabel(t(language, "left.title"), 800, 340, {
        fontSize: 42,
        fontWeight: "700"
      }, 0.5, 0.5));
      scene.addChild(createLabel(leftMessage, 800, 414, {
        fontSize: 22,
        fill: "#cad2c9",
        wordWrap: true,
        wordWrapWidth: 760,
        lineHeight: 30
      }, 0.5, 0.5));
      currentGeometry = null;
    } else if (localizedMatch.status === "lobby") {
      resetTurnPastilleState(null);
      pendingAnnulationChoice = null;
      activeCombatFx = null;
      activeDamageBursts = {};
      activeHealBursts = {};
      activeImpactFlashes = {};
      activeTurnStartSeatNumber = null;
      seatResponseThumbnailsBySeat = {};
      seatResponseThumbnailTurnSeatNumber = null;
      seatResistancePills = {};
      activeCardFlights = [];
      activePlaybackArrows = [];
      eventPlaybackActive = false;
      activeActionVisual = null;
      centerResponseCards = [];
      confirmingLeave = false;
      confirmingDiscardCardInstanceId = "";
      selectedKickSeatNumber = 0;
      confirmingKickSeatNumber = 0;
      opponentCursors = {};
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = null;
      cardInspectState = null;
      inspectLayerActive = false;
      renderLobbyScene(
        scene,
        localizedMatch,
        localSeatNumber,
        language,
        session.mode,
        session.channelId,
        session.guildId,
        scheduleRedraw
      );
      currentGeometry = null;
    } else {
      // Compute baton load hover scale (smooth scale-up animation)
      const draggedCard = getDraggedCard();
      const isHoveringAmOverBaton = (
        interactionState.draggingCardInstanceId !== ""
        && interactionState.dragHoverTarget?.kind === "object"
        && draggedCard != null
        && (() => {
          const hoveredId = interactionState.dragHoverTarget!.objectInstanceId!;
          const localSeat = getLocalSeat(displayMatch, localSeatNumber);
          const batonCard = localSeat?.objects?.find((c) => c.instanceId === hoveredId);
          return localSeat != null && batonCard != null && canLoadMassAttackStaff(draggedCard, batonCard, localSeat.seatNumber, localSeatNumber);
        })()
      );
      if (isHoveringAmOverBaton) {
        if (batonLoadHoverTs == null) {
          batonLoadHoverTs = Date.now();
        }
      } else {
        batonLoadHoverTs = null;
      }
      const batonLoadProgress = batonLoadHoverTs == null ? 0 : Math.min(1, (Date.now() - batonLoadHoverTs) / 220);
      const batonEased = batonLoadProgress < 1 ? 1 - Math.pow(1 - batonLoadProgress, 3) : 1;
      const batonLoadScale = 1 + 0.45 * batonEased;
      const replayNow = getReplayNow();

      currentGeometry = renderTableScene(
        scene,
        displayMatch,
        localSeatNumber,
        displayLayoutSeatNumber,
        language,
        presentationLockActive,
        displayedTurnSeatNumber,
        turnPastilleState,
        presentationLockActive ? activeActionVisual : null,
        centerResponseCards,
        interactionState,
        handFocusBlend.fromCardInstanceId,
        handFocusBlend.toCardInstanceId,
        handFocusBlend.progress,
        activeDamageBursts,
        activeHealBursts,
        activeImpactFlashes,
        activeTelekinesieReveal,
        seatResponseThumbnailsBySeat,
        seatResistancePills,
        devSeatVisualEffectsBySeat,
        activeCardFlights,
        activePlaybackArrows,
        opponentCursors,
        scheduleRedraw,
        displayedHpBySeat,
        targetHintDismissed,
        batonLoadScale,
        replayNow,
        localHandDealAnimatingUntil,
        displayMatch.game?.viergeReplayCard ?? null
      );
    }

    const passButtonLeftPx = currentGeometry?.responseSlot == null
      ? 0
      : currentGeometry.responseSlot.x + currentGeometry.responseSlot.width / 2;
    const passButtonTopPx = currentGeometry?.responseSlot == null
      ? 0
      : currentGeometry.responseSlot.y + currentGeometry.responseSlot.height + 14;
    const combatBannerLeftPx = currentGeometry == null
      ? STAGE_WIDTH / 2
      : currentGeometry.playSlot.x + currentGeometry.playSlot.width / 2;
    const combatBannerTopPx = currentGeometry == null
      ? 88
      : Math.max(18, currentGeometry.playSlot.y - 52);
    const playbackLockTopPx = currentGeometry == null
      ? 56
      : Math.max(18, currentGeometry.playSlot.y - 34);
    const kickTarget = getKickTarget();
    const kickActionTarget = getSeatKickActionTarget();
    const lobbyLayout: LobbyOverlayLayout | null = localizedMatch.status === "lobby" ? (() => {
      const smX = LOBBY_START_X + (LOBBY_CARD_W + LOBBY_CARD_GAP);
      const addBotButtons = Array.from({ length: localizedMatch.maxSeats }, (_, i) => i + 2)
        .filter((seatNumber) => localizedMatch.seats.find((seat) => seat.seatNumber === seatNumber) == null)
        .map((seatNumber) => {
          const i = seatNumber - 2;
          const col = i % LOBBY_COLUMNS;
          const row = 1 + Math.floor(i / LOBBY_COLUMNS);
          return {
            leftPx: LOBBY_START_X + col * (LOBBY_CARD_W + LOBBY_CARD_GAP),
            topPx: LOBBY_START_Y + row * (LOBBY_CARD_H + LOBBY_CARD_GAP),
            widthPx: LOBBY_CARD_W,
            heightPx: LOBBY_CARD_H
          };
        });
      const botKickButtons = localizedMatch.seats
        .filter((seat) => seat.controllerType === "bot" && seat.seatNumber !== 1)
        .map((seat) => {
          const i = seat.seatNumber - 2;
          const col = i % LOBBY_COLUMNS;
          const row = 1 + Math.floor(i / LOBBY_COLUMNS);
          return {
            seatNumber: seat.seatNumber,
            leftPx: LOBBY_START_X + col * (LOBBY_CARD_W + LOBBY_CARD_GAP) + LOBBY_CARD_W - 118,
            topPx: LOBBY_START_Y + row * (LOBBY_CARD_H + LOBBY_CARD_GAP) + 12,
            widthPx: 104,
            heightPx: 32
          };
        });
      const expansionButtons = EXPANSION_DECKS.map((deck, index) => {
        const rowY = LOBBY_EXP_Y + LOBBY_EXP_HEADER_H + index * (LOBBY_EXP_ROW_H + LOBBY_EXP_ROW_GAP);
        return {
          key: deck.key,
          leftPx: LOBBY_EXP_X,
          topPx: rowY,
          widthPx: LOBBY_EXP_W,
          heightPx: LOBBY_EXP_ROW_H,
          available: deck.available,
          enabled: localizedMatch.enabledExpansions[deck.key] ?? false
        };
      });
      return {
        startMatchLeftPx: smX,
        startMatchTopPx: LOBBY_START_Y,
        startMatchWidthPx: 2 * LOBBY_CARD_W + LOBBY_CARD_GAP,
        startMatchHeightPx: LOBBY_CARD_H,
        addBotButtons,
        botKickButtons,
        expansionButtons
      };
    })() : null;
    const prevEventLogEl = frameElement.querySelector<HTMLElement>("[data-event-log-history='true']");
    const savedEventLogScroll = prevEventLogEl != null
      ? { top: prevEventLogEl.scrollTop, atBottom: prevEventLogEl.scrollTop + prevEventLogEl.clientHeight >= prevEventLogEl.scrollHeight - 4 }
      : null;
    const prevModalScrollEl = frameElement.querySelector<HTMLElement>("[data-modal-list-scroll='true']");
    const savedModalScrollTop = prevModalScrollEl?.scrollTop ?? null;
    const prevBugReportTextarea = frameElement.querySelector<HTMLTextAreaElement>("[data-action='edit-bug-report-description']");
    const savedBugReportSelection = prevBugReportTextarea != null && document.activeElement === prevBugReportTextarea
      ? {
          start: prevBugReportTextarea.selectionStart ?? prevBugReportTextarea.value.length,
          end: prevBugReportTextarea.selectionEnd ?? prevBugReportTextarea.value.length
        }
      : null;
    const ordreInterruptArrow: OrdreInterruptArrowLayout | null = (() => {
      const pendingInterrupt = localizedMatch.game?.pendingOrdreInterrupt;
      const actorSeatNumber = pendingInterrupt?.hidden === false ? pendingInterrupt.actorSeatNumber : undefined;
      if (pendingInterrupt?.hidden !== false || currentGeometry == null) {
        return null;
      }
      const geometry = currentGeometry;
      const actorRect = actorSeatNumber == null ? undefined : geometry.seatRects.get(actorSeatNumber);
      const actorCenter = actorSeatNumber == null ? undefined : geometry.seatCenters.get(actorSeatNumber);

      const panelRect = {
        x: STAGE_WIDTH / 2 - 280,
        y: STAGE_HEIGHT / 2 - 134,
        width: 560,
        height: 268
      };
      const panelCenter = getRectCenter(panelRect);
      const panelEdgePointToward = (point: StagePoint): StagePoint => {
        const dx = point.x - panelCenter.x;
        const dy = point.y - panelCenter.y;
        const sourceIsMoreHorizontal = Math.abs(dx) / panelRect.width > Math.abs(dy) / panelRect.height;
        return sourceIsMoreHorizontal
          ? {
              x: dx >= 0 ? panelRect.x + panelRect.width + 10 : panelRect.x - 10,
              y: Math.max(panelRect.y + 28, Math.min(panelRect.y + panelRect.height - 28, point.y))
            }
          : {
              x: Math.max(panelRect.x + 28, Math.min(panelRect.x + panelRect.width - 28, point.x)),
              y: dy >= 0 ? panelRect.y + panelRect.height + 10 : panelRect.y - 10
            };
      };
      const actorPanelTarget = actorCenter == null ? null : panelEdgePointToward(actorCenter);
      const targetArrows = [...new Set(pendingInterrupt.targetSeatNumbers ?? [])]
        .filter((targetSeatNumber) => targetSeatNumber !== actorSeatNumber)
        .map((targetSeatNumber): OrdreInterruptArrowPath | null => {
          const targetRect = geometry.seatRects.get(targetSeatNumber);
          const targetCenter = geometry.seatCenters.get(targetSeatNumber);
          if (targetRect == null || targetCenter == null) {
            return null;
          }
          const panelStart = panelEdgePointToward(targetCenter);
          return {
            from: panelStart,
            to: rectEdgePoint(panelStart.x, panelStart.y, targetRect)
          };
        })
        .filter((arrow): arrow is OrdreInterruptArrowPath => arrow != null);
      return {
        actor: actorRect == null || actorPanelTarget == null
          ? null
          : {
              from: rectEdgePoint(actorPanelTarget.x, actorPanelTarget.y, actorRect),
              to: actorPanelTarget
            },
        targets: targetArrows
      };
    })();

    const nextOverlayMarkup =
      leftMessage !== ""
        ? `
          <div class="pixi-frame-center-card">
            <h1>${t(language, "left.title")}</h1>
            <p>${leftMessage}</p>
          </div>
        `
        : buildOverlayMarkup(localizedMatch, localSeatNumber, language, errorMessage, confirmingLeave, confirmingDiscardCardInstanceId, confirmingCurseReleaseStatusInstanceId, kickTarget, kickActionTarget, seatFxEditorOpen, devSeatVisualEffectsBySeat, pendingAnnulationChoice, presentationLockActive ? null : (localizedMatch.game?.pendingObjectChoice ?? null), localizedMatch.game?.pendingHandInspection ?? null, localizedMatch.game?.pendingPublicHandReveal ?? null, telepathyPreviewCardInstanceId, localizedMatch.game?.pendingBoardResetKeep ?? null, boardResetKeepPreviewCardInstanceId, presentationLockActive ? null : (localizedMatch.game?.pendingDeathSearch ?? null), deathSearchPreviewCardInstanceId, deathSearchSelectedCardInstanceIds, localizedMatch.game?.pendingPickpocket ?? null, pickpocketPreviewCardInstanceId, pickpocketSelectedCardInstanceIds, localizedMatch.game?.pendingSacrificeChoice ?? null, localizedMatch.game?.pendingSorcellerieSacrificeChoice ?? null, presentationLockActive ? null : (localizedMatch.game?.pendingOrdreInterrupt ?? null), localizedMatch.game?.pendingCurseRelease, sacrificeAmountInput, localizedMatch.game?.forcedFollowUp, consumePreviewCardInstanceId, seenEventMessageIds, eventLogExpanded, eventLogWidth, eventLogHeight, { speedMultiplier: replaySpeedMultiplier, paused: replayPaused, canRewind: latestReplayBatch.length > 0 }, cardReferenceOpen, cardReferencePreviewCardId, cardReferenceSearchQuery, cardReferenceShowBase, cardReferenceShowSorcellerie, cardReferenceShowAbondance, cardReferenceShowPuissance, cardReferenceShowCommunion, changelogOpen, publicChangelog, publicVersionInfo, bugReportOpen, bugReportDraft, bugReportSubmitting, bugReportErrorMessage, activeCombatFx, presentationLockActive, victoryCelebrationVisible, session.enableDevTools, canUseDevCardPicker, devCardPickerSeatNumber, session.mode, session.channelId, session.guildId, combatBannerLeftPx, combatBannerTopPx, playbackLockTopPx, passButtonLeftPx, passButtonTopPx, lobbyLayout, ordreInterruptArrow);

    if (nextOverlayMarkup !== lastOverlayMarkup) {
      frameElement.innerHTML = nextOverlayMarkup;
      lastOverlayMarkup = nextOverlayMarkup;
      bindOverlayEvents();
      if (localizedMatch.game?.pendingOrdreInterrupt?.hidden === false) {
        logClient(
          "ordre_render",
          `card=${localizedMatch.game.pendingOrdreInterrupt.cardName ?? "n/a"} panel=${frameElement.querySelectorAll("[data-ordre-interrupt-panel='true']").length} cancelButtons=${frameElement.querySelectorAll("[data-action='ordre-interrupt-cancel']").length} passButtons=${frameElement.querySelectorAll("[data-action='ordre-interrupt-pass']").length}`
        );
      }

      const newEventLogEl = frameElement.querySelector<HTMLElement>("[data-event-log-history='true']");
      if (newEventLogEl != null && savedEventLogScroll != null) {
        newEventLogEl.scrollTop = savedEventLogScroll.atBottom
          ? newEventLogEl.scrollHeight
          : savedEventLogScroll.top;
      }

      const newModalScrollEl = frameElement.querySelector<HTMLElement>("[data-modal-list-scroll='true']");
      if (newModalScrollEl != null && savedModalScrollTop != null) {
        newModalScrollEl.scrollTop = savedModalScrollTop;
      }

      const newBugReportTextarea = frameElement.querySelector<HTMLTextAreaElement>("[data-action='edit-bug-report-description']");
      if (newBugReportTextarea != null && savedBugReportSelection != null) {
        newBugReportTextarea.focus();
        newBugReportTextarea.setSelectionRange(savedBugReportSelection.start, savedBugReportSelection.end);
      }
    }
    syncPublicHandRevealRefreshTimer();
    renderInspectOverlay();
    pruneLoadedTextures();

    if (
      handFocusTransition != null
      || handDealAnimationsActive
      || combatVisualsActive
      || turnPastilleAnimating
      || sleepOverlayActive
      || getLocalSeat(match, localSeatNumber)?.hand?.some((card) => shouldHighlightOrdreDemmerlausResponse(match, localSeatNumber, card)) === true
      || (batonLoadHoverTs != null && (Date.now() - batonLoadHoverTs) < 220)
    ) {
      scheduleRedraw();
    }
  };

  const requestSync = async (): Promise<void> => {
    if (leftMessage !== "") {
      return;
    }

    if (hasActiveLocalInteraction()) {
      syncQueued = true;
      return;
    }

    if (syncInFlight) {
      syncQueued = true;
      return;
    }

    syncInFlight = true;
    try {
      rememberPendingActionSnapshot(match);
      const nextMatch = await fetchMatch(session.instanceId, playerSessionToken);
      rememberPendingActionSnapshot(nextMatch);
      const unseenCount = (nextMatch.game?.eventLog ?? []).filter((event) => !seenGameEventIds.has(event.id)).length;
      const ordreInterrupt = nextMatch.game?.pendingOrdreInterrupt;
      logClient(
        "match_update",
        `source=sync unseen=${unseenCount} playback=${eventPlaybackActive} pending=${pendingReplayBatchCount} currentTurn=${nextMatch.game?.currentTurnSeatNumber ?? "n/a"} localSeat=${localSeatNumber} hasLocal=${getLocalSeat(nextMatch, localSeatNumber) != null} ordre=${ordreInterrupt == null ? "none" : `hidden=${ordreInterrupt.hidden} card=${ordreInterrupt.cardName ?? "n/a"}`}`
      );
      preUpdateLocalizedSeatsBySeat = Object.fromEntries(
        localizeMatchState(match, language).seats.map((s) => [s.seatNumber, s])
      );
      match = nextMatch;
      syncLocalSeatNumberFromMatch(nextMatch);
      errorMessage = "";
      syncEventLogSeenState();
      syncPendingAnnulationChoice();
      syncTelepathyPreview();
      syncBoardResetKeepPreview();
      syncConsumePreview();
      syncDeathSearchState();
      syncPickpocketState();
      if (match.game?.pendingSacrificeChoice == null) {
        sacrificeAmountInput = "";
      }
      updateVictoryCelebrationState();
      updatePostVictoryCloseTimer();
      replayCombatPresentationEvents();
      const localHandIds = new Set(getLocalHand().map((card) => card.instanceId));
      if (
        interactionState.hoveredCardInstanceId !== ""
        && !localHandIds.has(interactionState.hoveredCardInstanceId)
      ) {
        setHoveredCardInstanceId("");
      }
      if (!match.seats.some((seat) => seat.seatNumber === confirmingKickSeatNumber)) {
        confirmingKickSeatNumber = 0;
      }
      if (!match.seats.some((seat) => seat.seatNumber === selectedKickSeatNumber && seat.controllerType === "human")) {
        selectedKickSeatNumber = 0;
      }
      pruneSeatVisualEffects();
      if (getLocalSeat(match, localSeatNumber)?.isHost !== true) {
        seatFxEditorOpen = false;
        devSeatVisualEffectsBySeat = {};
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unable to refresh";
    } finally {
      syncInFlight = false;
      if (hasActiveLocalInteraction()) {
        syncQueued = true;
      } else {
        redraw();
        if (syncQueued && !hasBlockingModalOpen()) {
          syncQueued = false;
          void requestSync();
        }
      }
    }
  };

  const bindDraggableModalCards = (): void => {
    const resolveModalDragKey = (card: HTMLElement, index: number): string => {
      const title = card.querySelector("h2")?.textContent?.trim() ?? "";
      const eyebrow = card.querySelector(".eyebrow")?.textContent?.trim() ?? "";
      const classKey = Array.from(card.classList).sort().join(".");
      return `${classKey}|${eyebrow}|${title}|${index}`;
    };

    const clampModalOffset = (
      card: HTMLElement,
      offsetX: number,
      offsetY: number
    ): { x: number; y: number } => {
      const boundsElement = card.closest<HTMLElement>(".pixi-modal-backdrop, .modal-backdrop, .object-choice-overlay, .telepathy-overlay")
        ?? frameElement;
      const boundsRect = boundsElement.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const currentOffsetX = Number(card.dataset.dragOffsetX ?? "0") || 0;
      const currentOffsetY = Number(card.dataset.dragOffsetY ?? "0") || 0;
      const baseLeft = cardRect.left - currentOffsetX;
      const baseTop = cardRect.top - currentOffsetY;
      const margin = 8;
      const minX = boundsRect.left + margin - baseLeft;
      const maxX = boundsRect.right - margin - cardRect.width - baseLeft;
      const minY = boundsRect.top + margin - baseTop;
      const maxY = boundsRect.bottom - margin - cardRect.height - baseTop;
      const clampAxis = (value: number, min: number, max: number): number => {
        if (min > max) {
          return (min + max) / 2;
        }
        return Math.min(Math.max(value, min), max);
      };
      return {
        x: clampAxis(offsetX, minX, maxX),
        y: clampAxis(offsetY, minY, maxY)
      };
    };

    const applyModalOffset = (card: HTMLElement, offsetX: number, offsetY: number): void => {
      card.dataset.dragOffsetX = String(offsetX);
      card.dataset.dragOffsetY = String(offsetY);
      card.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
    };

    frameElement.querySelectorAll<HTMLElement>("[data-pixi-modal-card='true']").forEach((card, index) => {
      const dragKey = resolveModalDragKey(card, index);
      card.dataset.pixiModalDragKey = dragKey;
      const savedOffset = modalDragOffsets.get(dragKey);
      if (savedOffset != null) {
        const nextOffset = clampModalOffset(card, savedOffset.x, savedOffset.y);
        modalDragOffsets.set(dragKey, nextOffset);
        applyModalOffset(card, nextOffset.x, nextOffset.y);
      }

      if (card.dataset.pixiModalDragBound === "true") {
        return;
      }
      card.dataset.pixiModalDragBound = "true";

      card.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        const target = event.target as HTMLElement | null;
        if (
          target?.closest([
            "button",
            "input",
            "select",
            "textarea",
            "a",
            "[role='button']",
            "[contenteditable='true']",
            "[data-modal-list-scroll='true']",
            ".telepathy-list",
            ".object-choice-grid",
            ".pixi-seat-fx__body"
          ].join(", ")) != null
        ) {
          return;
        }

        const boundsElement = card.closest<HTMLElement>(".pixi-modal-backdrop, .modal-backdrop, .object-choice-overlay, .telepathy-overlay")
          ?? frameElement;
        const boundsRect = boundsElement.getBoundingClientRect();
        const startRect = card.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const initialOffsetX = Number(card.dataset.dragOffsetX ?? "0") || 0;
        const initialOffsetY = Number(card.dataset.dragOffsetY ?? "0") || 0;
        const baseLeft = startRect.left - initialOffsetX;
        const baseTop = startRect.top - initialOffsetY;
        const margin = 8;
        let moved = false;
        let stopped = false;

        const clampOffset = (nextOffsetX: number, nextOffsetY: number): { x: number; y: number } => {
          const minX = boundsRect.left + margin - baseLeft;
          const maxX = boundsRect.right - margin - startRect.width - baseLeft;
          const minY = boundsRect.top + margin - baseTop;
          const maxY = boundsRect.bottom - margin - startRect.height - baseTop;
          const clampAxis = (value: number, min: number, max: number): number => {
            if (min > max) {
              return (min + max) / 2;
            }
            return Math.min(Math.max(value, min), max);
          };
          return {
            x: clampAxis(nextOffsetX, minX, maxX),
            y: clampAxis(nextOffsetY, minY, maxY)
          };
        };

        const applyOffset = (offsetX: number, offsetY: number): void => {
          applyModalOffset(card, offsetX, offsetY);
          const activeDragKey = card.dataset.pixiModalDragKey;
          if (activeDragKey != null && activeDragKey !== "") {
            modalDragOffsets.set(activeDragKey, { x: offsetX, y: offsetY });
          }
        };

        const handlePointerMove = (moveEvent: PointerEvent): void => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (!moved && Math.hypot(dx, dy) < 4) {
            return;
          }
          moved = true;
          moveEvent.preventDefault();
          const next = clampOffset(initialOffsetX + dx, initialOffsetY + dy);
          applyOffset(next.x, next.y);
        };

        const stopDragging = (): void => {
          if (stopped) {
            return;
          }
          stopped = true;
          modalDragActive = false;
          card.classList.remove("pixi-modal-dragging");
          if (card.hasPointerCapture?.(event.pointerId) === true) {
            card.releasePointerCapture(event.pointerId);
          }
          card.removeEventListener("pointermove", handlePointerMove);
          card.removeEventListener("pointerup", stopDragging);
          card.removeEventListener("pointercancel", stopDragging);
          card.removeEventListener("lostpointercapture", stopDragging);
          if (modalDragRedrawQueued) {
            modalDragRedrawQueued = false;
            scheduleRedraw();
          }
          if (syncQueued && !syncInFlight) {
            syncQueued = false;
            void requestSync();
          }
        };

        modalDragActive = true;
        card.classList.add("pixi-modal-dragging");
        card.setPointerCapture?.(event.pointerId);
        card.addEventListener("pointermove", handlePointerMove);
        card.addEventListener("pointerup", stopDragging);
        card.addEventListener("pointercancel", stopDragging);
        card.addEventListener("lostpointercapture", stopDragging);
      });
    });
  };

  const bindOverlayEvents = (): void => {
    if (leftMessage !== "") {
      return;
    }

    bindDraggableModalCards();

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='set-language']").forEach((button) => {
      button.onclick = () => {
        const nextLanguage = button.dataset.language === "en" ? "en" : "fr";
        language = nextLanguage;
        persistLanguage(nextLanguage);
        redraw();
      };
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='add-bot']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          applyImmediateMatchUpdate(await requestAddBot(session.instanceId, playerSessionToken));
          errorMessage = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.addBot");
        }
        redraw();
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='start-match']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await requestStartMatch(session.instanceId, playerSessionToken));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.startMatch");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='leave-match']")?.addEventListener("click", () => {
      confirmingLeave = true;
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='open-card-reference']")?.addEventListener("click", () => {
      cardReferenceOpen = true;
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='open-changelog']")?.addEventListener("click", () => {
      changelogOpen = true;
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='close-changelog']")?.addEventListener("click", () => {
      changelogOpen = false;
      markChangelogSeen();
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='open-bug-report']")?.addEventListener("click", () => {
      bugReportOpen = true;
      bugReportErrorMessage = "";
      redraw();
      frameElement.querySelector<HTMLTextAreaElement>("[data-action='edit-bug-report-description']")?.focus();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='close-bug-report']")?.addEventListener("click", () => {
      if (bugReportSubmitting) {
        return;
      }

      bugReportOpen = false;
      bugReportErrorMessage = "";
      redraw();
      if (syncQueued && !syncInFlight) {
        syncQueued = false;
        void requestSync();
      }
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='close-card-reference']")?.addEventListener("click", () => {
      cardReferenceOpen = false;
      cardReferenceSearchQuery = "";
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='open-seat-fx']")?.addEventListener("click", () => {
      seatFxEditorOpen = true;
      redraw();
    });

    frameElement.querySelectorAll<HTMLElement>("[data-action='close-seat-fx']").forEach((element) => {
      element.addEventListener("click", () => {
        seatFxEditorOpen = false;
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-seat-fx']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = Number(button.dataset.seatNumber ?? "0");
        const effectId = button.dataset.effectId as SeatVisualEffectId | undefined;
        if (seatNumber <= 0 || effectId == null || !DEV_SEAT_VISUAL_EFFECT_IDS.includes(effectId)) {
          return;
        }

        const currentEffects = new Set(devSeatVisualEffectsBySeat[seatNumber] ?? []);
        if (currentEffects.has(effectId)) {
          currentEffects.delete(effectId);
        } else {
          currentEffects.add(effectId);
        }

        if (currentEffects.size === 0) {
          const nextSeatEffects = { ...devSeatVisualEffectsBySeat };
          delete nextSeatEffects[seatNumber];
          devSeatVisualEffectsBySeat = nextSeatEffects;
        } else {
          devSeatVisualEffectsBySeat = {
            ...devSeatVisualEffectsBySeat,
            [seatNumber]: normalizeSeatVisualEffects(currentEffects)
          };
        }
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='clear-seat-fx']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = Number(button.dataset.seatNumber ?? "0");
        if (seatNumber <= 0 || devSeatVisualEffectsBySeat[seatNumber] == null) {
          return;
        }

        const nextSeatEffects = { ...devSeatVisualEffectsBySeat };
        delete nextSeatEffects[seatNumber];
        devSeatVisualEffectsBySeat = nextSeatEffects;
        redraw();
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='clear-all-seat-fx']")?.addEventListener("click", () => {
      devSeatVisualEffectsBySeat = {};
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-reference-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.cardId ?? "";
        if (id === "" || id === cardReferencePreviewCardId) return;
        cardReferencePreviewCardId = id;
        const savedScrollTop = frameElement.querySelector<HTMLElement>(".card-reference-list")?.scrollTop ?? 0;
        redraw();
        const listEl = frameElement.querySelector<HTMLElement>(".card-reference-list");
        if (listEl != null) listEl.scrollTop = savedScrollTop;
      });
    });

    frameElement.querySelector<HTMLInputElement>("[data-action='edit-reference-search']")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const selStart = input.selectionStart ?? input.value.length;
      const selEnd = input.selectionEnd ?? input.value.length;
      cardReferenceSearchQuery = input.value;
      redraw();
      const newInput = frameElement.querySelector<HTMLInputElement>("[data-action='edit-reference-search']");
      if (newInput != null) {
        newInput.focus();
        newInput.setSelectionRange(selStart, selEnd);
      }
    });

    frameElement.querySelector<HTMLTextAreaElement>("[data-action='edit-bug-report-description']")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLTextAreaElement;
      const selStart = input.selectionStart ?? input.value.length;
      const selEnd = input.selectionEnd ?? input.value.length;
      bugReportDraft = input.value;
      bugReportErrorMessage = "";
      redraw();
      const newInput = frameElement.querySelector<HTMLTextAreaElement>("[data-action='edit-bug-report-description']");
      if (newInput != null) {
        newInput.focus();
        newInput.setSelectionRange(selStart, selEnd);
      }
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='send-bug-report']")?.addEventListener("click", async () => {
      const description = bugReportDraft.trim();
      if (description === "") {
        bugReportErrorMessage = t(language, "error.submitBugReport");
        redraw();
        return;
      }

      bugReportSubmitting = true;
      bugReportErrorMessage = "";
      redraw();

      try {
        await persistClientLogNow();
        await submitBugReport(session.instanceId, playerSessionToken, { description });
        logClient("bug_report", `Submitted bug report for ${match.shortId}`);
        bugReportDraft = "";
        bugReportOpen = false;
      } catch (error) {
        bugReportErrorMessage = error instanceof Error ? error.message : t(language, "error.submitBugReport");
      } finally {
        bugReportSubmitting = false;
      }

      redraw();
      if (!bugReportOpen && syncQueued && !syncInFlight) {
        syncQueued = false;
        void requestSync();
      }
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-reference-deck']").forEach((button) => {
      button.addEventListener("click", () => {
        const deck = button.dataset.referenceDeck;
        if (deck === "base") cardReferenceShowBase = !cardReferenceShowBase;
        else if (deck === "sorcellerie") cardReferenceShowSorcellerie = !cardReferenceShowSorcellerie;
        else if (deck === "abondance") cardReferenceShowAbondance = !cardReferenceShowAbondance;
        else if (deck === "puissance") cardReferenceShowPuissance = !cardReferenceShowPuissance;
        else if (deck === "communion") cardReferenceShowCommunion = !cardReferenceShowCommunion;
        redraw();
      });
    });

    const devDrawSelect = frameElement.querySelector<HTMLSelectElement>("[data-action='dev-draw-card']");
    devDrawSelect?.addEventListener("focus", () => {
      overlayInteractionLocked = true;
    });
    devDrawSelect?.addEventListener("blur", () => {
      overlayInteractionLocked = false;
      if (syncQueued && !syncInFlight) {
        syncQueued = false;
        void requestSync();
      }
    });
    devDrawSelect?.addEventListener("change", async (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const cardId = select.value;
      if (cardId === "" || isDevDrawSeparatorValue(cardId)) {
        select.value = "";
        return;
      }

      overlayInteractionLocked = false;
      select.value = "";
      try {
        applyImmediateMatchUpdate(await devDrawCard(session.instanceId, playerSessionToken, cardId));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.drawCard");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='close-dev-seat-card-picker']")?.addEventListener("click", () => {
      devCardPickerSeatNumber = 0;
      overlayInteractionLocked = false;
      redraw();
      if (syncQueued && !syncInFlight) {
        syncQueued = false;
        void requestSync();
      }
    });

    const devSeatDrawSelect = frameElement.querySelector<HTMLSelectElement>("[data-action='dev-draw-seat-card']");
    devSeatDrawSelect?.addEventListener("focus", () => {
      overlayInteractionLocked = true;
    });
    devSeatDrawSelect?.addEventListener("blur", () => {
      overlayInteractionLocked = false;
      if (syncQueued && !syncInFlight) {
        syncQueued = false;
        void requestSync();
      }
    });
    devSeatDrawSelect?.addEventListener("change", async (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const cardId = select.value;
      const targetSeatNumber = Number(select.dataset.targetSeatNumber ?? "0");
      if (cardId === "" || isDevDrawSeparatorValue(cardId) || targetSeatNumber <= 0) {
        select.value = "";
        return;
      }

      overlayInteractionLocked = false;
      select.value = "";
      try {
        applyImmediateMatchUpdate(await devDrawCard(session.instanceId, playerSessionToken, cardId, targetSeatNumber));
        errorMessage = "";
        devCardPickerSeatNumber = 0;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.drawCard");
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='kick-seat']").forEach((button) => {
      button.addEventListener("click", async () => {
        const seatNumber = Number(button.dataset.seatNumber ?? "0");
        if (seatNumber <= 0) {
          return;
        }
        if (button.dataset.removeLobbyBot === "true") {
          button.disabled = true;
          try {
            applyImmediateMatchUpdate(await requestKickPlayer(session.instanceId, playerSessionToken, {
              seatNumber
            }));
            errorMessage = "";
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : t(language, "error.kickPlayer");
          } finally {
            selectedKickSeatNumber = 0;
            confirmingKickSeatNumber = 0;
          }
          redraw();
          return;
        }
        confirmingKickSeatNumber = seatNumber;
        redraw();
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='leave-cancel']")?.addEventListener("click", () => {
      confirmingLeave = false;
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='leave-confirm']")?.addEventListener("click", async () => {
      confirmingLeave = false;
      try {
        await disconnectFromMatch(session.instanceId, playerSessionToken);
      } catch {
        // Leaving should still swap the renderer view into a terminal state even if the disconnect call fails.
      }

      leftMessage = t(language, "left.replacedByBot");
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='kick-cancel']")?.addEventListener("click", () => {
      selectedKickSeatNumber = 0;
      confirmingKickSeatNumber = 0;
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='kick-confirm']")?.addEventListener("click", async () => {
      if (confirmingKickSeatNumber === 0) {
        return;
      }

      try {
        applyImmediateMatchUpdate(await requestKickPlayer(session.instanceId, playerSessionToken, {
          seatNumber: confirmingKickSeatNumber
        }));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.kickPlayer");
      } finally {
        selectedKickSeatNumber = 0;
        confirmingKickSeatNumber = 0;
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='select-pending-object']").forEach((button) => {
      button.addEventListener("click", async () => {
        const objectInstanceId = button.dataset.objectInstanceId;
        if (objectInstanceId == null) {
          return;
        }

        button.disabled = true;
        try {
          applyImmediateMatchUpdate(await selectPendingObject(session.instanceId, playerSessionToken, { objectInstanceId }));
          errorMessage = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.selectObject");
        }
        redraw();
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='dismiss-telepathy']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await acknowledgePendingHandInspection(session.instanceId, playerSessionToken, {}));
        errorMessage = "";
        telepathyPreviewCardInstanceId = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.closeInspection");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='ack-public-hand-reveal']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await acknowledgePendingPublicHandReveal(session.instanceId, playerSessionToken, {}));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.closePublicHandReveal");
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='inspect-public-hand-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = Number(button.dataset.seatNumber ?? "");
        const cardInstanceId = button.dataset.cardInstanceId ?? "";
        if (!Number.isFinite(seatNumber) || cardInstanceId === "") {
          return;
        }

        const card = match.seats.find((seat) => seat.seatNumber === seatNumber)?.hand?.find((candidate) => candidate.instanceId === cardInstanceId);
        if (card == null) {
          return;
        }

        openCardInspectFromElement(card, button);
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-telepathy-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.cardInstanceId ?? "";
        if (id !== "" && id !== telepathyPreviewCardInstanceId) {
          telepathyPreviewCardInstanceId = id;
          const savedScrollTop = frameElement.querySelector<HTMLElement>(".telepathy-list")?.scrollTop ?? 0;
          redraw();
          const listEl = frameElement.querySelector<HTMLElement>(".telepathy-list");
          if (listEl != null) listEl.scrollTop = savedScrollTop;
        }
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-consume-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.cardInstanceId ?? "";
        if (id !== "" && id !== consumePreviewCardInstanceId) {
          consumePreviewCardInstanceId = id;
          const savedScrollTop = frameElement.querySelector<HTMLElement>(".telepathy-list")?.scrollTop ?? 0;
          redraw();
          const listEl = frameElement.querySelector<HTMLElement>(".telepathy-list");
          if (listEl != null) listEl.scrollTop = savedScrollTop;
        }
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='confirm-consume-card']")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const cardInstanceId = button.dataset.cardInstanceId ?? "";
      if (cardInstanceId === "") {
        return;
      }
      await performCardPlay({ cardInstanceId, mode: "active" });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='pass-forced-follow-up']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await passForcedFollowUp(session.instanceId, playerSessionToken));
        errorMessage = "";
        consumePreviewCardInstanceId = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.passFollowUp");
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-board-reset-card']").forEach((button) => {
      button.addEventListener("click", async () => {
        const cardInstanceId = button.dataset.cardInstanceId ?? "";
        if (cardInstanceId === "") {
          return;
        }
        button.disabled = true;
        try {
          applyImmediateMatchUpdate(await resolvePendingBoardResetKeep(session.instanceId, playerSessionToken, { cardInstanceId }));
          errorMessage = "";
          boardResetKeepPreviewCardInstanceId = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.keepCard");
        }
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='choose-death-search-corpse']").forEach((button) => {
      button.addEventListener("click", async () => {
        const corpseSeatNumber = Number(button.dataset.seatNumber ?? "0");
        if (corpseSeatNumber <= 0) return;
        button.disabled = true;
        try {
          applyImmediateMatchUpdate(await resolvePendingDeathSearch(session.instanceId, playerSessionToken, { corpseSeatNumber }));
          errorMessage = "";
          syncDeathSearchState();
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.resolveDeathSearch");
        }
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-death-search-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.cardInstanceId ?? "";
        if (id === "") return;
        const alreadySelected = deathSearchSelectedCardInstanceIds.includes(id);
        deathSearchSelectedCardInstanceIds = alreadySelected
          ? deathSearchSelectedCardInstanceIds.filter((x) => x !== id)
          : [...deathSearchSelectedCardInstanceIds, id];
        deathSearchPreviewCardInstanceId = id;
        const savedScrollTop = frameElement.querySelector<HTMLElement>(".telepathy-list")?.scrollTop ?? 0;
        redraw();
        const listEl = frameElement.querySelector<HTMLElement>(".telepathy-list");
        if (listEl != null) listEl.scrollTop = savedScrollTop;
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='confirm-death-search-keep']")?.addEventListener("click", async () => {
      const keepCardInstanceIds = deathSearchSelectedCardInstanceIds;
      if (keepCardInstanceIds.length === 0) return;
      try {
        applyImmediateMatchUpdate(await resolvePendingDeathSearch(session.instanceId, playerSessionToken, { keepCardInstanceIds }));
        errorMessage = "";
        deathSearchPreviewCardInstanceId = "";
        deathSearchSelectedCardInstanceIds = [];
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.resolveDeathSearch");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='decline-death-search']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await resolvePendingDeathSearch(session.instanceId, playerSessionToken, { decline: true }));
        errorMessage = "";
        deathSearchPreviewCardInstanceId = "";
        deathSearchSelectedCardInstanceIds = [];
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.resolveDeathSearch");
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-pickpocket-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.cardInstanceId ?? "";
        if (id === "") return;
        const alreadySelected = pickpocketSelectedCardInstanceIds.includes(id);
        pickpocketSelectedCardInstanceIds = alreadySelected
          ? pickpocketSelectedCardInstanceIds.filter((x) => x !== id)
          : [...pickpocketSelectedCardInstanceIds, id];
        pickpocketPreviewCardInstanceId = id;
        const savedScrollTop = frameElement.querySelector<HTMLElement>(".telepathy-list")?.scrollTop ?? 0;
        redraw();
        const listEl = frameElement.querySelector<HTMLElement>(".telepathy-list");
        if (listEl != null) listEl.scrollTop = savedScrollTop;
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='confirm-pickpocket-take']")?.addEventListener("click", async () => {
      const takeCardInstanceIds = pickpocketSelectedCardInstanceIds;
      if (takeCardInstanceIds.length === 0) return;
      try {
        applyImmediateMatchUpdate(await resolvePendingPickpocket(session.instanceId, playerSessionToken, { takeCardInstanceIds }));
        errorMessage = "";
        pickpocketPreviewCardInstanceId = "";
        pickpocketSelectedCardInstanceIds = [];
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.resolvePickpocket");
      }
      redraw();
    });

    frameElement.querySelector<HTMLInputElement>("[data-action='edit-sacrifice-amount']")?.addEventListener("input", (event) => {
      const input = event.currentTarget as HTMLInputElement;
      const selStart = input.selectionStart ?? input.value.length;
      const selEnd = input.selectionEnd ?? input.value.length;
      sacrificeAmountInput = input.value.replace(/[^\d]/g, "");
      const pendingSacrificeChoice = match.game?.pendingSacrificeChoice;
      const confirmBtn = frameElement.querySelector<HTMLButtonElement>("[data-action='confirm-sacrifice-amount']");
      if (pendingSacrificeChoice != null && confirmBtn != null) {
        const normalizedValue = sacrificeAmountInput.trim();
        const parsed = Number(normalizedValue);
        confirmBtn.disabled = !(/^\d+$/.test(normalizedValue) && parsed >= 0 && parsed <= pendingSacrificeChoice.maxAmount);
      }
      redraw();
      const newInput = frameElement.querySelector<HTMLInputElement>("[data-action='edit-sacrifice-amount']");
      if (newInput != null) {
        newInput.focus();
        const nextCursor = Math.min(selStart, newInput.value.length);
        newInput.setSelectionRange(nextCursor, Math.min(selEnd, newInput.value.length));
      }
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='confirm-sacrifice-amount']")?.addEventListener("click", async () => {
      const pendingSacrificeChoice = match.game?.pendingSacrificeChoice;
      const normalizedValue = sacrificeAmountInput.trim();
      const parsed = Number(normalizedValue);
      if (pendingSacrificeChoice == null || !/^\d+$/.test(normalizedValue) || !Number.isInteger(parsed) || parsed < 0 || parsed > pendingSacrificeChoice.maxAmount) {
        errorMessage = t(language, "error.sacrificeRange", { maxAmount: pendingSacrificeChoice?.maxAmount ?? 0 });
        redraw();
        return;
      }
      try {
        applyImmediateMatchUpdate(await resolvePendingSacrificeChoice(session.instanceId, playerSessionToken, { amount: parsed }));
        errorMessage = "";
        sacrificeAmountInput = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.chooseSacrifice");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='sorcellerie-sacrifice-waive']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await resolvePendingSorcellerieSacrificeChoice(session.instanceId, playerSessionToken, { waiveSacrifice: true }));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.chooseSorcellerieSacrifice");
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='sorcellerie-sacrifice-pay']")?.addEventListener("click", async () => {
      try {
        applyImmediateMatchUpdate(await resolvePendingSorcellerieSacrificeChoice(session.instanceId, playerSessionToken, { waiveSacrifice: false }));
        errorMessage = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : t(language, "error.chooseSorcellerieSacrifice");
      }
      redraw();
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='ordre-interrupt-cancel']").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          applyImmediateMatchUpdate(await resolvePendingOrdreInterrupt(session.instanceId, playerSessionToken, { choice: "cancel" }));
          errorMessage = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.resolveOrdreInterrupt");
        }
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='ordre-interrupt-pass']").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          applyImmediateMatchUpdate(await resolvePendingOrdreInterrupt(session.instanceId, playerSessionToken, { choice: "pass" }));
          errorMessage = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.resolveOrdreInterrupt");
        }
        redraw();
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='discard-cancel']")?.addEventListener("click", () => {
      confirmingDiscardCardInstanceId = "";
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='discard-confirm']")?.addEventListener("click", async () => {
      const cardInstanceId = confirmingDiscardCardInstanceId;
      if (cardInstanceId === "") {
        return;
      }

      confirmingDiscardCardInstanceId = "";
      await performCardPlay({
        cardInstanceId,
        mode: "inactive"
      });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='curse-release-cancel']")?.addEventListener("click", () => {
      confirmingCurseReleaseStatusInstanceId = "";
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='curse-release-confirm']")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      const statusInstanceId = button.dataset.statusInstanceId ?? confirmingCurseReleaseStatusInstanceId;
      if (statusInstanceId === "") {
        return;
      }

      button.disabled = true;
      try {
        applyImmediateMatchUpdate(await resolvePendingCurseRelease(session.instanceId, playerSessionToken, {
          choice: "accept",
          statusInstanceId
        }));
        errorMessage = "";
        confirmingCurseReleaseStatusInstanceId = "";
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "Unable to remove curse";
      }
      redraw();
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='pass-response']")?.addEventListener("click", async () => {
      await performPendingResponse({ choice: "pass" });
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='ordre-response']")?.addEventListener("click", async () => {
      await performPendingResponse({ choice: "ordre-demmerlaus" });
    });

    frameElement.querySelector<HTMLElement>("[data-annulation-choice-card='true']")?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    frameElement.querySelectorAll<HTMLElement>("[data-pixi-modal-card='true']").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    });

    frameElement.querySelectorAll<HTMLElement>("[data-action='annulation-choice-cancel']").forEach((element) => {
      element.addEventListener("click", () => {
        pendingAnnulationChoice = null;
        redraw();
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='annulation-choice-confirm']").forEach((button) => {
      button.addEventListener("click", async () => {
        const pendingChoice = pendingAnnulationChoice;
        if (pendingChoice == null) {
          return;
        }

        const annulationCount = Math.max(1, Math.min(
          Number(button.dataset.annulationCount ?? "1") || 1,
          pendingChoice.maxCount
        ));
        button.disabled = true;
        await performPendingResponse({ choice: "annulation", annulationCount });
      });
    });

    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-expansion']").forEach((button) => {
      button.onclick = async () => {
        const expansion = button.dataset.expansionKey as ExpansionKey | undefined;
        if (expansion == null) {
          return;
        }

        try {
          applyImmediateMatchUpdate(await requestUpdateExpansion(session.instanceId, playerSessionToken, {
            expansion,
            enabled: !match.enabledExpansions[expansion]
          }));
          errorMessage = "";
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : t(language, "error.updateExpansion");
        }
        redraw();
      };
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='toggle-event-log']")?.addEventListener("click", () => {
      eventLogExpanded = !eventLogExpanded;
      redraw();
      if (eventLogExpanded) {
        const historyEl = frameElement.querySelector<HTMLElement>("[data-event-log-history='true']");
        if (historyEl != null) {
          historyEl.scrollTop = historyEl.scrollHeight;
        }
      }
    });
    frameElement.querySelector<HTMLButtonElement>("[data-action='toggle-replay-pause']")?.addEventListener("click", () => {
      setReplayPaused(!replayPaused);
    });
    frameElement.querySelector<HTMLButtonElement>("[data-action='rewind-replay']")?.addEventListener("click", () => {
      replayLatestBatch();
    });
    frameElement.querySelectorAll<HTMLButtonElement>("[data-action='set-replay-speed-preset']").forEach((button) => {
      button.addEventListener("click", () => {
        const nextSpeed = Number(button.dataset.speed ?? "1");
        if (Number.isFinite(nextSpeed)) {
          setReplaySpeed(nextSpeed);
        }
      });
    });
    frameElement.querySelector<HTMLInputElement>("[data-action='set-replay-speed']")?.addEventListener("input", (event) => {
      const nextSpeed = Number((event.currentTarget as HTMLInputElement).value);
      if (Number.isFinite(nextSpeed)) {
        setReplaySpeed(nextSpeed);
      }
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='resize-event-log']")?.addEventListener("mousedown", (e) => {
      handleResizeEventLog(e);
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='download-server-log']")?.addEventListener("click", () => {
      const lines = (match?.game?.debugLog ?? []).map(
        (entry) => `${entry.createdAt} [${entry.source}:${entry.scope}] ${entry.message}`
      );
      downloadTextFile(`emerlaus-server-log-${session.instanceId}.log`, lines.join("\n"));
    });

    frameElement.querySelector<HTMLButtonElement>("[data-action='download-client-log']")?.addEventListener("click", () => {
      downloadTextFile(`emerlaus-client-log-${session.instanceId}.log`, clientDebugLog.join("\n"));
    });
  };

  const handleCanvasPointerMove = (event: PointerEvent): void => {
    if (!currentMetrics.isLandscape || leftMessage !== "" || hasBlockingModalOpen()) {
      return;
    }

    const point = viewportToStage(event.clientX, event.clientY);
    if (point == null) {
      if (!hasActiveLocalInteraction() && interactionState.hoveredCardInstanceId !== "") {
        setHoveredCardInstanceId("");
      }
      return;
    }

    // Drag/arrow operations are still blocked during event playback — only hover is allowed.
    if (eventPlaybackActive) {
      const hoveredLayout = getHoveredHandCard(point);
      setHoveredHandCardFromPointer(hoveredLayout != null ? hoveredLayout.card.instanceId : "");
      return;
    }

    if (interactionState.arrowDrag != null) {
      interactionState.arrowDrag.pointerX = point.x;
      interactionState.arrowDrag.pointerY = point.y;
      const arrowCard = getLocalHand().find((card) => card.instanceId === interactionState.arrowDrag?.cardInstanceId);
      interactionState.arrowDrag.nearestSeatNumber = resolveArrowNearestSeatNumber(point, arrowCard);
      if (interactionState.arrowDrag.source === "object") {
        interactionState.arrowDrag.nearestObjectInstanceId = null;
      } else {
        interactionState.arrowDrag.nearestObjectInstanceId = arrowCard?.cardId === "depouillement"
          ? null
          : resolveArrowNearestObjectInstanceId(point);
      }
      const now = Date.now();
      if (now - cursorSendAt >= CURSOR_THROTTLE_MS) {
        cursorSendAt = now;
        broadcastCursorTarget(interactionState.arrowDrag.nearestSeatNumber);
      }
      scheduleRedraw();
      return;
    }

    if (interactionState.draggingCardInstanceId !== "") {
      interactionState.dragPointerX = point.x;
      interactionState.dragPointerY = point.y;
      const draggedCard = getDraggedCard();
      interactionState.dragHoverTarget = draggedCard == null ? null : resolveDragHoverTarget(point, draggedCard);
      scheduleRedraw();
      return;
    }

    if (pendingObjectPress != null) {
      const activeObjectPress = pendingObjectPress;
      const localSeat = getLocalSeat(match, localSeatNumber);
      const pendingTarget = currentGeometry?.inspectTargets.find((target) =>
        target.group === "object"
        && target.card.instanceId === activeObjectPress.cardInstanceId
      );
      const canStartObjectDrag =
        localSeat != null
        && match.status === "in_progress"
        && match.game?.currentTurnSeatNumber === localSeatNumber
        && match.game.pendingAction == null
        && match.game.pendingObjectChoice == null
        && pendingTarget != null
        && isAttackStaffObjectCard(pendingTarget.card)
        && pendingTarget.card.canPlay === true
        && pendingTarget.card.usedThisTurn !== true
        && (localSeat.objects ?? []).some((card) => card.instanceId === pendingTarget.card.instanceId);
      if (canStartObjectDrag) {
        const movement = Math.hypot(point.x - activeObjectPress.startX, point.y - activeObjectPress.startY);
        if (movement >= HAND_DRAG_START_DISTANCE) {
          beginObjectCardInteraction(pendingTarget, point);
          pendingObjectPress = null;
          scheduleRedraw();
          return;
        }
      }
    }

    if (pendingHandPress != null) {
      const activeHandPress = pendingHandPress;
      const pendingLayout = currentGeometry?.handLayouts.find((layout) => layout.card.instanceId === activeHandPress.cardInstanceId);
      if (pendingLayout != null && canStartInteractionForCard(pendingLayout.card)) {
        const movement = Math.hypot(point.x - activeHandPress.startX, point.y - activeHandPress.startY);
        if (movement >= HAND_DRAG_START_DISTANCE) {
          beginHandCardInteraction(pendingLayout, point);
          pendingHandPress = null;
          scheduleRedraw();
          return;
        }
      }
    }

    const hoveredLayout = getHoveredHandCard(point);
    const nextHoveredCardInstanceId =
      hoveredLayout != null
        ? hoveredLayout.card.instanceId
        : "";
    setHoveredHandCardFromPointer(nextHoveredCardInstanceId);
  };

  const handleCanvasPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !currentMetrics.isLandscape || leftMessage !== "" || eventPlaybackActive || hasBlockingModalOpen()) {
      return;
    }

    const point = viewportToStage(event.clientX, event.clientY);
    if (point == null) {
      return;
    }

    const localSeat = getLocalSeat(match, localSeatNumber);
    const geometry = currentGeometry;
    if (
      canUseDevCardPicker
      && match.status === "in_progress"
      && localSeat != null
      && geometry != null
      && getInspectTargetAtPoint(point) == null
    ) {
      const clickedTargetSeat = match.seats.find((seat) =>
        seat.seatNumber !== localSeatNumber
        && geometry.seatRects.has(seat.seatNumber)
        && pointInRect(point, geometry.seatRects.get(seat.seatNumber)!)
      );
      if (clickedTargetSeat != null) {
        event.preventDefault();
        selectedKickSeatNumber = 0;
        devCardPickerSeatNumber = clickedTargetSeat.seatNumber;
        redraw();
        return;
      }
      if (devCardPickerSeatNumber !== 0) {
        devCardPickerSeatNumber = 0;
        redraw();
      }
    }

    if (localSeat?.isHost === true && geometry != null) {
      const clickedHumanSeat = match.seats.find((seat) =>
        seat.seatNumber !== localSeatNumber
        && seat.controllerType === "human"
        && geometry.seatRects.has(seat.seatNumber)
        && pointInRect(point, geometry.seatRects.get(seat.seatNumber)!)
      );
      if (clickedHumanSeat != null) {
        event.preventDefault();
        selectedKickSeatNumber = clickedHumanSeat.seatNumber;
        redraw();
        return;
      }
      if (selectedKickSeatNumber !== 0) {
        selectedKickSeatNumber = 0;
        redraw();
      }
    }

    const inspectTarget = getInspectTargetAtPoint(point);
    if (
      localSeat != null
      && match.status === "in_progress"
      && match.game?.currentTurnSeatNumber === localSeatNumber
      && match.game.pendingAction == null
      && match.game.pendingObjectChoice == null
      && inspectTarget?.group === "object"
      && isAttackStaffObjectCard(inspectTarget.card)
      && inspectTarget.card.canPlay === true
      && inspectTarget.card.usedThisTurn !== true
      && (localSeat.objects ?? []).some((card) => card.instanceId === inspectTarget.card.instanceId)
    ) {
      event.preventDefault();
      pendingObjectPress = {
        cardInstanceId: inspectTarget.card.instanceId,
        startX: point.x,
        startY: point.y
      };
      return;
    }

    const hoveredLayout = getHoveredHandCard(point);
    if (hoveredLayout != null) {
      event.preventDefault();
      setHoveredCardInstanceId(hoveredLayout.card.instanceId);
      pendingHandPress = {
        cardInstanceId: hoveredLayout.card.instanceId,
        startX: point.x,
        startY: point.y
      };
      return;
    }
  };

  const handleCanvasPointerUp = async (event: PointerEvent): Promise<void> => {
    if (event.button !== 0 || leftMessage !== "" || eventPlaybackActive || hasBlockingModalOpen()) {
      return;
    }

    const point = viewportToStage(event.clientX, event.clientY);
    if (point == null) {
      if (interactionState.arrowDrag != null) {
        broadcastCursorTarget(null);
      }
      pendingHandPress = null;
      clearInteractionState();
      redraw();
      return;
    }

    if (interactionState.arrowDrag != null) {
      const { source, cardInstanceId, nearestSeatNumber, nearestObjectInstanceId } = interactionState.arrowDrag;
      const draggedCard = getLocalHand().find((card) => card.instanceId === cardInstanceId);
      broadcastCursorTarget(null);
      if (source === "object") {
        if (nearestSeatNumber != null) {
          targetHintDismissed = true;
          await performObjectFire({
            objectInstanceId: cardInstanceId,
            targetSeatNumber: nearestSeatNumber
          });
          return;
        }

        clearInteractionState();
        redraw();
        return;
      }
      if (
        currentGeometry != null
        && canDiscardCard(match, localSeatNumber)
        && pointInRect(point, currentGeometry.discardZone)
      ) {
        clearInteractionState();
        confirmingDiscardCardInstanceId = cardInstanceId;
        redraw();
        return;
      }
      if (nearestObjectInstanceId != null) {
        if (draggedCard != null && !draggedCard.canPlay) {
          showBlockedCardMessage(draggedCard);
          return;
        }
        await performCardPlay({
          cardInstanceId,
          mode: "active",
          targetObjectInstanceId: nearestObjectInstanceId
        });
        return;
      }
      const effectiveTargets = draggedCard == null
        ? null
        : getEffectiveInteractionTargets(draggedCard, match.game?.viergeReplayCard);
      if (nearestSeatNumber != null && effectiveTargets !== "target_object") {
        if (draggedCard != null && !draggedCard.canPlay) {
          showBlockedCardMessage(draggedCard);
          return;
        }
        targetHintDismissed = true;
        await performCardPlay({
          cardInstanceId,
          mode: "active",
          targetSeatNumber: nearestSeatNumber
        });
        return;
      }

      clearInteractionState();
      redraw();
      return;
    }

    if (interactionState.draggingCardInstanceId === "") {
      if (pendingObjectPress != null) {
        const inspectTarget = currentGeometry?.inspectTargets.find((target) =>
          target.group === "object"
          && target.card.instanceId === pendingObjectPress?.cardInstanceId
        );
        pendingObjectPress = null;
        if (inspectTarget != null) {
          openCardInspect(inspectTarget);
          return;
        }
      }
      if (pendingHandPress != null) {
        const inspectTarget = getHandInspectTarget(pendingHandPress.cardInstanceId);
        pendingHandPress = null;
        if (inspectTarget != null) {
          openCardInspect(inspectTarget);
          return;
        }
      }
      const inspectTarget = getInspectTargetAtPoint(point);
      if (inspectTarget != null) {
        if (inspectTarget.group === "status" && canOfferCurseRelease(inspectTarget.card)) {
          confirmingCurseReleaseStatusInstanceId = inspectTarget.card.instanceId;
          redraw();
          return;
        }
        openCardInspect(inspectTarget);
      }
      return;
    }

    const draggedCard = getDraggedCard();
    interactionState.dragHoverTarget = draggedCard == null ? null : resolveDragHoverTarget(point, draggedCard);
    if (draggedCard == null || interactionState.dragHoverTarget == null) {
      clearInteractionState();
      redraw();
      return;
    }

    if (interactionState.dragHoverTarget.kind === "seat" && interactionState.dragHoverTarget.seatNumber != null) {
      if (!draggedCard.canPlay) {
        showBlockedCardMessage(draggedCard);
        return;
      }
      await performCardPlay({
        cardInstanceId: draggedCard.instanceId,
        mode: "active",
        targetSeatNumber: interactionState.dragHoverTarget.seatNumber
      });
      return;
    }

    if (interactionState.dragHoverTarget.kind === "object" && interactionState.dragHoverTarget.objectInstanceId != null) {
      if (!draggedCard.canPlay) {
        showBlockedCardMessage(draggedCard);
        return;
      }
      await performCardPlay({
        cardInstanceId: draggedCard.instanceId,
        mode: "active",
        targetObjectInstanceId: interactionState.dragHoverTarget.objectInstanceId
      });
      return;
    }

    if (interactionState.dragHoverTarget.kind === "response-slot") {
      const choice = getResponseChoiceForCard(draggedCard);
      if (choice == null || !canDropIntoResponseSlot(match, localSeatNumber, draggedCard)) {
        showBlockedCardMessage(draggedCard);
        return;
      }

      const annulationPrompt = choice === "annulation"
        ? getCollectiveAnnulationPrompt(match, localSeatNumber, getLocalHand(), draggedCard)
        : null;
      if (annulationPrompt != null) {
        pendingAnnulationChoice = {
          cardInstanceId: draggedCard.instanceId,
          maxCount: annulationPrompt.maxCount,
          neededCount: annulationPrompt.neededCount
        };
        clearInteractionState();
        redraw();
        return;
      }

      await performPendingResponse({ choice });
      return;
    }

    if (interactionState.dragHoverTarget.kind === "play-slot") {
      if (!draggedCard.canPlay) {
        showBlockedCardMessage(draggedCard);
        return;
      }
      const effectiveTargets = getEffectiveInteractionTargets(draggedCard, match.game?.viergeReplayCard);
      await performCardPlay({
        cardInstanceId: draggedCard.instanceId,
        mode: "active",
        targetSeatNumber: effectiveTargets === "self_or_single_opponent" ? localSeatNumber : undefined
      });
      return;
    }

    if (interactionState.dragHoverTarget.kind === "discard" && canDiscardCard(match, localSeatNumber)) {
      clearInteractionState();
      confirmingDiscardCardInstanceId = draggedCard.instanceId;
      redraw();
      return;
    }

    clearInteractionState();
    redraw();
  };

  const handleWindowPointerUp = (event: PointerEvent): void => {
    void handleCanvasPointerUp(event);
  };

  redraw();
  void loadReleaseInfo();
  connectSSE(session.instanceId);
  app.canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  window.addEventListener("pointermove", handleCanvasPointerMove);
  window.addEventListener("pointerup", handleWindowPointerUp);

  const resizeObserver = new ResizeObserver(() => {
    redraw();
  });
  resizeObserver.observe(hostElement);

  const unsubscribe = session.subscribeToParticipantUpdates(() => {
    void requestSync();
  });

  pollInterval = window.setInterval(() => {
    void requestSync();
  }, POLL_INTERVAL_MS);

  window.addEventListener("beforeunload", () => {
    destroyed = true;
    if (inspectCloseTimer != null) {
      window.clearTimeout(inspectCloseTimer);
    }
    if (publicHandRevealRefreshTimer != null) {
      window.clearTimeout(publicHandRevealRefreshTimer);
    }
    if (clientLogPersistTimer != null) {
      window.clearTimeout(clientLogPersistTimer);
      clientLogPersistTimer = null;
    }
    void persistClientLogNow();
    clearVictoryRevealTimer();
    clearPostVictoryCloseTimer();
    resizeObserver.disconnect();
    if (pollInterval != null) {
      window.clearInterval(pollInterval);
    }
    sseEventSource?.close();
    app.canvas.removeEventListener("pointerdown", handleCanvasPointerDown);
    window.removeEventListener("pointermove", handleCanvasPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
    unsubscribe();
    if (session.mode === "discord" && leftMessage === "" && match.status !== "finished") {
      void disconnectFromMatch(session.instanceId, playerSessionToken);
    }
    app.destroy(undefined, { children: true, context: true, style: true });
  }, { once: true });
}
