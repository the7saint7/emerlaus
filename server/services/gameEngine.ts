import { randomUUID } from "node:crypto";
import {
  abondanceDeckCardQuantities,
  baseCardDefinitionById,
  baseCardDefinitions,
  puissanceDeckCardQuantities,
  type BaseCardDefinition,
  type CardCategoryCode,
  type CardEffect,
  type RollExpression
} from "../../shared/cards/index.js";
import type {
  CardTargetMode,
  CardView,
  CombatPresentationEvent,
  DebugLogEntry,
  DiceRollEvent,
  GameEvent,
  GameState,
  MatchSessionStats,
  MatchState,
  PendingActionOption,
  PlayCardRequest,
  PendingActionResponseRequest,
  PendingActionResponderState,
  PendingActionState,
  ResponseChoiceType,
  SeatSessionStats,
  SeatState,
  MatchExpansionSettings
} from "../../shared/types.js";
import type {
  StoredCardInstance,
  StoredForcedFollowUpState,
  StoredGameState,
  StoredMatchState,
  StoredObjectOwnershipStatState,
  StoredPendingActionResponderState,
  StoredSeatState,
  StoredSessionStatRuntimeState,
  StoredSeatStatus,
  StoredPendingActionState
} from "./gameEngineTypes.js";

const ATTACK_CATEGORIES = new Set<CardCategoryCode>(["AD", "AM", "S", "E", "CO"]);
const MASS_ATTACK_STAFF_CARD_ID = "baton-dattaque-massive";
const ORDRE_DEMMERLAUS_CARD_ID = "ordre-demmerlaus";
const ABUNDANCE_ALLOWED_CATEGORIES: CardCategoryCode[] = ["A", "AD", "AM"];

interface SuccessfulHitDamageModifierConfig {
  triggerNotation: string;
  successTotals: number[];
  mode: "use_total_player_power" | "multiply_damage";
  damageMultiplier?: number;
}

interface SuccessfulHitDamageContext {
  actorSeat: SeatState;
  damageMultiplier: number;
}

interface StatRollContext {
  seatNumber: number;
  highIsGood: boolean;
}

interface SuccessfulHitKillRollConfig {
  triggerNotation: string;
  successTotals: number[];
}

interface SuccessfulHitFreezeConfig {
  triggerNotation: string;
  successTotals: number[];
}

interface PersistentOwnerTurnMassDamageConfig {
  damageNotation: string;
}

interface TimedPotionStatusConfig {
  durationNotation: string;
  damageMultiplier?: number;
  extraPlaysPerTurn?: number;
  grantsAttackImmunity?: boolean;
}

const SUCCESSFUL_HIT_DAMAGE_MODIFIER_BY_CARD_ID: Partial<Record<string, SuccessfulHitDamageModifierConfig>> = {
  "eclair-diabolique": {
    triggerNotation: "1D12",
    successTotals: [1],
    mode: "use_total_player_power"
  },
  "fleche-diabolique": {
    triggerNotation: "1D12",
    successTotals: [1],
    mode: "use_total_player_power"
  },
  "eclair-empoisonnant": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  },
  "eclatement-empoisonne": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  },
  "fleche-empoisonnee": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  },
  "rayon-empoisonne": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  },
  "sphere-de-poison": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  },
  "venin-de-vipere": {
    triggerNotation: "1D10",
    successTotals: [1],
    mode: "multiply_damage",
    damageMultiplier: 2
  }
};

const SUCCESSFUL_HIT_KILL_ROLL_BY_CARD_ID: Partial<Record<string, SuccessfulHitKillRollConfig>> = {
  "espoir-diabolique": {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  "espoir-mortel": {
    triggerNotation: "1D10",
    successTotals: [1]
  }
};

const SUCCESSFUL_HIT_FREEZE_ROLL_BY_CARD_ID: Partial<Record<string, SuccessfulHitFreezeConfig>> = {
  engelure: {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  "flechette-glacee": {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  "rayon-glacial": {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  refroidissement: {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  "sculpture-de-glace": {
    triggerNotation: "1D12",
    successTotals: [1]
  },
  "zero-absolu": {
    triggerNotation: "1D12",
    successTotals: [1]
  }
};

const EXTRA_RESISTANCE_ROLL_OBJECT_CARD_IDS = new Set<string>(["robe-de-double-resistance"]);

const PERSISTENT_OWNER_TURN_MASS_DAMAGE_BY_CARD_ID: Partial<Record<string, PersistentOwnerTurnMassDamageConfig>> = {
  grele: {
    damageNotation: "1D12"
  },
  "tremblement-de-terre": {
    damageNotation: "1D20"
  }
};

const FULL_TURN_NO_RIPOSTE_STATUS_CARD_IDS = new Set<string>([
  "sommeil",
  "engelure",
  "flechette-glacee",
  "rayon-glacial",
  "refroidissement",
  "sculpture-de-glace",
  "zero-absolu"
]);

const TIMED_POTION_STATUS_BY_CARD_ID: Partial<Record<string, TimedPotionStatusConfig>> = {
  "potion-de-force": {
    durationNotation: "1D6",
    damageMultiplier: 2
  },
  "potion-de-geant": {
    durationNotation: "1D4",
    damageMultiplier: 3
  },
  "potion-de-rapidite": {
    durationNotation: "1D6",
    extraPlaysPerTurn: 1
  },
  "potion-dinvincibilite": {
    durationNotation: "1D4",
    damageMultiplier: 2,
    grantsAttackImmunity: true
  }
};

const TOTAL_POWER_OVERRIDE_STATUS_CARD_IDS = new Set<string>(["puissance"]);
const SOUS_GRADES_DURATION_MS = 30_000;

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }

  return items[Math.floor(Math.random() * items.length)];
}

function publicImageUrl(importedAssetPath?: string | null): string {
  if (importedAssetPath == null || importedAssetPath === "") {
    return "";
  }

  return `/${importedAssetPath.replace(/^client[\\/]+public[\\/]+/, "").replace(/\\/g, "/")}`;
}

function requireDefinition(cardId: string): BaseCardDefinition {
  const definition = baseCardDefinitionById[cardId];
  if (definition == null) {
    throw new Error(`Missing card definition for ${cardId}`);
  }

  return definition;
}

function cardConsumesTurnAsNoOp(definition: BaseCardDefinition): boolean {
  return definition.implementation?.status === "needs_handler" || definition.implementation?.status === "stub";
}

function appendCardCopies(deck: StoredCardInstance[], cardId: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    deck.push({
      instanceId: randomUUID(),
      cardId
    });
  }
}

function createDeck(enabledExpansions: MatchExpansionSettings): StoredCardInstance[] {
  const deck: StoredCardInstance[] = [];

  for (const card of baseCardDefinitions) {
    appendCardCopies(deck, card.id, card.baseDeckQuantity);
  }

  if (enabledExpansions.abondance) {
    for (const [cardId, count] of Object.entries(abondanceDeckCardQuantities)) {
      appendCardCopies(deck, cardId, count);
    }
  }

  if (enabledExpansions.puissance) {
    for (const [cardId, count] of Object.entries(puissanceDeckCardQuantities)) {
      appendCardCopies(deck, cardId, count);
    }
  }

  return shuffle(deck);
}

function determineMinimumHandSize(deckSize: number): number {
  if (deckSize >= 300) {
    return 7;
  }

  if (deckSize >= 200) {
    return 6;
  }

  return 5;
}

function createSeatState(seatNumber: number): StoredSeatState {
  return {
    seatNumber,
    hand: [],
    objects: [],
    statuses: [],
    alive: true,
    skipTurnsRemaining: 0,
    pendingExtraPlays: 0,
    attackImmunityTurns: 0,
    noRiposteTurnsRemaining: 0
  };
}

function createSeatSessionStats(seatNumber: number): SeatSessionStats {
  return {
    seatNumber,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingReceived: 0,
    biggestHit: 0,
    biggestHeal: 0,
    kills: 0,
    cardsPlayed: 0,
    activeCardsPlayed: 0,
    inactiveCardsPlayed: 0,
    responseCardsPlayed: 0,
    objectsWorn: 0,
    longestObjectHoldTurns: 0,
    longestObjectHoldCardName: null,
    resistAttempts: 0,
    resistSuccesses: 0,
    resistCriticalSuccesses: 0,
    resistFatalFailures: 0,
    luckyRolls: 0,
    unluckyRolls: 0,
    neutralRolls: 0,
    timesTargeted: 0,
    lowestHpSurvived: null
  };
}

function createMatchSessionStats(seatNumbers: number[]): MatchSessionStats {
  return {
    seatStats: seatNumbers.map((seatNumber) => createSeatSessionStats(seatNumber))
  };
}

function createSessionStatRuntime(): StoredSessionStatRuntimeState {
  return {
    activeObjectOwnerships: []
  };
}

function getSeatSessionStats(game: StoredGameState, seatNumber: number): SeatSessionStats {
  const stats = game.sessionStats.seatStats.find((candidate) => candidate.seatNumber === seatNumber);
  if (stats == null) {
    throw new Error(`Missing session stats for seat ${seatNumber}`);
  }

  return stats;
}

function copySeatSessionStats(source: SeatSessionStats): SeatSessionStats {
  return { ...source };
}

function swapSeatSessionStats(game: StoredGameState, leftSeatNumber: number, rightSeatNumber: number): void {
  const leftStats = getSeatSessionStats(game, leftSeatNumber);
  const rightStats = getSeatSessionStats(game, rightSeatNumber);
  const leftSnapshot = copySeatSessionStats(leftStats);
  const rightSnapshot = copySeatSessionStats(rightStats);

  Object.assign(leftStats, rightSnapshot, { seatNumber: leftSeatNumber });
  Object.assign(rightStats, leftSnapshot, { seatNumber: rightSeatNumber });
}

function flattenStoredCardInstance(card: StoredCardInstance): StoredCardInstance[] {
  const attachedCards = card.attachedCards?.flatMap((attachedCard) => flattenStoredCardInstance(attachedCard)) ?? [];
  return [
    {
      instanceId: card.instanceId,
      cardId: card.cardId
    },
    ...attachedCards
  ];
}

function flattenStoredCardInstances(cards: StoredCardInstance[]): StoredCardInstance[] {
  return cards.flatMap((card) => flattenStoredCardInstance(card));
}

function getStoredSeat(game: StoredGameState, seatNumber: number): StoredSeatState {
  const seat = game.seatStates.find((candidate) => candidate.seatNumber === seatNumber);
  if (seat == null) {
    throw new Error(`Missing stored seat ${seatNumber}`);
  }

  return seat;
}

function getPublicSeat(match: StoredMatchState, seatNumber: number): SeatState {
  const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);
  if (seat == null) {
    throw new Error(`Missing public seat ${seatNumber}`);
  }

  return seat;
}

function updateLongestObjectHoldTurns(game: StoredGameState, ownership: StoredObjectOwnershipStatState): void {
  const duration = Math.max(0, game.turnNumber - ownership.startedTurnNumber);
  const stats = getSeatSessionStats(game, ownership.ownerSeatNumber);
  if (duration > stats.longestObjectHoldTurns) {
    stats.longestObjectHoldTurns = duration;
    stats.longestObjectHoldCardName = requireDefinition(ownership.cardId).name;
  }
}

function syncObjectOwnershipStats(match: StoredMatchState): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const actualOwnerships = new Map<string, { ownerSeatNumber: number; cardId: string }>();
  for (const seatState of game.seatStates) {
    for (const objectCard of seatState.objects) {
      actualOwnerships.set(objectCard.instanceId, {
        ownerSeatNumber: seatState.seatNumber,
        cardId: objectCard.cardId
      });
    }
  }

  const nextOwnerships: StoredObjectOwnershipStatState[] = [];
  for (const ownership of game.sessionStatRuntime.activeObjectOwnerships) {
    const actualOwnership = actualOwnerships.get(ownership.objectInstanceId);
    if (actualOwnership == null) {
      updateLongestObjectHoldTurns(game, ownership);
      continue;
    }

    if (actualOwnership.ownerSeatNumber !== ownership.ownerSeatNumber) {
      updateLongestObjectHoldTurns(game, ownership);
      getSeatSessionStats(game, actualOwnership.ownerSeatNumber).objectsWorn += 1;
      nextOwnerships.push({
        objectInstanceId: ownership.objectInstanceId,
        cardId: actualOwnership.cardId,
        ownerSeatNumber: actualOwnership.ownerSeatNumber,
        startedTurnNumber: game.turnNumber
      });
      actualOwnerships.delete(ownership.objectInstanceId);
      continue;
    }

    nextOwnerships.push(ownership);
    actualOwnerships.delete(ownership.objectInstanceId);
  }

  for (const [objectInstanceId, actualOwnership] of actualOwnerships.entries()) {
    getSeatSessionStats(game, actualOwnership.ownerSeatNumber).objectsWorn += 1;
    nextOwnerships.push({
      objectInstanceId,
      cardId: actualOwnership.cardId,
      ownerSeatNumber: actualOwnership.ownerSeatNumber,
      startedTurnNumber: game.turnNumber
    });
  }

  game.sessionStatRuntime.activeObjectOwnerships = nextOwnerships;
}

function refreshActiveObjectHoldDurations(match: StoredMatchState): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  for (const ownership of game.sessionStatRuntime.activeObjectOwnerships) {
    updateLongestObjectHoldTurns(game, ownership);
  }
}

function recordDamageDealt(match: StoredMatchState, sourceSeatNumber: number | undefined, targetSeatNumber: number, amount: number): void {
  const game = match.internalGame;
  if (game == null || amount <= 0) {
    return;
  }

  getSeatSessionStats(game, targetSeatNumber).damageTaken += amount;
  if (sourceSeatNumber == null) {
    return;
  }

  const sourceStats = getSeatSessionStats(game, sourceSeatNumber);
  sourceStats.damageDealt += amount;
  sourceStats.biggestHit = Math.max(sourceStats.biggestHit, amount);
}

function recordHealing(match: StoredMatchState, sourceSeatNumber: number, targetSeatNumber: number, amount: number): void {
  const game = match.internalGame;
  if (game == null || amount <= 0) {
    return;
  }

  const sourceStats = getSeatSessionStats(game, sourceSeatNumber);
  const targetStats = getSeatSessionStats(game, targetSeatNumber);
  sourceStats.healingDone += amount;
  sourceStats.biggestHeal = Math.max(sourceStats.biggestHeal, amount);
  targetStats.healingReceived += amount;
}

function recordCardsPlayed(match: StoredMatchState, seatNumber: number, mode: "active" | "inactive"): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const stats = getSeatSessionStats(game, seatNumber);
  stats.cardsPlayed += 1;
  if (mode === "active") {
    stats.activeCardsPlayed += 1;
  } else {
    stats.inactiveCardsPlayed += 1;
  }
}

function recordResponseCardsPlayed(match: StoredMatchState, seatNumber: number, count: number): void {
  const game = match.internalGame;
  if (game == null || count <= 0) {
    return;
  }

  getSeatSessionStats(game, seatNumber).responseCardsPlayed += count;
}

function recordTargetedSeats(match: StoredMatchState, actorSeatNumber: number, targetSeatNumbers: number[]): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  for (const targetSeatNumber of targetSeatNumbers) {
    if (targetSeatNumber === actorSeatNumber) {
      continue;
    }

    getSeatSessionStats(game, targetSeatNumber).timesTargeted += 1;
  }
}

function recordLowestHpSurvived(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const hp = getPublicSeat(match, seatNumber).hp;
  if (hp <= 0) {
    return;
  }

  const stats = getSeatSessionStats(game, seatNumber);
  stats.lowestHpSurvived = stats.lowestHpSurvived == null
    ? hp
    : Math.min(stats.lowestHpSurvived, hp);
}

function sortBySeatNumber<T extends { seatNumber: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.seatNumber - right.seatNumber);
}

function aliveSeatNumbers(game: StoredGameState): number[] {
  return sortBySeatNumber(game.seatStates)
    .filter((seat) => seat.alive)
    .map((seat) => seat.seatNumber);
}

function clockwiseSeatNumbers(game: StoredGameState, actorSeatNumber: number): number[] {
  const alive = aliveSeatNumbers(game);
  const actorIndex = alive.indexOf(actorSeatNumber);
  if (actorIndex === -1) {
    return alive;
  }

  return [
    ...alive.slice(actorIndex + 1),
    ...alive.slice(0, actorIndex)
  ];
}

function isAttackDefinition(definition: BaseCardDefinition): boolean {
  return ATTACK_CATEGORIES.has(definition.category.code);
}

function isAttackLikeDefinition(definition: BaseCardDefinition): boolean {
  return isAttackDefinition(definition)
    || definition.id === MASS_ATTACK_STAFF_CARD_ID
    || definition.id.startsWith("robe-");
}

function targetMustHaveObjectOnTable(definition: BaseCardDefinition): boolean {
  return definition.id === "transfert-dobjets";
}

function singleOpponentTargetRequiresEligibleObject(definition: BaseCardDefinition): boolean {
  if (targetMustHaveObjectOnTable(definition)) {
    return true;
  }

  return definition.rules.effects.some((effect) =>
    (effect.type === "remove_target_object" && effect.chance == null)
    || effect.type === "steal_target_object"
  );
}

function pickBotOpponentTarget(match: StoredMatchState, actorSeatNumber: number, definition: BaseCardDefinition): number | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  const allowedObjectSlots = getAllowedObjectSlotsForDefinition(definition);
  const requiresTargetObject = singleOpponentTargetRequiresEligibleObject(definition);
  const opponents = nextLivingOpponentSeatNumbers(game, actorSeatNumber)
    .filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition));
  const eligibleOpponents = requiresTargetObject
    ? opponents.filter((seatNumber) => seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots))
    : opponents;
  if (!isAttackDefinition(definition) || Math.random() >= 0.5) {
    return pickRandom(eligibleOpponents);
  }

  const vulnerableOpponents = eligibleOpponents.filter((seatNumber) =>
    getStoredSeat(game, seatNumber).noRiposteTurnsRemaining > 0
  );
  const targetSeatNumber = pickRandom(vulnerableOpponents) ?? pickRandom(eligibleOpponents);
  if (vulnerableOpponents.length > 0 && targetSeatNumber != null) {
    appendServerDebugLog(
      match,
      "bot_ai",
      `Seat ${actorSeatNumber} biased ${definition.name} target toward unable-to-defend seat ${targetSeatNumber}`
    );
  }

  return targetSeatNumber;
}

function rollDiceNotationDetailed(notation: string): { total: number; values: number[] } {
  const match = notation.trim().toUpperCase().match(/^(\d+)D(\d+)$/);
  if (match == null) {
    throw new Error(`Unsupported roll notation: ${notation}`);
  }

  const rolls = Number(match[1]);
  const sides = Number(match[2]);
  const values: number[] = [];

  for (let index = 0; index < rolls; index += 1) {
    values.push(Math.floor(Math.random() * sides) + 1);
  }

  return {
    total: values.reduce((sum, value) => sum + value, 0),
    values
  };
}

function getRollNotationBounds(notation: string): { min: number; max: number } {
  const match = notation.trim().toUpperCase().match(/^(\d+)D(\d+)$/);
  if (match == null) {
    throw new Error(`Unsupported roll notation: ${notation}`);
  }

  const rolls = Number(match[1]);
  const sides = Number(match[2]);
  return {
    min: rolls,
    max: rolls * sides
  };
}

function classifyRollHalf(notation: string, total: number): "upper" | "lower" | "middle" {
  const bounds = getRollNotationBounds(notation);
  const midpoint = (bounds.min + bounds.max) / 2;
  if (total < midpoint) {
    return "lower";
  }

  if (total > midpoint) {
    return "upper";
  }

  return "middle";
}

function recordLuckOutcome(
  match: StoredMatchState,
  seatNumber: number,
  notation: string,
  total: number,
  highIsGood: boolean
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const stats = getSeatSessionStats(game, seatNumber);
  const half = classifyRollHalf(notation, total);
  if (half === "middle") {
    stats.neutralRolls += 1;
    return;
  }

  const favorable = highIsGood ? half === "upper" : half === "lower";
  if (favorable) {
    stats.luckyRolls += 1;
  } else {
    stats.unluckyRolls += 1;
  }
}

function appendDealerMessage(match: StoredMatchState, content: string): void {
  const createdAt = new Date().toISOString();
  const messageId = randomUUID();

  pushGameEvent(match, {
    id: messageId,
    type: "dealer_message",
    createdAt,
    content
  });
}

function pushDiceRoll(match: StoredMatchState, diceRoll: DiceRollEvent): void {
  if (match.internalGame == null) {
    return;
  }

  match.internalGame.diceRolls.push(diceRoll);
  if (match.internalGame.diceRolls.length > 20) {
    match.internalGame.diceRolls = match.internalGame.diceRolls.slice(-20);
  }
}

export function appendServerDebugLog(match: StoredMatchState, scope: string, message: string): void {
  if (match.internalGame == null) {
    return;
  }

  const entry: DebugLogEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: "server",
    scope,
    message
  };

  match.internalGame.debugLog.push(entry);
}

function pushGameEvent(match: StoredMatchState, event: GameEvent): void {
  if (match.internalGame == null) {
    return;
  }

  match.internalGame.eventLog.push(event);
}

function getGameEventSeatNumbers(event: GameEvent): number[] {
  const seatNumbers = new Set<number>();
  if ("seatNumber" in event && typeof event.seatNumber === "number") {
    seatNumbers.add(event.seatNumber);
  }
  if ("actorSeatNumber" in event && typeof event.actorSeatNumber === "number") {
    seatNumbers.add(event.actorSeatNumber);
  }
  if ("targetSeatNumber" in event && typeof event.targetSeatNumber === "number") {
    seatNumbers.add(event.targetSeatNumber);
  }
  if (event.type === "action_start") {
    for (const targetSeatNumber of event.targetSeatNumbers) {
      seatNumbers.add(targetSeatNumber);
    }
  }
  return [...seatNumbers];
}

function pushPresentationEvent(
  match: StoredMatchState,
  event: Omit<CombatPresentationEvent, "id" | "createdAt">
): void {
  if (match.internalGame == null) {
    return;
  }

  const fullEvent: CombatPresentationEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...event
  };

  match.internalGame.presentationEvents.push(fullEvent);
  if (match.internalGame.presentationEvents.length > 50) {
    match.internalGame.presentationEvents = match.internalGame.presentationEvents.slice(-50);
  }
  pushGameEvent(match, fullEvent);
  appendServerDebugLog(match, "presentation", `Queued ${fullEvent.type}${fullEvent.seatNumber != null ? ` for seat ${fullEvent.seatNumber}` : ""}${fullEvent.targetSeatNumber != null ? ` targeting seat ${fullEvent.targetSeatNumber}` : ""}${fullEvent.cardName != null ? ` on ${fullEvent.cardName}` : ""}`);
}

function publishDiceRoll(match: StoredMatchState, notation: string, total: number, values: number[]): void {
  const diceRoll: DiceRollEvent = {
    id: randomUUID(),
    seatNumber: undefined,
    notation,
    total,
    values,
    rolledAt: new Date().toISOString()
  };

  pushDiceRoll(match, diceRoll);
  pushGameEvent(match, {
    id: diceRoll.id,
    boxId: undefined,
    type: "dice_roll",
    createdAt: diceRoll.rolledAt,
    seatNumber: diceRoll.seatNumber,
    notation: diceRoll.notation,
    total: diceRoll.total,
    values: diceRoll.values
  });

  appendServerDebugLog(match, "dice", `Queued roll ${notation.toUpperCase()} => ${total}${values.length > 0 ? ` [${values.join(", ")}]` : ""}`);
}

function publishSeatDiceRoll(
  match: StoredMatchState,
  seatNumber: number,
  notation: string,
  total: number,
  values: number[],
  boxId?: string
): void {
  const diceRoll: DiceRollEvent = {
    id: randomUUID(),
    seatNumber,
    notation,
    total,
    values,
    rolledAt: new Date().toISOString()
  };

  pushDiceRoll(match, diceRoll);
  pushGameEvent(match, {
    id: diceRoll.id,
    boxId,
    type: "dice_roll",
    createdAt: diceRoll.rolledAt,
    seatNumber: diceRoll.seatNumber,
    notation: diceRoll.notation,
    total: diceRoll.total,
    values: diceRoll.values
  });

  appendServerDebugLog(match, "dice", `Queued roll ${notation.toUpperCase()} for seat ${seatNumber} => ${total}${values.length > 0 ? ` [${values.join(", ")}]` : ""}`);
}

function reshuffleDiscardIntoDeck(match: StoredMatchState, game: StoredGameState): void {
  if (game.discardPile.length === 0) {
    return;
  }

  game.deck = shuffle(game.discardPile);
  game.discardPile = [];
  appendDealerMessage(match, "Dealer reshuffled the discard pile into the deck.");
}

function drawCards(match: StoredMatchState, seatNumber: number, count: number): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("Game not initialized");
  }

  const seat = getStoredSeat(game, seatNumber);
  for (let drawn = 0; drawn < count; drawn += 1) {
    if (game.deck.length === 0) {
      reshuffleDiscardIntoDeck(match, game);
    }

    const nextCard = game.deck.shift();
    if (nextCard == null) {
      return;
    }

    seat.hand.push(nextCard);
    appendServerDebugLog(
      match,
      "draw",
      `Seat ${seatNumber} drew ${requireDefinition(nextCard.cardId).name} (${seat.hand.length} cards in hand)`
    );
  }
}

function discardInstances(game: StoredGameState, instances: StoredCardInstance[]): void {
  game.discardPile.push(...flattenStoredCardInstances(instances));
}

function clonePlayCardRequest(request: PlayCardRequest): PlayCardRequest {
  return {
    cardInstanceId: request.cardInstanceId,
    mode: request.mode,
    targetSeatNumber: request.targetSeatNumber,
    targetObjectInstanceId: request.targetObjectInstanceId
  };
}

function isViergeReplayableDefinition(definition: BaseCardDefinition): boolean {
  return definition.id !== "vierge" && definition.category.code !== "CA" && definition.category.code !== "O";
}

function buildRecordedActivePlayRequest(
  cardInstanceId: string,
  targets: CardTargetMode,
  targetSeatNumbers: number[],
  targetObjectInstanceId?: string
): PlayCardRequest {
  const request: PlayCardRequest = {
    cardInstanceId,
    mode: "active"
  };

  if (targetObjectInstanceId != null && (targets === "target_object" || targets === "single_player_or_object")) {
    request.targetObjectInstanceId = targetObjectInstanceId;
  } else if (
    targets === "single_opponent"
    || targets === "self_or_single_opponent"
    || targets === "single_player_or_object"
  ) {
    request.targetSeatNumber = targetSeatNumbers[0];
  }

  return request;
}

function rememberViergeReplaySource(
  game: StoredGameState,
  definition: BaseCardDefinition,
  request: PlayCardRequest
): void {
  if (!isViergeReplayableDefinition(definition) || request.mode !== "active") {
    return;
  }

  game.lastViergeReplay = {
    cardId: definition.id,
    request: clonePlayCardRequest(request)
  };
}

function rememberViergeReplaySourceFromPendingAction(
  game: StoredGameState,
  pendingAction: StoredPendingActionState,
  definition: BaseCardDefinition
): void {
  if (pendingAction.skipStoredCardResolution === true || pendingAction.sourceZone === "object") {
    return;
  }

  rememberViergeReplaySource(
    game,
    definition,
    buildRecordedActivePlayRequest(
      pendingAction.storedCard.instanceId,
      definition.rules.targets,
      pendingAction.targetSeatNumbers,
      pendingAction.targetObjectInstanceId
    )
  );
}

function discardPlayedCardToTalon(
  game: StoredGameState,
  card: StoredCardInstance,
  definition: BaseCardDefinition,
  request: PlayCardRequest
): void {
  game.discardPile.push(card);
  rememberViergeReplaySource(game, definition, request);
}

function nextLivingOpponentSeatNumbers(game: StoredGameState, actorSeatNumber: number): number[] {
  return clockwiseSeatNumbers(game, actorSeatNumber).filter((seatNumber) => seatNumber !== actorSeatNumber);
}

function getLeftOpponentSeatNumber(game: StoredGameState, actorSeatNumber: number): number | undefined {
  const alive = aliveSeatNumbers(game);
  const index = alive.indexOf(actorSeatNumber);
  if (index === -1 || alive.length < 2) {
    return undefined;
  }

  return alive[(index + 1) % alive.length];
}

function listTargetableObjectOwners(
  game: StoredGameState,
  actorSeatNumber: number,
  sourceDefinition?: BaseCardDefinition
): number[] {
  const ignoreAttackImmunity = sourceDefinition?.id === ORDRE_DEMMERLAUS_CARD_ID;
  return sortBySeatNumber(game.seatStates)
    .filter((seat) =>
      seat.seatNumber !== actorSeatNumber
      && seat.alive
      && (ignoreAttackImmunity || seat.attackImmunityTurns === 0)
      && seat.objects.some((card) => requireDefinition(card.cardId).category.code === "O")
    )
    .map((seat) => seat.seatNumber);
}

function getAllowedObjectSlotsForDefinition(definition: BaseCardDefinition): string[] | undefined {
  for (const effect of definition.rules.effects) {
    if (effect.type === "remove_target_object" || effect.type === "steal_target_object") {
      return effect.allowedSlots;
    }
  }

  return undefined;
}

function objectMatchesAllowedSlots(cardId: string, allowedSlots?: string[]): boolean {
  if (allowedSlots == null || allowedSlots.length === 0) {
    return true;
  }

  return allowedSlots.includes(getObjectSlot(requireDefinition(cardId).name));
}

function seatHasEligibleTargetObject(
  game: StoredGameState,
  seatNumber: number,
  allowedSlots?: string[]
): boolean {
  return getStoredSeat(game, seatNumber).objects.some((objectCard) =>
    requireDefinition(objectCard.cardId).category.code === "O"
    && objectMatchesAllowedSlots(objectCard.cardId, allowedSlots)
  );
}

function evaluateRoll(
  match: StoredMatchState,
  expression: RollExpression,
  actorSeat: SeatState,
  targetSeat?: SeatState,
  rollerSeatNumber?: number,
  boxId?: string,
  statRollContext?: StatRollContext
): number {
  switch (expression.kind) {
    case "dice": {
      const roll = rollDiceNotationDetailed(expression.notation);
      if (rollerSeatNumber != null) {
        publishSeatDiceRoll(match, rollerSeatNumber, expression.notation, roll.total, roll.values, boxId);
      } else {
        publishDiceRoll(match, expression.notation, roll.total, roll.values);
      }
      if (statRollContext != null) {
        recordLuckOutcome(match, statRollContext.seatNumber, expression.notation, roll.total, statRollContext.highIsGood);
      }
      const base = roll.total;
      if (expression.scaleBy === "power") {
        return base + actorSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      if (expression.scaleBy === "target_power" && targetSeat != null) {
        return base + targetSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      if (expression.scaleBy === "multiply_power") {
        return base * Math.max(0, actorSeat.powerLevel! + (expression.powerBonus ?? 0));
      }

      if (expression.scaleBy === "multiply_target_power" && targetSeat != null) {
        return base * Math.max(0, targetSeat.powerLevel! + (expression.powerBonus ?? 0));
      }

      return base;
    }
    case "dice_per_power": {
      const sourceSeat = expression.powerSource === "target" ? targetSeat : actorSeat;
      const effectivePower = Math.max(0, (sourceSeat?.powerLevel ?? 0) + (expression.powerBonus ?? 0));
      if (effectivePower === 0) {
        return 0;
      }

      const diceMatch = expression.notation.trim().toUpperCase().match(/^(\d+)D(\d+)$/);
      if (diceMatch == null) {
        throw new Error(`Unsupported roll notation: ${expression.notation}`);
      }

      const notation = `${Number(diceMatch[1]) * effectivePower}D${Number(diceMatch[2])}`;
      const roll = rollDiceNotationDetailed(notation);
      if (rollerSeatNumber != null) {
        publishSeatDiceRoll(match, rollerSeatNumber, notation, roll.total, roll.values, boxId);
      } else {
        publishDiceRoll(match, notation, roll.total, roll.values);
      }
      if (statRollContext != null) {
        recordLuckOutcome(match, statRollContext.seatNumber, notation, roll.total, statRollContext.highIsGood);
      }

      return roll.total;
    }
    case "fixed":
      if (expression.scaleBy === "power") {
        return expression.amount + actorSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      if (expression.scaleBy === "target_power" && targetSeat != null) {
        return expression.amount + targetSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      if (expression.scaleBy === "multiply_power") {
        return expression.amount * Math.max(0, actorSeat.powerLevel! + (expression.powerBonus ?? 0));
      }

      if (expression.scaleBy === "multiply_target_power" && targetSeat != null) {
        return expression.amount * Math.max(0, targetSeat.powerLevel! + (expression.powerBonus ?? 0));
      }

      return expression.amount;
    case "current_hp_fraction":
      return Math.max(1, Math.ceil((targetSeat?.hp ?? 0) * expression.numerator / expression.denominator));
    case "sacrifice_amount":
      return actorSeat.hp * (expression.multiplier ?? 1);
    case "total_active_players_times":
      return expression.amount * (match.internalGame == null ? 0 : aliveSeatNumbers(match.internalGame).length);
  }
}

function resolveChosenSacrificeDamageAmount(chosenAmount: number, expression: Extract<RollExpression, { kind: "sacrifice_amount" }>): number {
  return chosenAmount * (expression.multiplier ?? 1);
}

function isTargetDependentRollExpression(expression: RollExpression): boolean {
  if (expression.kind === "current_hp_fraction") {
    return true;
  }

  if (expression.kind === "dice_per_power" && expression.powerSource === "target") {
    return true;
  }

  return "scaleBy" in expression && (
    expression.scaleBy === "target_power" ||
    expression.scaleBy === "multiply_target_power"
  );
}

function effectAllowsHalfOnSuccessfulResistance(
  definition: BaseCardDefinition,
  effect: Extract<CardEffect, { type: "damage" | "lifesteal" }>
): boolean {
  return definition.defenseBand?.resistance.color === "yellow"
    || (effect.type === "damage" && effect.grantsHalfDamageOnResistance === true);
}

function effectMayApplyHpLossAfterResistance(
  definition: BaseCardDefinition,
  effect: Extract<CardEffect, { type: "damage" | "lifesteal" }>,
  resisted: boolean
): boolean {
  return !resisted || effectAllowsHalfOnSuccessfulResistance(definition, effect);
}

function adjustHpLossAmountForResistance(
  definition: BaseCardDefinition,
  effect: Extract<CardEffect, { type: "damage" | "lifesteal" }>,
  baseAmount: number,
  resisted: boolean,
  criticalSuccess: boolean,
  fatalFailure: boolean
): number {
  let amount = baseAmount;

  if (resisted) {
    if (criticalSuccess) {
      amount = 0;
    } else if (effectAllowsHalfOnSuccessfulResistance(definition, effect)) {
      amount = Math.max(1, Math.ceil(amount / 2));
    } else {
      amount = 0;
    }
  }

  if (fatalFailure) {
    amount *= 2;
  }

  return amount;
}

function computePowerLevel(match: StoredMatchState, seatNumber: number): number {
  const game = match.internalGame;
  if (game == null) {
    return 1;
  }

  const storedSeat = getStoredSeat(game, seatNumber);
  let modifier = 0;

  for (const objectInstance of storedSeat.objects) {
    const definition = requireDefinition(objectInstance.cardId);
    for (const effect of definition.rules.effects) {
      if (effect.type === "power_modifier") {
        modifier += effect.amount;
      }
    }
  }

  return 1 + modifier;
}

function getActiveTimedPotionStatuses(seatState: StoredSeatState): StoredSeatStatus[] {
  return seatState.statuses.filter(
    (status) => TIMED_POTION_STATUS_BY_CARD_ID[status.cardId] != null
      && status.activatesNextTurn !== true
      && (status.remainingTurnTriggers ?? 0) > 0
  );
}

function hasTimedPotionAttackImmunity(seatState: StoredSeatState): boolean {
  return seatState.statuses.some(
    (status) =>
      TIMED_POTION_STATUS_BY_CARD_ID[status.cardId]?.grantsAttackImmunity === true
      && (status.remainingTurnTriggers ?? 0) > 0
  );
}

function getTimedPotionDamageMultiplier(match: StoredMatchState, actorSeatNumber: number): number {
  const game = match.internalGame;
  if (game == null) {
    return 1;
  }

  return getActiveTimedPotionStatuses(getStoredSeat(game, actorSeatNumber)).reduce((multiplier, status) => {
    const statusMultiplier = TIMED_POTION_STATUS_BY_CARD_ID[status.cardId]?.damageMultiplier ?? 1;
    return Math.max(multiplier, statusMultiplier);
  }, 1);
}

function hasActiveTotalPowerOverrideStatus(seatState: StoredSeatState): boolean {
  return seatState.statuses.some(
    (status) =>
      TOTAL_POWER_OVERRIDE_STATUS_CARD_IDS.has(status.cardId)
      && status.activatesNextTurn !== true
      && (status.remainingTurnTriggers ?? 0) > 0
  );
}

function usesTotalAlivePowerForAction(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceDefinition: BaseCardDefinition,
  sourceZone: "hand" | "object" = "hand"
): boolean {
  const game = match.internalGame;
  if (game == null || sourceZone !== "hand" || sourceDefinition.category.code === "E") {
    return false;
  }

  const extraPlayMode = getActiveExtraPlayMode(match, actorSeatNumber);
  if (
    extraPlayMode?.useTotalAlivePower === true
    && (extraPlayMode.allowedCategories === "any" || extraPlayMode.allowedCategories.includes(sourceDefinition.category.code))
  ) {
    return true;
  }

  return hasActiveTotalPowerOverrideStatus(getStoredSeat(game, actorSeatNumber));
}

function getTotalAlivePowerLevel(match: StoredMatchState): number {
  const game = match.internalGame;
  if (game == null) {
    return 0;
  }

  return aliveSeatNumbers(game)
    .map((seatNumber) => getPublicSeat(match, seatNumber).powerLevel ?? 1)
    .reduce((sum, powerLevel) => sum + powerLevel, 0);
}

function getTemporaryActionPowerBonus(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceDefinition: BaseCardDefinition,
  sourceZone: "hand" | "object" = "hand"
): number {
  const game = match.internalGame;
  if (
    game == null
    || sourceZone !== "hand"
    || (sourceDefinition.category.code !== "AD" && sourceDefinition.category.code !== "AM")
  ) {
    return 0;
  }

  const actorState = getStoredSeat(game, actorSeatNumber);
  let bonus = 0;
  for (const objectInstance of actorState.objects) {
    if (objectInstance.cardId === "ceinture-de-force-3") {
      bonus += 3;
    } else if (objectInstance.cardId === "ceinture-de-force-2") {
      bonus += 2;
    }
  }

  for (const statusInstance of actorState.statuses) {
    if (statusInstance.cardId === "pacte-tenebreux") {
      bonus += 2;
    }
  }

  const extraPlayMode = getActiveExtraPlayMode(match, actorSeatNumber);
  if (
    extraPlayMode != null
    && extraPlayMode.temporaryPowerBonus !== 0
    && (extraPlayMode.allowedCategories === "any" || extraPlayMode.allowedCategories.includes(sourceDefinition.category.code))
  ) {
    bonus += extraPlayMode.temporaryPowerBonus;
  }

  return bonus;
}

function getActorSeatForAction(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceDefinition: BaseCardDefinition,
  sourceZone: "hand" | "object" = "hand"
): SeatState {
  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const powerBonus = getTemporaryActionPowerBonus(match, actorSeatNumber, sourceDefinition, sourceZone);
  const totalAlivePowerOverride = usesTotalAlivePowerForAction(match, actorSeatNumber, sourceDefinition, sourceZone)
    ? getTotalAlivePowerLevel(match)
    : undefined;
  if (powerBonus === 0 && totalAlivePowerOverride == null) {
    return actorSeat;
  }

  return {
    ...actorSeat,
    powerLevel: (totalAlivePowerOverride ?? actorSeat.powerLevel ?? 1) + powerBonus
  };
}

function resolveSuccessfulHitDamageContext(
  match: StoredMatchState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  sourceZone: "hand" | "object",
  targetSeatNumber: number,
  boxId?: string
): SuccessfulHitDamageContext {
  const baseActorSeat = getActorSeatForAction(match, actorSeatNumber, definition, sourceZone);
  const timedPotionDamageMultiplier = getTimedPotionDamageMultiplier(match, actorSeatNumber);
  const config = SUCCESSFUL_HIT_DAMAGE_MODIFIER_BY_CARD_ID[definition.id];
  if (config == null) {
    return {
      actorSeat: baseActorSeat,
      damageMultiplier: timedPotionDamageMultiplier
    };
  }

  const triggerRoll = rollDiceNotationDetailed(config.triggerNotation);
  publishSeatDiceRoll(match, actorSeatNumber, config.triggerNotation, triggerRoll.total, triggerRoll.values, boxId);
  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} rolled ${config.triggerNotation} => ${triggerRoll.total} after hitting seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );

  if (!config.successTotals.includes(triggerRoll.total)) {
    return {
      actorSeat: baseActorSeat,
      damageMultiplier: timedPotionDamageMultiplier
    };
  }

  if (config.mode === "use_total_player_power") {
    const totalAlivePowerLevel = getTotalAlivePowerLevel(match);
    appendDealerMessage(
      match,
      `${getPublicSeat(match, actorSeatNumber).displayName}'s ${definition.name} uses the total power of all living players (${totalAlivePowerLevel}).`
    );
    appendServerDebugLog(
      match,
      "effect",
      `${definition.name} switched to total alive power ${totalAlivePowerLevel} after hitting seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
    );

    return {
      actorSeat: {
        ...baseActorSeat,
        powerLevel: totalAlivePowerLevel
      },
      damageMultiplier: timedPotionDamageMultiplier
    };
  }

  if (config.mode === "multiply_damage") {
    const damageMultiplier = Math.max(1, config.damageMultiplier ?? 1);
    appendDealerMessage(
      match,
      `${getPublicSeat(match, actorSeatNumber).displayName}'s ${definition.name} deals ${damageMultiplier}x damage.`
    );
    appendServerDebugLog(
      match,
      "effect",
      `${definition.name} switched to ${damageMultiplier}x damage after hitting seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
    );

    return {
      actorSeat: baseActorSeat,
      damageMultiplier: timedPotionDamageMultiplier * damageMultiplier
    };
  }

  return {
    actorSeat: baseActorSeat,
    damageMultiplier: timedPotionDamageMultiplier
  };
}

function getSeatHpCap(match: StoredMatchState, seatNumber: number): number | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  const storedSeat = getStoredSeat(game, seatNumber);
  let cap: number | undefined;

  for (const status of storedSeat.statuses) {
    if (status.cardId === "limite-de-30-points-de-vie") {
      cap = cap == null ? 30 : Math.min(cap, 30);
    }
  }

  return cap;
}

function setSeatHp(match: StoredMatchState, seatNumber: number, nextHp: number): { previousHp: number; nextHp: number; delta: number } {
  const seat = getPublicSeat(match, seatNumber);
  const previousHp = seat.hp;
  const hpCap = getSeatHpCap(match, seatNumber);
  const clampedHp = hpCap == null ? nextHp : Math.min(nextHp, hpCap);
  seat.hp = clampedHp;
  return {
    previousHp,
    nextHp: clampedHp,
    delta: clampedHp - previousHp
  };
}

function refreshSeatSummaries(match: StoredMatchState): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  syncObjectOwnershipStats(match);
  for (const seat of match.seats) {
    const storedSeat = getStoredSeat(game, seat.seatNumber);
    seat.handCount = storedSeat.hand.length;
    seat.isAlive = storedSeat.alive;
    seat.hp = storedSeat.alive ? seat.hp : 0;
    seat.powerLevel = computePowerLevel(match, seat.seatNumber);
  }
}

function buildCardView(
  instance: StoredCardInstance | StoredSeatStatus,
  definition: BaseCardDefinition,
  zone: CardView["zone"],
  canPlay: boolean,
  disabledReason?: string
): CardView {
  return {
    instanceId: instance.instanceId,
    cardId: definition.id,
    name: definition.name,
    description: definition.description,
    imageUrl: publicImageUrl(definition.image.importedAssetPath),
    categoryCode: definition.category.code,
    categoryLabel: definition.category.label,
    selectionMode: definition.rules.selectionMode,
    targets: definition.rules.targets,
    defenseBand: definition.defenseBand,
    attachedCardCount: "attachedCards" in instance ? instance.attachedCards?.length ?? 0 : undefined,
    remainingTurnTriggers: "remainingTurnTriggers" in instance ? instance.remainingTurnTriggers : undefined,
    canPlay,
    disabledReason,
    zone
  };
}

function getRequiredFollowUpCategory(definition: BaseCardDefinition): CardCategoryCode | undefined {
  switch (definition.id) {
    case "ad-points-de-vie":
      return "AD";
    case "ca-points-de-vie":
      return "CA";
    default:
      return undefined;
  }
}

function getRequiredExtraPlayStarterCategory(definition: BaseCardDefinition): CardCategoryCode | undefined {
  switch (definition.id) {
    case "masse-double":
      return "AM";
    case "double-attaque":
      return "AD";
    default:
      return undefined;
  }
}

function requiresAnyOtherCardInHandForExtraPlay(definition: BaseCardDefinition): boolean {
  return definition.id.startsWith("resistance-diminuee-");
}

function getResistanceDiminueePenalty(definitionId: string): number {
  switch (definitionId) {
    case "resistance-diminuee-1":
      return -1;
    case "resistance-diminuee-2":
      return -2;
    case "resistance-diminuee-3":
      return -3;
    case "resistance-diminuee-4":
      return -4;
    default:
      return 0;
  }
}

function resolveFollowUpCategoryHeal(
  match: StoredMatchState,
  sourceDefinition: BaseCardDefinition,
  followUpCard: StoredCardInstance,
  actorSeatNumber: number,
  boxId?: string
): number {
  if (sourceDefinition.id === "ca-points-de-vie") {
    return 25;
  }

  if (sourceDefinition.id !== "ad-points-de-vie") {
    return 0;
  }

  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const followUpDefinition = requireDefinition(followUpCard.cardId);
  const damageEffects = followUpDefinition.rules.effects.filter(
    (effect): effect is Extract<CardEffect, { type: "damage" }> => effect.type === "damage"
  );
  if (damageEffects.length === 0) {
    return 0;
  }

  let totalHeal = 0;
  for (const effect of damageEffects) {
    let healAmount = evaluateRoll(match, effect.amount, actorSeat, undefined, actorSeatNumber, boxId, {
      seatNumber: actorSeatNumber,
      highIsGood: true
    });
    const usesPowerLevel =
      effect.amount.kind === "dice_per_power"
      || ("scaleBy" in effect.amount && (effect.amount.scaleBy === "power" || effect.amount.scaleBy === "multiply_power"));
    if (!usesPowerLevel) {
      healAmount *= 2;
    }
    totalHeal += healAmount;
  }

  return totalHeal;
}

function consumeHandCardByCategory(source: StoredCardInstance[], categoryCode: CardCategoryCode): StoredCardInstance {
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const candidate = source[index];
    if (candidate == null || requireDefinition(candidate.cardId).category.code !== categoryCode) {
      continue;
    }

    return source.splice(index, 1)[0]!;
  }

  throw new Error(`Missing required ${categoryCode} card`);
}

function getSeatMassAttackStaff(seat: StoredSeatState, instanceId?: string): StoredCardInstance | undefined {
  return seat.objects.find((card) =>
    card.cardId === MASS_ATTACK_STAFF_CARD_ID && (instanceId == null || card.instanceId === instanceId)
  );
}

function getMassAttackStaffLoadedCount(card: StoredCardInstance): number {
  return card.attachedCards?.length ?? 0;
}

function rollMassAttackStaffDamage(
  match: StoredMatchState,
  actorSeatNumber: number,
  staffCard: StoredCardInstance,
  boxId?: string
): number {
  const notation = `${Math.max(1, 1 + getMassAttackStaffLoadedCount(staffCard))}D6`;
  const roll = rollDiceNotationDetailed(notation);
  publishSeatDiceRoll(match, actorSeatNumber, notation, roll.total, roll.values, boxId);
  return roll.total;
}

function isAbundanceTurn(match: StoredMatchState, seatNumber: number): boolean {
  return (
    match.internalGame?.currentTurnSeatNumber === seatNumber
    && match.internalGame.forcedPlayCategories != null
    && match.internalGame.forcedPlayCategories !== "any"
    && match.internalGame.forcedPlayCategories.length === ABUNDANCE_ALLOWED_CATEGORIES.length
    && ABUNDANCE_ALLOWED_CATEGORIES.every((category) => match.internalGame?.forcedPlayCategories?.includes(category))
  );
}

function getActiveExtraPlayMode(match: StoredMatchState, actorSeatNumber: number) {
  const game = match.internalGame;
  if (game?.extraPlayMode?.actorSeatNumber !== actorSeatNumber) {
    return undefined;
  }

  return game.extraPlayMode;
}

function autoSkipOptionalExtraPlayIfUnavailable(match: StoredMatchState, actorSeatNumber: number): void {
  const game = match.internalGame;
  const extraPlayMode = getActiveExtraPlayMode(match, actorSeatNumber);
  if (game == null || extraPlayMode == null || extraPlayMode.requiredActivePlaysRemaining > 0) {
    return;
  }

  const actorState = getStoredSeat(game, actorSeatNumber);
  const hasEligibleFollowUp = actorState.hand.some((card) =>
    extraPlayMode.allowedCategories === "any"
    || extraPlayMode.allowedCategories.includes(requireDefinition(card.cardId).category.code)
  );
  if (hasEligibleFollowUp) {
    return;
  }

  actorState.pendingExtraPlays = 0;
  game.extraPlayMode = undefined;
  appendServerDebugLog(
    match,
    "turn",
    `Seat ${actorSeatNumber} has no remaining eligible follow-up for ${requireDefinition(extraPlayMode.sourceCardId).name}; optional extra play skipped`
  );
}

function isResistanceDiminueeCard(cardId: string): boolean {
  return cardId.startsWith("resistance-diminuee-");
}

function allowsNormalResistance(definition: BaseCardDefinition): boolean {
  return definition.rules.requiresResistanceCheck && definition.defenseBand?.resistance.color !== "red";
}

function hasPlayableResistanceReductionFollowUp(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceCardInstanceId: string
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const actorSeat = getStoredSeat(game, actorSeatNumber);
  return actorSeat.hand.some((handCard) => {
    if (handCard.instanceId === sourceCardInstanceId) {
      return false;
    }

    const definition = requireDefinition(handCard.cardId);
    if (!allowsNormalResistance(definition)) {
      return false;
    }

    return canPlayCardActively(match, actorSeatNumber, handCard).canPlay;
  });
}

function canPlayCardActively(match: StoredMatchState, actorSeatNumber: number, card: StoredCardInstance): { canPlay: boolean; reason?: string } {
  const game = match.internalGame;
  if (game == null) {
    return { canPlay: false, reason: "Game not started" };
  }

  if (
    game.pendingAction != null
    || game.pendingObjectChoice != null
    || game.pendingHandInspection != null
    || game.pendingPublicHandReveal != null
    || game.pendingBoardResetKeep != null
    || game.pendingDeathSearch != null
    || game.pendingPickpocket != null
    || game.pendingSacrificeChoice != null
    || game.pendingCurseRelease != null
  ) {
    return { canPlay: false, reason: "Resolve the current action first" };
  }

  if (game.currentTurnSeatNumber !== actorSeatNumber && game.forcedFollowUp?.actorSeatNumber !== actorSeatNumber) {
    return { canPlay: false, reason: "Wait for your turn" };
  }

  const actorSeat = getStoredSeat(game, actorSeatNumber);
  if (!actorSeat.alive) {
    return { canPlay: false, reason: "Dead players cannot act" };
  }

  const definition = requireDefinition(card.cardId);
  if (definition.id === "fouille-de-mort") {
    return { canPlay: false, reason: "This card triggers automatically when an opponent dies" };
  }

  if (definition.id === "appel-de-la-mort" && (getActorSeatForAction(match, actorSeatNumber, definition).powerLevel ?? 1) < 4) {
    return { canPlay: false, reason: "Appel de la mort requires at least 4 power" };
  }

  if (
    (definition.id === "corruption-dun-anneau" || definition.id === "transformation-energetique-dun-anneau")
    && getEquippedPowerRings(actorSeat).length === 0
  ) {
    return { canPlay: false, reason: "This card requires an equipped power ring" };
  }

  if (
    definition.id === "puissance-totale"
    && !actorSeat.hand.some(
      (handCard) => handCard.instanceId !== card.instanceId && ["A", "AD", "AM"].includes(requireDefinition(handCard.cardId).category.code)
    )
  ) {
    return { canPlay: false, reason: "Puissance totale requires an A/AD/AM card in hand" };
  }

  if (definition.id === "vierge" && game.lastViergeReplay == null) {
    return { canPlay: false, reason: "Vierge requires an eligible non-CA/non-O card in the talon" };
  }

  if (
    game.forcedPlayCategories != null
    && game.forcedPlayCategories !== "any"
    && !game.forcedPlayCategories.includes(definition.category.code)
  ) {
    return { canPlay: false, reason: "Only A, AD, and AM cards can be actively played this turn" };
  }

  const extraPlayMode = getActiveExtraPlayMode(match, actorSeatNumber);
  if (
    extraPlayMode != null
    && extraPlayMode.allowedCategories !== "any"
    && !extraPlayMode.allowedCategories.includes(definition.category.code)
  ) {
    return {
      canPlay: false,
      reason: `Only ${extraPlayMode.allowedCategories.join("/")} cards can be actively played for ${requireDefinition(extraPlayMode.sourceCardId).name}`
    };
  }

  const requiredFollowUpCategory = getRequiredFollowUpCategory(definition);
  const requiredExtraPlayStarterCategory = getRequiredExtraPlayStarterCategory(definition);
  const allowedObjectSlots = getAllowedObjectSlotsForDefinition(definition);
  const requiresTargetObject = singleOpponentTargetRequiresEligibleObject(definition);
  const livingOpponents = nextLivingOpponentSeatNumbers(game, actorSeatNumber);
  const attackableOpponents = livingOpponents.filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition));
  const attackableOpponentsWithObjects = attackableOpponents.filter((seatNumber) => getStoredSeat(game, seatNumber).objects.length > 0);
  const opponentsWithEligibleObjects = livingOpponents.filter((seatNumber) =>
    seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
  );
  if (game.forcedFollowUp != null) {
    if (game.forcedFollowUp.actorSeatNumber !== actorSeatNumber) {
      return { canPlay: false, reason: "Waiting for the forced follow-up" };
    }

    if (!game.forcedFollowUp.allowedCategories.includes(definition.category.code)) {
      const categories = game.forcedFollowUp.allowedCategories.join("/");
      const reason = game.forcedFollowUp.consumeMode === true
        ? `${requireDefinition(game.forcedFollowUp.sourceCardId).name} requires a ${categories} card to consume`
        : `Colère du magicien requires an AD card`;
      return { canPlay: false, reason };
    }

    if (game.forcedFollowUp.consumeMode !== true && definition.rules.targets !== "single_opponent") {
      return { canPlay: false, reason: "This forced follow-up must target the paralyzed opponent" };
    }
  }

  if (definition.category.code === "CA") {
    return { canPlay: false, reason: "Counter cards are only used as reactions" };
  }

  if (
    requiredFollowUpCategory != null
    && !actorSeat.hand.some((handCard) => requireDefinition(handCard.cardId).category.code === requiredFollowUpCategory)
  ) {
    return { canPlay: false, reason: `This card requires a ${requiredFollowUpCategory} card in hand` };
  }

  if (
    requiredExtraPlayStarterCategory != null
    && !actorSeat.hand.some((handCard) => handCard.instanceId !== card.instanceId && requireDefinition(handCard.cardId).category.code === requiredExtraPlayStarterCategory)
  ) {
    return { canPlay: false, reason: `This card requires a ${requiredExtraPlayStarterCategory} card in hand` };
  }

  if (
    requiresAnyOtherCardInHandForExtraPlay(definition)
    && !actorSeat.hand.some((handCard) => handCard.instanceId !== card.instanceId)
  ) {
    return { canPlay: false, reason: "This card requires another card in hand" };
  }

  if (
    isResistanceDiminueeCard(definition.id)
    && !hasPlayableResistanceReductionFollowUp(match, actorSeatNumber, card.instanceId)
  ) {
    return { canPlay: false, reason: "This card requires a follow-up card that allows resistance" };
  }

  if (definition.category.code === "AM" && extraPlayMode == null && getSeatMassAttackStaff(actorSeat) != null) {
    return { canPlay: true };
  }

  switch (definition.rules.targets) {
    case "self":
    case "none":
      return { canPlay: true };
    case "all_opponents":
      return attackableOpponents.length > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid opponent target" };
    case "single_opponent":
      if (requiresTargetObject) {
        return opponentsWithEligibleObjects.length > 0
          ? { canPlay: true }
          : { canPlay: false, reason: "No valid opponent target" };
      }
      if (targetMustHaveObjectOnTable(definition)) {
        return attackableOpponentsWithObjects.length > 0
          ? { canPlay: true }
          : { canPlay: false, reason: "The target opponent must have at least one object on the table" };
      }
      return attackableOpponents.length > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid opponent target" };
    case "self_or_single_opponent":
      return attackableOpponents.length > 0 || actorSeat.alive
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid target" };
    case "left_opponent":
      {
        const leftOpponentSeatNumber = getLeftOpponentSeatNumber(game, actorSeatNumber);
        if (leftOpponentSeatNumber == null) {
          return { canPlay: false, reason: "No left opponent available" };
        }

        if (isProtectedFromAttack(match, leftOpponentSeatNumber, definition)) {
          return { canPlay: false, reason: "The left opponent is protected right now" };
        }

        return { canPlay: true };
      }
    case "target_object":
      return listTargetableObjectOwners(game, actorSeatNumber, definition).some((seatNumber) =>
        seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
      )
        ? { canPlay: true }
        : { canPlay: false, reason: "No target object available" };
    case "single_player_or_object":
      return attackableOpponents.length > 0 || listTargetableObjectOwners(game, actorSeatNumber, definition).some((seatNumber) =>
        seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
      )
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid target" };
    default:
      return { canPlay: false, reason: "Unsupported target mode" };
  }
}

function isTemporalStopTurnActiveForActor(match: StoredMatchState, actorSeatNumber: number): boolean {
  return match.internalGame?.temporalStopActiveSeatNumber === actorSeatNumber;
}

function isTemporalStopResponseSuppressed(
  match: StoredMatchState,
  pendingAction: StoredPendingActionState,
  responderSeatNumber: number
): boolean {
  return (
    isTemporalStopTurnActiveForActor(match, pendingAction.actorSeatNumber)
    && responderSeatNumber !== pendingAction.actorSeatNumber
  );
}

function getPendingResponder(game: StoredGameState, seatNumber: number): StoredPendingActionResponderState | undefined {
  return game.pendingAction?.responders.find((responder) => responder.seatNumber === seatNumber);
}

function getResponseOptionChoices(match: StoredMatchState, seatNumber: number): PendingActionOption[] {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return [];
  }
  const pendingDefinition = requireDefinition(pendingAction.storedCard.cardId);

  const responder = getPendingResponder(game, seatNumber);
  if (responder == null || responder.state !== "pending") {
    return [];
  }

  if (game.pendingSacrificeChoice != null) {
    return [];
  }

  const currentResponder = getCurrentPendingResponder(pendingAction);
  if (currentResponder?.seatNumber !== seatNumber) {
    return [];
  }

  const seatState = getStoredSeat(game, seatNumber);
  const hasMiroir = seatState.hand.some((card) => card.cardId === "miroir");
  const hasOrdreDemmerlaus = seatState.hand.some((card) => card.cardId === ORDRE_DEMMERLAUS_CARD_ID);
  const temporalStopSuppressed = isTemporalStopResponseSuppressed(match, pendingAction, seatNumber);
  if (
    seatState.noRiposteTurnsRemaining > 0 &&
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    isAttackLikeDefinition(pendingDefinition)
  ) {
    return [
      {
        choice: "pass",
        label: "Pass",
        description: "This seat cannot respond to attacks right now."
      }
    ];
  }

  // During a mirror chain: only mirror-back or accept the hit — no other defenses
  if (pendingAction.fromMirror === true) {
    const options: PendingActionOption[] = [
      { choice: "pass", label: "Pass", description: "Accept the reflected damage." }
    ];
    if (hasOrdreDemmerlaus) {
      options.push({
        choice: "ordre-demmerlaus",
        label: "Use Ordre d'Emmerlaus",
        description: "Cancel this reflected action, even though it is outside the normal defense rules."
      });
    }
    if (hasMiroir) {
      options.push({ choice: "mirror", label: "Mirror", description: "Reflect it back again." });
    }
    return options;
  }

  const annulations = seatState.hand.filter((card) => card.cardId === "annulation");
  const options: PendingActionOption[] = [
    {
      choice: "pass",
      label: "Pass",
      description: "Do not play a defense card. A normal resistance roll still happens if allowed."
    }
  ];

  if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    pendingDefinition.rules.requiresResistanceCheck &&
    pendingDefinition.defenseBand != null &&
    pendingDefinition.defenseBand.resistance.color !== "red" &&
    !temporalStopSuppressed
  ) {
    options[0] = {
      choice: "pass",
      label: "Pass",
      description: "Do not play a defense card. Resolve the normal resistance roll."
    };
  } else if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    temporalStopSuppressed &&
    pendingDefinition.rules.requiresResistanceCheck
  ) {
    options[0] = {
      choice: "pass",
      label: "Pass",
      description: "Do not play a defense card. Resistance is suppressed during this stopped-time turn."
    };
  }

  if (
    pendingDefinition.defenseBand?.annulationAllowed &&
    annulations.length >= (pendingAction.responseMode === "collective" ? 1 : pendingDefinition.defenseBand.annulationCardsRequired)
  ) {
    options.push({
      choice: "annulation",
      label: pendingDefinition.defenseBand.annulationCardsRequired > 1 ? "Use Annulation x2" : "Use Annulation",
      description: "Cancel this action using Annulation."
    });
  }

  if (hasOrdreDemmerlaus) {
    options.push({
      choice: "ordre-demmerlaus",
      label: "Use Ordre d'Emmerlaus",
      description: "Cancel this action with Ordre d'Emmerlaus, even if it is CA, E, or would normally need 2 Annulations."
    });
  }

  if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    pendingDefinition.defenseBand?.resistanceAccrueAllowed &&
    !temporalStopSuppressed
  ) {
    const hasResistanceAccrue = seatState.hand.some((card) => card.cardId === "resistance-accrue");
    if (hasResistanceAccrue) {
      options.push({
        choice: "resistance_accrue",
        label: "Use Resistance accrue",
        description: "Improve this seat's resistance for the current action."
      });
    }
  }

  if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    pendingDefinition.defenseBand?.mirrorAllowed &&
    hasMiroir &&
    !temporalStopSuppressed
  ) {
    options.push({
      choice: "mirror",
      label: "Mirror",
      description: "Reflect this attack back at the attacker."
    });
  }

  return options;
}

function canPlayCardAsPendingResponse(match: StoredMatchState, seatNumber: number, card: StoredCardInstance): { canPlay: boolean; reason?: string } {
  if (match.internalGame?.pendingObjectChoice != null) {
    return { canPlay: false, reason: "Choose the pending object first" };
  }

  if (match.internalGame?.pendingBoardResetKeep != null) {
    return { canPlay: false, reason: "Choose the card to keep first" };
  }

  if (match.internalGame?.pendingDeathSearch != null) {
    return { canPlay: false, reason: "Resolve the death search first" };
  }

  if (match.internalGame?.pendingSacrificeChoice != null) {
    return { canPlay: false, reason: "Choose the sacrifice amount first" };
  }

  const options = getResponseOptionChoices(match, seatNumber);
  if (options.length === 0) {
    return { canPlay: false, reason: "Waiting for the current action to resolve" };
  }

  if (card.cardId === "annulation") {
    return options.some((option) => option.choice === "annulation")
      ? { canPlay: true }
      : { canPlay: false, reason: "Annulation is not legal for this action" };
  }

  if (card.cardId === ORDRE_DEMMERLAUS_CARD_ID) {
    return options.some((option) => option.choice === "ordre-demmerlaus")
      ? { canPlay: true }
      : { canPlay: false, reason: "Ordre d'Emmerlaus is not legal for this action" };
  }

  if (card.cardId === "resistance-accrue") {
    return options.some((option) => option.choice === "resistance_accrue")
      ? { canPlay: true }
      : { canPlay: false, reason: "Resistance accrue is not legal for this action" };
  }

  if (card.cardId === "miroir") {
    return options.some((option) => option.choice === "mirror")
      ? { canPlay: true }
      : { canPlay: false, reason: "Mirror is not legal for this action" };
  }

  return { canPlay: false, reason: "Only response cards can be used right now" };
}

function getTargetSeatNumbers(game: StoredGameState, actorSeatNumber: number, request: PlayCardRequest, targets: CardTargetMode): number[] {
  switch (targets) {
    case "self":
      return [actorSeatNumber];
    case "single_opponent":
      if (request.targetSeatNumber == null || request.targetSeatNumber === actorSeatNumber) {
        throw new Error("A target player is required");
      }

      return [request.targetSeatNumber];
    case "self_or_single_opponent":
      if (request.targetSeatNumber == null) {
        throw new Error("A target player is required");
      }

      return [request.targetSeatNumber];
    case "all_opponents":
      return nextLivingOpponentSeatNumbers(game, actorSeatNumber);
    case "left_opponent": {
      const leftSeat = getLeftOpponentSeatNumber(game, actorSeatNumber);
      if (leftSeat == null) {
        throw new Error("No left opponent available");
      }

      return [leftSeat];
    }
    case "single_player_or_object":
      return request.targetSeatNumber != null ? [request.targetSeatNumber] : [];
    case "target_object":
    case "none":
    default:
      return [];
  }
}

function isProtectedFromAttack(match: StoredMatchState, targetSeatNumber: number, sourceDefinition: BaseCardDefinition): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const targetSeat = getStoredSeat(game, targetSeatNumber);
  if (targetSeat.attackImmunityTurns > 0) {
    return true;
  }

  if (
    sourceDefinition.category.code === "AM"
    && targetSeat.objects.some((objectCard) => objectCard.cardId === "amulette-anti-attaque-de-masse")
  ) {
    return true;
  }

  if (
    hasTimedPotionAttackImmunity(targetSeat)
  ) {
    return true;
  }

  return false;
}

function isRobeOriginDamageSource(sourceDefinition: BaseCardDefinition): boolean {
  return sourceDefinition.id.startsWith("robe-");
}

function damageReductionFromObjects(match: StoredMatchState, seatNumber: number, sourceDefinition: BaseCardDefinition): number {
  const game = match.internalGame;
  if (game == null) {
    return 0;
  }

  if (isRobeOriginDamageSource(sourceDefinition)) {
    return 0;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const publicSeat = getPublicSeat(match, seatNumber);
  let reduction = 0;

  for (const objectInstance of seatState.objects) {
    const definition = requireDefinition(objectInstance.cardId);
    for (const effect of definition.rules.effects) {
      if (effect.type === "absorb_damage") {
        reduction += evaluateRoll(match, effect.amount, publicSeat, undefined, seatNumber);
      }
    }
  }

  return reduction;
}

function computeMirrorRobeReflection(
  match: StoredMatchState,
  targetSeatNumber: number,
  incomingAmount: number,
  sourceDefinition: BaseCardDefinition,
  sourceSeatNumber?: number,
  boxId?: string
): number {
  const game = match.internalGame;
  if (
    game == null
    || incomingAmount <= 0
    || sourceSeatNumber == null
    || sourceSeatNumber === targetSeatNumber
    || !isAttackLikeDefinition(sourceDefinition)
    || isRobeOriginDamageSource(sourceDefinition)
  ) {
    return 0;
  }

  const targetState = getStoredSeat(game, targetSeatNumber);
  const hasMirrorRobe = targetState.objects.some((objectCard) => objectCard.cardId === "robe-miroir");
  if (!hasMirrorRobe) {
    return 0;
  }

  const mirrorRobeDefinition = requireDefinition("robe-miroir");
  if (isProtectedFromAttack(match, sourceSeatNumber, mirrorRobeDefinition)) {
    return 0;
  }

  const roll = rollDiceNotationDetailed("1D6");
  publishSeatDiceRoll(match, targetSeatNumber, "1D6", roll.total, roll.values, boxId);
  const reflectedAmount = Math.min(incomingAmount, roll.total);
  if (reflectedAmount <= 0) {
    return 0;
  }

  appendDealerMessage(
    match,
    `${getPublicSeat(match, targetSeatNumber).displayName}'s Robe miroir reflects ${reflectedAmount} damage back to ${getPublicSeat(match, sourceSeatNumber).displayName}.`
  );
  appendServerDebugLog(
    match,
    "object",
    `Seat ${targetSeatNumber}'s Robe miroir reflected ${reflectedAmount} from ${sourceDefinition.name} back to seat ${sourceSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  return reflectedAmount;
}

function triggerCounterattackRobe(
  match: StoredMatchState,
  targetSeatNumber: number,
  sourceDefinition: BaseCardDefinition,
  sourceSeatNumber?: number,
  boxId?: string
): void {
  const game = match.internalGame;
  if (
    game == null
    || sourceSeatNumber == null
    || sourceSeatNumber === targetSeatNumber
    || !isAttackLikeDefinition(sourceDefinition)
    || isRobeOriginDamageSource(sourceDefinition)
  ) {
    return;
  }

  const targetState = getStoredSeat(game, targetSeatNumber);
  if (!targetState.objects.some((objectCard) => objectCard.cardId === "robe-de-contre-attaque")) {
    return;
  }

  if (!getStoredSeat(game, sourceSeatNumber).alive) {
    return;
  }

  const counterattackDefinition = requireDefinition("robe-de-contre-attaque");
  if (isProtectedFromAttack(match, sourceSeatNumber, counterattackDefinition)) {
    return;
  }

  const roll = rollDiceNotationDetailed("1D10");
  publishSeatDiceRoll(match, targetSeatNumber, "1D10", roll.total, roll.values, boxId);
  if (roll.total <= 0) {
    return;
  }

  pushPresentationEvent(match, {
    boxId,
    type: "attack_impact",
    actorSeatNumber: targetSeatNumber,
    targetSeatNumber: sourceSeatNumber,
    cardName: counterattackDefinition.name
  });
  appendDealerMessage(
    match,
    `${getPublicSeat(match, targetSeatNumber).displayName}'s ${counterattackDefinition.name} hits ${getPublicSeat(match, sourceSeatNumber).displayName} for ${roll.total}.`
  );
  appendServerDebugLog(
    match,
    "object",
    `Seat ${targetSeatNumber}'s ${counterattackDefinition.name} dealt ${roll.total} to seat ${sourceSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  applyDamage(match, sourceSeatNumber, roll.total, counterattackDefinition, false, boxId, targetSeatNumber);
}

function moveCardFromHand(source: StoredCardInstance[], instanceId: string): StoredCardInstance {
  const index = source.findIndex((card) => card.instanceId === instanceId);
  if (index === -1) {
    throw new Error("Card instance not found");
  }

  const [card] = source.splice(index, 1);
  return card;
}

function removeObjectFromSeat(match: StoredMatchState, ownerSeatNumber: number, instanceId?: string): StoredCardInstance[] {
  const game = match.internalGame;
  if (game == null) {
    return [];
  }

  const owner = getStoredSeat(game, ownerSeatNumber);
  if (owner.objects.length === 0) {
    return [];
  }

  if (instanceId == null) {
    const removed = owner.objects.shift()!;
    appendServerDebugLog(match, "object", `Seat ${ownerSeatNumber} lost object ${requireDefinition(removed.cardId).name}`);
    syncObjectOwnershipStats(match);
    return [removed];
  }

  const index = owner.objects.findIndex((card) => card.instanceId === instanceId);
  if (index === -1) {
    throw new Error("Target object not found");
  }

  const removed = owner.objects.splice(index, 1);
  appendServerDebugLog(match, "object", `Seat ${ownerSeatNumber} lost object ${requireDefinition(removed[0].cardId).name}`);
  syncObjectOwnershipStats(match);
  return removed;
}

function removeAllObjectsFromSeat(match: StoredMatchState, ownerSeatNumber: number): StoredCardInstance[] {
  const game = match.internalGame;
  if (game == null) {
    return [];
  }

  const owner = getStoredSeat(game, ownerSeatNumber);
  if (owner.objects.length === 0) {
    return [];
  }

  const removed = [...owner.objects];
  owner.objects = [];
  for (const card of removed) {
    appendServerDebugLog(match, "object", `Seat ${ownerSeatNumber} lost object ${requireDefinition(card.cardId).name}`);
  }
  syncObjectOwnershipStats(match);
  return removed;
}

function maybePassChanceRoll(
  match: StoredMatchState,
  actorSeatNumber: number,
  effect: Extract<CardEffect, { type: "remove_target_object" }>,
  targetSeatNumbers: number[],
  boxId?: string
): boolean {
  if (effect.chance == null) {
    return true;
  }

  const game = match.internalGame;
  if (game != null) {
    const anyTargetHasObjects = targetSeatNumbers.some((seatNumber) =>
      seatHasEligibleTargetObject(game, seatNumber, effect.allowedSlots)
    );
    if (!anyTargetHasObjects) {
      appendServerDebugLog(
        match,
        "object",
        `Skipped ${effect.chance.notation} object-removal chance for seat ${actorSeatNumber} because no target has eligible objects${boxId != null ? ` [box ${boxId}]` : ""}`
      );
      return false;
    }
  }

  const roll = rollDiceNotationDetailed(effect.chance.notation);
  publishSeatDiceRoll(match, actorSeatNumber, effect.chance.notation, roll.total, roll.values, boxId);
  const passed = effect.chance.successTotals.includes(roll.total);
  appendServerDebugLog(
    match,
    "object",
    `${effect.chance.notation} object-removal chance ${roll.total} ${passed ? "succeeded" : "failed"} for seat ${actorSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  return passed;
}

function queueObjectChoice(
  match: StoredMatchState,
  chooserSeatNumber: number,
  ownerSeatNumber: number,
  sourceCard: StoredCardInstance,
  mode: "remove" | "steal",
  boxId?: string,
  finalizeActorSeatNumber?: number
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const owner = getStoredSeat(game, ownerSeatNumber);
  const sourceDefinition = requireDefinition(sourceCard.cardId);
  const allowedSlots = getAllowedObjectSlotsForDefinition(sourceDefinition);
  const eligibleObjects = owner.objects.filter((objectCard) => objectMatchesAllowedSlots(objectCard.cardId, allowedSlots));
  if (eligibleObjects.length === 0) {
    appendServerDebugLog(match, "object", `Seat ${ownerSeatNumber} has no object to remove`);
    return false;
  }

  if (game.pendingAction == null && finalizeActorSeatNumber == null) {
    const removed = removeObjectFromSeat(match, ownerSeatNumber, eligibleObjects[0]?.instanceId);
    if (mode === "steal") {
      removed.forEach((card) => addObjectToSeat(match, chooserSeatNumber, card));
      if (removed[0] != null) {
        appendDealerMessage(
          match,
          `${getPublicSeat(match, chooserSeatNumber).displayName} stole ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
        );
      }
    } else {
      discardInstances(game, removed);
      if (removed[0] != null) {
        appendDealerMessage(
          match,
          `${getPublicSeat(match, chooserSeatNumber).displayName} removed ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
        );
      }
    }
    return false;
  }

  const chooser = getPublicSeat(match, chooserSeatNumber);
  if (chooser.controllerType === "bot") {
    const chosenObject = pickRandom(eligibleObjects);
    if (chosenObject == null) {
      return false;
    }
    const removed = removeObjectFromSeat(match, ownerSeatNumber, chosenObject.instanceId);
    if (mode === "steal") {
      removed.forEach((card) => addObjectToSeat(match, chooserSeatNumber, card));
      if (removed[0] != null) {
        appendDealerMessage(
          match,
          `${chooser.displayName} stole ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
        );
      }
    } else {
      discardInstances(game, removed);
      if (removed[0] != null) {
        appendDealerMessage(
          match,
          `${chooser.displayName} removed ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
        );
      }
    }
    return false;
  }

  game.pendingObjectChoice = {
    boxId,
    chooserSeatNumber,
    ownerSeatNumber,
    sourceCard,
    mode,
    finalizeActorSeatNumber
  };
  appendServerDebugLog(
    match,
    "object",
    `Seat ${chooserSeatNumber} must choose an object from seat ${ownerSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function queuePowerRingChoice(
  match: StoredMatchState,
  chooserSeatNumber: number,
  sourceCard: StoredCardInstance,
  boxId?: string,
  finalizeActorSeatNumber?: number
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const owner = getStoredSeat(game, chooserSeatNumber);
  const eligibleRings = getEquippedPowerRings(owner);
  if (eligibleRings.length === 0) {
    appendServerDebugLog(match, "object", `Seat ${chooserSeatNumber} has no power ring to sacrifice`);
    return false;
  }

  const chooser = getPublicSeat(match, chooserSeatNumber);
  if (chooser.controllerType === "bot") {
    const chosenRing = eligibleRings
      .slice()
      .sort((left, right) => (getPowerRingLevel(right.cardId) ?? 0) - (getPowerRingLevel(left.cardId) ?? 0))[0];
    if (chosenRing == null) {
      return false;
    }

    game.pendingObjectChoice = {
      boxId,
      chooserSeatNumber,
      ownerSeatNumber: chooserSeatNumber,
      sourceCard,
      mode: "consume_power_ring",
      finalizeActorSeatNumber
    };
    selectPendingObject(match, chooser.userId, chosenRing.instanceId);
    return true;
  }

  game.pendingObjectChoice = {
    boxId,
    chooserSeatNumber,
    ownerSeatNumber: chooserSeatNumber,
    sourceCard,
    mode: "consume_power_ring",
    finalizeActorSeatNumber
  };
  appendServerDebugLog(
    match,
    "object",
    `Seat ${chooserSeatNumber} must choose a power ring to sacrifice${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function queueHandInspection(
  match: StoredMatchState,
  viewerSeatNumber: number,
  targetSeatNumber: number,
  sourceCard: StoredCardInstance,
  boxId?: string,
  finalizeActorSeatNumber?: number
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const viewer = getPublicSeat(match, viewerSeatNumber);
  if (viewer.controllerType === "bot") {
    return false;
  }

  game.pendingHandInspection = {
    boxId,
    viewerSeatNumber,
    targetSeatNumber,
    sourceCard,
    finalizeActorSeatNumber
  };
  appendServerDebugLog(
    match,
    "telepathy",
    `Seat ${viewerSeatNumber} must acknowledge ${requireDefinition(sourceCard.cardId).name} on seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function queueBoardResetKeepChoice(
  match: StoredMatchState,
  chooserSeatNumber: number,
  sourceCard: StoredCardInstance,
  effectIndex: number,
  boxId?: string
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const chooserState = getStoredSeat(game, chooserSeatNumber);
  if (chooserState.hand.length === 0) {
    return false;
  }

  const chooser = getPublicSeat(match, chooserSeatNumber);
  if (chooser.controllerType === "bot") {
    return false;
  }

  game.pendingBoardResetKeep = {
    boxId,
    chooserSeatNumber,
    sourceCard,
    effectIndex
  };
  appendServerDebugLog(
    match,
    "board_reset",
    `Seat ${chooserSeatNumber} must choose a card to keep for ${requireDefinition(sourceCard.cardId).name}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function buildPendingPickpocketPool(
  match: StoredMatchState,
  pendingPickpocket: NonNullable<StoredGameState["pendingPickpocket"]>
): { takeCardCount: number; cardOptions: NonNullable<GameState["pendingPickpocket"]>["cardOptions"] } {
  const game = match.internalGame!;
  const targetState = getStoredSeat(game, pendingPickpocket.targetSeatNumber);
  const targetSeat = getPublicSeat(match, pendingPickpocket.targetSeatNumber);
  const cardOptions = [
    ...targetState.hand.map((card) => ({
      ...buildCardView(card, requireDefinition(card.cardId), "hand", false),
      source: "hand" as const,
      ownerSeatNumber: targetSeat.seatNumber,
      ownerDisplayName: targetSeat.displayName
    })),
    ...targetState.objects.map((card) => ({
      ...buildCardView(card, requireDefinition(card.cardId), "object", false),
      source: "object" as const,
      ownerSeatNumber: targetSeat.seatNumber,
      ownerDisplayName: targetSeat.displayName
    }))
  ];

  return {
    takeCardCount: Math.min(pendingPickpocket.takeCardCount, cardOptions.length),
    cardOptions
  };
}

function queuePickpocketChoice(
  match: StoredMatchState,
  chooserSeatNumber: number,
  targetSeatNumber: number,
  sourceCard: StoredCardInstance,
  takeCardCount: number,
  boxId?: string
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const chooser = getPublicSeat(match, chooserSeatNumber);
  if (chooser.controllerType === "bot") {
    return false;
  }

  game.pendingPickpocket = {
    boxId,
    chooserSeatNumber,
    targetSeatNumber,
    sourceCard,
    takeCardCount
  };
  appendServerDebugLog(
    match,
    "pickpocket",
    `Seat ${chooserSeatNumber} must choose ${takeCardCount} card(s) from seat ${targetSeatNumber} for ${requireDefinition(sourceCard.cardId).name}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function resolvePickpocketSelection(
  match: StoredMatchState,
  pendingPickpocket: NonNullable<StoredGameState["pendingPickpocket"]>,
  selectedCardInstanceIds: string[]
): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("Game not initialized");
  }

  const chooserState = getStoredSeat(game, pendingPickpocket.chooserSeatNumber);
  const targetState = getStoredSeat(game, pendingPickpocket.targetSeatNumber);
  const pool = buildPendingPickpocketPool(match, pendingPickpocket);
  const requestedCardIds = [...new Set(selectedCardInstanceIds)];
  if (requestedCardIds.length !== pool.takeCardCount) {
    throw new Error(`Choose exactly ${pool.takeCardCount} cards to take`);
  }

  const optionsById = new Map(pool.cardOptions.map((card) => [card.instanceId, card]));
  const chosenCards: StoredCardInstance[] = [];
  for (const cardInstanceId of requestedCardIds) {
    const selectedCard = optionsById.get(cardInstanceId);
    if (selectedCard == null) {
      throw new Error("One or more selected cards are no longer available");
    }

    if (selectedCard.source === "hand") {
      chosenCards.push(moveCardFromHand(targetState.hand, cardInstanceId));
    } else {
      const removed = removeObjectFromSeat(match, pendingPickpocket.targetSeatNumber, cardInstanceId);
      if (removed[0] == null) {
        throw new Error("Selected object is no longer available");
      }
      chosenCards.push(removed[0]);
    }
  }

  chooserState.hand.push(...chosenCards);
  const chooserSeat = getPublicSeat(match, pendingPickpocket.chooserSeatNumber);
  const targetSeat = getPublicSeat(match, pendingPickpocket.targetSeatNumber);
  const chosenNames = chosenCards.map((card) => requireDefinition(card.cardId).name);
  appendDealerMessage(
    match,
    `${chooserSeat.displayName} uses ${requireDefinition(pendingPickpocket.sourceCard.cardId).name} to steal ${chosenCards.length} card${chosenCards.length === 1 ? "" : "s"} from ${targetSeat.displayName}.`
  );
  appendServerDebugLog(
    match,
    "pickpocket",
    `Seat ${pendingPickpocket.chooserSeatNumber} stole ${chosenNames.join(", ") || "no cards"} from seat ${pendingPickpocket.targetSeatNumber}`
  );
}

function findDeathSearchOwner(
  match: StoredMatchState,
  deadSeatNumber: number
): { chooserSeatNumber: number; sourceCard: StoredCardInstance } | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  for (const seatState of sortBySeatNumber(game.seatStates)) {
    if (!seatState.alive || seatState.seatNumber === deadSeatNumber) {
      continue;
    }

    const sourceCard = seatState.hand.find((card) => card.cardId === "fouille-de-mort");
    if (sourceCard != null) {
      return {
        chooserSeatNumber: seatState.seatNumber,
        sourceCard
      };
    }
  }

  return undefined;
}

function queueDeathSearch(
  match: StoredMatchState,
  deadSeatNumber: number,
  corpseCards: StoredCardInstance[]
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  if (aliveSeatNumbers(game).length <= 1) {
    return false;
  }

  const existingPending = game.pendingDeathSearch;
  if (existingPending != null) {
    existingPending.corpses.push({
      seatNumber: deadSeatNumber,
      cards: corpseCards
    });
    appendServerDebugLog(
      match,
      "death_search",
      `Added seat ${deadSeatNumber} corpse to pending ${requireDefinition(existingPending.sourceCard.cardId).name} search`
    );
    refreshSeatSummaries(match);
    return true;
  }

  const owner = findDeathSearchOwner(match, deadSeatNumber);
  if (owner == null) {
    return false;
  }

  game.pendingDeathSearch = {
    chooserSeatNumber: owner.chooserSeatNumber,
    sourceCard: owner.sourceCard,
    corpses: [
      {
        seatNumber: deadSeatNumber,
        cards: corpseCards
      }
    ]
  };
  appendServerDebugLog(
    match,
    "death_search",
    `Seat ${owner.chooserSeatNumber} may use ${requireDefinition(owner.sourceCard.cardId).name} after seat ${deadSeatNumber} died`
  );
  refreshSeatSummaries(match);
  return true;
}

function queueSacrificeChoice(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceCard: StoredCardInstance,
  maxAmount: number,
  boxId?: string
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const actorSeat = getPublicSeat(match, actorSeatNumber);
  if (actorSeat.controllerType === "bot") {
    return false;
  }

  game.pendingSacrificeChoice = {
    boxId,
    actorSeatNumber,
    sourceCard,
    maxAmount
  };
  appendServerDebugLog(
    match,
    "sacrifice",
    `Seat ${actorSeatNumber} must choose sacrifice amount for ${requireDefinition(sourceCard.cardId).name}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  refreshSeatSummaries(match);
  return true;
}

function redrawSeatHand(match: StoredMatchState, seatNumber: number, redrawCount?: number, boxId?: string): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const discardedCount = seatState.hand.length;
  if (discardedCount > 0) {
    discardInstances(game, seatState.hand.splice(0));
  }

  const desiredHandCount = Math.max(0, redrawCount ?? game.minimumHandSize);
  drawCards(match, seatNumber, desiredHandCount);
  appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName} discards their hand and redraws.`);
  appendServerDebugLog(
    match,
    "hand",
    `Seat ${seatNumber} redrew hand ${discardedCount} -> ${seatState.hand.length}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
}

function executeBoardReset(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceCard: StoredCardInstance,
  effect: Extract<CardEffect, { type: "board_reset" }>,
  keptCardInstanceIds: string[],
  boxId?: string
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const actorState = getStoredSeat(game, actorSeatNumber);
  const keptCardIdSet = new Set(keptCardInstanceIds.slice(0, effect.keeperCards));
  const keptCards = actorState.hand.filter((card) => keptCardIdSet.has(card.instanceId)).slice(0, effect.keeperCards);
  const keptCardsForHand = [...keptCards];
  const keptCardNames = keptCards.map((card) => requireDefinition(card.cardId).name);
  const recycled: StoredCardInstance[] = [];

  for (const seatState of game.seatStates) {
    if (seatState.seatNumber === actorSeatNumber) {
      recycled.push(...seatState.hand.filter((card) => !keptCardIdSet.has(card.instanceId)));
      seatState.hand = keptCardsForHand;
    } else {
      recycled.push(...seatState.hand.splice(0));
    }

    recycled.push(...seatState.objects.splice(0));
    recycled.push(...seatState.statuses.splice(0).map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
    seatState.skipTurnsRemaining = 0;
    seatState.attackImmunityTurns = 0;
    seatState.noRiposteTurnsRemaining = 0;
    seatState.handInspectionTargetSeatNumber = undefined;
  }
  syncObjectOwnershipStats(match);

  if (effect.reshuffleAllOtherCards) {
    game.deck = shuffle([...game.deck, ...game.discardPile, ...flattenStoredCardInstances(recycled)]);
    game.discardPile = [];
  } else {
    discardInstances(game, recycled);
  }

  for (const seatState of sortBySeatNumber(game.seatStates)) {
    if (!seatState.alive) {
      continue;
    }

    while (seatState.hand.length < game.minimumHandSize) {
      drawCards(match, seatState.seatNumber, 1);
    }
  }

  const boardResetHp = setSeatHp(match, actorSeatNumber, actorSeat.hp + effect.attackerHpBonus);
  if (boardResetHp.delta > 0) {
    recordHealing(match, actorSeatNumber, actorSeatNumber, boardResetHp.delta);
    pushPresentationEvent(match, {
      boxId,
      type: "hp_gain",
      seatNumber: actorSeatNumber,
      cardName: requireDefinition(sourceCard.cardId).name,
      amount: boardResetHp.delta
    });
  }

  appendServerDebugLog(
    match,
    "board_reset",
    `${requireDefinition(sourceCard.cardId).name} reset the board; seat ${actorSeatNumber} kept ${keptCardNames.join(", ") || "no cards"}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
}

function handleSeatDeath(match: StoredMatchState, seatNumber: number, resurrectionBlocked: boolean, killerSeatNumber?: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const publicSeat = getPublicSeat(match, seatNumber);

  if (!seatState.alive || publicSeat.hp > 0) {
    return;
  }

  if (game.pendingDeathSearch?.chooserSeatNumber === seatNumber) {
    discardInstances(game, game.pendingDeathSearch.corpses.flatMap((corpse) => corpse.cards));
    appendServerDebugLog(match, "death_search", `Canceled pending ${requireDefinition(game.pendingDeathSearch.sourceCard.cardId).name} because seat ${seatNumber} died`);
    game.pendingDeathSearch = undefined;
  }

  const ringIndex = seatState.objects.findIndex((card) => card.cardId === "anneau-de-resurrection");
  if (!resurrectionBlocked && ringIndex !== -1) {
    const [ring] = seatState.objects.splice(ringIndex, 1);
    syncObjectOwnershipStats(match);
    game.discardPile.push(ring);
    discardInstances(game, seatState.hand.splice(0));
    publicSeat.hp = 50;
    seatState.alive = true;
    drawCards(match, seatNumber, 5);
    appendDealerMessage(match, `${publicSeat.displayName} was restored by Anneau de résurrection.`);
    appendServerDebugLog(match, "death", `Seat ${seatNumber} resurrected via Anneau de resurrection`);
    return;
  }

  const corpseCards: StoredCardInstance[] = [
    ...seatState.hand.splice(0),
    ...flattenStoredCardInstances(seatState.objects.splice(0)),
    ...seatState.statuses.splice(0).map((status) => ({ instanceId: status.instanceId, cardId: status.cardId }))
  ];
  syncObjectOwnershipStats(match);
  seatState.alive = false;
  publicSeat.hp = 0;
  seatState.skipTurnsRemaining = 0;
  seatState.pendingExtraPlays = 0;
  seatState.attackImmunityTurns = 0;
  seatState.noRiposteTurnsRemaining = 0;
  seatState.handInspectionTargetSeatNumber = undefined;
  appendDealerMessage(match, `${publicSeat.displayName} has fallen.`);
  if (!queueDeathSearch(match, seatNumber, corpseCards)) {
    discardInstances(game, corpseCards);
  }
  if (killerSeatNumber != null && killerSeatNumber !== seatNumber) {
    getSeatSessionStats(game, killerSeatNumber).kills += 1;
  }
  appendServerDebugLog(match, "death", `Seat ${seatNumber} died and released ${corpseCards.length} cards`);
}

function checkForWinner(match: StoredMatchState): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  if (game.pendingDeathSearch != null) {
    return false;
  }

  const alive = aliveSeatNumbers(game);
  if (alive.length <= 1) {
    game.winnerSeatNumber = alive[0];
    match.status = "finished";
    if (alive[0] != null) {
      appendDealerMessage(match, `${getPublicSeat(match, alive[0]).displayName} is the last wizard standing.`);
    }
    return true;
  }

  return false;
}

function applyDamage(
  match: StoredMatchState,
  targetSeatNumber: number,
  amount: number,
  sourceDefinition: BaseCardDefinition,
  resurrectionBlocked = false,
  boxId?: string,
  sourceSeatNumber?: number
): number {
  const targetSeat = getPublicSeat(match, targetSeatNumber);
  if (isProtectedFromAttack(match, targetSeatNumber, sourceDefinition)) {
    appendServerDebugLog(match, "damage", `${sourceDefinition.name} dealt 0 to seat ${targetSeatNumber} because the target is protected`);
    return 0;
  }

  const absorbedAmount = damageReductionFromObjects(match, targetSeatNumber, sourceDefinition);
  const reflectedAmount = computeMirrorRobeReflection(
    match,
    targetSeatNumber,
    amount,
    sourceDefinition,
    sourceSeatNumber,
    boxId
  );
  const reducedAmount = Math.max(0, amount - absorbedAmount - reflectedAmount);
  targetSeat.hp -= reducedAmount;
  recordDamageDealt(match, sourceSeatNumber, targetSeatNumber, reducedAmount);
  appendServerDebugLog(
    match,
    "damage",
    `${sourceDefinition.name} dealt ${reducedAmount} to seat ${targetSeatNumber} (raw ${amount}, absorbed ${absorbedAmount}, reflected ${reflectedAmount}, hp now ${targetSeat.hp})${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  if (reducedAmount > 0) {
    pushPresentationEvent(match, {
      boxId,
      type: "hp_loss",
      seatNumber: targetSeatNumber,
      cardName: sourceDefinition.name,
      amount: reducedAmount
    });
    recordLowestHpSurvived(match, targetSeatNumber);
  }
  if (reflectedAmount > 0 && sourceSeatNumber != null) {
    const mirrorRobeDefinition = requireDefinition("robe-miroir");
    applyDamage(match, sourceSeatNumber, reflectedAmount, mirrorRobeDefinition, false, boxId, targetSeatNumber);
  }
  triggerCounterattackRobe(match, targetSeatNumber, sourceDefinition, sourceSeatNumber, boxId);
  handleSeatDeath(match, targetSeatNumber, resurrectionBlocked, sourceSeatNumber);
  return reducedAmount;
}

function swapSeatOccupants(
  match: StoredMatchState,
  leftSeatNumber: number,
  rightSeatNumber: number,
  effect: Extract<CardEffect, { type: "swap_bodies" }>
): void {
  const leftSeat = getPublicSeat(match, leftSeatNumber);
  const rightSeat = getPublicSeat(match, rightSeatNumber);
  const game = match.internalGame;
  if (game == null) {
    return;
  }
  const leftStoredSeat = getStoredSeat(game, leftSeatNumber);
  const rightStoredSeat = getStoredSeat(game, rightSeatNumber);

  if (effect.swapSeatOrder) {
    swapSeatSessionStats(game, leftSeatNumber, rightSeatNumber);
    const leftSnapshot = {
      controllerType: leftSeat.controllerType,
      userId: leftSeat.userId,
      displayName: leftSeat.displayName,
      avatarUrl: leftSeat.avatarUrl,
      connected: leftSeat.connected,
      isHost: leftSeat.isHost,
      difficulty: leftSeat.difficulty,
      disconnectedUserId: leftSeat.disconnectedUserId
    };

    leftSeat.controllerType = rightSeat.controllerType;
    leftSeat.userId = rightSeat.userId;
    leftSeat.displayName = rightSeat.displayName;
    leftSeat.avatarUrl = rightSeat.avatarUrl;
    leftSeat.connected = rightSeat.connected;
    leftSeat.isHost = rightSeat.isHost;
    leftSeat.difficulty = rightSeat.difficulty;
    leftSeat.disconnectedUserId = rightSeat.disconnectedUserId;

    rightSeat.controllerType = leftSnapshot.controllerType;
    rightSeat.userId = leftSnapshot.userId;
    rightSeat.displayName = leftSnapshot.displayName;
    rightSeat.avatarUrl = leftSnapshot.avatarUrl;
    rightSeat.connected = leftSnapshot.connected;
    rightSeat.isHost = leftSnapshot.isHost;
    rightSeat.difficulty = leftSnapshot.difficulty;
    rightSeat.disconnectedUserId = leftSnapshot.disconnectedUserId;
  }

  if (effect.swapHp) {
    const leftPrevHp = leftSeat.hp;
    const rightPrevHp = rightSeat.hp;
    const leftResult = setSeatHp(match, leftSeatNumber, rightPrevHp);
    const rightResult = setSeatHp(match, rightSeatNumber, leftPrevHp);

    if (leftResult.delta > 0) {
      pushPresentationEvent(match, { type: "hp_gain", seatNumber: leftSeatNumber, amount: leftResult.delta });
    } else if (leftResult.delta < 0) {
      pushPresentationEvent(match, { type: "hp_loss", seatNumber: leftSeatNumber, amount: -leftResult.delta });
    }
    if (rightResult.delta > 0) {
      pushPresentationEvent(match, { type: "hp_gain", seatNumber: rightSeatNumber, amount: rightResult.delta });
    } else if (rightResult.delta < 0) {
      pushPresentationEvent(match, { type: "hp_loss", seatNumber: rightSeatNumber, amount: -rightResult.delta });
    }

    handleSeatDeath(match, leftSeatNumber, false);
    handleSeatDeath(match, rightSeatNumber, false);
  }

  if (effect.swapHand) {
    [leftStoredSeat.hand, rightStoredSeat.hand] = [rightStoredSeat.hand, leftStoredSeat.hand];
  }

  if (effect.swapObjects) {
    [leftStoredSeat.objects, rightStoredSeat.objects] = [rightStoredSeat.objects, leftStoredSeat.objects];
    syncObjectOwnershipStats(match);
  }

  if (effect.swapStatuses) {
    const leftBodyBoundStatuses = leftStoredSeat.statuses.filter((status) => status.bodyBound === true);
    const rightBodyBoundStatuses = rightStoredSeat.statuses.filter((status) => status.bodyBound === true);
    const leftTransferableStatuses = leftStoredSeat.statuses.filter((status) => status.bodyBound !== true);
    const rightTransferableStatuses = rightStoredSeat.statuses.filter((status) => status.bodyBound !== true);
    leftStoredSeat.statuses = [...rightTransferableStatuses, ...leftBodyBoundStatuses];
    rightStoredSeat.statuses = [...leftTransferableStatuses, ...rightBodyBoundStatuses];
  }

  appendServerDebugLog(
    match,
    "swap",
    `Seat ${leftSeatNumber} and seat ${rightSeatNumber} swapped`
    + `${effect.swapSeatOrder ? " controllers" : ""}`
    + `${effect.swapHp ? " hp" : ""}`
    + `${effect.swapHand ? " hands" : ""}`
    + `${effect.swapObjects ? " objects" : ""}`
    + `${effect.swapStatuses ? " statuses" : ""}`
  );
}

function requestObjectOwnerSeatNumber(
  match: StoredMatchState,
  actorSeatNumber: number,
  targetSeatNumbers: number[],
  targetObjectInstanceId?: string,
  sourceDefinition?: BaseCardDefinition
): number {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("Game not initialized");
  }

  if (targetObjectInstanceId != null) {
    const owner = game.seatStates.find((seat) => seat.objects.some((card) => card.instanceId === targetObjectInstanceId));
    if (owner == null) {
      throw new Error("Target object not found");
    }

    const targetObject = owner.objects.find((card) => card.instanceId === targetObjectInstanceId);
    if (targetObject == null || requireDefinition(targetObject.cardId).category.code !== "O") {
      throw new Error("That card cannot be targeted as an object");
    }
    if (sourceDefinition != null && !objectMatchesAllowedSlots(targetObject.cardId, getAllowedObjectSlotsForDefinition(sourceDefinition))) {
      throw new Error("That object cannot be targeted by this card");
    }

    return owner.seatNumber;
  }

  const targetSeatNumber = targetSeatNumbers[0] ?? listTargetableObjectOwners(game, actorSeatNumber, sourceDefinition).find((seatNumber) =>
    getStoredSeat(game, seatNumber).objects.some((objectCard) =>
      objectMatchesAllowedSlots(objectCard.cardId, sourceDefinition == null ? undefined : getAllowedObjectSlotsForDefinition(sourceDefinition))
    )
  );
  if (targetSeatNumber == null) {
    throw new Error("A target object is required");
  }

  if (sourceDefinition != null && !getStoredSeat(game, targetSeatNumber).objects.some((objectCard) =>
    objectMatchesAllowedSlots(objectCard.cardId, getAllowedObjectSlotsForDefinition(sourceDefinition))
  )) {
    throw new Error("That player has no valid object for this card");
  }

  return targetSeatNumber;
}

function determineResponseMode(definition: BaseCardDefinition): PendingActionState["responseMode"] {
  return definition.rules.targets === "self" || definition.rules.targets === "all_opponents"
    ? "collective"
    : "per_target";
}

function isSelfTargetedSinglePlayerSpell(
  definition: BaseCardDefinition,
  actorSeatNumber: number,
  targetSeatNumbers: number[]
): boolean {
  return (
    definition.rules.targets === "single_player_or_object"
    || definition.rules.targets === "self_or_single_opponent"
  )
    && targetSeatNumbers.length === 1
    && targetSeatNumbers[0] === actorSeatNumber;
}

function getCurrentPendingResponder(pendingAction: StoredPendingActionState): StoredPendingActionResponderState | undefined {
  return pendingAction.responders.find((responder) => responder.state === "pending");
}

function getResponderSeatNumbers(
  game: StoredGameState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  targetSeatNumbers: number[]
): number[] {
  if (!definition.rules.requiresDefenseWindow && !definition.rules.requiresResistanceCheck) {
    return [];
  }

  if (definition.rules.targets === "self") {
    return nextLivingOpponentSeatNumbers(game, actorSeatNumber);
  }

  if (isSelfTargetedSinglePlayerSpell(definition, actorSeatNumber, targetSeatNumbers)) {
    return nextLivingOpponentSeatNumbers(game, actorSeatNumber);
  }

  return targetSeatNumbers.filter((seatNumber) => getStoredSeat(game, seatNumber).alive);
}

function computeResistanceThreshold(match: StoredMatchState, seatNumber: number, responderChoice: ResponseChoiceType): number {
  const game = match.internalGame;
  if (game == null) {
    return 10;
  }

  const publicSeat = getPublicSeat(match, seatNumber);
  const storedSeat = getStoredSeat(game, seatNumber);
  let modifier = 0;

  for (const objectInstance of storedSeat.objects) {
    const definition = requireDefinition(objectInstance.cardId);
    for (const effect of definition.rules.effects) {
      if (effect.type === "modify_resistance" && effect.duration === "until_removed") {
        modifier += effect.amount;
      }
    }
  }

  for (const statusInstance of storedSeat.statuses) {
    const definition = requireDefinition(statusInstance.cardId);
    for (const effect of definition.rules.effects) {
      if (effect.type === "modify_resistance" && effect.duration === "until_removed") {
        if (definition.id === "hydromel") {
          const pendingAction = game.pendingAction;
          if (
            pendingAction == null
            || pendingAction.actorSeatNumber === seatNumber
            || !isAttackLikeDefinition(requireDefinition(pendingAction.storedCard.cardId))
          ) {
            continue;
          }
        }
        modifier += effect.amount;
      }
    }
  }

  const pendingAction = game.pendingAction;
  if (pendingAction != null) {
    const actionDefinition = requireDefinition(pendingAction.storedCard.cardId);
    for (const effect of actionDefinition.rules.effects) {
      if (effect.type === "modify_resistance" && effect.duration === "current_action") {
        modifier += effect.amount;
      }
    }

    if (
      pendingAction.actorSeatNumber !== seatNumber
      && pendingAction.sourceZone === "hand"
      && (actionDefinition.category.code === "AD" || actionDefinition.category.code === "AM")
      && getStoredSeat(game, pendingAction.actorSeatNumber).statuses.some((status) => status.cardId === "pacte-tenebreux")
    ) {
      modifier -= 3;
    }

    const extraPlayMode = game.extraPlayMode;
    if (
      extraPlayMode != null
      && pendingAction.actorSeatNumber !== seatNumber
      && pendingAction.actorSeatNumber === extraPlayMode.actorSeatNumber
      && pendingAction.sourceZone === "hand"
      && extraPlayMode.temporaryResistanceModifier !== 0
      && (extraPlayMode.allowedCategories === "any" || extraPlayMode.allowedCategories.includes(actionDefinition.category.code))
    ) {
      modifier += extraPlayMode.temporaryResistanceModifier;
    }
  }

  if (responderChoice === "resistance_accrue") {
    modifier += publicSeat.powerLevel ?? 1;
  }

  return 10 + modifier;
}

interface ResistanceRollOutcome {
  attempted: boolean;
  resisted: boolean;
  fatalFailure: boolean;
  criticalSuccess: boolean;
  detonationTriggered: boolean;
}

function getResistanceRollCount(
  match: StoredMatchState,
  definition: BaseCardDefinition,
  targetSeatNumber: number
): number {
  const game = match.internalGame;
  const baseRollsRequired = Math.max(1, definition.defenseBand?.resistance.rollsRequired || 1);
  if (game == null || !isAttackLikeDefinition(definition)) {
    return baseRollsRequired;
  }

  const extraRolls = getStoredSeat(game, targetSeatNumber).objects.reduce((count, objectInstance) => (
    EXTRA_RESISTANCE_ROLL_OBJECT_CARD_IDS.has(objectInstance.cardId) ? count + 1 : count
  ), 0);

  return baseRollsRequired + extraRolls;
}

function getFatalResistanceCurseStatus(match: StoredMatchState, seatNumber: number, rollTotal: number): StoredSeatStatus | undefined {
  const game = match.internalGame;
  if (game == null || rollTotal !== 13) {
    return undefined;
  }

  return getStoredSeat(game, seatNumber).statuses.find((status) => status.cardId === "detonation-13");
}

function canAttemptResistance(
  match: StoredMatchState,
  pendingAction: StoredPendingActionState,
  definition: BaseCardDefinition,
  targetSeatNumber: number,
  responderChoice: ResponseChoiceType
): boolean {
  if (pendingAction.fromMirror === true) {
    return false;
  }

  if (isTemporalStopResponseSuppressed(match, pendingAction, targetSeatNumber)) {
    return false;
  }

  if (isAttackLikeDefinition(definition) && getStoredSeat(match.internalGame!, targetSeatNumber).noRiposteTurnsRemaining > 0) {
    return false;
  }

  return (
    definition.rules.requiresResistanceCheck &&
    definition.defenseBand != null &&
    definition.defenseBand.resistance.color !== "red" &&
    (responderChoice === "pass" || responderChoice === "resist" || responderChoice === "resistance_accrue")
  );
}

function rollResistanceForAction(
  match: StoredMatchState,
  pendingAction: StoredPendingActionState,
  definition: BaseCardDefinition,
  targetSeatNumber: number,
  responderChoice: ResponseChoiceType,
  rollsRequired: number,
  attemptLabel?: string
): ResistanceRollOutcome {
  if (!canAttemptResistance(match, pendingAction, definition, targetSeatNumber, responderChoice)) {
    return { attempted: false, resisted: false, fatalFailure: false, criticalSuccess: false, detonationTriggered: false };
  }

  const game = match.internalGame;
  if (game == null) {
    return { attempted: false, resisted: false, fatalFailure: false, criticalSuccess: false, detonationTriggered: false };
  }

  const threshold = computeResistanceThreshold(match, targetSeatNumber, responderChoice);
  const labelSuffix = attemptLabel != null ? ` (${attemptLabel})` : "";
  appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} attempts resistance on ${definition.name}${labelSuffix} with threshold ${threshold}`);
  pushPresentationEvent(match, {
    boxId: pendingAction.boxId,
    type: "resistance_start",
    seatNumber: targetSeatNumber,
    cardName: definition.name,
    bonus: threshold - 10,
    threshold
  });

  let resisted = true;
  let fatalFailure = false;
  let criticalSuccess = false;
  let detonationTriggered = false;
  getSeatSessionStats(game, targetSeatNumber).resistAttempts += 1;
  for (let rollIndex = 0; rollIndex < Math.max(1, rollsRequired); rollIndex += 1) {
    const roll = rollDiceNotationDetailed("1D20");
    publishSeatDiceRoll(match, targetSeatNumber, "1D20", roll.total, roll.values, pendingAction.boxId);
    recordLuckOutcome(match, targetSeatNumber, "1D20", roll.total, false);
    const fatalCurseStatus = getFatalResistanceCurseStatus(match, targetSeatNumber, roll.total);
    if (fatalCurseStatus != null) {
      detonationTriggered = true;
      resisted = false;
      const targetSeat = getPublicSeat(match, targetSeatNumber);
      appendDealerMessage(match, `${targetSeat.displayName} rolled 13 on resistance and dies from ${requireDefinition(fatalCurseStatus.cardId).name}.`);
      appendServerDebugLog(
        match,
        "curse",
        `Seat ${targetSeatNumber} rolled 13 on resistance and was killed by ${requireDefinition(fatalCurseStatus.cardId).name}${labelSuffix}`
      );
      if (targetSeat.hp > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "hp_loss",
          seatNumber: targetSeatNumber,
          cardName: requireDefinition(fatalCurseStatus.cardId).name,
          amount: targetSeat.hp
        });
        setSeatHp(match, targetSeatNumber, 0);
      }
      handleSeatDeath(match, targetSeatNumber, false, fatalCurseStatus.sourceSeatNumber);
      break;
    }

    if (roll.total === 20) {
      resisted = false;
      fatalFailure = true;
      break;
    }

    if (roll.total === 1) {
      // Critical success: resist is guaranteed, no damage even on yellow sphere
      criticalSuccess = true;
      break;
    }

    if (roll.total > threshold) {
      resisted = false;
      break;
    }
  }

  pushPresentationEvent(match, {
    boxId: pendingAction.boxId,
    type: "resistance_result",
    seatNumber: targetSeatNumber,
    cardName: definition.name,
    success: resisted,
    fatalFailure,
    criticalSuccess
  });

  if (criticalSuccess) {
    const targetStats = getSeatSessionStats(game, targetSeatNumber);
    targetStats.resistSuccesses += 1;
    targetStats.resistCriticalSuccesses += 1;
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically resisted ${definition.name}!`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically resisted ${definition.name}${labelSuffix}`);
  } else if (resisted) {
    getSeatSessionStats(game, targetSeatNumber).resistSuccesses += 1;
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} resisted ${definition.name}.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} resisted ${definition.name}${labelSuffix}`);
  } else if (fatalFailure) {
    getSeatSessionStats(game, targetSeatNumber).resistFatalFailures += 1;
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically failed the resistance roll.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically failed resistance on ${definition.name}${labelSuffix}`);
  } else if (detonationTriggered) {
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} could not finish resisting ${definition.name}${labelSuffix} because Détonation 13 triggered`);
  } else {
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} failed resistance on ${definition.name}${labelSuffix}`);
  }

  return { attempted: true, resisted, fatalFailure, criticalSuccess, detonationTriggered };
}

function adjustDamageForResistance(
  amount: number,
  outcome: Pick<ResistanceRollOutcome, "resisted" | "fatalFailure" | "criticalSuccess">,
  definition: BaseCardDefinition,
  effect: Extract<CardEffect, { type: "damage" }>
): number {
  let adjustedAmount = amount;
  if (outcome.resisted) {
    if (outcome.criticalSuccess) {
      adjustedAmount = 0;
    } else if (definition.defenseBand?.resistance.color === "yellow" || effect.grantsHalfDamageOnResistance) {
      adjustedAmount = Math.max(1, Math.ceil(adjustedAmount / 2));
    } else {
      adjustedAmount = 0;
    }
  }

  if (outcome.fatalFailure) {
    adjustedAmount *= 2;
  }

  return adjustedAmount;
}

function resolveSuccessfulHitKillRoll(
  match: StoredMatchState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  targetSeatNumbers: number[],
  boxId?: string
): void {
  const game = match.internalGame;
  if (game == null || targetSeatNumbers.length === 0) {
    return;
  }

  const config = SUCCESSFUL_HIT_KILL_ROLL_BY_CARD_ID[definition.id];
  if (config == null) {
    return;
  }

  const roll = rollDiceNotationDetailed(config.triggerNotation);
  publishSeatDiceRoll(match, actorSeatNumber, config.triggerNotation, roll.total, roll.values, boxId);
  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} rolled ${config.triggerNotation} => ${roll.total} against targets ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`
  );

  if (!config.successTotals.includes(roll.total)) {
    appendDealerMessage(match, `${getPublicSeat(match, actorSeatNumber).displayName}'s ${definition.name} failed to trigger.`);
    return;
  }

  appendDealerMessage(
    match,
    targetSeatNumbers.length === 1
      ? `${definition.name} triggers and kills ${getPublicSeat(match, targetSeatNumbers[0]).displayName}!`
      : `${definition.name} triggers and destroys every affected opponent!`
  );
  for (const targetSeatNumber of targetSeatNumbers) {
    if (!getStoredSeat(game, targetSeatNumber).alive) {
      continue;
    }

    const targetSeat = getPublicSeat(match, targetSeatNumber);
    targetSeat.hp = 0;
    handleSeatDeath(match, targetSeatNumber, false, actorSeatNumber);
  }
}

function resolveSuccessfulHitFreezeRoll(
  match: StoredMatchState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  targetSeatNumber: number,
  boxId?: string
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const config = SUCCESSFUL_HIT_FREEZE_ROLL_BY_CARD_ID[definition.id];
  if (config == null || !getStoredSeat(game, targetSeatNumber).alive) {
    return;
  }

  const roll = rollDiceNotationDetailed(config.triggerNotation);
  publishSeatDiceRoll(match, actorSeatNumber, config.triggerNotation, roll.total, roll.values, boxId);
  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} rolled ${config.triggerNotation} => ${roll.total} after hitting seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );

  if (!config.successTotals.includes(roll.total)) {
    appendDealerMessage(match, `${getPublicSeat(match, actorSeatNumber).displayName}'s ${definition.name} failed to freeze ${getPublicSeat(match, targetSeatNumber).displayName}.`);
    return;
  }

  const targetState = getStoredSeat(game, targetSeatNumber);
  targetState.skipTurnsRemaining += 1;
  targetState.noRiposteTurnsRemaining = Math.max(targetState.noRiposteTurnsRemaining, 1);
  if (!targetState.statuses.some((status) => status.cardId === definition.id)) {
    targetState.statuses.push({
      instanceId: randomUUID(),
      cardId: definition.id,
      sourceSeatNumber: actorSeatNumber
    });
  }

  appendDealerMessage(
    match,
    `${definition.name} freezes ${getPublicSeat(match, targetSeatNumber).displayName}: they lose their next turn and cannot riposte for one full turn.`
  );
  appendServerDebugLog(
    match,
    "status",
    `${definition.name} froze seat ${targetSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
}

function resolveRouletteRusse(
  match: StoredMatchState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  boxId?: string
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const eligibleSeatNumbers = aliveSeatNumbers(game).filter((seatNumber) =>
    seatNumber === actorSeatNumber || !isProtectedFromAttack(match, seatNumber, definition)
  );
  const chosenSeatNumber = pickRandom(eligibleSeatNumbers);
  if (chosenSeatNumber == null) {
    return;
  }

  const actorName = getPublicSeat(match, actorSeatNumber).displayName;
  const chosenSeat = getPublicSeat(match, chosenSeatNumber);
  appendDealerMessage(match, `${actorName}'s ${definition.name} randomly chooses ${chosenSeat.displayName}.`);
  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} randomly selected seat ${chosenSeatNumber} from [${eligibleSeatNumbers.join(", ")}]${boxId != null ? ` [box ${boxId}]` : ""}`
  );

  if (chosenSeatNumber === actorSeatNumber) {
    const hpLoss = Math.max(1, Math.ceil(chosenSeat.hp / 2));
    const hpResult = setSeatHp(match, actorSeatNumber, chosenSeat.hp - hpLoss);
    if (hpResult.delta < 0) {
      pushPresentationEvent(match, {
        boxId,
        type: "hp_loss",
        seatNumber: actorSeatNumber,
        cardName: definition.name,
        amount: Math.abs(hpResult.delta)
      });
      recordLowestHpSurvived(match, actorSeatNumber);
    }
    handleSeatDeath(match, actorSeatNumber, false, actorSeatNumber);
    appendDealerMessage(match, `${chosenSeat.displayName} loses ${Math.abs(hpResult.delta)} HP from ${definition.name}.`);
    return;
  }

  const requestedHp = Math.min(chosenSeat.hp, 5);
  const hpResult = setSeatHp(match, chosenSeatNumber, requestedHp);
  if (hpResult.delta < 0) {
    pushPresentationEvent(match, {
      boxId,
      type: "hp_loss",
      seatNumber: chosenSeatNumber,
      cardName: definition.name,
      amount: Math.abs(hpResult.delta)
    });
    recordLowestHpSurvived(match, chosenSeatNumber);
  }
  handleSeatDeath(match, chosenSeatNumber, false, actorSeatNumber);
  appendDealerMessage(match, `${chosenSeat.displayName} is reduced to ${getPublicSeat(match, chosenSeatNumber).hp} HP by ${definition.name}.`);
}

function resolveEquilibre(
  match: StoredMatchState,
  actorSeatNumber: number,
  definition: BaseCardDefinition,
  boxId?: string
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const livingSeatNumbers = aliveSeatNumbers(game);
  if (livingSeatNumbers.length === 0) {
    return;
  }

  const totalHp = livingSeatNumbers.reduce((sum, seatNumber) => sum + getPublicSeat(match, seatNumber).hp, 0);
  const sharedHp = Math.floor(totalHp / livingSeatNumbers.length);
  let remainder = totalHp % livingSeatNumbers.length;

  appendDealerMessage(
    match,
    `${getPublicSeat(match, actorSeatNumber).displayName} uses ${definition.name}: ${totalHp} HP is redistributed among ${livingSeatNumbers.length} living player${livingSeatNumbers.length === 1 ? "" : "s"}.`
  );

  for (const seatNumber of livingSeatNumbers) {
    const targetHp = sharedHp + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }

    const hpResult = setSeatHp(match, seatNumber, targetHp);
    if (hpResult.delta < 0) {
      pushPresentationEvent(match, {
        boxId,
        type: "hp_loss",
        seatNumber,
        cardName: definition.name,
        amount: Math.abs(hpResult.delta)
      });
      recordLowestHpSurvived(match, seatNumber);
    } else if (hpResult.delta > 0) {
      recordHealing(match, actorSeatNumber, seatNumber, hpResult.delta);
      pushPresentationEvent(match, {
        boxId,
        type: "hp_gain",
        seatNumber,
        cardName: definition.name,
        amount: hpResult.delta
      });
    }
  }

  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} redistributed ${totalHp} HP across seats ${livingSeatNumbers.join(", ")} starting from base ${sharedHp}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
}

function resolvePersistentOwnerTurnMassDamageTick(
  match: StoredMatchState,
  ownerSeatNumber: number,
  definition: BaseCardDefinition,
  statusInstance?: StoredSeatStatus,
  boxId?: string
): void {
  const game = match.internalGame;
  const config = PERSISTENT_OWNER_TURN_MASS_DAMAGE_BY_CARD_ID[definition.id];
  if (game == null || config == null) {
    return;
  }

  const targetSeatNumbers = nextLivingOpponentSeatNumbers(game, ownerSeatNumber);
  const affectedTargetSeatNumbers = targetSeatNumbers.filter((targetSeatNumber) =>
    !isProtectedFromAttack(match, targetSeatNumber, definition)
  );
  const timedPotionDamageMultiplier = getTimedPotionDamageMultiplier(match, ownerSeatNumber);

  const actionBoxId = boxId ?? randomUUID();

  // On turn-triggered ticks (statusInstance provided), push an action_start so the
  // client can animate the card sliding to centre and targeting all opponents.
  if (statusInstance != null) {
    const summary = `${getPublicSeat(match, ownerSeatNumber).displayName}'s ${definition.name} deals ${config.damageNotation} to all opponents.`;
    pushGameEvent(match, {
      id: randomUUID(),
      boxId: actionBoxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber: ownerSeatNumber,
      targetSeatNumbers: [...targetSeatNumbers],
      card: buildCardView(statusInstance, definition, "status", false),
      summary
    });
  }

  const roll = rollDiceNotationDetailed(config.damageNotation);
  publishSeatDiceRoll(match, ownerSeatNumber, config.damageNotation, roll.total, roll.values, actionBoxId);
  appendServerDebugLog(
    match,
    "effect",
    `${definition.name} rolled ${config.damageNotation} => ${roll.total} against targets ${targetSeatNumbers.join(", ")} [box ${actionBoxId}]`
  );

  if (affectedTargetSeatNumbers.length === 0) {
    appendServerDebugLog(match, "effect", `${definition.name} found no valid opponents after protections were applied`);
    return;
  }

  appendDealerMessage(
    match,
    `${getPublicSeat(match, ownerSeatNumber).displayName}'s ${definition.name} deals ${roll.total * timedPotionDamageMultiplier} to all affected opponents.`
  );

  for (const targetSeatNumber of affectedTargetSeatNumbers) {
    pushPresentationEvent(match, {
      boxId: actionBoxId,
      type: "attack_impact",
      actorSeatNumber: ownerSeatNumber,
      targetSeatNumber,
      cardName: definition.name
    });
    applyDamage(match, targetSeatNumber, roll.total * timedPotionDamageMultiplier, definition, false, actionBoxId, ownerSeatNumber);
  }

  checkForWinner(match);
}

function consumeHandCardsById(source: StoredCardInstance[], cardId: string, count: number): StoredCardInstance[] {
  const removed: StoredCardInstance[] = [];

  for (let index = source.length - 1; index >= 0 && removed.length < count; index -= 1) {
    if (source[index]?.cardId !== cardId) {
      continue;
    }

    removed.push(...source.splice(index, 1));
  }

  if (removed.length !== count) {
    throw new Error(`Missing required ${cardId} cards`);
  }

  return removed.reverse();
}

/** Derives the equipment slot from a card name (first French noun of the card name). */
function getObjectSlot(cardName: string): string {
  const lower = cardName.toLowerCase();
  if (lower.startsWith("anneau")) return "anneau";
  if (lower.startsWith("amulette")) return "amulette";
  if (lower.startsWith("bâton") || lower.startsWith("baton")) return "baton";
  if (lower.startsWith("ceinture")) return "ceinture";
  if (lower.startsWith("robe")) return "robe";
  return "other";
}

function getPowerRingLevel(cardId: string): number | null {
  switch (cardId) {
    case "anneau-de-puissance-1":
      return 1;
    case "anneau-de-puissance-2":
      return 2;
    case "anneau-de-puissance-3":
      return 3;
    default:
      return null;
  }
}

function getEquippedPowerRings(seat: StoredSeatState): StoredCardInstance[] {
  return seat.objects.filter((objectCard) => getPowerRingLevel(objectCard.cardId) != null);
}

const OBJECT_SLOT_LIMITS: Record<string, number> = {
  anneau: 2,
  amulette: 1,
  baton: 1,
  ceinture: 1,
  robe: 1,
  other: 1
};

function normalizeSeatObjectSlots(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seat = getStoredSeat(game, seatNumber);
  const overflowBySlot = new Map<string, StoredCardInstance[]>();
  for (const objectCard of seat.objects) {
    const slot = getObjectSlot(requireDefinition(objectCard.cardId).name);
    const slotCards = overflowBySlot.get(slot) ?? [];
    slotCards.push(objectCard);
    overflowBySlot.set(slot, slotCards);
  }

  const removed: StoredCardInstance[] = [];
  for (const [slot, slotCards] of overflowBySlot.entries()) {
    const limit = OBJECT_SLOT_LIMITS[slot] ?? 1;
    while (slotCards.length > limit) {
      const displaced = slotCards.shift();
      if (displaced == null) {
        break;
      }

      const index = seat.objects.findIndex((candidate) => candidate.instanceId === displaced.instanceId);
      if (index >= 0) {
        seat.objects.splice(index, 1);
      }
      removed.push(displaced);
      appendServerDebugLog(
        match,
        "object",
        `Seat ${seatNumber} discarded overflow ${requireDefinition(displaced.cardId).name} to enforce ${slot} slot limit ${limit}`
      );
    }
  }

  if (removed.length > 0) {
    discardInstances(game, removed);
  }
  syncObjectOwnershipStats(match);
}

function addObjectToSeat(match: StoredMatchState, seatNumber: number, card: StoredCardInstance, interactive: boolean = false): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const seat = getStoredSeat(game, seatNumber);
  seat.objects.push(card);
  syncObjectOwnershipStats(match);

  if (interactive) {
    const slot = getObjectSlot(requireDefinition(card.cardId).name);
    const limit = OBJECT_SLOT_LIMITS[slot] ?? 1;
    const slotCount = seat.objects.filter(
      (o) => getObjectSlot(requireDefinition(o.cardId).name) === slot
    ).length;
    if (slotCount > limit) {
      return true; // overflow — skip normalization, let caller handle interactively
    }
  }

  normalizeSeatObjectSlots(match, seatNumber);
  return false;
}

function queueRingDiscardChoice(
  match: StoredMatchState,
  seatNumber: number,
  newRingCard: StoredCardInstance,
  boxId: string | undefined,
  finalizeActorSeatNumber: number
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const seat = getStoredSeat(game, seatNumber);
  const rings = seat.objects.filter(
    (o) => getObjectSlot(requireDefinition(o.cardId).name) === "anneau"
  );
  const limit = OBJECT_SLOT_LIMITS["anneau"] ?? 2;
  if (rings.length <= limit) {
    return false;
  }

  const publicSeat = getPublicSeat(match, seatNumber);
  if (publicSeat.controllerType === "bot") {
    const toDiscard = rings.find((r) => r.instanceId !== newRingCard.instanceId) ?? rings[0];
    if (toDiscard != null) {
      const removed = removeObjectFromSeat(match, seatNumber, toDiscard.instanceId);
      discardInstances(game, removed);
      appendServerDebugLog(
        match,
        "object",
        `Bot seat ${seatNumber} auto-discarded ${requireDefinition(toDiscard.cardId).name} for ring overflow`
      );
    }
    return false;
  }

  game.pendingObjectChoice = {
    boxId,
    chooserSeatNumber: seatNumber,
    ownerSeatNumber: seatNumber,
    sourceCard: newRingCard,
    mode: "discard_ring",
    finalizeActorSeatNumber
  };
  appendServerDebugLog(match, "object", `Seat ${seatNumber} must choose a ring to discard (overflow)`);
  refreshSeatSummaries(match);
  return true;
}

function movePersistentCard(
  match: StoredMatchState,
  actorSeatNumber: number,
  targetSeatNumbers: number[],
  card: StoredCardInstance,
  definition: BaseCardDefinition,
  sourceZone: "hand" | "object" = "hand"
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  if (definition.category.code === "O") {
    const isRing = getObjectSlot(definition.name) === "anneau";
    const ringOverflow = isRing
      ? addObjectToSeat(match, actorSeatNumber, card, true)
      : (addObjectToSeat(match, actorSeatNumber, card), false);
    appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} equipped ${definition.name}`);
    return ringOverflow;
  }

  if (definition.category.code === "SO") {
    for (const targetSeatNumber of targetSeatNumbers) {
      getStoredSeat(game, targetSeatNumber).statuses.push({
        instanceId: card.instanceId,
        cardId: card.cardId,
        sourceSeatNumber: actorSeatNumber
      });
      appendServerDebugLog(match, "status", `Seat ${targetSeatNumber} received status ${definition.name} from seat ${actorSeatNumber}`);
      const actorName = getPublicSeat(match, actorSeatNumber).displayName;
      const targetName = getPublicSeat(match, targetSeatNumber).displayName;
      appendDealerMessage(match, `${actorName} placed ${definition.name} on ${targetName}.`);
    }
    return false;
  }

  if (definition.id === "sanctuaire-demmerlaus") {
    addObjectToSeat(match, actorSeatNumber, card);
    appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} placed ${definition.name} in play`);
    return false;
  }

  if (definition.id === "hydromel") {
    const seat = getStoredSeat(game, actorSeatNumber);
    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber
    });
    appendServerDebugLog(match, "status", `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves`);
    return false;
  }

  if (definition.id === "abondance") {
    const seat = getStoredSeat(game, actorSeatNumber);
    const actorSeat = getActorSeatForAction(match, actorSeatNumber, definition, sourceZone);
    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber,
      remainingTurnTriggers: Math.max(1, actorSeat.powerLevel ?? 1),
      bodyBound: true,
      activatesNextTurn: true
    });
    appendServerDebugLog(
      match,
      "status",
      `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves for ${Math.max(1, actorSeat.powerLevel ?? 1)} turn(s), starting next turn`
    );
    return false;
  }

  if (definition.id === "puissance") {
    const seat = getStoredSeat(game, actorSeatNumber);
    const actorSeat = getActorSeatForAction(match, actorSeatNumber, definition, sourceZone);
    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber,
      remainingTurnTriggers: Math.max(1, actorSeat.powerLevel ?? 1),
      bodyBound: true
    });
    appendServerDebugLog(
      match,
      "status",
      `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves for ${Math.max(1, actorSeat.powerLevel ?? 1)} turn(s)`
    );
    return false;
  }

  if (TIMED_POTION_STATUS_BY_CARD_ID[definition.id] != null) {
    const seat = getStoredSeat(game, actorSeatNumber);
    const durationNotation = TIMED_POTION_STATUS_BY_CARD_ID[definition.id]!.durationNotation;
    const roll = rollDiceNotationDetailed(durationNotation);
    publishSeatDiceRoll(match, actorSeatNumber, durationNotation, roll.total, roll.values);
    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber,
      remainingTurnTriggers: Math.max(1, roll.total),
      bodyBound: true,
      activatesNextTurn: true
    });
    appendServerDebugLog(
      match,
      "status",
      `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves for ${Math.max(1, roll.total)} turn(s), starting next turn`
    );
    return false;
  }

  if (definition.id === "pacte-tenebreux") {
    const seat = getStoredSeat(game, actorSeatNumber);
    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber,
      bodyBound: true
    });
    appendServerDebugLog(match, "status", `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves`);
    return false;
  }

  if (PERSISTENT_OWNER_TURN_MASS_DAMAGE_BY_CARD_ID[definition.id] != null) {
    const seat = getStoredSeat(game, actorSeatNumber);
    const actorSeat = getActorSeatForAction(match, actorSeatNumber, definition, sourceZone);
    const remainingTurnTriggers = Math.max(0, (actorSeat.powerLevel ?? 1) - 1);
    if (remainingTurnTriggers === 0) {
      discardInstances(game, [card]);
      appendServerDebugLog(match, "status", `Seat ${actorSeatNumber}'s ${definition.name} resolved immediately and was discarded`);
      return false;
    }

    seat.statuses.push({
      instanceId: card.instanceId,
      cardId: card.cardId,
      sourceSeatNumber: actorSeatNumber,
      remainingTurnTriggers,
      bodyBound: true
    });
    appendServerDebugLog(
      match,
      "status",
      `Seat ${actorSeatNumber} placed ${definition.name} in front of themselves with ${remainingTurnTriggers} remaining turn trigger(s)`
    );
    return false;
  }

  game.discardPile.push(card);
  return false;
}

function resolveAbundanceTurnStart(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  game.forcedPlayCategories = undefined;
  const seatState = getStoredSeat(game, seatNumber);
  const abundanceStatuses = seatState.statuses.filter((status) => status.cardId === "abondance");
  if (abundanceStatuses.length === 0) {
    return;
  }

  for (const status of abundanceStatuses) {
    if (status.activatesNextTurn === true) {
      status.activatesNextTurn = false;
    }
  }

  const activeStatus = abundanceStatuses.find((status) => (status.remainingTurnTriggers ?? 0) > 0 && status.activatesNextTurn !== true);
  if (activeStatus == null) {
    return;
  }

  game.forcedPlayCategories = [...ABUNDANCE_ALLOWED_CATEGORIES];
  appendServerDebugLog(
    match,
    "status",
    `Seat ${seatNumber} starts an Abondance turn with ${(activeStatus.remainingTurnTriggers ?? 0)} turn(s) remaining`
  );
}

function resolveVitalityRingTurnStart(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  if (!seatState.objects.some((objectCard) => objectCard.cardId === "anneau-de-vitalite")) {
    return;
  }

  const roll = rollDiceNotationDetailed("1D6");
  publishSeatDiceRoll(match, seatNumber, "1D6", roll.total, roll.values);
  const healResult = setSeatHp(match, seatNumber, getPublicSeat(match, seatNumber).hp + roll.total);
  if (healResult.delta <= 0) {
    appendServerDebugLog(match, "status", `Seat ${seatNumber}'s Anneau de vitalité triggered for ${roll.total} but healed 0`);
    return;
  }

  recordHealing(match, seatNumber, seatNumber, healResult.delta);
  pushPresentationEvent(match, {
    type: "hp_gain",
    seatNumber,
    cardName: "Anneau de vitalité",
    amount: healResult.delta
  });
  appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName}'s Anneau de vitalité restores ${healResult.delta} HP.`);
  appendServerDebugLog(match, "status", `Seat ${seatNumber}'s Anneau de vitalité restored ${healResult.delta} HP`);
}

function resolveTimedPotionTurnStart(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const timedPotionStatuses = seatState.statuses.filter((status) => TIMED_POTION_STATUS_BY_CARD_ID[status.cardId] != null);
  if (timedPotionStatuses.length === 0) {
    return;
  }

  for (const status of timedPotionStatuses) {
    if (status.activatesNextTurn === true) {
      status.activatesNextTurn = false;
    }
  }

  const extraPlaysGranted = getActiveTimedPotionStatuses(seatState)
    .reduce((count, status) => count + (TIMED_POTION_STATUS_BY_CARD_ID[status.cardId]?.extraPlaysPerTurn ?? 0), 0);
  if (extraPlaysGranted > 0) {
    seatState.pendingExtraPlays += extraPlaysGranted;
    appendServerDebugLog(
      match,
      "status",
      `Seat ${seatNumber} gains ${extraPlaysGranted} extra play(s) from timed potion statuses`
    );
  }
}

function resolveAbundanceTurnEnd(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const abundanceStatuses = seatState.statuses.filter((status) =>
    status.cardId === "abondance" && status.activatesNextTurn !== true && (status.remainingTurnTriggers ?? 0) > 0
  );

  for (const status of abundanceStatuses) {
    const nextRemainingTurnTriggers = Math.max(0, (status.remainingTurnTriggers ?? 0) - 1);
    if (nextRemainingTurnTriggers > 0) {
      status.remainingTurnTriggers = nextRemainingTurnTriggers;
      appendServerDebugLog(
        match,
        "status",
        `Seat ${seatNumber}'s Abondance has ${nextRemainingTurnTriggers} affected turn(s) remaining`
      );
      continue;
    }

    seatState.statuses = seatState.statuses.filter((candidate) => candidate.instanceId !== status.instanceId);
    discardInstances(game, [{ instanceId: status.instanceId, cardId: status.cardId }]);
    appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName}'s Abondance ends.`);
    appendServerDebugLog(match, "status", `Seat ${seatNumber}'s Abondance expired at end of turn`);
  }

  game.forcedPlayCategories = undefined;
}

function resolveTimedPotionTurnEnd(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const activePotionStatuses = getActiveTimedPotionStatuses(seatState);
  for (const status of activePotionStatuses) {
    const definition = requireDefinition(status.cardId);
    const nextRemainingTurnTriggers = Math.max(0, (status.remainingTurnTriggers ?? 0) - 1);
    if (nextRemainingTurnTriggers > 0) {
      status.remainingTurnTriggers = nextRemainingTurnTriggers;
      appendServerDebugLog(
        match,
        "status",
        `Seat ${seatNumber}'s ${definition.name} has ${nextRemainingTurnTriggers} affected turn(s) remaining`
      );
      continue;
    }

    seatState.statuses = seatState.statuses.filter((candidate) => candidate.instanceId !== status.instanceId);
    discardInstances(game, [{ instanceId: status.instanceId, cardId: status.cardId }]);
    appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName}'s ${definition.name} ends.`);
    appendServerDebugLog(match, "status", `Seat ${seatNumber}'s ${definition.name} expired at end of turn`);
  }
}

function resolveTotalPowerOverrideTurnEnd(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const activeStatuses = seatState.statuses.filter(
    (status) =>
      TOTAL_POWER_OVERRIDE_STATUS_CARD_IDS.has(status.cardId)
      && status.activatesNextTurn !== true
      && (status.remainingTurnTriggers ?? 0) > 0
  );

  for (const status of activeStatuses) {
    const definition = requireDefinition(status.cardId);
    const nextRemainingTurnTriggers = Math.max(0, (status.remainingTurnTriggers ?? 0) - 1);
    if (nextRemainingTurnTriggers > 0) {
      status.remainingTurnTriggers = nextRemainingTurnTriggers;
      appendServerDebugLog(
        match,
        "status",
        `Seat ${seatNumber}'s ${definition.name} has ${nextRemainingTurnTriggers} affected turn(s) remaining`
      );
      continue;
    }

    seatState.statuses = seatState.statuses.filter((candidate) => candidate.instanceId !== status.instanceId);
    discardInstances(game, [{ instanceId: status.instanceId, cardId: status.cardId }]);
    appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName}'s ${definition.name} ends.`);
    appendServerDebugLog(match, "status", `Seat ${seatNumber}'s ${definition.name} expired at end of turn`);
  }
}

function describePlay(match: StoredMatchState, actorSeatNumber: number, definition: BaseCardDefinition, request: PlayCardRequest, targetSeatNumbers: number[]): string {
  const actorName = getPublicSeat(match, actorSeatNumber).displayName;

  if (request.mode === "inactive") {
    return `${actorName} discarded ${definition.name}.`;
  }

  if (definition.rules.targets === "all_opponents") {
    return `${actorName} played ${definition.name} against everyone.`;
  }

  if (request.targetObjectInstanceId != null) {
    const game = match.internalGame!;
    const owner = game.seatStates.find((seat) => seat.objects.some((card) => card.instanceId === request.targetObjectInstanceId));
    if (owner != null) {
      return `${actorName} played ${definition.name} on ${getPublicSeat(match, owner.seatNumber).displayName}'s object.`;
    }
  }

  if (targetSeatNumbers[0] != null) {
    if (targetSeatNumbers[0] === actorSeatNumber) {
      return `${actorName} played ${definition.name}.`;
    }
    return `${actorName} played ${definition.name} on ${getPublicSeat(match, targetSeatNumbers[0]).displayName}.`;
  }

  return `${actorName} played ${definition.name}.`;
}

function applyEffect(
  match: StoredMatchState,
  actorSeatNumber: number,
  cardInstance: StoredCardInstance,
  definition: BaseCardDefinition,
  effect: CardEffect,
  targetSeatNumbers: number[],
  targetObjectInstanceId?: string,
  boxId?: string,
  damageMultiplier = 1,
  objectChoiceFinalizeActorSeatNumber?: number,
  sourceZone: "hand" | "object" = "hand"
): boolean {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("Game not initialized");
  }

  const actorSeat = getActorSeatForAction(match, actorSeatNumber, definition, sourceZone);
  const actorState = getStoredSeat(game, actorSeatNumber);
  const timedPotionDamageMultiplier = getTimedPotionDamageMultiplier(match, actorSeatNumber);

  switch (effect.type) {
    case "damage": {
      appendServerDebugLog(match, "effect", `${definition.name} resolves damage on ${targetSeatNumbers.length > 0 ? targetSeatNumbers.join(", ") : "no targets"}${boxId != null ? ` [box ${boxId}]` : ""}`);
      const sacrificeAmount = effect.amount.kind === "sacrifice_amount"
        ? evaluateRoll(match, effect.amount, actorSeat, undefined, actorSeatNumber, boxId)
        : undefined;
      const sharedDamageAmount =
        effect.amount.kind === "dice_per_power" && effect.amount.powerSource === "self"
          ? evaluateRoll(match, effect.amount, actorSeat, undefined, actorSeatNumber, boxId, {
            seatNumber: actorSeatNumber,
            highIsGood: true
          })
          : undefined;

      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const amount = (
          sacrificeAmount
          ?? sharedDamageAmount
          ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId, {
            seatNumber: actorSeatNumber,
            highIsGood: true
          })
        ) * damageMultiplier * timedPotionDamageMultiplier;
        applyDamage(match, targetSeatNumber, amount, definition, false, boxId, actorSeatNumber);
      }

      if (sacrificeAmount != null) {
        actorSeat.hp -= sacrificeAmount;
        recordLowestHpSurvived(match, actorSeatNumber);
        handleSeatDeath(match, actorSeatNumber, false, actorSeatNumber);
      }
      break;
    }
    case "heal":
      appendServerDebugLog(match, "effect", `${definition.name} resolves heal${boxId != null ? ` [box ${boxId}]` : ""}`);
      if (effect.target === "self") {
        const healAmount = evaluateRoll(match, effect.amount, actorSeat, actorSeat, actorSeatNumber, boxId, {
          seatNumber: actorSeatNumber,
          highIsGood: true
        });
        const healResult = setSeatHp(match, actorSeatNumber, actorSeat.hp + healAmount);
        if (healResult.delta > 0) {
          recordHealing(match, actorSeatNumber, actorSeatNumber, healResult.delta);
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: actorSeatNumber,
            cardName: definition.name,
            amount: healResult.delta
          });
        }
      } else {
        const aliveOpponents = nextLivingOpponentSeatNumbers(game, actorSeatNumber);
        for (const targetSeatNumber of aliveOpponents) {
          const healAmount = evaluateRoll(match, effect.amount, actorSeat, getPublicSeat(match, targetSeatNumber), actorSeatNumber, boxId, {
            seatNumber: actorSeatNumber,
            highIsGood: true
          });
          const healResult = setSeatHp(match, targetSeatNumber, getPublicSeat(match, targetSeatNumber).hp + healAmount);
          if (healResult.delta > 0) {
            recordHealing(match, actorSeatNumber, targetSeatNumber, healResult.delta);
            pushPresentationEvent(match, {
              boxId,
              type: "hp_gain",
              seatNumber: targetSeatNumber,
              cardName: definition.name,
              amount: healResult.delta
            });
          }
        }
      }
      break;
    case "redraw_hand":
      appendServerDebugLog(match, "effect", `${definition.name} redraws hand for ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        redrawSeatHand(match, targetSeatNumber, effect.redrawCount, boxId);
      }
      break;
    case "lifesteal":
      appendServerDebugLog(match, "effect", `${definition.name} resolves lifesteal on ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const amount = evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          effect.powerSource === "target" ? targetSeat : actorSeat,
          actorSeatNumber,
          boxId,
          {
            seatNumber: actorSeatNumber,
            highIsGood: true
          }
        ) * damageMultiplier * timedPotionDamageMultiplier;
        const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, boxId, actorSeatNumber);
        if (dealt > 0 && getStoredSeat(game, actorSeatNumber).alive) {
          const lifestealResult = setSeatHp(match, actorSeatNumber, getPublicSeat(match, actorSeatNumber).hp + dealt);
          if (lifestealResult.delta > 0) {
            recordHealing(match, actorSeatNumber, actorSeatNumber, lifestealResult.delta);
            pushPresentationEvent(match, {
              boxId,
              type: "hp_gain",
              seatNumber: actorSeatNumber,
              cardName: definition.name,
              amount: lifestealResult.delta
            });
          }
        }
      }
      break;
    case "set_target_hp":
      appendServerDebugLog(match, "effect", `${definition.name} sets HP for ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const evaluatedHp = evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId);
        const requestedHp = definition.id === "limite-de-30-points-de-vie"
          ? Math.min(targetSeat.hp, evaluatedHp)
          : evaluatedHp;
        const hpResult = setSeatHp(match, targetSeatNumber, requestedHp);

        appendServerDebugLog(
          match,
          "effect",
          `${definition.name} set seat ${targetSeatNumber} HP ${hpResult.previousHp} -> ${hpResult.nextHp}${boxId != null ? ` [box ${boxId}]` : ""}`
        );

        if (hpResult.delta < 0) {
          recordLowestHpSurvived(match, targetSeatNumber);
          pushPresentationEvent(match, {
            boxId,
            type: "hp_loss",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: Math.abs(hpResult.delta)
          });
        } else if (hpResult.delta > 0) {
          recordHealing(match, actorSeatNumber, targetSeatNumber, hpResult.delta);
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: hpResult.delta
          });
        }

        handleSeatDeath(match, targetSeatNumber, false, actorSeatNumber);
      }
      break;
    case "instant_kill":
      appendServerDebugLog(match, "effect", `${definition.name} attempts instant kill on ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        if (targetSeat.hp > 0) {
          pushPresentationEvent(match, {
            boxId,
            type: "hp_loss",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: targetSeat.hp
          });
          setSeatHp(match, targetSeatNumber, 0);
        }
        handleSeatDeath(match, targetSeatNumber, effect.resurrectionBlocked ?? false, actorSeatNumber);
      }
      break;
    case "remove_target_object":
      if (!maybePassChanceRoll(match, actorSeatNumber, effect, targetSeatNumbers, boxId)) {
        break;
      }

      if (effect.mode === "all") {
        for (const targetSeatNumber of targetSeatNumbers) {
          const removed = removeAllObjectsFromSeat(match, targetSeatNumber);
          discardInstances(game, removed);
        }
      } else {
        let ownerSeatNumber: number;
        try {
          ownerSeatNumber = requestObjectOwnerSeatNumber(match, actorSeatNumber, targetSeatNumbers, targetObjectInstanceId, definition);
        } catch (error) {
          appendServerDebugLog(
            match,
            "object",
            `${definition.name} skipped remove_target_object because ${error instanceof Error ? error.message : "the target object became invalid"}${boxId != null ? ` [box ${boxId}]` : ""}`
          );
          return false;
        }
        if (targetObjectInstanceId == null) {
          return queueObjectChoice(match, actorSeatNumber, ownerSeatNumber, cardInstance, "remove", boxId, objectChoiceFinalizeActorSeatNumber);
        }

        const removed = removeObjectFromSeat(match, ownerSeatNumber, targetObjectInstanceId);
        discardInstances(game, removed);
        if (removed[0] != null) {
          appendServerDebugLog(match, "object", `${definition.name} discarded ${requireDefinition(removed[0].cardId).name} from seat ${ownerSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`);
        }
      }
      break;
    case "steal_target_object": {
      let ownerSeatNumber: number;
      try {
        ownerSeatNumber = requestObjectOwnerSeatNumber(match, actorSeatNumber, targetSeatNumbers, targetObjectInstanceId, definition);
      } catch (error) {
        appendServerDebugLog(
          match,
          "object",
          `${definition.name} skipped steal_target_object because ${error instanceof Error ? error.message : "the target object became invalid"}${boxId != null ? ` [box ${boxId}]` : ""}`
        );
        return false;
      }
      if (targetObjectInstanceId == null) {
        return queueObjectChoice(match, actorSeatNumber, ownerSeatNumber, cardInstance, "steal", boxId, objectChoiceFinalizeActorSeatNumber);
      }
      const removed = removeObjectFromSeat(match, ownerSeatNumber, targetObjectInstanceId);
      removed.forEach((card) => addObjectToSeat(match, actorSeatNumber, card));
      if (removed[0] != null) {
        appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} stole ${requireDefinition(removed[0].cardId).name} from seat ${ownerSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`);
      }
      break;
    }
    case "modify_resistance":
      // O-category cards stay in play as objects; computeResistanceThreshold already
      // reads the modifier from storedSeat.objects, so no separate status entry is needed.
      // SO-category curses/statuses are added by movePersistentCard; avoid duplicating them here.
      if (
        effect.duration === "until_removed"
        && definition.category.code !== "O"
        && definition.category.code !== "SO"
        && definition.id !== "hydromel"
      ) {
        for (const targetSeatNumber of targetSeatNumbers) {
          getStoredSeat(game, targetSeatNumber).statuses.push({
            instanceId: randomUUID(),
            cardId: cardInstance.cardId,
            sourceSeatNumber: actorSeatNumber
          });
        }
      }
      break;
    case "skip_turn":
      for (const targetSeatNumber of targetSeatNumbers) {
        getStoredSeat(game, targetSeatNumber).skipTurnsRemaining += effect.durationTurns;
      }
      break;
    case "disable_riposte":
      if (effect.duration === "full_turn") {
        for (const targetSeatNumber of targetSeatNumbers) {
          const targetState = getStoredSeat(game, targetSeatNumber);
          targetState.noRiposteTurnsRemaining = Math.max(targetState.noRiposteTurnsRemaining, 1);
          if (!targetState.statuses.some((status) => status.cardId === cardInstance.cardId)) {
            targetState.statuses.push({
              instanceId: randomUUID(),
              cardId: cardInstance.cardId,
              sourceSeatNumber: actorSeatNumber
            });
          }
          appendServerDebugLog(
            match,
            "status",
            `Seat ${targetSeatNumber} cannot respond to attacks for a full turn from ${definition.name}${boxId != null ? ` [box ${boxId}]` : ""}`
          );
        }
      }
      break;
    case "paralyze_for_bonus_attack":
      if (targetSeatNumbers[0] != null && getStoredSeat(game, targetSeatNumbers[0]).alive) {
        const pendingAction = game.pendingAction;
        game.forcedFollowUp = {
          sourceCardId: "colere-du-magicien",
          actorSeatNumber,
          targetSeatNumber: targetSeatNumbers[0],
          turnOwnerSeatNumber: pendingAction?.mirrorOriginActorSeatNumber ?? actorSeatNumber,
          allowedCategories: ["AD"],
          doubleHpLossDamage: effect.doubledDamageForForcedAttack,
          suppressDefenseWindow: true,
          suppressResistanceCheck: true
        };
        appendDealerMessage(
          match,
          `${actorSeat.displayName} paralyzed ${getPublicSeat(match, targetSeatNumbers[0]).displayName} with ${definition.name} and may immediately play an AD card.`
        );
        appendServerDebugLog(
          match,
          "forced_follow_up",
          `Seat ${actorSeatNumber} must play AD against seat ${targetSeatNumbers[0]} after ${definition.name}`
        );
      }
      break;
    case "play_extra_cards":
      actorState.pendingExtraPlays += effect.count;
      if ((definition.id === "masse-double" || definition.id === "double-attaque") && effect.allowedCategories !== "any") {
        game.extraPlayMode = {
          sourceCardId: definition.id,
          actorSeatNumber,
          allowedCategories: [...effect.allowedCategories],
          requiredActivePlaysRemaining: 1,
          remainingRestrictedPlays: effect.count,
          temporaryPowerBonus: 2,
          temporaryResistanceModifier: 0
        };
      } else if (definition.id === "puissance-totale" && effect.allowedCategories !== "any") {
        game.extraPlayMode = {
          sourceCardId: definition.id,
          actorSeatNumber,
          allowedCategories: [...effect.allowedCategories],
          requiredActivePlaysRemaining: 1,
          remainingRestrictedPlays: effect.count,
          temporaryPowerBonus: 0,
          temporaryResistanceModifier: 0,
          useTotalAlivePower: true
        };
      } else if (definition.id.startsWith("resistance-diminuee-")) {
        game.extraPlayMode = {
          sourceCardId: definition.id,
          actorSeatNumber,
          allowedCategories: "any",
          requiredActivePlaysRemaining: 1,
          remainingRestrictedPlays: effect.count,
          temporaryPowerBonus: 0,
          temporaryResistanceModifier: getResistanceDiminueePenalty(definition.id)
        };
      }
      appendServerDebugLog(match, "turn", `Seat ${actorSeatNumber} gained ${effect.count} extra play(s) from ${definition.name}${boxId != null ? ` [box ${boxId}]` : ""}`);
      break;
    case "swap_bodies":
      if (targetSeatNumbers[0] != null) {
        swapSeatOccupants(match, actorSeatNumber, targetSeatNumbers[0], effect);
      }
      break;
    case "board_reset": {
      const keepableCards = actorState.hand.slice();
      if (effect.keeperCards > 0 && keepableCards.length > 0) {
        if (queueBoardResetKeepChoice(match, actorSeatNumber, cardInstance, definition.rules.effects.indexOf(effect), boxId)) {
          return true;
        }

        const botKeptCard = pickRandom(keepableCards);
        executeBoardReset(
          match,
          actorSeatNumber,
          cardInstance,
          effect,
          botKeptCard == null ? [] : [botKeptCard.instanceId],
          boxId
        );
        break;
      }

      executeBoardReset(match, actorSeatNumber, cardInstance, effect, [], boxId);
      break;
    }
    case "grant_attack_immunity":
      actorState.attackImmunityTurns = Math.max(actorState.attackImmunityTurns, effect.durationTurns);
      if (effect.bonusHeal != null) {
        const bonusHealAmount = evaluateRoll(match, effect.bonusHeal, actorSeat, actorSeat, actorSeatNumber, boxId, {
          seatNumber: actorSeatNumber,
          highIsGood: true
        });
        const bonusHealResult = setSeatHp(match, actorSeatNumber, actorSeat.hp + bonusHealAmount);
        if (bonusHealResult.delta > 0) {
          recordHealing(match, actorSeatNumber, actorSeatNumber, bonusHealResult.delta);
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: actorSeatNumber,
            cardName: definition.name,
            amount: bonusHealResult.delta
          });
        }
      }
      break;
    case "power_modifier":
    case "resurrection_ring":
    case "absorb_damage":
      break;
    case "look_at_hand":
      if (targetSeatNumbers[0] != null) {
        actorState.handInspectionTargetSeatNumber = targetSeatNumbers[0];
        return queueHandInspection(
          match,
          actorSeatNumber,
          targetSeatNumbers[0],
          cardInstance,
          boxId,
          game.pendingAction == null ? (objectChoiceFinalizeActorSeatNumber ?? actorSeatNumber) : undefined
        );
      }
      break;
    case "dealer_message":
      appendDealerMessage(match, effect.messageKey);
      break;
  }

  return false;
}

function maybeQueueMassAttackStaffTurnAction(
  match: StoredMatchState,
  seatNumber: number,
  skipAfterAction: boolean
): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const staffCard = getSeatMassAttackStaff(seatState);
  if (staffCard == null) {
    return false;
  }

  const definition = requireDefinition(staffCard.cardId);
  const targetSeatNumbers = nextLivingOpponentSeatNumbers(game, seatNumber)
    .filter((targetSeatNumber) => !isProtectedFromAttack(match, targetSeatNumber, definition));
  if (targetSeatNumbers.length === 0) {
    appendServerDebugLog(match, "object", `Seat ${seatNumber}'s ${definition.name} found no valid targets at start of turn`);
    return false;
  }

  beginObjectPendingAction(
    match,
    seatNumber,
    staffCard,
    definition,
    targetSeatNumbers,
    `${getPublicSeat(match, seatNumber).displayName}'s ${definition.name} fires at everyone.`,
    {
      mode: skipAfterAction ? "advance_turn_without_play" : "resume_turn",
      seatNumber
    }
  );
  appendServerDebugLog(
    match,
    "object",
    `Seat ${seatNumber}'s ${definition.name} fired with ${getMassAttackStaffLoadedCount(staffCard)} stored AM card(s)`
  );
  return true;
}

function resolvePersistentOwnerTurnMassDamageStatuses(match: StoredMatchState, seatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const persistentStatuses = seatState.statuses.filter((status) =>
    PERSISTENT_OWNER_TURN_MASS_DAMAGE_BY_CARD_ID[status.cardId] != null
  );

  for (const status of persistentStatuses) {
    const definition = requireDefinition(status.cardId);
    resolvePersistentOwnerTurnMassDamageTick(match, seatNumber, definition, status);

    if (match.status === "finished") {
      return;
    }

    const nextRemainingTurnTriggers = Math.max(0, (status.remainingTurnTriggers ?? 0) - 1);
    if (nextRemainingTurnTriggers > 0) {
      status.remainingTurnTriggers = nextRemainingTurnTriggers;
      appendServerDebugLog(
        match,
        "status",
        `Seat ${seatNumber}'s ${definition.name} will trigger ${nextRemainingTurnTriggers} more time(s)`
      );
      continue;
    }

    seatState.statuses = seatState.statuses.filter((candidate) => candidate.instanceId !== status.instanceId);
    discardInstances(game, [{ instanceId: status.instanceId, cardId: status.cardId }]);
    appendDealerMessage(match, `${getPublicSeat(match, seatNumber).displayName}'s ${definition.name} ends.`);
    appendServerDebugLog(match, "status", `Seat ${seatNumber}'s ${definition.name} expired after its final trigger`);

    if (checkForWinner(match)) {
      return;
    }
  }
}

function startNextTurn(match: StoredMatchState, previousSeatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const ordered = aliveSeatNumbers(game);
  if (ordered.length === 0) {
    checkForWinner(match);
    return;
  }

  game.extraPlayMode = undefined;

  const currentIndex = ordered.indexOf(previousSeatNumber);
  if (game.temporalStopQueuedSeatNumber != null && !ordered.includes(game.temporalStopQueuedSeatNumber)) {
    game.temporalStopQueuedSeatNumber = undefined;
  }
  if (game.temporalStopActiveSeatNumber != null && !ordered.includes(game.temporalStopActiveSeatNumber)) {
    game.temporalStopActiveSeatNumber = undefined;
  }

  let nextIndex: number;
  if (
    currentIndex !== -1 &&
    game.temporalStopQueuedSeatNumber === previousSeatNumber &&
    game.temporalStopActiveSeatNumber == null
  ) {
    nextIndex = currentIndex;
    game.temporalStopQueuedSeatNumber = undefined;
    game.temporalStopActiveSeatNumber = previousSeatNumber;
    appendDealerMessage(match, `${getPublicSeat(match, previousSeatNumber).displayName} takes an extra turn with Arrêt temporaire d'Emmerlaüs.`);
    appendServerDebugLog(match, "turn", `Seat ${previousSeatNumber} begins the stopped-time extra turn`);
  } else {
    if (game.temporalStopActiveSeatNumber === previousSeatNumber) {
      game.temporalStopActiveSeatNumber = undefined;
      appendServerDebugLog(match, "turn", `Seat ${previousSeatNumber} finished the stopped-time extra turn`);
    }
    nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ordered.length;
  }
  let safety = 0;

  while (safety < ordered.length) {
    const candidateSeat = getStoredSeat(game, ordered[nextIndex]);
    normalizeSeatObjectSlots(match, candidateSeat.seatNumber);
    const hydromelStatuses = candidateSeat.statuses.filter((status) => status.cardId === "hydromel");
    if (hydromelStatuses.length > 0) {
      candidateSeat.statuses = candidateSeat.statuses.filter((status) => status.cardId !== "hydromel");
      discardInstances(game, hydromelStatuses.map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
      candidateSeat.skipTurnsRemaining += hydromelStatuses.length;
      appendDealerMessage(
        match,
        `${getPublicSeat(match, candidateSeat.seatNumber).displayName} discards Hydromel and will lose ${hydromelStatuses.length === 1 ? "that turn" : `${hydromelStatuses.length} turns`}.`
      );
      appendServerDebugLog(
        match,
        "status",
        `Seat ${candidateSeat.seatNumber} discarded ${hydromelStatuses.length} Hydromel status card(s) and gains ${hydromelStatuses.length} skip turn(s)`
      );
    }

    if (candidateSeat.noRiposteTurnsRemaining > 0) {
      candidateSeat.noRiposteTurnsRemaining -= 1;
      if (candidateSeat.noRiposteTurnsRemaining === 0) {
        const removedStatuses = candidateSeat.statuses.filter((status) => FULL_TURN_NO_RIPOSTE_STATUS_CARD_IDS.has(status.cardId));
        candidateSeat.statuses = candidateSeat.statuses.filter((status) => !FULL_TURN_NO_RIPOSTE_STATUS_CARD_IDS.has(status.cardId));
        discardInstances(game, removedStatuses.map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
        if (removedStatuses.length > 0) {
          appendServerDebugLog(match, "status", `Seat ${candidateSeat.seatNumber} recovered from full-turn no-riposte effects`);
        }
      }
    }

    game.currentTurnSeatNumber = candidateSeat.seatNumber;
    game.turnNumber += 1;
    refreshActiveObjectHoldDurations(match);
    candidateSeat.pendingExtraPlays = 0;
    candidateSeat.handInspectionTargetSeatNumber = undefined;
    resolveAbundanceTurnStart(match, candidateSeat.seatNumber);
    resolveVitalityRingTurnStart(match, candidateSeat.seatNumber);
    resolveTimedPotionTurnStart(match, candidateSeat.seatNumber);
    if (candidateSeat.attackImmunityTurns > 0) {
      candidateSeat.attackImmunityTurns -= 1;
      if (candidateSeat.attackImmunityTurns === 0) {
        const removedSanctuaryCards = candidateSeat.objects.filter((objectCard) => objectCard.cardId === "sanctuaire-demmerlaus");
        candidateSeat.objects = candidateSeat.objects.filter((objectCard) => objectCard.cardId !== "sanctuaire-demmerlaus");
        if (removedSanctuaryCards.length > 0) {
          discardInstances(game, removedSanctuaryCards);
          syncObjectOwnershipStats(match);
          appendServerDebugLog(match, "status", `Seat ${candidateSeat.seatNumber}'s Sanctuaire d'Emmerlaus expired`);
        }
      }
    }

    const losesTurn = candidateSeat.skipTurnsRemaining > 0;
    if (losesTurn) {
      candidateSeat.skipTurnsRemaining -= 1;
    }

    game.pendingCurseRelease = undefined;
    appendServerDebugLog(match, "turn", `Turn advanced to seat ${candidateSeat.seatNumber} (turn ${game.turnNumber})`);

    resolvePersistentOwnerTurnMassDamageStatuses(match, candidateSeat.seatNumber);
    if (match.status === "finished") {
      return;
    }

    if (maybeQueueMassAttackStaffTurnAction(match, candidateSeat.seatNumber, losesTurn)) {
      return;
    }

    if (losesTurn) {
      if (game.temporalStopActiveSeatNumber === candidateSeat.seatNumber) {
        game.temporalStopActiveSeatNumber = undefined;
        appendServerDebugLog(match, "turn", `Seat ${candidateSeat.seatNumber} consumed the stopped-time extra turn by skipping it`);
      }
      resolveAbundanceTurnEnd(match, candidateSeat.seatNumber);
      resolveTimedPotionTurnEnd(match, candidateSeat.seatNumber);
      resolveTotalPowerOverrideTurnEnd(match, candidateSeat.seatNumber);
      appendDealerMessage(match, `${getPublicSeat(match, candidateSeat.seatNumber).displayName} loses a turn.`);
      appendServerDebugLog(match, "turn", `Seat ${candidateSeat.seatNumber} skipped turn (${candidateSeat.skipTurnsRemaining} skips remaining)`);
      nextIndex = (nextIndex + 1) % ordered.length;
      safety += 1;
      continue;
    }

    maybeQueueCurseRelease(match, candidateSeat.seatNumber);
    return;
  }
}

export function passTurnWithoutPlaying(match: StoredMatchState, seatNumber: number, reason: string): void {
  const game = match.internalGame;
  if (game == null || game.currentTurnSeatNumber !== seatNumber) {
    return;
  }

  const seat = getStoredSeat(game, seatNumber);
  resolveAbundanceTurnEnd(match, seatNumber);
  resolveTimedPotionTurnEnd(match, seatNumber);
  resolveTotalPowerOverrideTurnEnd(match, seatNumber);
  const handBeforeRefill = seat.hand.length;
  while (seat.hand.length < game.minimumHandSize && seat.alive) {
    drawCards(match, seatNumber, 1);
  }

  appendServerDebugLog(
    match,
    "turn",
    `Seat ${seatNumber} ended turn without playing (${reason}); refill ${handBeforeRefill} -> ${seat.hand.length}`
  );
  startNextTurn(match, seatNumber);
  refreshSeatSummaries(match);
}

export function initializeMatchGame(match: StoredMatchState): void {
  const deck = createDeck(match.enabledExpansions);
  const minimumHandSize = determineMinimumHandSize(deck.length);
  const orderedSeats = sortBySeatNumber(match.seats);
  const seatNumbers = orderedSeats.map((seat) => seat.seatNumber);

  match.internalGame = {
    deck,
    discardPile: [],
    seatStates: orderedSeats.map((seat) => createSeatState(seat.seatNumber)),
    currentTurnSeatNumber: orderedSeats[Math.floor(Math.random() * orderedSeats.length)].seatNumber,
    turnNumber: 1,
    minimumHandSize,
    sessionStats: createMatchSessionStats(seatNumbers),
    sessionStatRuntime: createSessionStatRuntime(),
    diceRolls: [],
    presentationEvents: [],
    eventLog: [],
    debugLog: []
  };

  for (const seat of orderedSeats) {
    seat.hp = 50;
    seat.handCount = 0;
    seat.isAlive = true;
    drawCards(match, seat.seatNumber, minimumHandSize);
  }

  refreshSeatSummaries(match);
}

function buildPublicSeat(match: StoredMatchState, seat: SeatState, viewerSeatNumber?: number): SeatState {
  const game = match.internalGame;
  const publicSeat: SeatState = {
    ...seat,
    objects: [],
    statuses: []
  };

  if (game == null) {
    return publicSeat;
  }

  const storedSeat = getStoredSeat(game, seat.seatNumber);
  publicSeat.handCount = storedSeat.hand.length;
  publicSeat.powerLevel = computePowerLevel(match, seat.seatNumber);
  publicSeat.isAlive = storedSeat.alive;
  publicSeat.objects = storedSeat.objects.map((objectCard) =>
    buildCardView(objectCard, requireDefinition(objectCard.cardId), "object", false)
  );
  publicSeat.statuses = storedSeat.statuses.map((statusCard) =>
    buildCardView(statusCard, requireDefinition(statusCard.cardId), "status", false)
  );

  const viewerState = viewerSeatNumber != null ? getStoredSeat(game, viewerSeatNumber) : undefined;
  const publicRevealActive = game.pendingPublicHandReveal?.targetSeatNumbers.includes(seat.seatNumber) === true;
  const canSeeHand =
    viewerSeatNumber === seat.seatNumber
    || viewerState?.handInspectionTargetSeatNumber === seat.seatNumber
    || (viewerSeatNumber != null && publicRevealActive);

  if (canSeeHand) {
    publicSeat.hand = storedSeat.hand.map((handCard) => {
      const definition = requireDefinition(handCard.cardId);
      const playState = match.internalGame?.pendingAction != null
        ? canPlayCardAsPendingResponse(match, seat.seatNumber, handCard)
        : canPlayCardActively(match, seat.seatNumber, handCard);
      return buildCardView(handCard, definition, "hand", playState.canPlay, playState.reason);
    });
  }

  if (viewerSeatNumber === seat.seatNumber) {
    publicSeat.handInspectionTargetSeatNumber = storedSeat.handInspectionTargetSeatNumber;
  }

  return publicSeat;
}

function pushSeatSnapshotEventsForBox(match: StoredMatchState, boxId: string): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatNumbers = new Set<number>();
  for (const event of game.eventLog) {
    if (("boxId" in event ? event.boxId : undefined) !== boxId) {
      continue;
    }
    for (const seatNumber of getGameEventSeatNumbers(event)) {
      seatNumbers.add(seatNumber);
    }
  }

  for (const seatNumber of seatNumbers) {
    const publicSeat = getPublicSeat(match, seatNumber);
    pushGameEvent(match, {
      id: randomUUID(),
      boxId,
      type: "seat_snapshot",
      createdAt: new Date().toISOString(),
      seatNumber,
      seat: buildPublicSeat(match, publicSeat)
    });
  }
}

function buildPublicGameState(match: StoredMatchState, viewerSeatNumber?: number): GameState | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  const discardTop = game.discardPile.at(-1);
  const viewerSeat = viewerSeatNumber == null
    ? undefined
    : match.seats.find((seat) => seat.seatNumber === viewerSeatNumber);
  return {
    turnNumber: game.turnNumber,
    currentTurnSeatNumber: game.currentTurnSeatNumber,
    minimumHandSize: game.minimumHandSize,
    deckCount: game.deck.length,
    discardCount: game.discardPile.length,
    discardTop: discardTop == null
      ? undefined
      : buildCardView(discardTop, requireDefinition(discardTop.cardId), "discard", false),
    lastPlayedCard: game.lastPlayedCard,
    diceRolls: [...game.diceRolls],
    presentationEvents: [...game.presentationEvents],
    eventLog: [...game.eventLog],
    debugLog: viewerSeat?.isHost ? [...game.debugLog] : [],
    pendingAction: buildPendingActionPublicState(match),
    pendingResponseOptions: viewerSeatNumber == null ? [] : getResponseOptionChoices(match, viewerSeatNumber),
    pendingObjectChoice: buildPendingObjectChoicePublicState(match),
    pendingHandInspection: buildPendingHandInspectionPublicState(match),
    pendingPublicHandReveal: buildPendingPublicHandRevealPublicState(match),
    pendingBoardResetKeep: buildPendingBoardResetKeepPublicState(match, viewerSeatNumber),
    pendingDeathSearch: buildPendingDeathSearchPublicState(match, viewerSeatNumber),
    pendingPickpocket: buildPendingPickpocketPublicState(match, viewerSeatNumber),
    pendingSacrificeChoice: buildPendingSacrificeChoicePublicState(match),
    pendingCurseRelease: buildPendingCurseReleasePublicState(match),
    sessionStats: {
      seatStats: game.sessionStats.seatStats.map((seatStats) => ({ ...seatStats }))
    },
    forcedFollowUp: game.forcedFollowUp == null
      ? undefined
      : {
        sourceCardName: requireDefinition(game.forcedFollowUp.sourceCardId).name,
        actorSeatNumber: game.forcedFollowUp.actorSeatNumber,
        targetSeatNumber: game.forcedFollowUp.targetSeatNumber,
        allowedCategories: [...game.forcedFollowUp.allowedCategories],
        doubleHpLossDamage: game.forcedFollowUp.doubleHpLossDamage,
        consumeMode: game.forcedFollowUp.consumeMode
      },
    winnerSeatNumber: game.winnerSeatNumber
  };
}

export function buildPublicMatchState(match: StoredMatchState, viewerUserId?: string): MatchState {
  const viewerSeatNumber = viewerUserId == null
    ? undefined
    : match.seats.find((seat) => seat.userId === viewerUserId)?.seatNumber;

  return {
    instanceId: match.instanceId,
    shortId: match.shortId,
    status: match.status,
    maxSeats: match.maxSeats,
    enabledExpansions: { ...match.enabledExpansions },
    seats: sortBySeatNumber(match.seats).map((seat) => buildPublicSeat(match, seat, viewerSeatNumber)),
    spectators: match.spectators.map((spectator) => ({ ...spectator })),
    game: buildPublicGameState(match, viewerSeatNumber),
    createdAt: match.createdAt,
    startedAt: match.startedAt
  };
}

function buildPendingActionPublicState(match: StoredMatchState): PendingActionState | undefined {
  const pendingAction = match.internalGame?.pendingAction;
  if (pendingAction == null) {
    return undefined;
  }

  return {
    boxId: pendingAction.boxId,
    actorSeatNumber: pendingAction.actorSeatNumber,
    targetSeatNumbers: [...pendingAction.targetSeatNumbers],
    responderSeatNumbers: [...pendingAction.responderSeatNumbers],
    targetObjectInstanceId: pendingAction.targetObjectInstanceId,
    card: buildCardView(
      pendingAction.storedCard,
      requireDefinition(pendingAction.storedCard.cardId),
      pendingAction.sourceZone === "object" ? "object" : "discard",
      false
    ),
    summary: pendingAction.summary,
    responseMode: pendingAction.responseMode,
    fromMirror: pendingAction.fromMirror,
    mirrorOriginActorSeatNumber: pendingAction.mirrorOriginActorSeatNumber,
    responders: pendingAction.responders.map((responder) => ({
      seatNumber: responder.seatNumber,
      state: responder.state,
      choice: responder.choice,
      committedCardCount: responder.consumedCards.length,
      card: responder.consumedCards[0] == null
        ? undefined
        : buildCardView(responder.consumedCards[0], requireDefinition(responder.consumedCards[0].cardId), "discard", false),
      cards: responder.consumedCards.map((card) => buildCardView(card, requireDefinition(card.cardId), "discard", false))
    }))
  };
}

function buildPendingObjectChoicePublicState(match: StoredMatchState): GameState["pendingObjectChoice"] {
  const game = match.internalGame;
  const pendingObjectChoice = game?.pendingObjectChoice;
  if (game == null || pendingObjectChoice == null) {
    return undefined;
  }

  const owner = getStoredSeat(game, pendingObjectChoice.ownerSeatNumber);
  const sourceDefinition = requireDefinition(pendingObjectChoice.sourceCard.cardId);
  const isRingDiscard = pendingObjectChoice.mode === "discard_ring";
  const isPowerRingConsume = pendingObjectChoice.mode === "consume_power_ring";
  const allowedSlots = isRingDiscard
    ? ["anneau"]
    : isPowerRingConsume
    ? ["anneau"]
    : getAllowedObjectSlotsForDefinition(sourceDefinition);
  const prompt = isRingDiscard
    ? "You already hold 2 rings. Choose one to discard."
    : isPowerRingConsume
    ? "Choose a power ring to sacrifice."
    : pendingObjectChoice.mode === "steal"
    ? `Choose an object to steal from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName}.`
    : `Choose an object to remove from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName}.`;
  return {
    boxId: pendingObjectChoice.boxId,
    chooserSeatNumber: pendingObjectChoice.chooserSeatNumber,
    ownerSeatNumber: pendingObjectChoice.ownerSeatNumber,
    cardName: sourceDefinition.name,
    prompt,
    objectOptions: owner.objects
      .filter((objectCard) =>
        objectMatchesAllowedSlots(objectCard.cardId, allowedSlots)
        && (!isPowerRingConsume || getPowerRingLevel(objectCard.cardId) != null)
        && (!isRingDiscard || objectCard.instanceId !== pendingObjectChoice.sourceCard.instanceId)
      )
      .map((objectCard) =>
      buildCardView(objectCard, requireDefinition(objectCard.cardId), "object", false)
    )
  };
}

function buildPendingHandInspectionPublicState(match: StoredMatchState): GameState["pendingHandInspection"] {
  const game = match.internalGame;
  const pendingHandInspection = game?.pendingHandInspection;
  if (game == null || pendingHandInspection == null) {
    return undefined;
  }

  return {
    viewerSeatNumber: pendingHandInspection.viewerSeatNumber,
    targetSeatNumber: pendingHandInspection.targetSeatNumber,
    cardName: requireDefinition(pendingHandInspection.sourceCard.cardId).name
  };
}

function buildPendingPublicHandRevealPublicState(match: StoredMatchState): GameState["pendingPublicHandReveal"] {
  const game = match.internalGame;
  const pendingPublicHandReveal = game?.pendingPublicHandReveal;
  if (game == null || pendingPublicHandReveal == null) {
    return undefined;
  }

  return {
    actorSeatNumber: pendingPublicHandReveal.actorSeatNumber,
    targetSeatNumbers: [...pendingPublicHandReveal.targetSeatNumbers],
    cardName: requireDefinition(pendingPublicHandReveal.sourceCard.cardId).name,
    expiresAt: pendingPublicHandReveal.expiresAt,
    readySeatNumbers: [...pendingPublicHandReveal.readySeatNumbers],
    requiredReadySeatNumbers: listPublicHandRevealReadySeatNumbers(match)
  };
}

function listPublicHandRevealReadySeatNumbers(match: StoredMatchState): number[] {
  const game = match.internalGame;
  if (game == null) {
    return [];
  }

  return match.seats
    .filter((seat) => seat.controllerType === "human" && seat.connected && getStoredSeat(game, seat.seatNumber).alive)
    .map((seat) => seat.seatNumber)
    .sort((left, right) => left - right);
}

function buildPendingBoardResetKeepPublicState(
  match: StoredMatchState,
  viewerSeatNumber?: number
): GameState["pendingBoardResetKeep"] {
  const game = match.internalGame;
  const pendingBoardResetKeep = game?.pendingBoardResetKeep;
  if (game == null || pendingBoardResetKeep == null) {
    return undefined;
  }

  const chooserState = getStoredSeat(game, pendingBoardResetKeep.chooserSeatNumber);
  const isLocalChooser = viewerSeatNumber === pendingBoardResetKeep.chooserSeatNumber;
  const effect = requireDefinition(pendingBoardResetKeep.sourceCard.cardId).rules.effects[pendingBoardResetKeep.effectIndex];
  return {
    chooserSeatNumber: pendingBoardResetKeep.chooserSeatNumber,
    cardName: requireDefinition(pendingBoardResetKeep.sourceCard.cardId).name,
    keepCardCount: effect?.type === "board_reset" ? effect.keeperCards : 1,
    cardOptions: !isLocalChooser
      ? []
      : chooserState.hand.map((card) =>
        buildCardView(card, requireDefinition(card.cardId), "hand", false)
      )
  };
}

function getPendingDeathSearchSelectedCorpse(
  pendingDeathSearch: NonNullable<StoredGameState["pendingDeathSearch"]>
): { seatNumber: number; cards: StoredCardInstance[] } | undefined {
  if (pendingDeathSearch.selectedCorpseSeatNumber != null) {
    return pendingDeathSearch.corpses.find((corpse) => corpse.seatNumber === pendingDeathSearch.selectedCorpseSeatNumber);
  }

  return pendingDeathSearch.corpses.length === 1 ? pendingDeathSearch.corpses[0] : undefined;
}

function buildPendingDeathSearchPool(
  match: StoredMatchState,
  pendingDeathSearch: NonNullable<StoredGameState["pendingDeathSearch"]>
): { keepCardCount: number; cardOptions: NonNullable<GameState["pendingDeathSearch"]>["cardOptions"] } {
  const game = match.internalGame!;
  const chooserState = getStoredSeat(game, pendingDeathSearch.chooserSeatNumber);
  const chooserSeat = getPublicSeat(match, pendingDeathSearch.chooserSeatNumber);
  const selectedCorpse = getPendingDeathSearchSelectedCorpse(pendingDeathSearch);
  if (selectedCorpse == null) {
    return {
      keepCardCount: 0,
      cardOptions: []
    };
  }

  const corpseSeat = getPublicSeat(match, selectedCorpse.seatNumber);
  const cardOptions = [
    ...chooserState.hand
      .filter((card) => card.instanceId !== pendingDeathSearch.sourceCard.instanceId)
      .map((card) => ({
        ...buildCardView(card, requireDefinition(card.cardId), "hand", false),
        source: "self" as const,
        ownerSeatNumber: chooserSeat.seatNumber,
        ownerDisplayName: chooserSeat.displayName
      })),
    ...selectedCorpse.cards.map((card) => ({
      ...buildCardView(card, requireDefinition(card.cardId), "discard", false),
      source: "corpse" as const,
      ownerSeatNumber: corpseSeat.seatNumber,
      ownerDisplayName: corpseSeat.displayName
    }))
  ];

  return {
    keepCardCount: Math.min(5, cardOptions.length),
    cardOptions
  };
}

function buildBotPendingDeathSearchRequest(
  match: StoredMatchState,
  pendingDeathSearch: NonNullable<StoredGameState["pendingDeathSearch"]>
): { corpseSeatNumber?: number; keepCardInstanceIds?: string[]; decline?: boolean } {
  const selectedCorpseSeatNumber = pendingDeathSearch.selectedCorpseSeatNumber
    ?? (pendingDeathSearch.corpses.length === 1
      ? pendingDeathSearch.corpses[0]?.seatNumber
      : [...pendingDeathSearch.corpses].sort((left, right) => right.cards.length - left.cards.length)[0]?.seatNumber);

  if (selectedCorpseSeatNumber == null) {
    return { decline: true };
  }

  const pool = buildPendingDeathSearchPool(match, {
    ...pendingDeathSearch,
    selectedCorpseSeatNumber
  });

  return {
    corpseSeatNumber: selectedCorpseSeatNumber,
    keepCardInstanceIds: pool.cardOptions.slice(0, pool.keepCardCount).map((card) => card.instanceId)
  };
}

function buildPendingDeathSearchPublicState(
  match: StoredMatchState,
  viewerSeatNumber?: number
): GameState["pendingDeathSearch"] {
  const game = match.internalGame;
  const pendingDeathSearch = game?.pendingDeathSearch;
  if (game == null || pendingDeathSearch == null) {
    return undefined;
  }

  const isLocalChooser = viewerSeatNumber === pendingDeathSearch.chooserSeatNumber;
  const corpseOptions = pendingDeathSearch.corpses.map((corpse) => ({
    seatNumber: corpse.seatNumber,
    displayName: getPublicSeat(match, corpse.seatNumber).displayName,
    cardCount: corpse.cards.length
  }));
  const pool = isLocalChooser
    ? buildPendingDeathSearchPool(match, pendingDeathSearch)
    : { keepCardCount: 0, cardOptions: [] };

  return {
    chooserSeatNumber: isLocalChooser ? pendingDeathSearch.chooserSeatNumber : undefined,
    cardName: requireDefinition(pendingDeathSearch.sourceCard.cardId).name,
    keepCardCount: pool.keepCardCount,
    corpseOptions,
    selectedCorpseSeatNumber: getPendingDeathSearchSelectedCorpse(pendingDeathSearch)?.seatNumber,
    cardOptions: pool.cardOptions
  };
}

function buildPendingPickpocketPublicState(
  match: StoredMatchState,
  viewerSeatNumber?: number
): GameState["pendingPickpocket"] {
  const game = match.internalGame;
  const pendingPickpocket = game?.pendingPickpocket;
  if (game == null || pendingPickpocket == null) {
    return undefined;
  }

  const isLocalChooser = viewerSeatNumber === pendingPickpocket.chooserSeatNumber;
  const pool = isLocalChooser
    ? buildPendingPickpocketPool(match, pendingPickpocket)
    : { takeCardCount: pendingPickpocket.takeCardCount, cardOptions: [] };

  return {
    chooserSeatNumber: pendingPickpocket.chooserSeatNumber,
    targetSeatNumber: pendingPickpocket.targetSeatNumber,
    cardName: requireDefinition(pendingPickpocket.sourceCard.cardId).name,
    takeCardCount: pool.takeCardCount,
    cardOptions: pool.cardOptions
  };
}

function buildPendingSacrificeChoicePublicState(match: StoredMatchState): GameState["pendingSacrificeChoice"] {
  const game = match.internalGame;
  const pendingSacrificeChoice = game?.pendingSacrificeChoice;
  if (game == null || pendingSacrificeChoice == null) {
    return undefined;
  }

  return {
    actorSeatNumber: pendingSacrificeChoice.actorSeatNumber,
    cardName: requireDefinition(pendingSacrificeChoice.sourceCard.cardId).name,
    maxAmount: pendingSacrificeChoice.maxAmount
  };
}

function buildPendingCurseReleasePublicState(match: StoredMatchState): GameState["pendingCurseRelease"] {
  const game = match.internalGame;
  const pendingCurseRelease = game?.pendingCurseRelease;
  if (game == null || pendingCurseRelease == null) {
    return undefined;
  }

  return {
    seatNumber: pendingCurseRelease.seatNumber,
    cardName: requireDefinition(pendingCurseRelease.sourceCardId).name,
    releaseCardName: requireDefinition(pendingCurseRelease.releaseCardId).name,
    releaseCardCount: pendingCurseRelease.releaseCardCount
  };
}

function maybeQueueCurseRelease(match: StoredMatchState, seatNumber: number): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const releasableStatus = seatState.statuses.find((status) => {
    const definition = requireDefinition(status.cardId);
    return (
      definition.category.code === "SO"
      && definition.rules.staysInPlay
      && definition.defenseBand?.annulationAllowed === true
      && (definition.defenseBand.annulationCardsRequired ?? 0) > 0
    );
  });
  if (releasableStatus == null) {
    return false;
  }

  const releaseDefinition = requireDefinition(releasableStatus.cardId);
  const releaseCardCount = Math.max(1, releaseDefinition.defenseBand?.annulationCardsRequired ?? 1);
  const annulationCount = seatState.hand.filter((card) => card.cardId === "annulation").length;
  if (annulationCount < releaseCardCount) {
    return false;
  }

  game.pendingCurseRelease = {
    seatNumber,
    statusInstanceId: releasableStatus.instanceId,
    sourceCardId: releasableStatus.cardId,
    releaseCardId: "annulation",
    releaseCardCount
  };
  appendServerDebugLog(
    match,
    "curse",
    `Seat ${seatNumber} may discard ${releaseCardCount} Annulation to remove ${releaseDefinition.name}`
  );
  return true;
}

function finalizeResolvedAction(match: StoredMatchState, actorSeatNumber: number, boxId?: string): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  if (game.pendingDeathSearch != null) {
    const deathSearchChooser = match.seats.find((seat) => seat.seatNumber === game.pendingDeathSearch?.chooserSeatNumber);
    game.pendingDeathSearch.continuationActorSeatNumber = actorSeatNumber;
    game.pendingDeathSearch.continuationBoxId = boxId;
    if (deathSearchChooser?.controllerType === "bot") {
      appendServerDebugLog(
        match,
        "death_search",
        `Auto-resolving ${requireDefinition(game.pendingDeathSearch.sourceCard.cardId).name} for bot seat ${deathSearchChooser.seatNumber}`
      );
      try {
        const botRequest = buildBotPendingDeathSearchRequest(match, game.pendingDeathSearch);
        resolvePendingDeathSearch(match, deathSearchChooser.userId, botRequest);
      } catch (error) {
        appendServerDebugLog(
          match,
          "death_search",
          `Bot auto-resolution failed for ${requireDefinition(game.pendingDeathSearch.sourceCard.cardId).name}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        refreshSeatSummaries(match);
      }
      return;
    }
    appendServerDebugLog(
      match,
      "death_search",
      `Turn resolution paused for ${requireDefinition(game.pendingDeathSearch.sourceCard.cardId).name}; seat ${game.pendingDeathSearch.chooserSeatNumber} must choose cards to keep`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (checkForWinner(match)) {
    refreshSeatSummaries(match);
    return;
  }

  const actorState = getStoredSeat(game, actorSeatNumber);
  if (game.forcedFollowUp != null) {
    appendServerDebugLog(
      match,
      "forced_follow_up",
      `Turn resolution paused for ${requireDefinition(game.forcedFollowUp.sourceCardId).name}; seat ${game.forcedFollowUp.actorSeatNumber} must play AD or pass`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingPickpocket != null) {
    appendServerDebugLog(
      match,
      "pickpocket",
      `Turn resolution paused for ${requireDefinition(game.pendingPickpocket.sourceCard.cardId).name}; seat ${game.pendingPickpocket.chooserSeatNumber} must choose cards to steal`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingHandInspection != null) {
    appendServerDebugLog(
      match,
      "telepathy",
      `Turn resolution paused for ${requireDefinition(game.pendingHandInspection.sourceCard.cardId).name}; seat ${game.pendingHandInspection.viewerSeatNumber} must close the hand view`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingPublicHandReveal != null) {
    appendServerDebugLog(
      match,
      "telepathy",
      `Turn resolution paused for ${requireDefinition(game.pendingPublicHandReveal.sourceCard.cardId).name}; waiting for the public hand reveal timer`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingBoardResetKeep != null) {
    appendServerDebugLog(
      match,
      "board_reset",
      `Turn resolution paused for ${requireDefinition(game.pendingBoardResetKeep.sourceCard.cardId).name}; seat ${game.pendingBoardResetKeep.chooserSeatNumber} must choose a card to keep`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingSacrificeChoice != null) {
    appendServerDebugLog(
      match,
      "sacrifice",
      `Turn resolution paused for ${requireDefinition(game.pendingSacrificeChoice.sourceCard.cardId).name}; seat ${game.pendingSacrificeChoice.actorSeatNumber} must choose the sacrifice amount`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (game.pendingCurseRelease != null) {
    appendServerDebugLog(
      match,
      "curse",
      `Turn resolution paused for ${requireDefinition(game.pendingCurseRelease.sourceCardId).name}; seat ${game.pendingCurseRelease.seatNumber} must accept or pass`
    );
    refreshSeatSummaries(match);
    return;
  }

  const pendingRepeatedPlay = game.pendingRepeatedPlay;
  if (pendingRepeatedPlay != null && pendingRepeatedPlay.actorSeatNumber === actorSeatNumber) {
    game.pendingRepeatedPlay = undefined;
    appendServerDebugLog(match, "repeat", `Seat ${actorSeatNumber} begins repeated use of ${requireDefinition(pendingRepeatedPlay.cardId).name}`);
    beginPendingRepeatedPlay(match, pendingRepeatedPlay);
    return;
  }

  autoSkipOptionalExtraPlayIfUnavailable(match, actorSeatNumber);

  if (actorState.pendingExtraPlays > 0) {
    actorState.pendingExtraPlays -= 1;
    appendServerDebugLog(match, "box", `Closed box ${boxId ?? "n/a"} for seat ${actorSeatNumber}; extra play remains (${actorState.pendingExtraPlays})`);
  } else {
    resolveAbundanceTurnEnd(match, actorSeatNumber);
    resolveTimedPotionTurnEnd(match, actorSeatNumber);
    resolveTotalPowerOverrideTurnEnd(match, actorSeatNumber);
    const handBeforeRefill = actorState.hand.length;
    while (actorState.hand.length < game.minimumHandSize && actorState.alive) {
      drawCards(match, actorSeatNumber, 1);
    }
    appendServerDebugLog(
      match,
      "box",
      `Closed box ${boxId ?? "n/a"} for seat ${actorSeatNumber}; refill ${handBeforeRefill} -> ${actorState.hand.length}`
    );
    startNextTurn(match, actorSeatNumber);
  }

  if (
    game.extraPlayMode?.actorSeatNumber === actorSeatNumber
    && game.extraPlayMode.remainingRestrictedPlays === 0
  ) {
    game.extraPlayMode = undefined;
  }

  refreshSeatSummaries(match);
  if (boxId != null) {
    pushSeatSnapshotEventsForBox(match, boxId);
  }
}

function resolveMirror(match: StoredMatchState, pendingAction: StoredPendingActionState, mirrorPlayerSeatNumber: number): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  // reflectTargetSeatNumber: whoever last sent this at the mirror player (the new victim of the reflect)
  const reflectTargetSeatNumber = pendingAction.actorSeatNumber;
  // originActorSeatNumber: the original attacker — preserved throughout the chain for power-level and turn purposes
  const originActorSeatNumber = pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber;
  const mirrorPlayerName = getPublicSeat(match, mirrorPlayerSeatNumber).displayName;
  const reflectTargetName = getPublicSeat(match, reflectTargetSeatNumber).displayName;

  // When a non-chain action is mirrored, pause it so the chain can run first.
  // A chain bounce (fromMirror) just replaces the current chain link — outer stays paused.
  if (!pendingAction.fromMirror) {
    game.pausedSequentialAction = pendingAction;
  } else {
    discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
  }

  appendDealerMessage(match, `${mirrorPlayerName} reflects ${definition.name} back at ${reflectTargetName}!`);
  appendServerDebugLog(match, "mirror", `Seat ${mirrorPlayerSeatNumber} mirrored ${definition.name} back to seat ${reflectTargetSeatNumber}`);

  const boxId = randomUUID();
  const newSummary = `${mirrorPlayerName} reflects ${definition.name} back at ${reflectTargetName}`;
  const targetAlive = getStoredSeat(game, reflectTargetSeatNumber).alive;

  game.pendingAction = {
    boxId,
    actorSeatNumber: mirrorPlayerSeatNumber,
    targetSeatNumbers: [reflectTargetSeatNumber],
    responderSeatNumbers: targetAlive ? [reflectTargetSeatNumber] : [],
    storedCard: pendingAction.storedCard,
    summary: newSummary,
    responseMode: "per_target",
    sourceZone: pendingAction.sourceZone ?? "hand",
    fromMirror: true,
    mirrorOriginActorSeatNumber: originActorSeatNumber,
    responders: targetAlive
      ? [{ seatNumber: reflectTargetSeatNumber, state: "pending", choice: "pending", consumedCards: [] }]
      : [],
    createdAt: new Date().toISOString()
  };

  pushGameEvent(match, {
    id: randomUUID(),
    boxId,
    type: "action_start",
    createdAt: new Date().toISOString(),
    actorSeatNumber: mirrorPlayerSeatNumber,
    targetSeatNumbers: [reflectTargetSeatNumber],
    card: buildCardView(
      pendingAction.storedCard,
      definition,
      pendingAction.sourceZone === "object" ? "object" : "discard",
      false
    ),
    summary: newSummary,
    fromMirror: true,
    mirrorOriginActorSeatNumber: originActorSeatNumber
  });

  if (!targetAlive) {
    finalizePendingAction(match);
    return;
  }

  refreshSeatSummaries(match);
  autoRespondIfNeeded(match);
}

function autoRespondIfNeeded(match: StoredMatchState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null || game.pendingSacrificeChoice != null) {
    return;
  }

  const currentResponder = getCurrentPendingResponder(pendingAction);
  if (currentResponder == null) {
    return;
  }

  // Bots handle their own responses via buildBotPendingResponse / scheduleBotTurnIfNeeded
  const responderSeat = match.seats.find((seat) => seat.seatNumber === currentResponder.seatNumber);
  if (responderSeat == null || responderSeat.controllerType === "bot") {
    return;
  }

  // Check if the player has any playable CA cards
  const seatState = getStoredSeat(game, currentResponder.seatNumber);
  const hasPlayableCA = seatState.hand.some((card) => {
    const def = requireDefinition(card.cardId);
    if (def.category.code !== "CA") {
      return false;
    }
    return canPlayCardAsPendingResponse(match, currentResponder.seatNumber, card).canPlay;
  });

  if (hasPlayableCA) {
    return; // Wait for the player to drag a CA card
  }

  const options = getResponseOptionChoices(match, currentResponder.seatNumber);
  const playerName = responderSeat.displayName;

  const canUseNormalResistance = options.some((option) => option.choice === "pass")
    && getCurrentPendingResponder(pendingAction)?.seatNumber === currentResponder.seatNumber
    && canAttemptResistance(
      match,
      pendingAction,
      requireDefinition(pendingAction.storedCard.cardId),
      currentResponder.seatNumber,
      "pass"
    );

  if (canUseNormalResistance) {
    appendDealerMessage(match, `${playerName} had no CA card and relied on normal resistance.`);
    appendServerDebugLog(match, "auto_respond", `Seat ${currentResponder.seatNumber} auto-passed into normal resistance (no CA cards)`);
    respondToPendingAction(match, responderSeat.userId, { choice: "pass" });
  } else {
    appendDealerMessage(match, `${playerName} had no defense — passed automatically.`);
    appendServerDebugLog(match, "auto_respond", `Seat ${currentResponder.seatNumber} auto-passed (no CA cards, no resist)`);
    respondToPendingAction(match, responderSeat.userId, { choice: "pass" });
  }
}

function beginObjectPendingAction(
  match: StoredMatchState,
  actorSeatNumber: number,
  sourceCard: StoredCardInstance,
  definition: BaseCardDefinition,
  targetSeatNumbers: number[],
  summary: string,
  continuation: StoredPendingActionState["continuation"]
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const responderSeatNumbers = targetSeatNumbers.filter((seatNumber) => getStoredSeat(game, seatNumber).alive);
  const boxId = randomUUID();
  appendDealerMessage(match, summary);
  pushGameEvent(match, {
    id: randomUUID(),
    boxId,
    type: "action_start",
    createdAt: new Date().toISOString(),
    actorSeatNumber,
    targetSeatNumbers: [...targetSeatNumbers],
    card: buildCardView(sourceCard, definition, "object", false),
    summary
  });
  appendServerDebugLog(
    match,
    "box",
    `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name} from object with responders ${responderSeatNumbers.length > 0 ? responderSeatNumbers.join(", ") : "none"}`
  );

  game.pendingAction = {
    boxId,
    actorSeatNumber,
    targetSeatNumbers: [...targetSeatNumbers],
    responderSeatNumbers,
    storedCard: sourceCard,
    summary,
    responseMode: "collective",
    responders: responderSeatNumbers.map((seatNumber) => ({
      seatNumber,
      state: "pending",
      choice: "pending",
      consumedCards: []
    })),
    sourceZone: "object",
    continuation,
    createdAt: new Date().toISOString()
  };

  refreshSeatSummaries(match);
  autoRespondIfNeeded(match);
}

function beginPendingAction(
  match: StoredMatchState,
  actorSeatNumber: number,
  removedCard: StoredCardInstance,
  definition: BaseCardDefinition,
  request: PlayCardRequest,
  targetSeatNumbers: number[],
  skipStoredCardResolution = false
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const responderSeatNumbers = getResponderSeatNumbers(game, actorSeatNumber, definition, targetSeatNumbers);
  const summary = describePlay(match, actorSeatNumber, definition, request, targetSeatNumbers);
  const boxId = randomUUID();
  const sharedSacrificeEffect = definition.rules.effects
    .find((effect): effect is Extract<CardEffect, { type: "damage" }> => effect.type === "damage" && effect.amount.kind === "sacrifice_amount");
  appendDealerMessage(match, summary);
  pushGameEvent(match, {
    id: randomUUID(),
    boxId,
    type: "action_start",
    createdAt: new Date().toISOString(),
    actorSeatNumber,
    targetSeatNumbers: [...targetSeatNumbers],
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    summary
  });
  appendServerDebugLog(
    match,
    "box",
    `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name} targeting ${targetSeatNumbers.length > 0 ? targetSeatNumbers.join(", ") : "none"} with responders ${responderSeatNumbers.length > 0 ? responderSeatNumbers.join(", ") : "none"}`
  );

  game.pendingAction = {
    boxId,
    actorSeatNumber,
    targetSeatNumbers: [...targetSeatNumbers],
    responderSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    storedCard: removedCard,
    summary,
    responseMode: isSelfTargetedSinglePlayerSpell(definition, actorSeatNumber, targetSeatNumbers)
      ? "collective"
      : determineResponseMode(definition),
    sourceZone: "hand",
    skipStoredCardResolution,
    sharedSacrificeAmount: undefined,
    responders: responderSeatNumbers.map((seatNumber) => ({
      seatNumber,
      state: "pending",
      choice: "pending",
      consumedCards: []
    })),
    createdAt: new Date().toISOString()
  };

  if (sharedSacrificeEffect != null) {
    const actorHp = getPublicSeat(match, actorSeatNumber).hp;
    if (queueSacrificeChoice(match, actorSeatNumber, removedCard, actorHp, boxId)) {
      return;
    }

    game.pendingAction.sharedSacrificeAmount = Math.max(1, Math.floor(actorHp / 2));
    appendServerDebugLog(
      match,
      "sacrifice",
      `Seat ${actorSeatNumber} auto-selected sacrifice amount ${game.pendingAction.sharedSacrificeAmount} for ${definition.name}${boxId != null ? ` [box ${boxId}]` : ""}`
    );
  }

  autoRespondIfNeeded(match);
}

function resumeAfterDeathSearch(
  match: StoredMatchState,
  continuationActorSeatNumber: number,
  continuationBoxId?: string
): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const pendingAction = game.pendingAction;
  if (pendingAction == null) {
    finalizeResolvedAction(match, continuationActorSeatNumber, continuationBoxId);
    return;
  }

  if (pendingAction.responseMode === "per_target") {
    if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      finalizePendingAction(match);
    } else {
      refreshSeatSummaries(match);
      autoRespondIfNeeded(match);
    }
    return;
  }

  if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
    resolvePendingAction(match);
  } else {
    refreshSeatSummaries(match);
    autoRespondIfNeeded(match);
  }
}

function resolvePendingActionContinuation(
  match: StoredMatchState,
  pendingAction: StoredPendingActionState
): boolean {
  const game = match.internalGame;
  const continuation = pendingAction.continuation;
  if (game == null || continuation == null) {
    return false;
  }

  if (checkForWinner(match)) {
    refreshSeatSummaries(match);
    return true;
  }

  if (continuation.mode === "resume_turn") {
    game.pendingCurseRelease = undefined;
    maybeQueueCurseRelease(match, continuation.seatNumber);
    appendServerDebugLog(
      match,
      "turn",
      `Seat ${continuation.seatNumber} resumes their turn after ${requireDefinition(pendingAction.storedCard.cardId).name}`
    );
  } else {
    appendDealerMessage(match, `${getPublicSeat(match, continuation.seatNumber).displayName} loses a turn.`);
    appendServerDebugLog(
      match,
      "turn",
      `Seat ${continuation.seatNumber} skipped the rest of the turn after ${requireDefinition(pendingAction.storedCard.cardId).name}`
    );
    resolveAbundanceTurnEnd(match, continuation.seatNumber);
    resolveTimedPotionTurnEnd(match, continuation.seatNumber);
    resolveTotalPowerOverrideTurnEnd(match, continuation.seatNumber);
    startNextTurn(match, continuation.seatNumber);
  }

  refreshSeatSummaries(match);
  return true;
}

function resolvePerDamageEffectResponder(match: StoredMatchState, responder: StoredPendingActionResponderState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  const targetSeatNumber = responder.seatNumber;
  const damageRollerSeatNumber = pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber;
  const actorSeat = getActorSeatForAction(
    match,
    damageRollerSeatNumber,
    definition,
    pendingAction.sourceZone ?? "hand"
  );
  const timedPotionDamageMultiplier = getTimedPotionDamageMultiplier(match, damageRollerSeatNumber);
  let anyEffectLanded = false;

  const damageEffects = definition.rules.effects.filter(
    (effect): effect is Extract<CardEffect, { type: "damage" }> => effect.type === "damage"
  );
  let damageEffectIndex = 0;

  for (const effect of definition.rules.effects) {
    if (!getStoredSeat(game, targetSeatNumber).alive) {
      break;
    }

    if (effect.type !== "damage") {
      const pausedForObjectChoice = applyEffect(
        match,
        pendingAction.actorSeatNumber,
        pendingAction.storedCard,
        definition,
        effect,
        [targetSeatNumber],
        pendingAction.targetObjectInstanceId,
        pendingAction.boxId,
        1,
        undefined,
        pendingAction.sourceZone ?? "hand"
      );
      if (pausedForObjectChoice) {
        return;
      }
      anyEffectLanded = true;
      continue;
    }

    damageEffectIndex += 1;
    const resistanceOutcome = rollResistanceForAction(
      match,
      pendingAction,
      definition,
      targetSeatNumber,
      responder.choice,
      getResistanceRollCount(match, definition, targetSeatNumber),
      damageEffects.length > 1 ? `attack ${damageEffectIndex}/${damageEffects.length}` : undefined
    );
    if (resistanceOutcome.detonationTriggered) {
      break;
    }

    const shouldEvaluateDamage =
      !resistanceOutcome.resisted ||
      (
        !resistanceOutcome.criticalSuccess &&
        (definition.defenseBand?.resistance.color === "yellow" || effect.grantsHalfDamageOnResistance === true)
      );
    const targetSeat = getPublicSeat(match, targetSeatNumber);
    const baseAmount = shouldEvaluateDamage
      ? effect.amount.kind === "sacrifice_amount"
        ? (
          pendingAction.sharedSacrificeAmount != null
            ? resolveChosenSacrificeDamageAmount(pendingAction.sharedSacrificeAmount, effect.amount)
            : evaluateRoll(match, effect.amount, actorSeat, targetSeat, damageRollerSeatNumber, pendingAction.boxId, {
              seatNumber: damageRollerSeatNumber,
              highIsGood: true
            })
        )
        : evaluateRoll(match, effect.amount, actorSeat, targetSeat, damageRollerSeatNumber, pendingAction.boxId, {
          seatNumber: damageRollerSeatNumber,
          highIsGood: true
        })
      : 0;
    const amount = shouldEvaluateDamage
      ? adjustDamageForResistance(baseAmount, resistanceOutcome, definition, effect) * timedPotionDamageMultiplier
      : 0;

    if (amount > 0) {
      pushPresentationEvent(match, {
        boxId: pendingAction.boxId,
        type: "attack_impact",
        actorSeatNumber: pendingAction.actorSeatNumber,
        targetSeatNumber,
        cardName: definition.name
      });
      anyEffectLanded = true;
    }

    appendServerDebugLog(match, "resolve", `Applying ${definition.name} hit ${damageEffectIndex}/${damageEffects.length} damage ${amount} to seat ${targetSeatNumber}`);
    if (amount > 0) {
      applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId, pendingAction.actorSeatNumber);
    }

    if (effect.amount.kind === "sacrifice_amount" && pendingAction.responders[0]?.seatNumber === targetSeatNumber) {
      actorSeat.hp -= pendingAction.sharedSacrificeAmount ?? baseAmount;
      recordLowestHpSurvived(match, pendingAction.actorSeatNumber);
      handleSeatDeath(match, pendingAction.actorSeatNumber, false, pendingAction.actorSeatNumber);
    }
  }

  discardInstances(game, responder.consumedCards);

  if (definition.rules.staysInPlay && anyEffectLanded) {
    movePersistentCard(match, pendingAction.actorSeatNumber, [targetSeatNumber], pendingAction.storedCard, definition);
  }
}

function resolvePerTargetResponder(match: StoredMatchState, responder: StoredPendingActionResponderState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  const targetSeatNumber = responder.seatNumber;
  const damageRollerSeatNumber = pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber;
  const shouldDeferCollectiveMirrorHit =
    pendingAction.fromMirror === true
    && game.pausedSequentialAction?.responseMode === "collective"
    && definition.rules.effects.some((effect) => effect.type === "damage" || effect.type === "lifesteal");
  if (!getStoredSeat(game, targetSeatNumber).alive) {
    discardInstances(game, responder.consumedCards);
    return;
  }

  if (shouldDeferCollectiveMirrorHit) {
    appendServerDebugLog(
      match,
      "mirror",
      `Seat ${targetSeatNumber} accepted reflected ${definition.name}; deferring damage to collective resolution`
    );
    discardInstances(game, responder.consumedCards);
    return;
  }

  if (responder.choice === "annulation" || responder.choice === "ordre-demmerlaus") {
    discardInstances(game, responder.consumedCards);
    const cancelSourceName = responder.choice === "ordre-demmerlaus"
      ? requireDefinition(ORDRE_DEMMERLAUS_CARD_ID).name
      : "Annulation";
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} canceled ${definition.name} with ${cancelSourceName}.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} canceled ${definition.name} with ${cancelSourceName}`);
    return;
  }

  if (responder.choice === "mirror") {
    // Damage was dealt during the mirror chain — just discard the consumed miroir card
    discardInstances(game, responder.consumedCards);
    appendServerDebugLog(match, "mirror", `Seat ${targetSeatNumber} mirror resolved (chain handled damage)`);
    return;
  }

  if (definition.rules.resistanceMode === "per_damage_effect") {
    resolvePerDamageEffectResponder(match, responder);
    return;
  }

  let resisted = false;
  let fatalFailure = false;
  let criticalSuccess = false;
  if (definition.rules.requiresResistanceCheck && definition.defenseBand != null && definition.defenseBand.resistance.color !== "red") {
    const outcome = rollResistanceForAction(
      match,
      pendingAction,
      definition,
      targetSeatNumber,
      responder.choice,
      getResistanceRollCount(match, definition, targetSeatNumber)
    );
    resisted = outcome.resisted;
    fatalFailure = outcome.fatalFailure;
    criticalSuccess = outcome.criticalSuccess;
    if (outcome.detonationTriggered) {
      discardInstances(game, responder.consumedCards);
      return;
    }
  }

  if (definition.id === "pickpocket-demmerlaus") {
    const takeCardCount = resisted ? 1 : 2;
    const pendingPickpocket = {
      boxId: pendingAction.boxId,
      chooserSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumber,
      sourceCard: pendingAction.storedCard,
      takeCardCount
    } satisfies NonNullable<StoredGameState["pendingPickpocket"]>;
    const pool = buildPendingPickpocketPool(match, pendingPickpocket);
    if (pool.takeCardCount > 0) {
      if (queuePickpocketChoice(
        match,
        pendingAction.actorSeatNumber,
        targetSeatNumber,
        pendingAction.storedCard,
        takeCardCount,
        pendingAction.boxId
      )) {
        return;
      }

      const selectedCardInstanceIds = pool.cardOptions
        .slice(0, pool.takeCardCount)
        .map((card) => card.instanceId);
      resolvePickpocketSelection(match, pendingPickpocket, selectedCardInstanceIds);
      return;
    }

    appendServerDebugLog(
      match,
      "pickpocket",
      `${definition.name} found no cards to steal from seat ${targetSeatNumber}${pendingAction.boxId != null ? ` [box ${pendingAction.boxId}]` : ""}`
    );
    return;
  }

  if (!resisted || definition.defenseBand?.resistance.color === "yellow") {
    if (!resisted && SUCCESSFUL_HIT_KILL_ROLL_BY_CARD_ID[definition.id] != null) {
      resolveSuccessfulHitKillRoll(match, damageRollerSeatNumber, definition, [targetSeatNumber], pendingAction.boxId);
    }

    if (!resisted && SUCCESSFUL_HIT_FREEZE_ROLL_BY_CARD_ID[definition.id] != null) {
      resolveSuccessfulHitFreezeRoll(match, damageRollerSeatNumber, definition, targetSeatNumber, pendingAction.boxId);
    }

    if (!resisted && definition.id === "corruption-dun-anneau") {
      discardInstances(game, responder.consumedCards);
      if (queuePowerRingChoice(
        match,
        pendingAction.actorSeatNumber,
        pendingAction.storedCard,
        pendingAction.boxId
      )) {
        return;
      }

      appendDealerMessage(
        match,
        `${getPublicSeat(match, pendingAction.actorSeatNumber).displayName} has no power ring left to sacrifice for ${definition.name}.`
      );
      appendServerDebugLog(
        match,
        "object",
        `${definition.name} could not find a power ring to sacrifice after resolving against seat ${targetSeatNumber}${pendingAction.boxId != null ? ` [box ${pendingAction.boxId}]` : ""}`
      );
      return;
    }

    const successfulHitDamageContext = !resisted
      ? resolveSuccessfulHitDamageContext(
        match,
        damageRollerSeatNumber,
        definition,
        pendingAction.sourceZone ?? "hand",
        targetSeatNumber,
        pendingAction.boxId
      )
      : undefined;

    for (const effect of definition.rules.effects) {
      if (effect.type !== "damage" && effect.type !== "lifesteal") {
        if (!resisted) {
          const pausedForObjectChoice = applyEffect(
            match,
            pendingAction.actorSeatNumber,
            pendingAction.storedCard,
            definition,
            effect,
            [targetSeatNumber],
            pendingAction.targetObjectInstanceId,
            pendingAction.boxId
          );
          if (pausedForObjectChoice) {
            return;
          }
        }
        continue;
      }

      const collectiveDamageRollerSeatNumber = pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber;
      const actorSeat = successfulHitDamageContext?.actorSeat ?? getActorSeatForAction(
        match,
        collectiveDamageRollerSeatNumber,
        definition,
        pendingAction.sourceZone ?? "hand"
      );
      const targetSeat = getPublicSeat(match, targetSeatNumber);
      const baseAmount = effect.type === "damage" && effect.amount.kind === "sacrifice_amount"
        ? (
          pendingAction.sharedSacrificeAmount != null
            ? resolveChosenSacrificeDamageAmount(pendingAction.sharedSacrificeAmount, effect.amount)
            : evaluateRoll(match, effect.amount, actorSeat, targetSeat, collectiveDamageRollerSeatNumber, pendingAction.boxId, {
              seatNumber: collectiveDamageRollerSeatNumber,
              highIsGood: true
            })
        )
        : evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          effect.type === "lifesteal" && effect.powerSource !== "target" ? actorSeat : targetSeat,
          collectiveDamageRollerSeatNumber,
          pendingAction.boxId,
          {
            seatNumber: collectiveDamageRollerSeatNumber,
            highIsGood: true
          }
        );
      const amount = adjustHpLossAmountForResistance(
        definition,
        effect,
        baseAmount,
        resisted,
        criticalSuccess,
        fatalFailure
      ) * (successfulHitDamageContext?.damageMultiplier ?? 1);

      if (amount > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "attack_impact",
          actorSeatNumber: pendingAction.actorSeatNumber,
          targetSeatNumber,
          cardName: definition.name
        });
      }

      appendServerDebugLog(match, "resolve", `Applying ${definition.name} ${effect.type} ${amount} to seat ${targetSeatNumber}`);
      const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId, pendingAction.actorSeatNumber);
      if (effect.type === "lifesteal" && dealt > 0) {
        if (dealt > 0 && getStoredSeat(game, pendingAction.actorSeatNumber).alive) {
          const lifestealResult = setSeatHp(
            match,
            pendingAction.actorSeatNumber,
            getPublicSeat(match, pendingAction.actorSeatNumber).hp + dealt
          );
          if (lifestealResult.delta > 0) {
            recordHealing(match, pendingAction.actorSeatNumber, pendingAction.actorSeatNumber, lifestealResult.delta);
            pushPresentationEvent(match, {
              boxId: pendingAction.boxId,
              type: "hp_gain",
              seatNumber: pendingAction.actorSeatNumber,
              cardName: definition.name,
              amount: lifestealResult.delta
            });
          }
        }
      }

      if (effect.type === "damage" && effect.amount.kind === "sacrifice_amount" && pendingAction.responders[0]?.seatNumber === targetSeatNumber) {
        actorSeat.hp -= pendingAction.sharedSacrificeAmount ?? amount;
        if ((pendingAction.sharedSacrificeAmount ?? amount) > 0) {
          pushPresentationEvent(match, {
            boxId: pendingAction.boxId,
            type: "hp_loss",
            seatNumber: pendingAction.actorSeatNumber,
            cardName: definition.name,
            amount: pendingAction.sharedSacrificeAmount ?? amount
          });
        }
        handleSeatDeath(match, pendingAction.actorSeatNumber, false, pendingAction.actorSeatNumber);
      }
    }
  }

  discardInstances(game, responder.consumedCards);

  if (definition.rules.staysInPlay && !resisted) {
    movePersistentCard(match, pendingAction.actorSeatNumber, [targetSeatNumber], pendingAction.storedCard, definition);
  }
}

function finalizePendingAction(match: StoredMatchState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  appendServerDebugLog(match, "pending_action", `Finalize ${definition.name} from seat ${pendingAction.actorSeatNumber} [box ${pendingAction.boxId}]`);

  if (game.pendingPickpocket != null) {
    appendServerDebugLog(
      match,
      "pickpocket",
      `Finalize paused for ${definition.name}; seat ${game.pendingPickpocket.chooserSeatNumber} must choose stolen cards`
    );
    refreshSeatSummaries(match);
    return;
  }

  if (pendingAction.fromMirror === true) {
    // Mirror chain link resolved — resume the paused outer action if there is one
    const pausedAction = game.pausedSequentialAction;
    const reflectedTargetSeatNumber = pendingAction.targetSeatNumbers[0];
    const shouldDeferCollectiveMirrorHit =
      requireDefinition(pendingAction.storedCard.cardId).rules.effects.some(
        (effect) => effect.type === "damage" || effect.type === "lifesteal"
      );
    if (
      shouldDeferCollectiveMirrorHit &&
      pausedAction?.responseMode === "collective" &&
      reflectedTargetSeatNumber != null &&
      getStoredSeat(game, reflectedTargetSeatNumber).alive
    ) {
      pausedAction.deferredMirrorHits = [
        ...(pausedAction.deferredMirrorHits ?? []),
        {
          sourceSeatNumber: pendingAction.actorSeatNumber,
          targetSeatNumber: reflectedTargetSeatNumber
        }
      ];
      appendServerDebugLog(
        match,
        "mirror",
        `Deferred reflected ${definition.name} hit from seat ${pendingAction.actorSeatNumber} to seat ${reflectedTargetSeatNumber}`
      );
    }

    game.pendingAction = undefined;
    if (pausedAction != null) {
      game.pendingAction = pausedAction;
      game.pausedSequentialAction = undefined;
      appendServerDebugLog(match, "mirror", "Mirror chain resolved; resuming outer action");
      refreshSeatSummaries(match);
      if (game.pendingAction.responders.every((responder) => responder.state !== "pending")) {
        if (game.pendingAction.responseMode === "per_target") {
          finalizePendingAction(match);
        } else {
          resolvePendingAction(match);
        }
      } else {
        autoRespondIfNeeded(match);
      }
    } else {
      // Standalone per_target mirror chain (single-target attack was mirrored)
      // Advance from original attacker so the turn order stays correct
      const turnOwner = pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber;
      finalizeResolvedAction(match, turnOwner, pendingAction.boxId);
    }
    return;
  }

  if (!definition.rules.staysInPlay) {
    rememberViergeReplaySourceFromPendingAction(game, pendingAction, definition);
    discardInstances(game, [pendingAction.storedCard]);
  }

  game.lastPlayedCard = {
    actorSeatNumber: pendingAction.actorSeatNumber,
    targetSeatNumbers: [...pendingAction.targetSeatNumbers],
    targetObjectInstanceId: pendingAction.targetObjectInstanceId,
    card: buildCardView(
      pendingAction.storedCard,
      definition,
      pendingAction.sourceZone === "object" ? "object" : "discard",
      false
    ),
    mode: "active",
    summary: pendingAction.summary,
    resolvedAt: new Date().toISOString()
  };
  game.pendingAction = undefined;
  if (resolvePendingActionContinuation(match, pendingAction)) {
    return;
  }
  finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
}

function resolvePendingAction(match: StoredMatchState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return;
  }

  if (pendingAction.responseMode === "per_target") {
    const currentResponder = getCurrentPendingResponder(pendingAction);
    if (currentResponder == null) {
      finalizePendingAction(match);
      return;
    }

    resolvePerTargetResponder(match, currentResponder);
    if (game.pendingDeathSearch != null || game.pendingObjectChoice != null || game.pendingPickpocket != null) {
      refreshSeatSummaries(match);
      return;
    }

    if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      finalizePendingAction(match);
    } else {
      refreshSeatSummaries(match);
    }
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  const timedPotionDamageMultiplier = getTimedPotionDamageMultiplier(
    match,
    pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber
  );
  const annulationRequired = definition.defenseBand?.annulationCardsRequired ?? 0;
  const ordreResponder = pendingAction.responders.find((responder) => responder.choice === "ordre-demmerlaus");
  const collectiveCanceled =
    pendingAction.responseMode === "collective" && (
      ordreResponder != null
      || (
        definition.defenseBand?.annulationAllowed === true &&
        pendingAction.responders
          .filter((responder) => responder.choice === "annulation")
          .reduce((count, responder) => count + responder.consumedCards.length, 0) >= Math.max(1, annulationRequired)
      )
    );

  if (collectiveCanceled) {
    const cancelingResponder = ordreResponder ?? pendingAction.responders.find((responder) => responder.choice === "annulation");
    const cancelingSeatNumber = cancelingResponder?.seatNumber;
    const cancelSourceName = cancelingResponder?.choice === "ordre-demmerlaus"
      ? requireDefinition(ORDRE_DEMMERLAUS_CARD_ID).name
      : "Annulation";
    discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
    if (pendingAction.sourceZone !== "object") {
      if (definition.rules.staysInPlay) {
        movePersistentCard(match, pendingAction.actorSeatNumber, pendingAction.targetSeatNumbers, pendingAction.storedCard, definition, pendingAction.sourceZone ?? "hand");
      } else {
        rememberViergeReplaySourceFromPendingAction(game, pendingAction, definition);
        discardInstances(game, [pendingAction.storedCard]);
      }
    }
    if (cancelingSeatNumber != null) {
      appendServerDebugLog(
        match,
        "resolve",
        `Seat ${cancelingSeatNumber} canceled ${definition.name} with ${cancelSourceName}; stopping collective responses`
      );
    }
    if (cancelingSeatNumber != null) {
      appendDealerMessage(match, `${getPublicSeat(match, cancelingSeatNumber).displayName} canceled ${definition.name} with ${cancelSourceName}.`);
    } else {
      appendDealerMessage(match, `${definition.name} was canceled before resolving.`);
    }
    game.lastPlayedCard = {
      actorSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumbers: [...pendingAction.targetSeatNumbers],
      targetObjectInstanceId: pendingAction.targetObjectInstanceId,
      card: buildCardView(
        pendingAction.storedCard,
        definition,
        pendingAction.sourceZone === "object" ? "object" : "discard",
        false
      ),
      mode: "active",
      summary: pendingAction.summary,
      resolvedAt: new Date().toISOString()
    };
    game.pendingAction = undefined;
    if (resolvePendingActionContinuation(match, pendingAction)) {
      return;
    }
    finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
    return;
  }

  // In collective response mode, partial Annulation contributions are spent
  // but do not protect individual targets unless the full cancel threshold
  // was met above and the action already returned early as canceled.
  const canceledTargets = new Set<number>();

  // Mirrored targets dodge the original collective action. The reflected copy
  // is handled immediately as a mirror chain, so do not apply it again here.
  const mirroredTargets = new Set<number>(
    pendingAction.responders
      .filter((responder) => responder.choice === "mirror")
      .map((responder) => responder.seatNumber)
  );
  const deferredMirrorHits = (pendingAction.deferredMirrorHits ?? []).filter((hit) =>
    getStoredSeat(game, hit.targetSeatNumber).alive
  );
  const actorState = getStoredSeat(game, pendingAction.actorSeatNumber);
  const requiredFollowUpCategory = getRequiredFollowUpCategory(definition);
  if (requiredFollowUpCategory != null) {
    const eligibleCards = actorState.hand.filter(
      (c) => requireDefinition(c.cardId).category.code === requiredFollowUpCategory
    );

    if (eligibleCards.length === 0) {
      appendServerDebugLog(
        match,
        "play_card",
        `Seat ${pendingAction.actorSeatNumber} has no ${requiredFollowUpCategory} card to consume for ${definition.name}`
      );
    } else if (eligibleCards.length === 1) {
      const consumedFollowUpCard = consumeHandCardByCategory(actorState.hand, requiredFollowUpCategory);
      discardInstances(game, [consumedFollowUpCard]);
      const consumedDefinition = requireDefinition(consumedFollowUpCard.cardId);
      pushGameEvent(match, {
        id: randomUUID(),
        boxId: pendingAction.boxId,
        type: "action_start",
        createdAt: new Date().toISOString(),
        actorSeatNumber: pendingAction.actorSeatNumber,
        targetSeatNumbers: [pendingAction.actorSeatNumber],
        card: buildCardView(consumedFollowUpCard, consumedDefinition, "hand", false),
        summary: `${getPublicSeat(match, pendingAction.actorSeatNumber).displayName} consumes ${consumedDefinition.name} for ${definition.name}.`
      });
      appendServerDebugLog(
        match,
        "play_card",
        `Seat ${pendingAction.actorSeatNumber} auto-consumed ${consumedDefinition.name} for ${definition.name}`
      );
      const followUpHeal = resolveFollowUpCategoryHeal(
        match,
        definition,
        consumedFollowUpCard,
        pendingAction.actorSeatNumber,
        pendingAction.boxId
      );
      if (followUpHeal > 0) {
        const healResult = setSeatHp(
          match,
          pendingAction.actorSeatNumber,
          getPublicSeat(match, pendingAction.actorSeatNumber).hp + followUpHeal
        );
        if (healResult.delta > 0) {
          recordHealing(match, pendingAction.actorSeatNumber, pendingAction.actorSeatNumber, healResult.delta);
          pushPresentationEvent(match, {
            boxId: pendingAction.boxId,
            type: "hp_gain",
            seatNumber: pendingAction.actorSeatNumber,
            cardName: definition.name,
            amount: healResult.delta
          });
        }
        appendServerDebugLog(
          match,
          "effect",
          `${definition.name} auto-consumed ${consumedDefinition.name} for ${healResult.delta} HP`
        );
      }
    } else {
      // Multiple eligible cards — let player choose; finalizeResolvedAction will pause on forcedFollowUp
      game.forcedFollowUp = {
        sourceCardId: definition.id,
        actorSeatNumber: pendingAction.actorSeatNumber,
        targetSeatNumber: pendingAction.actorSeatNumber,
        turnOwnerSeatNumber: pendingAction.actorSeatNumber,
        allowedCategories: [requiredFollowUpCategory],
        doubleHpLossDamage: false,
        suppressDefenseWindow: false,
        suppressResistanceCheck: false,
        consumeMode: true
      };
      appendServerDebugLog(
        match,
        "play_card",
        `Seat ${pendingAction.actorSeatNumber} must choose a ${requiredFollowUpCategory} card to consume for ${definition.name} (${eligibleCards.length} options)`
      );
    }
  }

  const resistedTargets = new Set<number>();
  const fatalResistanceTargets = new Set<number>();
  const criticalSuccessTargets = new Set<number>();
  if (definition.rules.requiresResistanceCheck && definition.defenseBand != null && definition.defenseBand.resistance.color !== "red") {
    for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
      if (canceledTargets.has(targetSeatNumber) || mirroredTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        continue;
      }

      const responder = pendingAction.responders.find((candidate) => candidate.seatNumber === targetSeatNumber);
      if (responder == null) {
        continue;
      }

      const outcome = rollResistanceForAction(
        match,
        pendingAction,
        definition,
        targetSeatNumber,
        responder.choice,
        getResistanceRollCount(match, definition, targetSeatNumber)
      );
      if (outcome.criticalSuccess) {
        resistedTargets.add(targetSeatNumber);
        criticalSuccessTargets.add(targetSeatNumber);
      } else if (outcome.resisted) {
        resistedTargets.add(targetSeatNumber);
      }

      if (outcome.detonationTriggered) {
        continue;
      }

      if (outcome.fatalFailure) {
        fatalResistanceTargets.add(targetSeatNumber);
      }
    }
  }

  if (SUCCESSFUL_HIT_KILL_ROLL_BY_CARD_ID[definition.id] != null) {
    const resolvedTargetSeatNumbers = pendingAction.targetSeatNumbers.filter(
      (seatNumber) =>
        !canceledTargets.has(seatNumber) &&
        !mirroredTargets.has(seatNumber) &&
        !resistedTargets.has(seatNumber) &&
        getStoredSeat(game, seatNumber).alive
    );
    resolveSuccessfulHitKillRoll(match, pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber, definition, resolvedTargetSeatNumbers, pendingAction.boxId);
  }

  if (PERSISTENT_OWNER_TURN_MASS_DAMAGE_BY_CARD_ID[definition.id] != null) {
    resolvePersistentOwnerTurnMassDamageTick(match, pendingAction.actorSeatNumber, definition, undefined, pendingAction.boxId);
  }

  const successfulHitDamageContextBySeatNumber = new Map<number, SuccessfulHitDamageContext>();
  for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
    if (
      canceledTargets.has(targetSeatNumber) ||
      mirroredTargets.has(targetSeatNumber) ||
      resistedTargets.has(targetSeatNumber) ||
      !getStoredSeat(game, targetSeatNumber).alive
    ) {
      continue;
    }

    successfulHitDamageContextBySeatNumber.set(
      targetSeatNumber,
      resolveSuccessfulHitDamageContext(
        match,
        pendingAction.mirrorOriginActorSeatNumber ?? pendingAction.actorSeatNumber,
        definition,
        pendingAction.sourceZone ?? "hand",
        targetSeatNumber,
        pendingAction.boxId
      )
    );
  }

  for (const effect of definition.rules.effects) {
    if (effect.type !== "damage" && effect.type !== "lifesteal") {
      const remainingTargets = pendingAction.targetSeatNumbers.filter(
        (seatNumber) =>
          !canceledTargets.has(seatNumber) &&
          !mirroredTargets.has(seatNumber) &&
          !resistedTargets.has(seatNumber) &&
          getStoredSeat(game, seatNumber).alive
      );
      const pausedForObjectChoice = applyEffect(
        match,
        pendingAction.actorSeatNumber,
        pendingAction.storedCard,
        definition,
        effect,
        remainingTargets,
        pendingAction.targetObjectInstanceId,
        pendingAction.boxId,
        1,
        undefined,
        pendingAction.sourceZone ?? "hand"
      );
      if (pausedForObjectChoice) {
        return;
      }
      continue;
    }

    const defaultActorSeat = getActorSeatForAction(
      match,
      pendingAction.actorSeatNumber,
      definition,
      pendingAction.sourceZone ?? "hand"
    );
    const hpLossTargetSeatNumbers = pendingAction.targetSeatNumbers.filter((targetSeatNumber) => {
      if (canceledTargets.has(targetSeatNumber) || mirroredTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        return false;
      }

      return effectMayApplyHpLossAfterResistance(definition, effect, resistedTargets.has(targetSeatNumber));
    });
    const hpLossApplicationSeatNumbers = [
      ...hpLossTargetSeatNumbers,
      ...deferredMirrorHits.map((hit) => hit.targetSeatNumber)
    ];

    const usesSharedDamageBase =
      hpLossApplicationSeatNumbers.length > 0
      && !isTargetDependentRollExpression(effect.amount);
    const sharedDamageBase = usesSharedDamageBase
      ? definition.id === MASS_ATTACK_STAFF_CARD_ID
        ? rollMassAttackStaffDamage(match, pendingAction.actorSeatNumber, pendingAction.storedCard, pendingAction.boxId)
        : effect.type === "damage" && effect.amount.kind === "sacrifice_amount"
        ? (
          pendingAction.sharedSacrificeAmount != null
            ? resolveChosenSacrificeDamageAmount(pendingAction.sharedSacrificeAmount, effect.amount)
            : evaluateRoll(
              match,
              effect.amount,
              defaultActorSeat,
              hpLossApplicationSeatNumbers.length > 0 ? getPublicSeat(match, hpLossApplicationSeatNumbers[0]) : undefined,
              pendingAction.actorSeatNumber,
              pendingAction.boxId
            )
        )
        : evaluateRoll(
          match,
          effect.amount,
          defaultActorSeat,
          hpLossApplicationSeatNumbers.length > 0 ? getPublicSeat(match, hpLossApplicationSeatNumbers[0]) : undefined,
          pendingAction.actorSeatNumber,
          pendingAction.boxId
        )
      : undefined;

    if (sharedDamageBase != null) {
      appendServerDebugLog(
        match,
        "resolve",
        `Collected ${definition.name} shared ${effect.type} ${sharedDamageBase} for targets ${hpLossApplicationSeatNumbers.join(", ")}`
      );
    }

    const healBySeatNumber = new Map<number, number>();

    for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
      if (canceledTargets.has(targetSeatNumber) || mirroredTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        continue;
      }

      const targetSeat = getPublicSeat(match, targetSeatNumber);
      const successfulHitDamageContext = successfulHitDamageContextBySeatNumber.get(targetSeatNumber);
      const actorSeat = successfulHitDamageContext?.actorSeat ?? defaultActorSeat;
      const willTakeHpLossAfterResistance = effectMayApplyHpLossAfterResistance(definition, effect, resistedTargets.has(targetSeatNumber));
      if (willTakeHpLossAfterResistance) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "attack_impact",
          actorSeatNumber: pendingAction.actorSeatNumber,
          targetSeatNumber,
          cardName: definition.name
        });
      }

      const baseAmount = willTakeHpLossAfterResistance
        ? sharedDamageBase
          ?? evaluateRoll(
            match,
            effect.amount,
            actorSeat,
            effect.type === "lifesteal" && effect.powerSource !== "target" ? actorSeat : targetSeat,
            pendingAction.actorSeatNumber,
            pendingAction.boxId
          )
        : 0;
      const amount = willTakeHpLossAfterResistance
        ? adjustHpLossAmountForResistance(
          definition,
          effect,
          baseAmount,
          resistedTargets.has(targetSeatNumber),
          criticalSuccessTargets.has(targetSeatNumber),
          fatalResistanceTargets.has(targetSeatNumber)
        ) * (successfulHitDamageContext?.damageMultiplier ?? timedPotionDamageMultiplier)
        : 0;

      const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId, pendingAction.actorSeatNumber);
      if (effect.type === "lifesteal" && dealt > 0 && getStoredSeat(game, pendingAction.actorSeatNumber).alive) {
        healBySeatNumber.set(
          pendingAction.actorSeatNumber,
          (healBySeatNumber.get(pendingAction.actorSeatNumber) ?? 0) + dealt
        );
      }
    }

    for (const hit of deferredMirrorHits) {
      const targetSeat = getPublicSeat(match, hit.targetSeatNumber);
      const deferredActorSeat = getPublicSeat(match, hit.sourceSeatNumber);
      const deferredTimedPotionDamageMultiplier = getTimedPotionDamageMultiplier(match, hit.sourceSeatNumber);
      const baseAmount = sharedDamageBase
        ?? evaluateRoll(
          match,
          effect.amount,
          deferredActorSeat,
          effect.type === "lifesteal" && effect.powerSource !== "target" ? deferredActorSeat : targetSeat,
          hit.sourceSeatNumber,
          pendingAction.boxId
        );
      const amount = baseAmount * deferredTimedPotionDamageMultiplier;

      if (amount > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "attack_impact",
          actorSeatNumber: hit.sourceSeatNumber,
          targetSeatNumber: hit.targetSeatNumber,
          cardName: definition.name
        });
        appendServerDebugLog(
          match,
          "resolve",
          `Applying deferred mirror ${definition.name} ${effect.type} ${amount} to seat ${hit.targetSeatNumber}`
        );
        const dealt = applyDamage(match, hit.targetSeatNumber, amount, definition, false, pendingAction.boxId, hit.sourceSeatNumber);
        if (effect.type === "lifesteal" && dealt > 0 && getStoredSeat(game, hit.sourceSeatNumber).alive) {
          healBySeatNumber.set(
            hit.sourceSeatNumber,
            (healBySeatNumber.get(hit.sourceSeatNumber) ?? 0) + dealt
          );
        }
      }
    }

    if (effect.type === "lifesteal") {
      for (const [seatNumber, healAmount] of healBySeatNumber.entries()) {
        if (healAmount <= 0) {
          continue;
        }

        const healResult = setSeatHp(match, seatNumber, getPublicSeat(match, seatNumber).hp + healAmount);
        if (healResult.delta > 0) {
          recordHealing(match, seatNumber, seatNumber, healResult.delta);
          pushPresentationEvent(match, {
            boxId: pendingAction.boxId,
            type: "hp_gain",
            seatNumber,
            cardName: definition.name,
            amount: healResult.delta
          });
        }
      }
    }

    if (effect.type === "damage" && effect.amount.kind === "sacrifice_amount" && sharedDamageBase != null) {
      const sacrificedHp = pendingAction.sharedSacrificeAmount ?? sharedDamageBase;
      getPublicSeat(match, pendingAction.actorSeatNumber).hp -= sacrificedHp;
      recordLowestHpSurvived(match, pendingAction.actorSeatNumber);
      if (sacrificedHp > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "hp_loss",
          seatNumber: pendingAction.actorSeatNumber,
          cardName: definition.name,
          amount: sacrificedHp
        });
      }
      handleSeatDeath(match, pendingAction.actorSeatNumber, false, pendingAction.actorSeatNumber);
    }

  }

  discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
  const resolvedTargetSeatNumbers = pendingAction.targetSeatNumbers.filter(
    (seatNumber) => !canceledTargets.has(seatNumber) && !resistedTargets.has(seatNumber) && !mirroredTargets.has(seatNumber)
  );

  if (pendingAction.skipStoredCardResolution === true) {
    appendServerDebugLog(match, "pending_action", `Skipped stored-card resolution for ${definition.name} after repeated use`);
  } else if (definition.rules.staysInPlay) {
    if (pendingAction.sourceZone !== "object") {
      const ringOverflow = movePersistentCard(
        match,
        pendingAction.actorSeatNumber,
        resolvedTargetSeatNumbers,
        pendingAction.storedCard,
        definition,
        pendingAction.sourceZone ?? "hand"
      );
      if (ringOverflow) {
        queueRingDiscardChoice(
          match,
          pendingAction.actorSeatNumber,
          pendingAction.storedCard,
          pendingAction.boxId,
          pendingAction.actorSeatNumber
        );
      }
    }
  } else {
    rememberViergeReplaySourceFromPendingAction(game, pendingAction, definition);
    discardInstances(game, [pendingAction.storedCard]);
  }

  game.lastPlayedCard = {
    actorSeatNumber: pendingAction.actorSeatNumber,
    targetSeatNumbers: [...pendingAction.targetSeatNumbers],
    targetObjectInstanceId: pendingAction.targetObjectInstanceId,
    card: buildCardView(
      pendingAction.storedCard,
      definition,
      pendingAction.sourceZone === "object" ? "object" : "discard",
      false
    ),
    mode: "active",
    summary: pendingAction.summary,
    resolvedAt: new Date().toISOString()
  };
  game.pendingAction = undefined;
  if (resolvePendingActionContinuation(match, pendingAction)) {
    return;
  }
  if (game.pendingObjectChoice != null) {
    refreshSeatSummaries(match);
    return;
  }
  finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
}

export function respondToPendingAction(match: StoredMatchState, userId: string, request: PendingActionResponseRequest): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    throw new Error("No pending action to respond to");
  }

  const responderSeat = match.seats.find((seat) => seat.userId === userId);
  if (responderSeat == null) {
    throw new Error("Player seat not found");
  }

  const responder = getPendingResponder(game, responderSeat.seatNumber);
  if (responder == null || responder.state !== "pending") {
    throw new Error("This seat cannot respond to the current action");
  }

  const currentResponder = getCurrentPendingResponder(pendingAction);
  if (currentResponder?.seatNumber !== responderSeat.seatNumber) {
    throw new Error("Wait for the current defender to finish resolving");
  }

  const seatState = getStoredSeat(game, responderSeat.seatNumber);
  const allowedChoices = new Set(getResponseOptionChoices(match, responderSeat.seatNumber).map((option) => option.choice));
  if (!allowedChoices.has(request.choice)) {
    throw new Error("That response is not legal for the current action");
  }

  responder.choice = request.choice;
  responder.state = "locked";
  appendServerDebugLog(match, "response", `Seat ${responderSeat.seatNumber} locked response ${request.choice}`);

  pushPresentationEvent(match, {
    boxId: pendingAction.boxId,
    type: "response_choice",
    seatNumber: responderSeat.seatNumber,
    actorSeatNumber: pendingAction.actorSeatNumber,
    cardName: requireDefinition(pendingAction.storedCard.cardId).name,
    responseChoice: request.choice
  });

  if (request.choice === "annulation") {
    const requiredCount = requireDefinition(pendingAction.storedCard.cardId).defenseBand?.annulationCardsRequired ?? 1;
    if (pendingAction.responseMode === "collective") {
      const alreadyCommitted = pendingAction.responders
        .filter((candidate) => candidate.choice === "annulation")
        .reduce((count, candidate) => count + candidate.consumedCards.length, 0);
      const neededCount = Math.max(1, requiredCount - alreadyCommitted);
      const availableCount = seatState.hand.filter((card) => card.cardId === "annulation").length;
      const requestedCount = Number.isFinite(request.annulationCount)
        ? Math.max(1, Math.floor(request.annulationCount!))
        : neededCount;
      const consumeCount = Math.min(availableCount, neededCount, requestedCount);
      responder.consumedCards = consumeHandCardsById(seatState.hand, "annulation", consumeCount);
      appendServerDebugLog(
        match,
        "response",
        `Seat ${responderSeat.seatNumber} committed ${responder.consumedCards.length} Annulation card(s) on ${requireDefinition(pendingAction.storedCard.cardId).name} (${alreadyCommitted + responder.consumedCards.length}/${requiredCount})`
      );
    } else {
      responder.consumedCards = consumeHandCardsById(seatState.hand, "annulation", requiredCount);
      appendServerDebugLog(
        match,
        "response",
        `Seat ${responderSeat.seatNumber} committed ${responder.consumedCards.length} Annulation card(s) on ${requireDefinition(pendingAction.storedCard.cardId).name}`
      );
    }
  } else if (request.choice === "ordre-demmerlaus") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, ORDRE_DEMMERLAUS_CARD_ID, 1);
    appendServerDebugLog(
      match,
      "response",
      `Seat ${responderSeat.seatNumber} committed ${requireDefinition(ORDRE_DEMMERLAUS_CARD_ID).name} on ${requireDefinition(pendingAction.storedCard.cardId).name}`
    );
  } else if (request.choice === "resistance_accrue") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, "resistance-accrue", 1);
  } else if (request.choice === "mirror") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, "miroir", 1);
  } else {
    responder.consumedCards = [];
  }

  recordResponseCardsPlayed(match, responderSeat.seatNumber, responder.consumedCards.length);

  // Mirror starts a chain immediately for both per_target and collective modes
  if (request.choice === "mirror") {
    resolveMirror(match, pendingAction, responderSeat.seatNumber);
    return;
  }

  if (pendingAction.responseMode === "per_target") {
    resolvePerTargetResponder(match, responder);
    if (game.pendingDeathSearch != null || game.pendingObjectChoice != null || game.pendingPickpocket != null) {
      refreshSeatSummaries(match);
      return;
    }

    if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      finalizePendingAction(match);
    } else {
      refreshSeatSummaries(match);
      autoRespondIfNeeded(match);
    }
  } else {
    if (request.choice === "ordre-demmerlaus") {
      resolvePendingAction(match);
    } else if (request.choice === "annulation") {
      const annulationRequired = requireDefinition(pendingAction.storedCard.cardId).defenseBand?.annulationCardsRequired ?? 1;
      const committedAnnulations = pendingAction.responders
        .filter((candidate) => candidate.choice === "annulation")
        .reduce((count, candidate) => count + candidate.consumedCards.length, 0);
      if (committedAnnulations >= annulationRequired) {
        resolvePendingAction(match);
      } else if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
        resolvePendingAction(match);
      } else {
        refreshSeatSummaries(match);
        autoRespondIfNeeded(match);
      }
    } else if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      resolvePendingAction(match);
    } else {
      refreshSeatSummaries(match);
      autoRespondIfNeeded(match);
    }

    if (game.pendingDeathSearch != null) {
      refreshSeatSummaries(match);
      return;
    }
  }
}

export function selectPendingObject(match: StoredMatchState, userId: string, objectInstanceId: string): void {
  const game = match.internalGame;
  const pendingObjectChoice = game?.pendingObjectChoice;
  if (game == null || pendingObjectChoice == null) {
    throw new Error("No pending object choice");
  }

  const chooserSeat = match.seats.find((seat) => seat.userId === userId);
  if (chooserSeat == null || chooserSeat.seatNumber !== pendingObjectChoice.chooserSeatNumber) {
    throw new Error("This seat cannot choose the object");
  }

  const owner = getStoredSeat(game, pendingObjectChoice.ownerSeatNumber);
  if (!owner.objects.some((object) => object.instanceId === objectInstanceId)) {
    throw new Error("Target object not found for this player");
  }

  const sourceDefinition = requireDefinition(pendingObjectChoice.sourceCard.cardId);
  const chosenCardId = owner.objects.find((object) => object.instanceId === objectInstanceId)?.cardId ?? "";
  if (pendingObjectChoice.mode === "discard_ring") {
    if (getObjectSlot(requireDefinition(chosenCardId).name) !== "anneau") {
      throw new Error("You must choose a ring to discard");
    }
  } else if (pendingObjectChoice.mode === "consume_power_ring") {
    if (getPowerRingLevel(chosenCardId) == null) {
      throw new Error("You must choose a power ring to sacrifice");
    }
  } else if (!objectMatchesAllowedSlots(chosenCardId, getAllowedObjectSlotsForDefinition(sourceDefinition))) {
    throw new Error("That object cannot be selected for this card");
  }
  const removed = removeObjectFromSeat(match, pendingObjectChoice.ownerSeatNumber, objectInstanceId);
  if (removed[0] != null) {
    if (pendingObjectChoice.mode === "steal") {
      removed.forEach((card) => addObjectToSeat(match, pendingObjectChoice.chooserSeatNumber, card));
      appendDealerMessage(
        match,
        `${chooserSeat.displayName} stole ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
      );
    } else if (pendingObjectChoice.mode === "discard_ring") {
      discardInstances(game, removed);
      appendDealerMessage(
        match,
        `${chooserSeat.displayName} discards ${requireDefinition(removed[0].cardId).name} to equip ${sourceDefinition.name}.`
      );
    } else if (pendingObjectChoice.mode === "consume_power_ring") {
      const sacrificedRing = removed[0];
      const sacrificedDefinition = requireDefinition(sacrificedRing.cardId);
      const ringLevel = getPowerRingLevel(sacrificedRing.cardId);
      discardInstances(game, removed);
      if (ringLevel == null) {
        throw new Error("Only power rings can be sacrificed for this effect");
      }

      const amount = 25 * ringLevel;
      if (sourceDefinition.id === "transformation-energetique-dun-anneau") {
        const healResult = setSeatHp(
          match,
          pendingObjectChoice.chooserSeatNumber,
          getPublicSeat(match, pendingObjectChoice.chooserSeatNumber).hp + amount
        );
        if (healResult.delta > 0) {
          recordHealing(match, pendingObjectChoice.chooserSeatNumber, pendingObjectChoice.chooserSeatNumber, healResult.delta);
          pushPresentationEvent(match, {
            boxId: pendingObjectChoice.boxId,
            type: "hp_gain",
            seatNumber: pendingObjectChoice.chooserSeatNumber,
            cardName: sourceDefinition.name,
            amount: healResult.delta
          });
        }
        appendDealerMessage(
          match,
          `${chooserSeat.displayName} sacrifices ${sacrificedDefinition.name} with ${sourceDefinition.name} and restores ${healResult.delta} HP.`
        );
        appendServerDebugLog(
          match,
          "object",
          `${sourceDefinition.name} consumed ${sacrificedRing.cardId} for ${healResult.delta} HP${pendingObjectChoice.boxId != null ? ` [box ${pendingObjectChoice.boxId}]` : ""}`
        );
      } else if (sourceDefinition.id === "corruption-dun-anneau") {
        const targetSeatNumber = game.pendingAction?.targetSeatNumbers[0];
        if (targetSeatNumber == null || !getStoredSeat(game, targetSeatNumber).alive) {
          appendDealerMessage(
            match,
            `${chooserSeat.displayName} sacrifices ${sacrificedDefinition.name} with ${sourceDefinition.name}, but there is no valid target left.`
          );
          appendServerDebugLog(
            match,
            "object",
            `${sourceDefinition.name} consumed ${sacrificedRing.cardId} without a valid target${pendingObjectChoice.boxId != null ? ` [box ${pendingObjectChoice.boxId}]` : ""}`
          );
        } else {
          pushPresentationEvent(match, {
            boxId: pendingObjectChoice.boxId,
            type: "attack_impact",
            actorSeatNumber: game.pendingAction?.actorSeatNumber ?? pendingObjectChoice.chooserSeatNumber,
            targetSeatNumber,
            cardName: sourceDefinition.name
          });
          const dealt = applyDamage(
            match,
            targetSeatNumber,
            amount,
            sourceDefinition,
            false,
            pendingObjectChoice.boxId,
            game.pendingAction?.actorSeatNumber ?? pendingObjectChoice.chooserSeatNumber
          );
          appendDealerMessage(
            match,
            `${chooserSeat.displayName} sacrifices ${sacrificedDefinition.name} with ${sourceDefinition.name} and deals ${dealt} damage to ${getPublicSeat(match, targetSeatNumber).displayName}.`
          );
          appendServerDebugLog(
            match,
            "object",
            `${sourceDefinition.name} consumed ${sacrificedRing.cardId} for ${dealt} damage to seat ${targetSeatNumber}${pendingObjectChoice.boxId != null ? ` [box ${pendingObjectChoice.boxId}]` : ""}`
          );
        }
      } else {
        appendServerDebugLog(
          match,
          "object",
          `${sourceDefinition.name} consumed ${sacrificedRing.cardId} with no specialized resolution${pendingObjectChoice.boxId != null ? ` [box ${pendingObjectChoice.boxId}]` : ""}`
        );
      }
    } else {
      discardInstances(game, removed);
      appendDealerMessage(
        match,
        `${chooserSeat.displayName} removed ${requireDefinition(removed[0].cardId).name} from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName} with ${sourceDefinition.name}.`
      );
    }
  }

  game.pendingObjectChoice = undefined;
  if (pendingObjectChoice.finalizeActorSeatNumber != null) {
    finalizeResolvedAction(match, pendingObjectChoice.finalizeActorSeatNumber, pendingObjectChoice.boxId);
    return;
  }

  const pendingAction = game.pendingAction;
  if (pendingAction?.responseMode === "per_target" && pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
    finalizePendingAction(match);
    return;
  }

  if (pendingAction?.responseMode === "collective" && pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
    resolvePendingAction(match);
    return;
  }

  refreshSeatSummaries(match);
  autoRespondIfNeeded(match);
}

export function acknowledgePendingHandInspection(match: StoredMatchState, userId: string): void {
  const game = match.internalGame;
  const pendingHandInspection = game?.pendingHandInspection;
  if (game == null || pendingHandInspection == null) {
    throw new Error("No pending hand inspection");
  }

  const viewerSeat = match.seats.find((seat) => seat.userId === userId);
  if (viewerSeat == null || viewerSeat.seatNumber !== pendingHandInspection.viewerSeatNumber) {
    throw new Error("This seat cannot close the hand inspection");
  }

  appendServerDebugLog(
    match,
    "telepathy",
    `Seat ${viewerSeat.seatNumber} closed ${requireDefinition(pendingHandInspection.sourceCard.cardId).name} hand view`
  );
  game.pendingHandInspection = undefined;

  if (pendingHandInspection.finalizeActorSeatNumber != null) {
    finalizeResolvedAction(match, pendingHandInspection.finalizeActorSeatNumber, pendingHandInspection.boxId);
    return;
  }

  const pendingAction = game.pendingAction;
  if (pendingAction?.responseMode === "per_target" && pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
    finalizePendingAction(match);
    return;
  }

  if (pendingAction?.responseMode === "collective" && pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
    resolvePendingAction(match);
    return;
  }

  refreshSeatSummaries(match);
  autoRespondIfNeeded(match);
}

export function acknowledgePendingPublicHandReveal(match: StoredMatchState, userId: string): void {
  const game = match.internalGame;
  const pendingPublicHandReveal = game?.pendingPublicHandReveal;
  if (game == null || pendingPublicHandReveal == null) {
    throw new Error("No pending public hand reveal");
  }

  const seat = match.seats.find((candidate) => candidate.userId === userId);
  const requiredReadySeatNumbers = listPublicHandRevealReadySeatNumbers(match);
  if (seat == null || !requiredReadySeatNumbers.includes(seat.seatNumber)) {
    throw new Error("Only active human players can acknowledge the public hand reveal");
  }

  const readyCount = pendingPublicHandReveal.readySeatNumbers.filter((seatNumber) => requiredReadySeatNumbers.includes(seatNumber)).length;

  if (!pendingPublicHandReveal.readySeatNumbers.includes(seat.seatNumber)) {
    pendingPublicHandReveal.readySeatNumbers = [...pendingPublicHandReveal.readySeatNumbers, seat.seatNumber]
      .sort((left, right) => left - right);
    appendServerDebugLog(
      match,
      "telepathy",
      `Seat ${seat.seatNumber} is ready to close ${requireDefinition(pendingPublicHandReveal.sourceCard.cardId).name} (${readyCount + 1}/${requiredReadySeatNumbers.length})`
    );
  }

  if (pendingPublicHandReveal.readySeatNumbers.filter((seatNumber) => requiredReadySeatNumbers.includes(seatNumber)).length >= requiredReadySeatNumbers.length) {
    resolvePendingPublicHandReveal(match, "all_ready");
    return;
  }

  refreshSeatSummaries(match);
}

export function resolvePendingPublicHandReveal(match: StoredMatchState, reason: "expired" | "all_ready" = "expired"): void {
  const game = match.internalGame;
  const pendingPublicHandReveal = game?.pendingPublicHandReveal;
  if (game == null || pendingPublicHandReveal == null) {
    return;
  }

  appendDealerMessage(match, `${requireDefinition(pendingPublicHandReveal.sourceCard.cardId).name} ends.`);
  appendServerDebugLog(
    match,
    "telepathy",
    reason === "all_ready"
      ? `Public hand reveal from ${requireDefinition(pendingPublicHandReveal.sourceCard.cardId).name} ended early because every seat was ready`
      : `Public hand reveal from ${requireDefinition(pendingPublicHandReveal.sourceCard.cardId).name} expired`
  );
  game.pendingPublicHandReveal = undefined;

  if (pendingPublicHandReveal.finalizeActorSeatNumber != null) {
    finalizeResolvedAction(match, pendingPublicHandReveal.finalizeActorSeatNumber, pendingPublicHandReveal.boxId);
    return;
  }

  refreshSeatSummaries(match);
}

export function resolvePendingBoardResetKeep(match: StoredMatchState, userId: string, cardInstanceId: string): void {
  const game = match.internalGame;
  const pendingBoardResetKeep = game?.pendingBoardResetKeep;
  if (game == null || pendingBoardResetKeep == null) {
    throw new Error("No pending keep choice");
  }

  const chooserSeat = match.seats.find((seat) => seat.userId === userId);
  if (chooserSeat == null || chooserSeat.seatNumber !== pendingBoardResetKeep.chooserSeatNumber) {
    throw new Error("This seat cannot choose the card to keep");
  }

  const chooserState = getStoredSeat(game, chooserSeat.seatNumber);
  if (!chooserState.hand.some((card) => card.instanceId === cardInstanceId)) {
    throw new Error("Selected card is not in hand");
  }

  const definition = requireDefinition(pendingBoardResetKeep.sourceCard.cardId);
  const effect = definition.rules.effects[pendingBoardResetKeep.effectIndex];
  if (effect?.type !== "board_reset") {
    throw new Error("Pending keep choice no longer matches a board reset effect");
  }

  appendServerDebugLog(
    match,
    "board_reset",
    `Seat ${chooserSeat.seatNumber} kept ${requireDefinition(chooserState.hand.find((card) => card.instanceId === cardInstanceId)!.cardId).name} for ${definition.name}`
  );

  game.pendingBoardResetKeep = undefined;
  executeBoardReset(
    match,
    chooserSeat.seatNumber,
    pendingBoardResetKeep.sourceCard,
    effect,
    [cardInstanceId],
    pendingBoardResetKeep.boxId
  );

  for (const remainingEffect of definition.rules.effects.slice(pendingBoardResetKeep.effectIndex + 1)) {
    if (remainingEffect.type === "dealer_message") {
      appendDealerMessage(match, remainingEffect.messageKey);
    }
  }

  const pendingAction = game.pendingAction;
  if (pendingAction != null) {
    discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
    if (pendingAction.skipStoredCardResolution === true) {
      appendServerDebugLog(match, "pending_action", `Skipped stored-card resolution for ${definition.name} after deferred board-reset choice`);
    } else if (definition.rules.staysInPlay) {
      if (pendingAction.sourceZone !== "object") {
        movePersistentCard(
          match,
          pendingAction.actorSeatNumber,
          [...pendingAction.targetSeatNumbers],
          pendingAction.storedCard,
          definition
        );
      }
    } else {
      rememberViergeReplaySourceFromPendingAction(game, pendingAction, definition);
      discardInstances(game, [pendingAction.storedCard]);
    }

    game.lastPlayedCard = {
      actorSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumbers: [...pendingAction.targetSeatNumbers],
      targetObjectInstanceId: pendingAction.targetObjectInstanceId,
      card: buildCardView(
        pendingAction.storedCard,
        definition,
        pendingAction.sourceZone === "object" ? "object" : "discard",
        false
      ),
      mode: "active",
      summary: pendingAction.summary,
      resolvedAt: new Date().toISOString()
    };
    game.pendingAction = undefined;
    if (resolvePendingActionContinuation(match, pendingAction)) {
      return;
    }
    finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
    return;
  }

  finalizeResolvedAction(match, chooserSeat.seatNumber, pendingBoardResetKeep.boxId);
}

export function resolvePendingDeathSearch(
  match: StoredMatchState,
  userId: string,
  request: { corpseSeatNumber?: number; keepCardInstanceIds?: string[]; decline?: boolean }
): void {
  const game = match.internalGame;
  const pendingDeathSearch = game?.pendingDeathSearch;
  if (game == null || pendingDeathSearch == null) {
    throw new Error("No pending death search");
  }

  const chooserSeat = match.seats.find((seat) => seat.userId === userId);
  if (chooserSeat == null || chooserSeat.seatNumber !== pendingDeathSearch.chooserSeatNumber) {
    throw new Error("This seat cannot resolve the death search");
  }

  if (request.decline) {
    const continuationActorSeatNumber = pendingDeathSearch.continuationActorSeatNumber ?? chooserSeat.seatNumber;
    const continuationBoxId = pendingDeathSearch.continuationBoxId;
    appendServerDebugLog(
      match,
      "death_search",
      `Seat ${chooserSeat.seatNumber} declined ${requireDefinition(pendingDeathSearch.sourceCard.cardId).name}; card kept in hand`
    );
    game.pendingDeathSearch = undefined;
    resumeAfterDeathSearch(match, continuationActorSeatNumber, continuationBoxId);
    return;
  }

  if (request.corpseSeatNumber != null) {
    const corpseExists = pendingDeathSearch.corpses.some((corpse) => corpse.seatNumber === request.corpseSeatNumber);
    if (!corpseExists) {
      throw new Error("Selected corpse is no longer available");
    }

    pendingDeathSearch.selectedCorpseSeatNumber = request.corpseSeatNumber;
  }

  const selectedCorpse = getPendingDeathSearchSelectedCorpse(pendingDeathSearch);
  if (selectedCorpse == null) {
    throw new Error("Choose which corpse to search first");
  }

  const chooserState = getStoredSeat(game, chooserSeat.seatNumber);
  if (!chooserState.hand.some((card) => card.instanceId === pendingDeathSearch.sourceCard.instanceId)) {
    throw new Error(`${requireDefinition(pendingDeathSearch.sourceCard.cardId).name} is no longer in hand`);
  }

  const pool = buildPendingDeathSearchPool(match, pendingDeathSearch);
  if (request.keepCardInstanceIds == null) {
    if (pool.keepCardCount === pool.cardOptions.length) {
      request.keepCardInstanceIds = pool.cardOptions.map((card) => card.instanceId);
    } else {
      refreshSeatSummaries(match);
      return;
    }
  }

  const requestedCardIds = [...new Set(request.keepCardInstanceIds)];
  if (requestedCardIds.length !== pool.keepCardCount) {
    throw new Error(`Choose exactly ${pool.keepCardCount} cards to keep`);
  }

  const availableCardIdSet = new Set(pool.cardOptions.map((card) => card.instanceId));
  if (requestedCardIds.some((cardInstanceId) => !availableCardIdSet.has(cardInstanceId))) {
    throw new Error("One or more selected cards are no longer available");
  }

  const keptCardIdSet = new Set(requestedCardIds);
  const keptCards = pool.cardOptions
    .filter((card) => keptCardIdSet.has(card.instanceId))
    .map((card) => ({ instanceId: card.instanceId, cardId: card.cardId }));
  const discardedCards = pool.cardOptions
    .filter((card) => !keptCardIdSet.has(card.instanceId))
    .map((card) => ({ instanceId: card.instanceId, cardId: card.cardId }));
  const sourceCard = moveCardFromHand(chooserState.hand, pendingDeathSearch.sourceCard.instanceId);
  chooserState.hand = keptCards;
  discardInstances(game, [sourceCard, ...discardedCards]);

  const corpseSeat = getPublicSeat(match, selectedCorpse.seatNumber);
  appendDealerMessage(
    match,
    `${chooserSeat.displayName} uses ${requireDefinition(sourceCard.cardId).name} to search ${corpseSeat.displayName} and keeps ${keptCards.length} cards.`
  );
  appendServerDebugLog(
    match,
    "death_search",
    `Seat ${chooserSeat.seatNumber} resolved ${requireDefinition(sourceCard.cardId).name} on seat ${corpseSeat.seatNumber}; kept ${keptCards.length}, discarded ${discardedCards.length + 1}`
  );

  const continuationActorSeatNumber = pendingDeathSearch.continuationActorSeatNumber ?? chooserSeat.seatNumber;
  const continuationBoxId = pendingDeathSearch.continuationBoxId;
  game.pendingDeathSearch = undefined;
  resumeAfterDeathSearch(match, continuationActorSeatNumber, continuationBoxId);
}

export function resolvePendingDeathSearchForBot(match: StoredMatchState, chooserSeatNumber: number): void {
  const game = match.internalGame;
  const pendingDeathSearch = game?.pendingDeathSearch;
  if (game == null || pendingDeathSearch == null || pendingDeathSearch.chooserSeatNumber !== chooserSeatNumber) {
    throw new Error("No pending death search for this bot");
  }

  const chooserSeat = getPublicSeat(match, chooserSeatNumber);
  if (pendingDeathSearch.sourceCard.cardId === "fouille-de-mort") {
    const chooserState = getStoredSeat(game, chooserSeatNumber);
    const sourceCard = moveCardFromHand(chooserState.hand, pendingDeathSearch.sourceCard.instanceId);
    discardInstances(game, [sourceCard, ...pendingDeathSearch.corpses.flatMap((corpse) => corpse.cards)]);
    appendDealerMessage(
      match,
      `${chooserSeat.displayName} uses ${requireDefinition(sourceCard.cardId).name} and keeps their current hand.`
    );
    appendServerDebugLog(
      match,
      "death_search",
      `Bot seat ${chooserSeatNumber} shortcut-resolved ${requireDefinition(sourceCard.cardId).name}; kept current hand and discarded all corpse cards`
    );
    const continuationActorSeatNumber = pendingDeathSearch.continuationActorSeatNumber ?? chooserSeat.seatNumber;
    const continuationBoxId = pendingDeathSearch.continuationBoxId;
    game.pendingDeathSearch = undefined;
    resumeAfterDeathSearch(match, continuationActorSeatNumber, continuationBoxId);
    return;
  }

  const botRequest = buildBotPendingDeathSearchRequest(match, pendingDeathSearch);
  resolvePendingDeathSearch(match, chooserSeat.userId, botRequest);
}

export function resolvePendingPickpocket(
  match: StoredMatchState,
  userId: string,
  request: { takeCardInstanceIds: string[] }
): void {
  const game = match.internalGame;
  const pendingPickpocket = game?.pendingPickpocket;
  if (game == null || pendingPickpocket == null) {
    throw new Error("No pending pickpocket");
  }

  const chooserSeat = match.seats.find((seat) => seat.userId === userId);
  if (chooserSeat == null || chooserSeat.seatNumber !== pendingPickpocket.chooserSeatNumber) {
    throw new Error("This seat cannot resolve the pickpocket");
  }

  resolvePickpocketSelection(match, pendingPickpocket, request.takeCardInstanceIds);

  const pendingAction = game.pendingAction;
  const definition = requireDefinition(pendingPickpocket.sourceCard.cardId);
  game.pendingPickpocket = undefined;
  if (pendingAction != null) {
    discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
    rememberViergeReplaySourceFromPendingAction(game, pendingAction, definition);
    discardInstances(game, [pendingAction.storedCard]);
    game.lastPlayedCard = {
      actorSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumbers: [...pendingAction.targetSeatNumbers],
      targetObjectInstanceId: pendingAction.targetObjectInstanceId,
      card: buildCardView(
        pendingAction.storedCard,
        definition,
        pendingAction.sourceZone === "object" ? "object" : "discard",
        false
      ),
      mode: "active",
      summary: pendingAction.summary,
      resolvedAt: new Date().toISOString()
    };
    game.pendingAction = undefined;
    finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
    return;
  }

  finalizeResolvedAction(match, chooserSeat.seatNumber, pendingPickpocket.boxId);
}

export function resolvePendingSacrificeChoice(match: StoredMatchState, userId: string, amount: number): void {
  const game = match.internalGame;
  const pendingSacrificeChoice = game?.pendingSacrificeChoice;
  if (game == null || pendingSacrificeChoice == null) {
    throw new Error("No pending sacrifice choice");
  }

  const actorSeat = match.seats.find((seat) => seat.userId === userId);
  if (actorSeat == null || actorSeat.seatNumber !== pendingSacrificeChoice.actorSeatNumber) {
    throw new Error("This seat cannot choose the sacrifice amount");
  }

  if (!Number.isInteger(amount)) {
    throw new Error("Sacrifice amount must be a whole number");
  }

  if (amount < 0) {
    throw new Error("Sacrifice amount cannot be negative");
  }

  if (amount > pendingSacrificeChoice.maxAmount) {
    throw new Error(`Sacrifice amount cannot exceed ${pendingSacrificeChoice.maxAmount}`);
  }

  if (game.pendingAction == null || game.pendingAction.boxId !== pendingSacrificeChoice.boxId) {
    throw new Error("Pending action no longer matches the sacrifice choice");
  }

  game.pendingAction.sharedSacrificeAmount = amount;
  game.pendingSacrificeChoice = undefined;
  appendServerDebugLog(
    match,
    "sacrifice",
    `Seat ${actorSeat.seatNumber} chose sacrifice amount ${amount} for ${requireDefinition(pendingSacrificeChoice.sourceCard.cardId).name}`
  );
  refreshSeatSummaries(match);
  autoRespondIfNeeded(match);
}

export function resolvePendingCurseRelease(match: StoredMatchState, userId: string, choice: "accept" | "pass"): void {
  const game = match.internalGame;
  const pendingCurseRelease = game?.pendingCurseRelease;
  if (game == null || pendingCurseRelease == null) {
    throw new Error("No pending curse release");
  }

  const seat = match.seats.find((candidate) => candidate.userId === userId);
  if (seat == null || seat.seatNumber !== pendingCurseRelease.seatNumber) {
    throw new Error("This seat cannot resolve the curse prompt");
  }

  const seatState = getStoredSeat(game, seat.seatNumber);
  if (choice === "pass") {
    appendServerDebugLog(match, "curse", `Seat ${seat.seatNumber} passed removing ${requireDefinition(pendingCurseRelease.sourceCardId).name}`);
    game.pendingCurseRelease = undefined;
    refreshSeatSummaries(match);
    autoRespondIfNeeded(match);
    return;
  }

  const annulations = seatState.hand.filter((card) => card.cardId === pendingCurseRelease.releaseCardId);
  if (annulations.length < pendingCurseRelease.releaseCardCount) {
    throw new Error(`You need ${pendingCurseRelease.releaseCardCount} ${requireDefinition(pendingCurseRelease.releaseCardId).name} cards`);
  }

  const removedStatusIndex = seatState.statuses.findIndex((status) => status.instanceId === pendingCurseRelease.statusInstanceId);
  if (removedStatusIndex === -1) {
    throw new Error("Curse status no longer present");
  }

  const [removedStatus] = seatState.statuses.splice(removedStatusIndex, 1);
  const consumedAnnulations = consumeHandCardsById(seatState.hand, pendingCurseRelease.releaseCardId, pendingCurseRelease.releaseCardCount);
  discardInstances(game, [
    ...consumedAnnulations,
    { instanceId: removedStatus.instanceId, cardId: removedStatus.cardId }
  ]);
  appendDealerMessage(
    match,
    `${seat.displayName} discarded ${pendingCurseRelease.releaseCardCount} ${requireDefinition(pendingCurseRelease.releaseCardId).name} to remove ${requireDefinition(pendingCurseRelease.sourceCardId).name}.`
  );
  appendServerDebugLog(match, "curse", `Seat ${seat.seatNumber} removed ${requireDefinition(pendingCurseRelease.sourceCardId).name} and ends the turn`);
  game.pendingCurseRelease = undefined;
  finalizeResolvedAction(match, seat.seatNumber);
}

function resolveRemovedCardPlay(
  match: StoredMatchState,
  actorSeatNumber: number,
  removedCard: StoredCardInstance,
  definition: BaseCardDefinition,
  request: PlayCardRequest,
  forcedFollowUp?: StoredForcedFollowUpState,
  options?: {
    skipStoredCardResolution?: boolean;
    fizzleIfInvalid?: boolean;
    summaryOverride?: string;
  }
): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("The match has not started");
  }

  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const targetSeatNumbers = request.mode === "inactive"
    ? []
    : forcedFollowUp != null
      ? [forcedFollowUp.targetSeatNumber]
      : getTargetSeatNumbers(game, actorSeatNumber, request, definition.rules.targets);
  const effectiveTargetSeatNumbers =
    request.mode === "active" && definition.rules.targets === "all_opponents"
      ? targetSeatNumbers.filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition))
      : targetSeatNumbers;

  let invalidReason: string | undefined;
  if (
    forcedFollowUp != null
    && request.targetSeatNumber != null
    && request.targetSeatNumber !== forcedFollowUp.targetSeatNumber
  ) {
    invalidReason = "Colère du magicien follow-up must target the paralyzed opponent";
  } else if (
    request.mode === "active"
    && definition.rules.targets === "single_opponent"
    && targetSeatNumbers[0] != null
    && !getStoredSeat(game, targetSeatNumbers[0]).alive
  ) {
    invalidReason = "Original target is no longer alive";
  } else if (
    request.mode === "active"
    && definition.rules.targets === "single_opponent"
    && targetSeatNumbers[0] != null
    && singleOpponentTargetRequiresEligibleObject(definition)
    && !seatHasEligibleTargetObject(game, targetSeatNumbers[0], getAllowedObjectSlotsForDefinition(definition))
  ) {
    invalidReason = "The target opponent must have at least one object on the table";
  } else if (
    request.mode === "active"
    && definition.id === "appel-de-la-mort"
    && (getActorSeatForAction(match, actorSeatNumber, definition).powerLevel ?? 1) < 4
  ) {
    invalidReason = "Appel de la mort requires at least 4 power";
  } else if (
    request.mode === "active"
    && (definition.id === "corruption-dun-anneau" || definition.id === "transformation-energetique-dun-anneau")
    && getEquippedPowerRings(getStoredSeat(game, actorSeatNumber)).length === 0
  ) {
    invalidReason = "This card requires an equipped power ring";
  } else if (
    request.mode === "active"
    && definition.id === "puissance-totale"
    && !getStoredSeat(game, actorSeatNumber).hand.some(
      (handCard) => handCard.instanceId !== removedCard.instanceId && ["A", "AD", "AM"].includes(requireDefinition(handCard.cardId).category.code)
    )
  ) {
    invalidReason = "Puissance totale requires an A/AD/AM card in hand";
  } else if (
    request.mode === "active"
    && definition.id === "vierge"
    && game.lastViergeReplay == null
  ) {
    invalidReason = "Vierge requires an eligible non-CA/non-O card in the talon";
  } else if (
    request.mode === "active"
    && definition.rules.targets !== "all_opponents"
    && targetSeatNumbers.some((seatNumber) => isProtectedFromAttack(match, seatNumber, definition))
  ) {
    invalidReason = "That target is protected and cannot be attacked right now";
  } else if (
    request.mode === "active"
    && definition.rules.targets === "all_opponents"
    && effectiveTargetSeatNumbers.length === 0
  ) {
    invalidReason = "No valid opponent target";
  } else if (
    request.mode === "active"
    && definition.category.code === "AM"
    && request.targetObjectInstanceId == null
    && forcedFollowUp == null
    && effectiveTargetSeatNumbers.length === 0
  ) {
    invalidReason = "No valid opponent target";
  }

  if (invalidReason != null) {
    if (options?.fizzleIfInvalid) {
      appendDealerMessage(match, `${actorSeat.displayName}'s repeated ${definition.name} fizzles.`);
      appendServerDebugLog(match, "repeat", `${definition.name} fizzled for seat ${actorSeatNumber}: ${invalidReason}`);
      finalizeResolvedAction(match, forcedFollowUp?.turnOwnerSeatNumber ?? actorSeatNumber);
      return;
    }

    throw new Error(invalidReason);
  }

  if (request.mode === "active") {
    recordTargetedSeats(match, actorSeatNumber, effectiveTargetSeatNumbers);
  }

  const summary = options?.summaryOverride ?? describePlay(match, actorSeatNumber, definition, request, effectiveTargetSeatNumbers);
  appendServerDebugLog(
    match,
    "play_card",
    `Seat ${actorSeatNumber} resolves ${definition.name} (${request.mode})${request.targetSeatNumber != null ? ` -> seat ${request.targetSeatNumber}` : ""}${request.targetObjectInstanceId != null ? ` -> object ${request.targetObjectInstanceId}` : ""}${options?.skipStoredCardResolution === true ? " [repeat]" : ""}`
  );

  if (request.mode === "active" && cardConsumesTurnAsNoOp(definition)) {
    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }
    appendDealerMessage(match, summary);
    appendDealerMessage(match, `[TEMP] ${definition.name} effect is not implemented yet.`);
    appendServerDebugLog(
      match,
      "play_card",
      `${definition.name} consumed the turn as a no-op because its effect is not implemented yet`
    );
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeatNumber);
    return;
  }

  if (request.mode === "inactive") {
    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }
    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeatNumber);
    return;
  }

  if (definition.id === "roulette-russe" || definition.id === "equilibre") {
    const boxId = randomUUID();
    appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name}`);
    pushGameEvent(match, {
      id: randomUUID(),
      boxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      summary
    });

    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }

    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };

    if (definition.id === "roulette-russe") {
      resolveRouletteRusse(match, actorSeatNumber, definition, boxId);
    } else {
      resolveEquilibre(match, actorSeatNumber, definition, boxId);
    }

    finalizeResolvedAction(match, actorSeatNumber, boxId);
    return;
  }

  if (definition.id === "arret-temporaire-demmerlaus") {
    const boxId = randomUUID();
    appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name}`);
    pushGameEvent(match, {
      id: randomUUID(),
      boxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      summary
    });

    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }

    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };

    game.temporalStopQueuedSeatNumber = actorSeatNumber;
    game.temporalStopActiveSeatNumber = undefined;
    appendDealerMessage(match, `${actorSeat.displayName} stops time and will immediately take a second turn.`);
    appendServerDebugLog(match, "turn", `Seat ${actorSeatNumber} queued a stopped-time extra turn with ${definition.name}`);
    finalizeResolvedAction(match, actorSeatNumber, boxId);
    return;
  }

  if (definition.id === "sous-grades") {
    const boxId = randomUUID();
    appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name}`);
    pushGameEvent(match, {
      id: randomUUID(),
      boxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      summary
    });

    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }

    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };

    const revealSeatNumbers = nextLivingOpponentSeatNumbers(game, actorSeatNumber);
    const requiredReadySeatNumbers = listPublicHandRevealReadySeatNumbers(match);
    game.pendingPublicHandReveal = {
      boxId,
      actorSeatNumber,
      targetSeatNumbers: revealSeatNumbers,
      sourceCard: removedCard,
      finalizeActorSeatNumber: actorSeatNumber,
      expiresAt: new Date(Date.now() + SOUS_GRADES_DURATION_MS).toISOString(),
      readySeatNumbers: []
    };
    appendDealerMessage(match, `${actorSeat.displayName} reveals every opponent hand for 30 seconds with ${definition.name}.`);
    appendServerDebugLog(
      match,
      "telepathy",
      `${definition.name} reveals hands from seats ${revealSeatNumbers.join(", ")} until ${game.pendingPublicHandReveal.expiresAt}`
    );
    if (requiredReadySeatNumbers.length === 0) {
      resolvePendingPublicHandReveal(match, "all_ready");
      return;
    }
    refreshSeatSummaries(match);
    return;
  }

  if (definition.id === "vierge") {
    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }

    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    const replay = game.lastViergeReplay;
    if (replay == null) {
      appendDealerMessage(match, `${actorSeat.displayName} has no eligible card to reproduce with ${definition.name}.`);
      appendServerDebugLog(match, "repeat", `${definition.name} found no eligible talon card for seat ${actorSeatNumber}`);
      finalizeResolvedAction(match, actorSeatNumber);
      return;
    }

    const replayDefinition = requireDefinition(replay.cardId);
    appendServerDebugLog(match, "repeat", `Seat ${actorSeatNumber} uses ${definition.name} to reproduce ${replayDefinition.name}`);
    resolveRemovedCardPlay(
      match,
      actorSeatNumber,
      { instanceId: randomUUID(), cardId: replay.cardId },
      replayDefinition,
      {
        ...clonePlayCardRequest(replay.request),
        cardInstanceId: removedCard.instanceId,
        mode: "active"
      },
      undefined,
      {
        skipStoredCardResolution: true,
        fizzleIfInvalid: true,
        summaryOverride: `${actorSeat.displayName}'s ${definition.name} reproduces ${replayDefinition.name}.`
      }
    );
    return;
  }

  if (definition.id === "transformation-energetique-dun-anneau") {
    const boxId = randomUUID();
    appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name}`);
    pushGameEvent(match, {
      id: randomUUID(),
      boxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      summary
    });

    if (options?.skipStoredCardResolution !== true) {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }

    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };

    if (!queuePowerRingChoice(match, actorSeatNumber, removedCard, boxId, actorSeatNumber)) {
      appendDealerMessage(match, `${actorSeat.displayName} has no power ring left to sacrifice for ${definition.name}.`);
      appendServerDebugLog(match, "object", `${definition.name} could not find a power ring to sacrifice [box ${boxId}]`);
      finalizeResolvedAction(match, actorSeatNumber, boxId);
      return;
    }

    refreshSeatSummaries(match);
    return;
  }

  if (definition.id === MASS_ATTACK_STAFF_CARD_ID) {
    if (options?.skipStoredCardResolution !== true) {
      movePersistentCard(match, actorSeatNumber, effectiveTargetSeatNumbers, removedCard, definition);
    }
    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "object", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeatNumber);
    return;
  }

  const responderSeatNumbers = getResponderSeatNumbers(game, actorSeatNumber, definition, effectiveTargetSeatNumbers);
  if (
    forcedFollowUp == null &&
    (definition.rules.requiresDefenseWindow || definition.rules.requiresResistanceCheck || definition.defenseBand?.annulationAllowed === true) &&
    responderSeatNumbers.length > 0 &&
    definition.defenseBand != null
  ) {
    beginPendingAction(
      match,
      actorSeatNumber,
      removedCard,
      definition,
      request,
      effectiveTargetSeatNumbers,
      options?.skipStoredCardResolution === true
    );
    refreshSeatSummaries(match);
    return;
  }

  const boxId = randomUUID();
  appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeatNumber} using ${definition.name}`);
  pushGameEvent(match, {
    id: randomUUID(),
    boxId,
    type: "action_start",
    createdAt: new Date().toISOString(),
    actorSeatNumber,
    targetSeatNumbers: effectiveTargetSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    summary
  });

  const damageMultiplier = forcedFollowUp?.doubleHpLossDamage === true ? 2 : 1;
  const finalizeActorSeatNumber = forcedFollowUp?.turnOwnerSeatNumber;
  const wasForcedFollowUp = forcedFollowUp != null;
  for (const effect of definition.rules.effects) {
    const pausedForObjectChoice = applyEffect(
      match,
      actorSeatNumber,
      removedCard,
      definition,
      effect,
      effectiveTargetSeatNumbers,
      request.targetObjectInstanceId,
      boxId,
      damageMultiplier,
      finalizeActorSeatNumber,
      "hand"
    );
    if (pausedForObjectChoice) {
      if (options?.skipStoredCardResolution !== true) {
        if (definition.rules.staysInPlay) {
          movePersistentCard(match, actorSeatNumber, effectiveTargetSeatNumbers, removedCard, definition);
        } else {
          discardPlayedCardToTalon(game, removedCard, definition, request);
        }
      }

      appendDealerMessage(match, summary);
      game.lastPlayedCard = {
        actorSeatNumber,
        targetSeatNumbers: effectiveTargetSeatNumbers,
        targetObjectInstanceId: request.targetObjectInstanceId,
        card: buildCardView(removedCard, definition, "discard", false),
        mode: request.mode,
        summary,
        resolvedAt: new Date().toISOString()
      };
      if (wasForcedFollowUp) {
        game.forcedFollowUp = undefined;
      }
      refreshSeatSummaries(match);
      return;
    }
  }

  let ringOverflow = false;
  if (options?.skipStoredCardResolution !== true) {
    if (definition.rules.staysInPlay) {
      ringOverflow = movePersistentCard(match, actorSeatNumber, effectiveTargetSeatNumbers, removedCard, definition);
      if (ringOverflow) {
        queueRingDiscardChoice(match, actorSeatNumber, removedCard, boxId, finalizeActorSeatNumber ?? actorSeatNumber);
      }
    } else {
      discardPlayedCardToTalon(game, removedCard, definition, request);
    }
  }

  appendDealerMessage(match, summary);
  game.lastPlayedCard = {
    actorSeatNumber,
    targetSeatNumbers: effectiveTargetSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    mode: request.mode,
    summary,
    resolvedAt: new Date().toISOString()
  };
  if (wasForcedFollowUp) {
    game.forcedFollowUp = undefined;
    appendServerDebugLog(match, "forced_follow_up", `Seat ${actorSeatNumber} completed Colère du magicien follow-up with ${definition.name}`);
  }
  if (ringOverflow) {
    return;
  }
  finalizeResolvedAction(match, finalizeActorSeatNumber ?? actorSeatNumber, boxId);
}

function beginPendingRepeatedPlay(match: StoredMatchState, repeatedPlay: NonNullable<StoredGameState["pendingRepeatedPlay"]>): void {
  const definition = requireDefinition(repeatedPlay.cardId);
  const actorName = getPublicSeat(match, repeatedPlay.actorSeatNumber).displayName;
  resolveRemovedCardPlay(
    match,
    repeatedPlay.actorSeatNumber,
    { instanceId: randomUUID(), cardId: repeatedPlay.cardId },
    definition,
    repeatedPlay.request,
    repeatedPlay.forcedFollowUp,
    {
      skipStoredCardResolution: true,
      fizzleIfInvalid: true,
      summaryOverride: `${actorName}'s Abondance repeats ${definition.name}.`
    }
  );
}

export function passForcedFollowUp(match: StoredMatchState, userId: string): void {
  const game = match.internalGame;
  const forcedFollowUp = game?.forcedFollowUp;
  if (game == null || forcedFollowUp == null) {
    throw new Error("No forced follow-up to pass");
  }

  const actorSeat = match.seats.find((seat) => seat.userId === userId);
  if (actorSeat == null || actorSeat.seatNumber !== forcedFollowUp.actorSeatNumber) {
    throw new Error("This seat cannot pass the forced follow-up");
  }

  if (forcedFollowUp.consumeMode !== true) {
    const actorState = getStoredSeat(game, actorSeat.seatNumber);
    const playableAd = actorState.hand.find((card) => canPlayCardActively(match, actorSeat.seatNumber, card).canPlay);
    if (playableAd != null) {
      throw new Error("You still have an AD card to play for Colère du magicien");
    }
  }

  const sourceName = requireDefinition(forcedFollowUp.sourceCardId).name;
  if (forcedFollowUp.consumeMode === true) {
    appendDealerMessage(match, `${actorSeat.displayName} passes the card consume for ${sourceName}.`);
    appendServerDebugLog(match, "forced_follow_up", `Seat ${actorSeat.seatNumber} passed consume for ${sourceName}`);
  } else {
    appendDealerMessage(match, `${actorSeat.displayName} has no AD card for ${sourceName} and passes.`);
    appendServerDebugLog(match, "forced_follow_up", `Seat ${actorSeat.seatNumber} passed ${sourceName} follow-up with no playable AD`);
  }
  const turnOwnerSeatNumber = forcedFollowUp.turnOwnerSeatNumber;
  game.forcedFollowUp = undefined;
  finalizeResolvedAction(match, turnOwnerSeatNumber);
}

function validateActionRequestBeforeHandRemoval(
  match: StoredMatchState,
  actorSeatNumber: number,
  handCard: StoredCardInstance,
  definition: BaseCardDefinition,
  request: PlayCardRequest,
  forcedFollowUp?: StoredForcedFollowUpState
): void {
  const game = match.internalGame;
  if (game == null || request.mode !== "active") {
    return;
  }

  const targetSeatNumbers = forcedFollowUp != null
    ? [forcedFollowUp.targetSeatNumber]
    : getTargetSeatNumbers(game, actorSeatNumber, request, definition.rules.targets);
  const effectiveTargetSeatNumbers =
    definition.rules.targets === "all_opponents"
      ? targetSeatNumbers.filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition))
      : targetSeatNumbers;

  if (
    forcedFollowUp != null
    && request.targetSeatNumber != null
    && request.targetSeatNumber !== forcedFollowUp.targetSeatNumber
  ) {
    throw new Error("Colère du magicien follow-up must target the paralyzed opponent");
  }

  if (
    definition.rules.targets === "single_opponent"
    && targetSeatNumbers[0] != null
    && !getStoredSeat(game, targetSeatNumbers[0]).alive
  ) {
    throw new Error("Original target is no longer alive");
  }

  if (
    definition.rules.targets === "single_opponent"
    && targetSeatNumbers[0] != null
    && singleOpponentTargetRequiresEligibleObject(definition)
    && !seatHasEligibleTargetObject(game, targetSeatNumbers[0], getAllowedObjectSlotsForDefinition(definition))
  ) {
    throw new Error("The target opponent must have at least one object on the table");
  }

  if (
    definition.id === "puissance-totale"
    && !getStoredSeat(game, actorSeatNumber).hand.some(
      (candidate) => candidate.instanceId !== handCard.instanceId && ["A", "AD", "AM"].includes(requireDefinition(candidate.cardId).category.code)
    )
  ) {
    throw new Error("Puissance totale requires an A/AD/AM card in hand");
  }

  if (
    definition.rules.targets !== "all_opponents"
    && targetSeatNumbers.some((seatNumber) => isProtectedFromAttack(match, seatNumber, definition))
  ) {
    throw new Error("That target is protected and cannot be attacked right now");
  }

  if (definition.rules.targets === "all_opponents" && effectiveTargetSeatNumbers.length === 0) {
    throw new Error("No valid opponent target");
  }

  if (
    definition.category.code === "AM"
    && request.targetObjectInstanceId == null
    && forcedFollowUp == null
    && effectiveTargetSeatNumbers.length === 0
  ) {
    throw new Error("No valid opponent target");
  }
}

export function playCardFromHand(match: StoredMatchState, userId: string, request: PlayCardRequest): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("The match has not started");
  }

  if (game.pendingHandInspection != null) {
    throw new Error("Resolve the current action first");
  }
  if (game.pendingPublicHandReveal != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingBoardResetKeep != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingDeathSearch != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingPickpocket != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingSacrificeChoice != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingCurseRelease != null) {
    throw new Error("Resolve the current action first");
  }

  const actorSeat = match.seats.find((seat) => seat.userId === userId);
  if (actorSeat == null) {
    throw new Error("Player seat not found");
  }

  if (game.currentTurnSeatNumber !== actorSeat.seatNumber && game.forcedFollowUp?.actorSeatNumber !== actorSeat.seatNumber) {
    throw new Error("It is not your turn");
  }

  const actorState = getStoredSeat(game, actorSeat.seatNumber);
  if (!actorState.alive) {
    throw new Error("Dead players cannot act");
  }

  const handCard = actorState.hand.find((card) => card.instanceId === request.cardInstanceId);
  if (handCard == null) {
    throw new Error("Card not found in hand");
  }

  const definition = requireDefinition(handCard.cardId);
  const forcedFollowUp = game.forcedFollowUp?.actorSeatNumber === actorSeat.seatNumber
    ? game.forcedFollowUp
    : undefined;
  // Consume mode: player is choosing which card to sacrifice for AD/CA > Points de vie
  if (forcedFollowUp != null && forcedFollowUp.consumeMode === true) {
    if (!forcedFollowUp.allowedCategories.includes(definition.category.code)) {
      throw new Error(`Must play a ${forcedFollowUp.allowedCategories.join("/")} card for ${requireDefinition(forcedFollowUp.sourceCardId).name}`);
    }

    const consumeBoxId = randomUUID();
    const removedCard = moveCardFromHand(actorState.hand, handCard.instanceId);
    discardInstances(game, [removedCard]);

    pushGameEvent(match, {
      id: randomUUID(),
      boxId: consumeBoxId,
      type: "action_start",
      createdAt: new Date().toISOString(),
      actorSeatNumber: actorSeat.seatNumber,
      targetSeatNumbers: [actorSeat.seatNumber],
      card: buildCardView(removedCard, definition, "hand", false),
      summary: `${actorSeat.displayName} consumes ${definition.name} for ${requireDefinition(forcedFollowUp.sourceCardId).name}.`
    });

    const sourceDef = requireDefinition(forcedFollowUp.sourceCardId);
    const followUpHeal = resolveFollowUpCategoryHeal(match, sourceDef, removedCard, actorSeat.seatNumber, consumeBoxId);
    if (followUpHeal > 0) {
      const healResult = setSeatHp(match, actorSeat.seatNumber, getPublicSeat(match, actorSeat.seatNumber).hp + followUpHeal);
      if (healResult.delta > 0) {
        recordHealing(match, actorSeat.seatNumber, actorSeat.seatNumber, healResult.delta);
        pushPresentationEvent(match, {
          boxId: consumeBoxId,
          type: "hp_gain",
          seatNumber: actorSeat.seatNumber,
          cardName: sourceDef.name,
          amount: healResult.delta
        });
      }
      appendServerDebugLog(match, "effect", `${sourceDef.name} consumed ${definition.name} for ${healResult.delta} HP`);
    }

    const turnOwnerSeatNumber = forcedFollowUp.turnOwnerSeatNumber;
    game.forcedFollowUp = undefined;
    finalizeResolvedAction(match, turnOwnerSeatNumber);
    return;
  }

  const extraPlayMode = getActiveExtraPlayMode(match, actorSeat.seatNumber);
  if (extraPlayMode != null && request.mode === "inactive" && extraPlayMode.requiredActivePlaysRemaining > 0) {
    const requiredCategories = extraPlayMode.allowedCategories === "any" ? "allowed" : extraPlayMode.allowedCategories.join("/");
    throw new Error(`Play a ${requiredCategories} card for ${requireDefinition(extraPlayMode.sourceCardId).name} first`);
  }
  if (forcedFollowUp != null && request.mode === "inactive") {
    throw new Error("Play an AD card for Colère du magicien or pass the forced follow-up");
  }

  const targetOwnedMassAttackStaff =
    request.mode === "active" && forcedFollowUp == null && request.targetObjectInstanceId != null
      ? getSeatMassAttackStaff(actorState, request.targetObjectInstanceId)
      : undefined;
  if (targetOwnedMassAttackStaff != null) {
    if (extraPlayMode?.sourceCardId === "masse-double" || extraPlayMode?.sourceCardId === "puissance-totale") {
      throw new Error(`${requireDefinition(extraPlayMode.sourceCardId).name} requires immediately playing its follow-up card, not loading the staff`);
    }
    if (definition.category.code !== "AM") {
      throw new Error("Only AM cards can be loaded onto Bâton d’attaque massive");
    }

    const removedCard = moveCardFromHand(actorState.hand, handCard.instanceId);
    recordCardsPlayed(match, actorSeat.seatNumber, "active");
    targetOwnedMassAttackStaff.attachedCards = [...(targetOwnedMassAttackStaff.attachedCards ?? []), removedCard];
    const summary = `${actorSeat.displayName} loaded ${definition.name} onto ${requireDefinition(targetOwnedMassAttackStaff.cardId).name}.`;
    appendDealerMessage(match, summary);
    appendServerDebugLog(
      match,
      "object",
      `Seat ${actorSeat.seatNumber} loaded ${definition.name} onto ${requireDefinition(targetOwnedMassAttackStaff.cardId).name} (${getMassAttackStaffLoadedCount(targetOwnedMassAttackStaff)} stored AM)`
    );
    game.lastPlayedCard = {
      actorSeatNumber: actorSeat.seatNumber,
      targetSeatNumbers: [],
      targetObjectInstanceId: targetOwnedMassAttackStaff.instanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: "active",
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeat.seatNumber);
    return;
  }

  const playState = canPlayCardActively(match, actorSeat.seatNumber, handCard);
  if (request.mode === "active" && !playState.canPlay) {
    throw new Error(playState.reason ?? "That card cannot be played right now");
  }
  validateActionRequestBeforeHandRemoval(match, actorSeat.seatNumber, handCard, definition, request, forcedFollowUp);

  const removedCard = moveCardFromHand(actorState.hand, handCard.instanceId);
  recordCardsPlayed(match, actorSeat.seatNumber, request.mode);
  if (extraPlayMode != null) {
    if (request.mode === "inactive") {
      actorState.pendingExtraPlays = 0;
      game.extraPlayMode = undefined;
      appendServerDebugLog(
        match,
        "turn",
        `Seat ${actorSeat.seatNumber} skipped the remaining optional extra play from ${requireDefinition(extraPlayMode.sourceCardId).name}`
      );
    } else if (
      extraPlayMode.allowedCategories === "any"
      || extraPlayMode.allowedCategories.includes(definition.category.code)
    ) {
      extraPlayMode.remainingRestrictedPlays = Math.max(0, extraPlayMode.remainingRestrictedPlays - 1);
      if (extraPlayMode.requiredActivePlaysRemaining > 0) {
        extraPlayMode.requiredActivePlaysRemaining -= 1;
      }
    }
  }
  if (
    request.mode === "active"
    && isAbundanceTurn(match, actorSeat.seatNumber)
    && ABUNDANCE_ALLOWED_CATEGORIES.includes(definition.category.code)
    && request.targetObjectInstanceId == null
    && game.pendingRepeatedPlay == null
  ) {
    game.pendingRepeatedPlay = {
      actorSeatNumber: actorSeat.seatNumber,
      cardId: definition.id,
      request: { ...request },
      forcedFollowUp: forcedFollowUp == null ? undefined : { ...forcedFollowUp }
    };
    appendServerDebugLog(match, "repeat", `Seat ${actorSeat.seatNumber} queued ${definition.name} for Abondance repeat`);
  }

  resolveRemovedCardPlay(match, actorSeat.seatNumber, removedCard, definition, request, forcedFollowUp);
}

export function getCurrentTurnSeat(match: StoredMatchState): SeatState | undefined {
  const currentSeatNumber = match.internalGame?.currentTurnSeatNumber;
  if (currentSeatNumber == null) {
    return undefined;
  }

  return match.seats.find((seat) => seat.seatNumber === currentSeatNumber);
}

export function buildBotPlayRequest(match: StoredMatchState, seatNumber: number): PlayCardRequest | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  // In consume mode, pick any eligible card (target is irrelevant — the intercept handles it)
  if (game.forcedFollowUp?.consumeMode === true && game.forcedFollowUp.actorSeatNumber === seatNumber) {
    const seatStateForConsume = getStoredSeat(game, seatNumber);
    const consumeCard = seatStateForConsume.hand.find(
      (c) => game.forcedFollowUp!.allowedCategories.includes(requireDefinition(c.cardId).category.code)
    );
    if (consumeCard != null) {
      return { cardInstanceId: consumeCard.instanceId, mode: "active" };
    }
    return undefined;
  }

  const seatState = getStoredSeat(game, seatNumber);
  for (const handCard of seatState.hand) {
    const definition = requireDefinition(handCard.cardId);
    const playState = canPlayCardActively(match, seatNumber, handCard);
    if (!playState.canPlay) {
      continue;
    }

    // Don't play a résistance diminuée card unless the hand has an attack that benefits from it
    if (isResistanceDiminueeCard(handCard.cardId) && !hasPlayableResistanceReductionFollowUp(match, seatNumber, handCard.instanceId)) {
      continue;
    }

    const request: PlayCardRequest = {
      cardInstanceId: handCard.instanceId,
      mode: "active"
    };

    switch (definition.rules.targets) {
      case "single_opponent":
        request.targetSeatNumber = pickBotOpponentTarget(match, seatNumber, definition);
        if (request.targetSeatNumber == null) {
          continue;
        }
        break;
      case "self_or_single_opponent":
        request.targetSeatNumber = pickBotOpponentTarget(match, seatNumber, definition) ?? seatNumber;
        break;
      case "left_opponent":
        request.targetSeatNumber = getLeftOpponentSeatNumber(game, seatNumber);
        break;
      case "single_player_or_object":
        request.targetSeatNumber = pickBotOpponentTarget(match, seatNumber, definition);
        if (request.targetSeatNumber == null) {
          continue;
        }
        break;
      case "target_object": {
        const allowedObjectSlots = getAllowedObjectSlotsForDefinition(definition);
        const ownerSeatNumber = pickRandom(
          listTargetableObjectOwners(game, seatNumber, definition).filter((candidateSeatNumber) =>
            getStoredSeat(game, candidateSeatNumber).objects.some((objectCard) =>
              objectMatchesAllowedSlots(objectCard.cardId, allowedObjectSlots)
            )
          )
        );
        if (ownerSeatNumber == null) {
          continue;
        }

        const ownerState = getStoredSeat(game, ownerSeatNumber);
        const targetableObjects = ownerState.objects.filter((card) =>
          requireDefinition(card.cardId).category.code === "O"
          && objectMatchesAllowedSlots(card.cardId, allowedObjectSlots)
        );
        request.targetObjectInstanceId = pickRandom(targetableObjects)?.instanceId;
        break;
      }
      default:
        break;
    }

    return request;
  }

  if (game.forcedFollowUp?.actorSeatNumber === seatNumber) {
    return undefined;
  }

  const discardCard = pickRandom(seatState.hand);
  if (discardCard == null) {
    return undefined;
  }

  return {
    cardInstanceId: discardCard.instanceId,
    mode: "inactive"
  };
}

export function buildBotPendingResponse(match: StoredMatchState, seatNumber: number): PendingActionResponseRequest | undefined {
  const options = getResponseOptionChoices(match, seatNumber);
  if (options.length === 0) {
    return undefined;
  }

  const pendingAction = match.internalGame?.pendingAction;
  const availableChoices = new Set(options.map((option) => option.choice));
  const preferredChoice =
    availableChoices.has("annulation") ? "annulation"
    : availableChoices.has("ordre-demmerlaus") ? "ordre-demmerlaus"
    : availableChoices.has("mirror") ? "mirror"
    : availableChoices.has("resistance_accrue") ? "resistance_accrue"
    : "pass";

  appendServerDebugLog(
    match,
    "bot_response",
    `Seat ${seatNumber} bot options=${options.map((option) => option.choice).join(",")} chose=${preferredChoice}`
  );

  return { choice: preferredChoice };
}
