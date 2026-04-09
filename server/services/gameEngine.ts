import { randomUUID } from "node:crypto";
import {
  baseCardDefinitionById,
  baseCardDefinitions,
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
  MatchState,
  PendingActionOption,
  PlayCardRequest,
  PendingActionResponseRequest,
  PendingActionResponderState,
  PendingActionState,
  ResponseChoiceType,
  SeatState
} from "../../shared/types.js";
import type {
  StoredCardInstance,
  StoredGameState,
  StoredMatchState,
  StoredPendingActionResponderState,
  StoredSeatState,
  StoredSeatStatus,
  StoredPendingActionState
} from "./gameEngineTypes.js";

const ATTACK_CATEGORIES = new Set<CardCategoryCode>(["AD", "AM", "S", "E", "CO"]);

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

function createDeck(): StoredCardInstance[] {
  const deck: StoredCardInstance[] = [];

  for (const card of baseCardDefinitions) {
    for (let count = 0; count < card.baseDeckQuantity; count += 1) {
      deck.push({
        instanceId: randomUUID(),
        cardId: card.id
      });
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

function pickBotOpponentTarget(match: StoredMatchState, actorSeatNumber: number, definition: BaseCardDefinition): number | undefined {
  const game = match.internalGame;
  if (game == null) {
    return undefined;
  }

  const allowedObjectSlots = getAllowedObjectSlotsForDefinition(definition);
  const requiresTargetObject = definition.rules.effects.some((effect) =>
    effect.type === "remove_target_object" || effect.type === "steal_target_object"
  );
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

function appendDealerMessage(match: StoredMatchState, content: string): void {
  match.chatMessages.push({
    id: randomUUID(),
    userId: "dealer",
    displayName: "Dealer",
    avatarUrl: "",
    content,
    createdAt: new Date().toISOString()
  });

  if (match.chatMessages.length > 100) {
    match.chatMessages = match.chatMessages.slice(-100);
  }
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
  if (match.internalGame.debugLog.length > 300) {
    match.internalGame.debugLog = match.internalGame.debugLog.slice(-300);
  }
}

function pushGameEvent(match: StoredMatchState, event: GameEvent): void {
  if (match.internalGame == null) {
    return;
  }

  match.internalGame.eventLog.push(event);
  if (match.internalGame.eventLog.length > 100) {
    match.internalGame.eventLog = match.internalGame.eventLog.slice(-100);
  }
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
  game.discardPile.push(...instances);
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

function listTargetableObjectOwners(game: StoredGameState, actorSeatNumber: number): number[] {
  return sortBySeatNumber(game.seatStates)
    .filter((seat) =>
      seat.seatNumber !== actorSeatNumber
      && seat.alive
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
  boxId?: string
): number {
  switch (expression.kind) {
    case "dice": {
      const roll = rollDiceNotationDetailed(expression.notation);
      if (rollerSeatNumber != null) {
        publishSeatDiceRoll(match, rollerSeatNumber, expression.notation, roll.total, roll.values, boxId);
      } else {
        publishDiceRoll(match, expression.notation, roll.total, roll.values);
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
      return actorSeat.hp;
    case "total_active_players_times":
      return expression.amount * (match.internalGame == null ? 0 : aliveSeatNumbers(match.internalGame).length);
  }
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

function refreshSeatSummaries(match: StoredMatchState): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

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
    canPlay,
    disabledReason,
    zone
  };
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
    || game.pendingBoardResetKeep != null
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
  const allowedObjectSlots = getAllowedObjectSlotsForDefinition(definition);
  const requiresTargetObject = definition.rules.effects.some((effect) =>
    effect.type === "remove_target_object" || effect.type === "steal_target_object"
  );
  const livingOpponents = nextLivingOpponentSeatNumbers(game, actorSeatNumber);
  const attackableOpponents = livingOpponents.filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition));
  const opponentsWithEligibleObjects = livingOpponents.filter((seatNumber) =>
    seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
  );
  if (game.forcedFollowUp != null) {
    if (game.forcedFollowUp.actorSeatNumber !== actorSeatNumber) {
      return { canPlay: false, reason: "Waiting for the forced follow-up" };
    }

    if (!game.forcedFollowUp.allowedCategories.includes(definition.category.code)) {
      return { canPlay: false, reason: "Colère du magicien requires an AD card" };
    }

    if (definition.rules.targets !== "single_opponent") {
      return { canPlay: false, reason: "This forced follow-up must target the paralyzed opponent" };
    }
  }

  if (definition.category.code === "CA") {
    return { canPlay: false, reason: "Counter cards are only used as reactions" };
  }

  switch (definition.rules.targets) {
    case "self":
    case "none":
      return { canPlay: true };
    case "all_opponents":
      return (isAttackDefinition(definition) ? attackableOpponents.length : livingOpponents.length) > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid opponent target" };
    case "single_opponent":
      if (requiresTargetObject) {
        return opponentsWithEligibleObjects.length > 0
          ? { canPlay: true }
          : { canPlay: false, reason: "No valid opponent target" };
      }
      return attackableOpponents.length > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid opponent target" };
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
      return listTargetableObjectOwners(game, actorSeatNumber).some((seatNumber) =>
        seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
      )
        ? { canPlay: true }
        : { canPlay: false, reason: "No target object available" };
    case "single_player_or_object":
      return attackableOpponents.length > 0 || listTargetableObjectOwners(game, actorSeatNumber).some((seatNumber) =>
        seatHasEligibleTargetObject(game, seatNumber, allowedObjectSlots)
      )
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid target" };
    default:
      return { canPlay: false, reason: "Unsupported target mode" };
  }
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
  if (
    seatState.noRiposteTurnsRemaining > 0 &&
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    isAttackDefinition(pendingDefinition)
  ) {
    return [
      {
        choice: "pass",
        label: "Pass",
        description: "This seat is asleep and cannot respond to attacks."
      }
    ];
  }

  // During a mirror chain: only mirror-back or accept the hit — no other defenses
  if (pendingAction.fromMirror === true) {
    const options: PendingActionOption[] = [
      { choice: "pass", label: "Pass", description: "Accept the reflected damage." }
    ];
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
    pendingDefinition.defenseBand.resistance.color !== "red"
  ) {
    options[0] = {
      choice: "pass",
      label: "Pass",
      description: "Do not play a defense card. Resolve the normal resistance roll."
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

  if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    pendingDefinition.defenseBand?.resistanceAccrueAllowed
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
    hasMiroir
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
  if (game == null || !isAttackDefinition(sourceDefinition)) {
    return false;
  }

  return getStoredSeat(game, targetSeatNumber).attackImmunityTurns > 0;
}

function damageReductionFromObjects(match: StoredMatchState, seatNumber: number): number {
  const game = match.internalGame;
  if (game == null) {
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
    return [removed];
  }

  const index = owner.objects.findIndex((card) => card.instanceId === instanceId);
  if (index === -1) {
    throw new Error("Target object not found");
  }

  const removed = owner.objects.splice(index, 1);
  appendServerDebugLog(match, "object", `Seat ${ownerSeatNumber} lost object ${requireDefinition(removed[0].cardId).name}`);
  return removed;
}

function maybePassChanceRoll(match: StoredMatchState, actorSeatNumber: number, effect: Extract<CardEffect, { type: "remove_target_object" }>, boxId?: string): boolean {
  if (effect.chance == null) {
    return true;
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
      getStoredSeat(game, chooserSeatNumber).objects.push(...removed);
    } else {
      discardInstances(game, removed);
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
      getStoredSeat(game, chooserSeatNumber).objects.push(...removed);
    } else {
      discardInstances(game, removed);
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

  if (effect.reshuffleAllOtherCards) {
    game.deck = shuffle([...game.deck, ...game.discardPile, ...recycled]);
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

  actorSeat.hp += effect.attackerHpBonus;
  if (effect.attackerHpBonus > 0) {
    pushPresentationEvent(match, {
      boxId,
      type: "hp_gain",
      seatNumber: actorSeatNumber,
      cardName: requireDefinition(sourceCard.cardId).name,
      amount: effect.attackerHpBonus
    });
  }

  appendServerDebugLog(
    match,
    "board_reset",
    `${requireDefinition(sourceCard.cardId).name} reset the board; seat ${actorSeatNumber} kept ${keptCardNames.join(", ") || "no cards"}${boxId != null ? ` [box ${boxId}]` : ""}`
  );
}

function handleSeatDeath(match: StoredMatchState, seatNumber: number, resurrectionBlocked: boolean): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const publicSeat = getPublicSeat(match, seatNumber);

  if (!seatState.alive || publicSeat.hp > 0) {
    return;
  }

  const ringIndex = seatState.objects.findIndex((card) => card.cardId === "anneau-de-resurrection");
  if (!resurrectionBlocked && ringIndex !== -1) {
    const [ring] = seatState.objects.splice(ringIndex, 1);
    game.discardPile.push(ring);
    discardInstances(game, seatState.hand.splice(0));
    publicSeat.hp = 50;
    seatState.alive = true;
    drawCards(match, seatNumber, 5);
    appendDealerMessage(match, `${publicSeat.displayName} was restored by Anneau de résurrection.`);
    appendServerDebugLog(match, "death", `Seat ${seatNumber} resurrected via Anneau de resurrection`);
    return;
  }

  seatState.alive = false;
  publicSeat.hp = 0;
  discardInstances(game, seatState.hand.splice(0));
  discardInstances(game, seatState.objects.splice(0));
  discardInstances(game, seatState.statuses.map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
  seatState.statuses = [];
  appendDealerMessage(match, `${publicSeat.displayName} has fallen.`);
  appendServerDebugLog(match, "death", `Seat ${seatNumber} died and discarded hand, objects, and statuses`);
}

function checkForWinner(match: StoredMatchState): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  const alive = aliveSeatNumbers(game);
  if (alive.length <= 1) {
    game.winnerSeatNumber = alive[0];
    match.status = "finished";
    if (alive[0] != null) {
      appendDealerMessage(match, `${getPublicSeat(match, alive[0]).displayName} is the last wizard standing.`);
    }
  }
}

function applyDamage(match: StoredMatchState, targetSeatNumber: number, amount: number, sourceDefinition: BaseCardDefinition, resurrectionBlocked = false, boxId?: string): number {
  const targetSeat = getPublicSeat(match, targetSeatNumber);
  if (isProtectedFromAttack(match, targetSeatNumber, sourceDefinition)) {
    appendServerDebugLog(match, "damage", `${sourceDefinition.name} dealt 0 to seat ${targetSeatNumber} because the target is protected`);
    return 0;
  }

  const reducedAmount = Math.max(0, amount - damageReductionFromObjects(match, targetSeatNumber));
  targetSeat.hp -= reducedAmount;
  appendServerDebugLog(
    match,
    "damage",
    `${sourceDefinition.name} dealt ${reducedAmount} to seat ${targetSeatNumber} (raw ${amount}, hp now ${targetSeat.hp})${boxId != null ? ` [box ${boxId}]` : ""}`
  );
  if (reducedAmount > 0) {
    pushPresentationEvent(match, {
      boxId,
      type: "hp_loss",
      seatNumber: targetSeatNumber,
      cardName: sourceDefinition.name,
      amount: reducedAmount
    });
  }
  handleSeatDeath(match, targetSeatNumber, resurrectionBlocked);
  return reducedAmount;
}

function swapSeatOccupants(match: StoredMatchState, leftSeatNumber: number, rightSeatNumber: number): void {
  const leftSeat = getPublicSeat(match, leftSeatNumber);
  const rightSeat = getPublicSeat(match, rightSeatNumber);

  const leftSnapshot = {
    controllerType: leftSeat.controllerType,
    userId: leftSeat.userId,
    connected: leftSeat.connected,
    isHost: leftSeat.isHost,
    difficulty: leftSeat.difficulty,
    disconnectedUserId: leftSeat.disconnectedUserId
  };

  // Body transfer swaps control of the seats while leaving each seat's visible identity
  // and gameplay state attached to the body already occupying that seat.
  leftSeat.controllerType = rightSeat.controllerType;
  leftSeat.userId = rightSeat.userId;
  leftSeat.connected = rightSeat.connected;
  leftSeat.isHost = rightSeat.isHost;
  leftSeat.difficulty = rightSeat.difficulty;
  leftSeat.disconnectedUserId = rightSeat.disconnectedUserId;

  rightSeat.controllerType = leftSnapshot.controllerType;
  rightSeat.userId = leftSnapshot.userId;
  rightSeat.connected = leftSnapshot.connected;
  rightSeat.isHost = leftSnapshot.isHost;
  rightSeat.difficulty = leftSnapshot.difficulty;
  rightSeat.disconnectedUserId = leftSnapshot.disconnectedUserId;
  appendServerDebugLog(match, "swap", `Seat ${leftSeatNumber} and seat ${rightSeatNumber} swapped controllers`);
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

  const targetSeatNumber = targetSeatNumbers[0] ?? listTargetableObjectOwners(game, actorSeatNumber).find((seatNumber) =>
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

  if (isAttackDefinition(definition) && getStoredSeat(match.internalGame!, targetSeatNumber).noRiposteTurnsRemaining > 0) {
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
    return { attempted: false, resisted: false, fatalFailure: false, criticalSuccess: false };
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
  for (let rollIndex = 0; rollIndex < Math.max(1, rollsRequired); rollIndex += 1) {
    const roll = rollDiceNotationDetailed("1D20");
    publishSeatDiceRoll(match, targetSeatNumber, "1D20", roll.total, roll.values, pendingAction.boxId);
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
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically resisted ${definition.name}!`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically resisted ${definition.name}${labelSuffix}`);
  } else if (resisted) {
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} resisted ${definition.name}.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} resisted ${definition.name}${labelSuffix}`);
  } else if (fatalFailure) {
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically failed the resistance roll.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically failed resistance on ${definition.name}${labelSuffix}`);
  } else {
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} failed resistance on ${definition.name}${labelSuffix}`);
  }

  return { attempted: true, resisted, fatalFailure, criticalSuccess };
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

const OBJECT_SLOT_LIMITS: Record<string, number> = {
  anneau: 2,
  amulette: 1,
  baton: 1,
  ceinture: 1,
  robe: 1,
  other: 1
};

function movePersistentCard(match: StoredMatchState, actorSeatNumber: number, targetSeatNumbers: number[], card: StoredCardInstance, definition: BaseCardDefinition): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  if (definition.category.code === "O") {
    const seat = getStoredSeat(game, actorSeatNumber);
    const slot = getObjectSlot(definition.name);
    const limit = OBJECT_SLOT_LIMITS[slot] ?? 1;
    const existing = seat.objects.filter((o) => getObjectSlot(requireDefinition(o.cardId).name) === slot);

    if (existing.length >= limit) {
      // Replace the oldest object of the same slot (discard it)
      const replaced = existing[0];
      const idx = seat.objects.indexOf(replaced);
      seat.objects.splice(idx, 1);
      game.discardPile.push(replaced);
      appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} replaced ${requireDefinition(replaced.cardId).name} with ${definition.name}`);
    }

    seat.objects.push(card);
    appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} equipped ${definition.name}`);
    return;
  }

  if (definition.category.code === "SO") {
    for (const targetSeatNumber of targetSeatNumbers) {
      getStoredSeat(game, targetSeatNumber).statuses.push({
        instanceId: card.instanceId,
        cardId: card.cardId,
        sourceSeatNumber: actorSeatNumber
      });
      appendServerDebugLog(match, "status", `Seat ${targetSeatNumber} received status ${definition.name} from seat ${actorSeatNumber}`);
    }
    return;
  }

  if (definition.id === "sanctuaire-demmerlaus") {
    const seat = getStoredSeat(game, actorSeatNumber);
    seat.objects.push(card);
    appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} placed ${definition.name} in play`);
    return;
  }

  game.discardPile.push(card);
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
  objectChoiceFinalizeActorSeatNumber?: number
): boolean {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("Game not initialized");
  }

  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const actorState = getStoredSeat(game, actorSeatNumber);

  switch (effect.type) {
    case "damage": {
      appendServerDebugLog(match, "effect", `${definition.name} resolves damage on ${targetSeatNumbers.length > 0 ? targetSeatNumbers.join(", ") : "no targets"}${boxId != null ? ` [box ${boxId}]` : ""}`);
      const sacrificeAmount = effect.amount.kind === "sacrifice_amount"
        ? evaluateRoll(match, effect.amount, actorSeat, undefined, actorSeatNumber, boxId)
        : undefined;
      const sharedDamageAmount =
        effect.amount.kind === "dice_per_power" && effect.amount.powerSource === "self"
          ? evaluateRoll(match, effect.amount, actorSeat, undefined, actorSeatNumber, boxId)
          : undefined;

      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const amount = (
          sacrificeAmount
          ?? sharedDamageAmount
          ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId)
        ) * damageMultiplier;
        applyDamage(match, targetSeatNumber, amount, definition, false, boxId);
      }

      if (sacrificeAmount != null) {
        actorSeat.hp -= sacrificeAmount;
        handleSeatDeath(match, actorSeatNumber, false);
      }
      break;
    }
    case "heal":
      appendServerDebugLog(match, "effect", `${definition.name} resolves heal${boxId != null ? ` [box ${boxId}]` : ""}`);
      if (effect.target === "self") {
        const healAmount = evaluateRoll(match, effect.amount, actorSeat, actorSeat, actorSeatNumber, boxId);
        actorSeat.hp += healAmount;
        pushPresentationEvent(match, {
          boxId,
          type: "hp_gain",
          seatNumber: actorSeatNumber,
          cardName: definition.name,
          amount: healAmount
        });
      } else {
        const aliveOpponents = nextLivingOpponentSeatNumbers(game, actorSeatNumber);
        for (const targetSeatNumber of aliveOpponents) {
          const healAmount = evaluateRoll(match, effect.amount, actorSeat, getPublicSeat(match, targetSeatNumber), actorSeatNumber, boxId);
          getPublicSeat(match, targetSeatNumber).hp += healAmount;
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: healAmount
          });
        }
      }
      break;
    case "lifesteal":
      appendServerDebugLog(match, "effect", `${definition.name} resolves lifesteal on ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const amount = evaluateRoll(match, effect.amount, actorSeat, effect.powerSource === "target" ? targetSeat : actorSeat, actorSeatNumber, boxId) * damageMultiplier;
        const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, boxId);
        actorSeat.hp += dealt;
        if (dealt > 0) {
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: actorSeatNumber,
            cardName: definition.name,
            amount: dealt
          });
        }
      }
      break;
    case "set_target_hp":
      appendServerDebugLog(match, "effect", `${definition.name} sets HP for ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const previousHp = targetSeat.hp;
        const nextHp = evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId);
        targetSeat.hp = nextHp;
        const delta = nextHp - previousHp;

        appendServerDebugLog(
          match,
          "effect",
          `${definition.name} set seat ${targetSeatNumber} HP ${previousHp} -> ${nextHp}${boxId != null ? ` [box ${boxId}]` : ""}`
        );

        if (delta < 0) {
          pushPresentationEvent(match, {
            boxId,
            type: "hp_loss",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: Math.abs(delta)
          });
        } else if (delta > 0) {
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: targetSeatNumber,
            cardName: definition.name,
            amount: delta
          });
        }

        handleSeatDeath(match, targetSeatNumber, false);
      }
      break;
    case "instant_kill":
      appendServerDebugLog(match, "effect", `${definition.name} attempts instant kill on ${targetSeatNumbers.join(", ")}${boxId != null ? ` [box ${boxId}]` : ""}`);
      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        targetSeat.hp = 0;
        handleSeatDeath(match, targetSeatNumber, effect.resurrectionBlocked ?? false);
      }
      break;
    case "remove_target_object":
      if (!maybePassChanceRoll(match, actorSeatNumber, effect, boxId)) {
        break;
      }

      if (effect.mode === "all") {
        for (const targetSeatNumber of targetSeatNumbers) {
          const removed = removeObjectFromSeat(match, targetSeatNumber);
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
      actorState.objects.push(...removed);
      if (removed[0] != null) {
        appendServerDebugLog(match, "object", `Seat ${actorSeatNumber} stole ${requireDefinition(removed[0].cardId).name} from seat ${ownerSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`);
      }
      break;
    }
    case "modify_resistance":
      // O-category cards stay in play as objects; computeResistanceThreshold already
      // reads the modifier from storedSeat.objects, so no separate status entry is needed.
      // SO-category curses/statuses are added by movePersistentCard; avoid duplicating them here.
      if (effect.duration === "until_removed" && definition.category.code !== "O" && definition.category.code !== "SO") {
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
      appendServerDebugLog(match, "turn", `Seat ${actorSeatNumber} gained ${effect.count} extra play(s) from ${definition.name}${boxId != null ? ` [box ${boxId}]` : ""}`);
      break;
    case "swap_bodies":
      if (targetSeatNumbers[0] != null) {
        swapSeatOccupants(match, actorSeatNumber, targetSeatNumbers[0]);
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
        const bonusHealAmount = evaluateRoll(match, effect.bonusHeal, actorSeat, actorSeat, actorSeatNumber, boxId);
        actorSeat.hp += bonusHealAmount;
        if (bonusHealAmount > 0) {
          pushPresentationEvent(match, {
            boxId,
            type: "hp_gain",
            seatNumber: actorSeatNumber,
            cardName: definition.name,
            amount: bonusHealAmount
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

  const currentIndex = ordered.indexOf(previousSeatNumber);
  let nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ordered.length;
  let safety = 0;

  while (safety < ordered.length) {
    const candidateSeat = getStoredSeat(game, ordered[nextIndex]);
    if (candidateSeat.skipTurnsRemaining > 0) {
      candidateSeat.skipTurnsRemaining -= 1;
      appendDealerMessage(match, `${getPublicSeat(match, candidateSeat.seatNumber).displayName} loses a turn.`);
      appendServerDebugLog(match, "turn", `Seat ${candidateSeat.seatNumber} skipped turn (${candidateSeat.skipTurnsRemaining} skips remaining)`);
      nextIndex = (nextIndex + 1) % ordered.length;
      safety += 1;
      continue;
    }

    if (candidateSeat.noRiposteTurnsRemaining > 0) {
      candidateSeat.noRiposteTurnsRemaining -= 1;
      if (candidateSeat.noRiposteTurnsRemaining === 0) {
        const removedStatuses = candidateSeat.statuses.filter((status) => status.cardId === "sommeil");
        candidateSeat.statuses = candidateSeat.statuses.filter((status) => status.cardId !== "sommeil");
        discardInstances(game, removedStatuses.map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
        if (removedStatuses.length > 0) {
          appendServerDebugLog(match, "status", `Seat ${candidateSeat.seatNumber} woke up from Sommeil`);
        }
      }
    }

    game.currentTurnSeatNumber = candidateSeat.seatNumber;
    game.turnNumber += 1;
    candidateSeat.pendingExtraPlays = 0;
    candidateSeat.handInspectionTargetSeatNumber = undefined;
    if (candidateSeat.attackImmunityTurns > 0) {
      candidateSeat.attackImmunityTurns -= 1;
      if (candidateSeat.attackImmunityTurns === 0) {
        const removedSanctuaryCards = candidateSeat.objects.filter((objectCard) => objectCard.cardId === "sanctuaire-demmerlaus");
        candidateSeat.objects = candidateSeat.objects.filter((objectCard) => objectCard.cardId !== "sanctuaire-demmerlaus");
        if (removedSanctuaryCards.length > 0) {
          discardInstances(game, removedSanctuaryCards);
          appendServerDebugLog(match, "status", `Seat ${candidateSeat.seatNumber}'s Sanctuaire d'Emmerlaus expired`);
        }
      }
    }
    game.pendingCurseRelease = undefined;
    maybeQueueMaledictionRelease(match, candidateSeat.seatNumber);
    appendServerDebugLog(match, "turn", `Turn advanced to seat ${candidateSeat.seatNumber} (turn ${game.turnNumber})`);
    return;
  }
}

export function passTurnWithoutPlaying(match: StoredMatchState, seatNumber: number, reason: string): void {
  const game = match.internalGame;
  if (game == null || game.currentTurnSeatNumber !== seatNumber) {
    return;
  }

  const seat = getStoredSeat(game, seatNumber);
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
  const deck = createDeck();
  const minimumHandSize = determineMinimumHandSize(deck.length);
  const orderedSeats = sortBySeatNumber(match.seats);

  match.internalGame = {
    deck,
    discardPile: [],
    seatStates: orderedSeats.map((seat) => createSeatState(seat.seatNumber)),
    currentTurnSeatNumber: orderedSeats[0].seatNumber,
    turnNumber: 1,
    minimumHandSize,
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
  const canSeeHand = viewerSeatNumber === seat.seatNumber || viewerState?.handInspectionTargetSeatNumber === seat.seatNumber;

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
    pendingBoardResetKeep: buildPendingBoardResetKeepPublicState(match, viewerSeatNumber),
    pendingSacrificeChoice: buildPendingSacrificeChoicePublicState(match),
    pendingCurseRelease: buildPendingCurseReleasePublicState(match),
    forcedFollowUp: game.forcedFollowUp == null
      ? undefined
      : {
        sourceCardName: requireDefinition(game.forcedFollowUp.sourceCardId).name,
        actorSeatNumber: game.forcedFollowUp.actorSeatNumber,
        targetSeatNumber: game.forcedFollowUp.targetSeatNumber,
        allowedCategories: [...game.forcedFollowUp.allowedCategories],
        doubleHpLossDamage: game.forcedFollowUp.doubleHpLossDamage
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
    status: match.status,
    maxSeats: match.maxSeats,
    seats: sortBySeatNumber(match.seats).map((seat) => buildPublicSeat(match, seat, viewerSeatNumber)),
    chatMessages: [...match.chatMessages],
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
    card: buildCardView(pendingAction.storedCard, requireDefinition(pendingAction.storedCard.cardId), "discard", false),
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
  const allowedSlots = getAllowedObjectSlotsForDefinition(sourceDefinition);
  return {
    boxId: pendingObjectChoice.boxId,
    chooserSeatNumber: pendingObjectChoice.chooserSeatNumber,
    ownerSeatNumber: pendingObjectChoice.ownerSeatNumber,
    cardName: sourceDefinition.name,
    prompt: pendingObjectChoice.mode === "steal"
      ? `Choose an object to steal from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName}.`
      : `Choose an object to remove from ${getPublicSeat(match, pendingObjectChoice.ownerSeatNumber).displayName}.`,
    objectOptions: owner.objects
      .filter((objectCard) => objectMatchesAllowedSlots(objectCard.cardId, allowedSlots))
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

function maybeQueueMaledictionRelease(match: StoredMatchState, seatNumber: number): boolean {
  const game = match.internalGame;
  if (game == null) {
    return false;
  }

  const seatState = getStoredSeat(game, seatNumber);
  const maledictionStatus = seatState.statuses.find((status) => status.cardId === "malediction");
  if (maledictionStatus == null) {
    return false;
  }

  const annulationCount = seatState.hand.filter((card) => card.cardId === "annulation").length;
  if (annulationCount < 2) {
    return false;
  }

  game.pendingCurseRelease = {
    seatNumber,
    statusInstanceId: maledictionStatus.instanceId,
    sourceCardId: maledictionStatus.cardId,
    releaseCardId: "annulation",
    releaseCardCount: 2
  };
  appendServerDebugLog(match, "curse", `Seat ${seatNumber} may discard 2 Annulation to remove Malediction`);
  return true;
}

function finalizeResolvedAction(match: StoredMatchState, actorSeatNumber: number, boxId?: string): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  checkForWinner(match);
  if (match.status === "finished") {
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

  if (game.pendingHandInspection != null) {
    appendServerDebugLog(
      match,
      "telepathy",
      `Turn resolution paused for ${requireDefinition(game.pendingHandInspection.sourceCard.cardId).name}; seat ${game.pendingHandInspection.viewerSeatNumber} must close the hand view`
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

  if (actorState.pendingExtraPlays > 0) {
    actorState.pendingExtraPlays -= 1;
    appendServerDebugLog(match, "box", `Closed box ${boxId ?? "n/a"} for seat ${actorSeatNumber}; extra play remains (${actorState.pendingExtraPlays})`);
  } else {
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

  refreshSeatSummaries(match);
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
    card: buildCardView(pendingAction.storedCard, definition, "discard", false),
    summary: newSummary
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

function beginPendingAction(
  match: StoredMatchState,
  actorSeatNumber: number,
  removedCard: StoredCardInstance,
  definition: BaseCardDefinition,
  request: PlayCardRequest,
  targetSeatNumbers: number[]
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
    responseMode: determineResponseMode(definition),
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

function resolvePerDamageEffectResponder(match: StoredMatchState, responder: StoredPendingActionResponderState): void {
  const game = match.internalGame;
  const pendingAction = game?.pendingAction;
  if (game == null || pendingAction == null) {
    return;
  }

  const definition = requireDefinition(pendingAction.storedCard.cardId);
  const targetSeatNumber = responder.seatNumber;
  const actorSeat = getPublicSeat(match, pendingAction.actorSeatNumber);
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
        pendingAction.boxId
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
      1,
      damageEffects.length > 1 ? `attack ${damageEffectIndex}/${damageEffects.length}` : undefined
    );

    const shouldEvaluateDamage =
      !resistanceOutcome.resisted ||
      (
        !resistanceOutcome.criticalSuccess &&
        (definition.defenseBand?.resistance.color === "yellow" || effect.grantsHalfDamageOnResistance === true)
      );
    const targetSeat = getPublicSeat(match, targetSeatNumber);
    const baseAmount = shouldEvaluateDamage
      ? effect.amount.kind === "sacrifice_amount"
        ? (pendingAction.sharedSacrificeAmount ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, pendingAction.actorSeatNumber, pendingAction.boxId))
        : evaluateRoll(match, effect.amount, actorSeat, targetSeat, pendingAction.actorSeatNumber, pendingAction.boxId)
      : 0;
    const amount = shouldEvaluateDamage
      ? adjustDamageForResistance(baseAmount, resistanceOutcome, definition, effect)
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
      applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId);
    }

    if (effect.amount.kind === "sacrifice_amount" && pendingAction.responders[0]?.seatNumber === targetSeatNumber) {
      actorSeat.hp -= pendingAction.sharedSacrificeAmount ?? amount;
      handleSeatDeath(match, pendingAction.actorSeatNumber, false);
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
  if (!getStoredSeat(game, targetSeatNumber).alive) {
    discardInstances(game, responder.consumedCards);
    return;
  }

  if (pendingAction.fromMirror === true && game.pausedSequentialAction?.responseMode === "collective") {
    appendServerDebugLog(
      match,
      "mirror",
      `Seat ${targetSeatNumber} accepted reflected ${definition.name}; deferring damage to collective resolution`
    );
    discardInstances(game, responder.consumedCards);
    return;
  }

  if (responder.choice === "annulation") {
    discardInstances(game, responder.consumedCards);
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} canceled ${definition.name}.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} canceled ${definition.name}`);
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
    const attemptedResistance = canAttemptResistance(
      match,
      pendingAction,
      definition,
      targetSeatNumber,
      responder.choice
    );
    if (attemptedResistance) {
      const rollsRequired = Math.max(1, definition.defenseBand.resistance.rollsRequired || 1);
      const threshold = computeResistanceThreshold(match, targetSeatNumber, responder.choice);
      appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} attempts resistance on ${definition.name} with threshold ${threshold}`);
      pushPresentationEvent(match, {
        boxId: pendingAction.boxId,
        type: "resistance_start",
        seatNumber: targetSeatNumber,
        cardName: definition.name,
        bonus: threshold - 10,
        threshold
      });

      resisted = true;
      for (let rollIndex = 0; rollIndex < rollsRequired; rollIndex += 1) {
        const roll = rollDiceNotationDetailed("1D20");
        publishSeatDiceRoll(match, targetSeatNumber, "1D20", roll.total, roll.values, pendingAction.boxId);
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
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically resisted ${definition.name}!`);
        appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically resisted ${definition.name}`);
      } else if (resisted) {
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} resisted ${definition.name}.`);
        appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} resisted ${definition.name}`);
      } else if (fatalFailure) {
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically failed the resistance roll.`);
        appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} critically failed resistance on ${definition.name}`);
      } else {
        appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} failed resistance on ${definition.name}`);
      }
    }
  }

  if (!resisted || definition.defenseBand?.resistance.color === "yellow") {
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

      const actorSeat = getPublicSeat(match, pendingAction.actorSeatNumber);
      const targetSeat = getPublicSeat(match, targetSeatNumber);
      const baseAmount = effect.type === "damage" && effect.amount.kind === "sacrifice_amount"
        ? (pendingAction.sharedSacrificeAmount ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, pendingAction.actorSeatNumber, pendingAction.boxId))
        : evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          effect.type === "lifesteal" && effect.powerSource !== "target" ? actorSeat : targetSeat,
          pendingAction.actorSeatNumber,
          pendingAction.boxId
        );
      const amount = adjustHpLossAmountForResistance(
        definition,
        effect,
        baseAmount,
        resisted,
        criticalSuccess,
        fatalFailure
      );

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
      const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId);
      if (effect.type === "lifesteal" && dealt > 0) {
        actorSeat.hp += dealt;
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "hp_gain",
          seatNumber: pendingAction.actorSeatNumber,
          cardName: definition.name,
          amount: dealt
        });
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
        handleSeatDeath(match, pendingAction.actorSeatNumber, false);
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

  if (pendingAction.fromMirror === true) {
    // Mirror chain link resolved — resume the paused outer action if there is one
    const pausedAction = game.pausedSequentialAction;
    const reflectedTargetSeatNumber = pendingAction.targetSeatNumbers[0];
    if (
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
    game.discardPile.push(pendingAction.storedCard);
  }

  game.lastPlayedCard = {
    actorSeatNumber: pendingAction.actorSeatNumber,
    targetSeatNumbers: [...pendingAction.targetSeatNumbers],
    targetObjectInstanceId: pendingAction.targetObjectInstanceId,
    card: buildCardView(pendingAction.storedCard, definition, "discard", false),
    mode: "active",
    summary: pendingAction.summary,
    resolvedAt: new Date().toISOString()
  };
  game.pendingAction = undefined;
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
    if (game.pendingObjectChoice != null) {
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
  const annulationRequired = definition.defenseBand?.annulationCardsRequired ?? 0;
  const collectiveCanceled =
    pendingAction.responseMode === "collective" &&
    definition.defenseBand?.annulationAllowed === true &&
    pendingAction.responders
      .filter((responder) => responder.choice === "annulation")
      .reduce((count, responder) => count + responder.consumedCards.length, 0) >= Math.max(1, annulationRequired);

  if (collectiveCanceled) {
    const cancelingSeatNumber = pendingAction.responders.find((responder) => responder.choice === "annulation")?.seatNumber;
    discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
    game.discardPile.push(pendingAction.storedCard);
    if (cancelingSeatNumber != null) {
      appendServerDebugLog(
        match,
        "resolve",
        `Seat ${cancelingSeatNumber} canceled ${definition.name}; stopping collective responses`
      );
    }
    if (cancelingSeatNumber != null) {
      appendDealerMessage(match, `${getPublicSeat(match, cancelingSeatNumber).displayName} canceled ${definition.name}.`);
    } else {
      appendDealerMessage(match, `${definition.name} was canceled before resolving.`);
    }
    game.lastPlayedCard = {
      actorSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumbers: [...pendingAction.targetSeatNumbers],
      targetObjectInstanceId: pendingAction.targetObjectInstanceId,
      card: buildCardView(pendingAction.storedCard, definition, "discard", false),
      mode: "active",
      summary: pendingAction.summary,
      resolvedAt: new Date().toISOString()
    };
    game.pendingAction = undefined;
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

  const resistedTargets = new Set<number>();
  const fatalResistanceTargets = new Set<number>();
  const criticalSuccessTargets = new Set<number>();
  if (definition.rules.requiresResistanceCheck && definition.defenseBand != null && definition.defenseBand.resistance.color !== "red") {
    const rollsRequired = Math.max(1, definition.defenseBand.resistance.rollsRequired || 1);
    for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
      if (canceledTargets.has(targetSeatNumber) || mirroredTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        continue;
      }

      const responder = pendingAction.responders.find((candidate) => candidate.seatNumber === targetSeatNumber);
      const resistanceAttempted = responder != null && canAttemptResistance(
        match,
        pendingAction,
        definition,
        targetSeatNumber,
        responder.choice
      );
      if (!resistanceAttempted) {
        continue;
      }

      const threshold = computeResistanceThreshold(match, targetSeatNumber, responder?.choice ?? "pass");
      pushPresentationEvent(match, {
        boxId: pendingAction.boxId,
        type: "resistance_start",
        seatNumber: targetSeatNumber,
        cardName: definition.name,
        bonus: threshold - 10,
        threshold
      });

      let success = true;
      let fatalFailure = false;
      let criticalSuccess = false;

      for (let rollIndex = 0; rollIndex < rollsRequired; rollIndex += 1) {
        const roll = rollDiceNotationDetailed("1D20");
        publishSeatDiceRoll(match, targetSeatNumber, "1D20", roll.total, roll.values, pendingAction.boxId);
        if (roll.total === 20) {
          success = false;
          fatalFailure = true;
          break;
        }

        if (roll.total === 1) {
          // Critical success: resist is guaranteed, no damage even on yellow sphere
          criticalSuccess = true;
          break;
        }

        if (roll.total > threshold) {
          success = false;
          break;
        }
      }

      pushPresentationEvent(match, {
        boxId: pendingAction.boxId,
        type: "resistance_result",
        seatNumber: targetSeatNumber,
        cardName: definition.name,
        success,
        fatalFailure,
        criticalSuccess
      });

      if (criticalSuccess) {
        resistedTargets.add(targetSeatNumber);
        criticalSuccessTargets.add(targetSeatNumber);
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically resisted ${definition.name}!`);
      } else if (success) {
        resistedTargets.add(targetSeatNumber);
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} resisted ${definition.name}.`);
      }

      if (fatalFailure) {
        fatalResistanceTargets.add(targetSeatNumber);
        appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} critically failed the resistance roll.`);
      }
    }
  }

  for (const effect of definition.rules.effects) {
    if (effect.type !== "damage" && effect.type !== "lifesteal") {
      const remainingTargets = pendingAction.targetSeatNumbers.filter(
        (seatNumber) =>
          !canceledTargets.has(seatNumber) &&
          !mirroredTargets.has(seatNumber) &&
          !resistedTargets.has(seatNumber)
      );
      const pausedForObjectChoice = applyEffect(
        match,
        pendingAction.actorSeatNumber,
        pendingAction.storedCard,
        definition,
        effect,
        remainingTargets,
        pendingAction.targetObjectInstanceId,
        pendingAction.boxId
      );
      if (pausedForObjectChoice) {
        return;
      }
      continue;
    }

    const actorSeat = getPublicSeat(match, pendingAction.actorSeatNumber);
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
      ? effect.type === "damage" && effect.amount.kind === "sacrifice_amount"
        ? (pendingAction.sharedSacrificeAmount ?? evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          hpLossApplicationSeatNumbers.length > 0 ? getPublicSeat(match, hpLossApplicationSeatNumbers[0]) : undefined,
          pendingAction.actorSeatNumber,
          pendingAction.boxId
        ))
        : evaluateRoll(
          match,
          effect.amount,
          actorSeat,
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

      const baseAmount = sharedDamageBase
        ?? evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          effect.type === "lifesteal" && effect.powerSource !== "target" ? actorSeat : targetSeat,
          pendingAction.actorSeatNumber,
          pendingAction.boxId
        );
      const amount = adjustHpLossAmountForResistance(
        definition,
        effect,
        baseAmount,
        resistedTargets.has(targetSeatNumber),
        criticalSuccessTargets.has(targetSeatNumber),
        fatalResistanceTargets.has(targetSeatNumber)
      );

      const dealt = applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId);
      if (effect.type === "lifesteal" && dealt > 0) {
        healBySeatNumber.set(
          pendingAction.actorSeatNumber,
          (healBySeatNumber.get(pendingAction.actorSeatNumber) ?? 0) + dealt
        );
      }
    }

    for (const hit of deferredMirrorHits) {
      const targetSeat = getPublicSeat(match, hit.targetSeatNumber);
      const deferredActorSeat = getPublicSeat(match, hit.sourceSeatNumber);
      const baseAmount = sharedDamageBase
        ?? evaluateRoll(
          match,
          effect.amount,
          deferredActorSeat,
          effect.type === "lifesteal" && effect.powerSource !== "target" ? deferredActorSeat : targetSeat,
          hit.sourceSeatNumber,
          pendingAction.boxId
        );
      const amount = baseAmount;

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
        const dealt = applyDamage(match, hit.targetSeatNumber, amount, definition, false, pendingAction.boxId);
        if (effect.type === "lifesteal" && dealt > 0) {
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

        getPublicSeat(match, seatNumber).hp += healAmount;
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "hp_gain",
          seatNumber,
          cardName: definition.name,
          amount: healAmount
        });
      }
    }

    if (effect.type === "damage" && effect.amount.kind === "sacrifice_amount" && sharedDamageBase != null) {
      actorSeat.hp -= sharedDamageBase;
      if (sharedDamageBase > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "hp_loss",
          seatNumber: pendingAction.actorSeatNumber,
          cardName: definition.name,
          amount: sharedDamageBase
        });
      }
      handleSeatDeath(match, pendingAction.actorSeatNumber, false);
    }

  }

  discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
  const resolvedTargetSeatNumbers = pendingAction.targetSeatNumbers.filter(
    (seatNumber) => !canceledTargets.has(seatNumber) && !resistedTargets.has(seatNumber) && !mirroredTargets.has(seatNumber)
  );

  if (definition.rules.staysInPlay) {
    movePersistentCard(
      match,
      pendingAction.actorSeatNumber,
      resolvedTargetSeatNumbers,
      pendingAction.storedCard,
      definition
    );
  } else {
    game.discardPile.push(pendingAction.storedCard);
  }

  game.lastPlayedCard = {
    actorSeatNumber: pendingAction.actorSeatNumber,
    targetSeatNumbers: [...pendingAction.targetSeatNumbers],
    targetObjectInstanceId: pendingAction.targetObjectInstanceId,
    card: buildCardView(pendingAction.storedCard, definition, "discard", false),
    mode: "active",
    summary: pendingAction.summary,
    resolvedAt: new Date().toISOString()
  };
  game.pendingAction = undefined;
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
  } else if (request.choice === "resistance_accrue") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, "resistance-accrue", 1);
  } else if (request.choice === "mirror") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, "miroir", 1);
  } else {
    responder.consumedCards = [];
  }

  // Mirror starts a chain immediately for both per_target and collective modes
  if (request.choice === "mirror") {
    resolveMirror(match, pendingAction, responderSeat.seatNumber);
    return;
  }

  if (pendingAction.responseMode === "per_target") {
    resolvePerTargetResponder(match, responder);
    if (game.pendingObjectChoice != null) {
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
    if (request.choice === "annulation") {
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
  if (!objectMatchesAllowedSlots(
    owner.objects.find((object) => object.instanceId === objectInstanceId)?.cardId ?? "",
    getAllowedObjectSlotsForDefinition(sourceDefinition)
  )) {
    throw new Error("That object cannot be selected for this card");
  }
  const removed = removeObjectFromSeat(match, pendingObjectChoice.ownerSeatNumber, objectInstanceId);
  if (removed[0] != null) {
    if (pendingObjectChoice.mode === "steal") {
      getStoredSeat(game, pendingObjectChoice.chooserSeatNumber).objects.push(...removed);
      appendDealerMessage(
        match,
        `${chooserSeat.displayName} stole ${requireDefinition(removed[0].cardId).name} with ${sourceDefinition.name}.`
      );
    } else {
      discardInstances(game, removed);
      appendDealerMessage(
        match,
        `${chooserSeat.displayName} removed ${requireDefinition(removed[0].cardId).name} with ${sourceDefinition.name}.`
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
    if (definition.rules.staysInPlay) {
      movePersistentCard(
        match,
        pendingAction.actorSeatNumber,
        [...pendingAction.targetSeatNumbers],
        pendingAction.storedCard,
        definition
      );
    } else {
      game.discardPile.push(pendingAction.storedCard);
    }

    game.lastPlayedCard = {
      actorSeatNumber: pendingAction.actorSeatNumber,
      targetSeatNumbers: [...pendingAction.targetSeatNumbers],
      targetObjectInstanceId: pendingAction.targetObjectInstanceId,
      card: buildCardView(pendingAction.storedCard, definition, "discard", false),
      mode: "active",
      summary: pendingAction.summary,
      resolvedAt: new Date().toISOString()
    };
    game.pendingAction = undefined;
    finalizeResolvedAction(match, pendingAction.actorSeatNumber, pendingAction.boxId);
    return;
  }

  finalizeResolvedAction(match, chooserSeat.seatNumber, pendingBoardResetKeep.boxId);
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

  const actorState = getStoredSeat(game, actorSeat.seatNumber);
  const playableAd = actorState.hand.find((card) => canPlayCardActively(match, actorSeat.seatNumber, card).canPlay);
  if (playableAd != null) {
    throw new Error("You still have an AD card to play for Colère du magicien");
  }

  appendDealerMessage(match, `${actorSeat.displayName} has no AD card for ${requireDefinition(forcedFollowUp.sourceCardId).name} and passes.`);
  appendServerDebugLog(
    match,
    "forced_follow_up",
    `Seat ${actorSeat.seatNumber} passed ${requireDefinition(forcedFollowUp.sourceCardId).name} follow-up with no playable AD`
  );
  const turnOwnerSeatNumber = forcedFollowUp.turnOwnerSeatNumber;
  game.forcedFollowUp = undefined;
  finalizeResolvedAction(match, turnOwnerSeatNumber);
}

export function playCardFromHand(match: StoredMatchState, userId: string, request: PlayCardRequest): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("The match has not started");
  }

  if (game.pendingHandInspection != null) {
    throw new Error("Resolve the current action first");
  }

  if (game.pendingBoardResetKeep != null) {
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
  if (forcedFollowUp != null && request.mode === "inactive") {
    throw new Error("Play an AD card for Colère du magicien or pass the forced follow-up");
  }

  const playState = canPlayCardActively(match, actorSeat.seatNumber, handCard);
  if (request.mode === "active" && !playState.canPlay) {
    throw new Error(playState.reason ?? "That card cannot be played right now");
  }

  const targetSeatNumbers = request.mode === "inactive"
    ? []
    : forcedFollowUp != null
      ? [forcedFollowUp.targetSeatNumber]
      : getTargetSeatNumbers(game, actorSeat.seatNumber, request, definition.rules.targets);
  const effectiveTargetSeatNumbers =
    request.mode === "active" && definition.rules.targets === "all_opponents" && isAttackDefinition(definition)
      ? targetSeatNumbers.filter((seatNumber) => !isProtectedFromAttack(match, seatNumber, definition))
      : targetSeatNumbers;
  if (
    forcedFollowUp != null &&
    request.targetSeatNumber != null &&
    request.targetSeatNumber !== forcedFollowUp.targetSeatNumber
  ) {
    throw new Error("Colère du magicien follow-up must target the paralyzed opponent");
  }

  if (
    request.mode === "active"
    && definition.rules.targets !== "all_opponents"
    && effectiveTargetSeatNumbers.some((seatNumber) => isProtectedFromAttack(match, seatNumber, definition))
  ) {
    throw new Error("That target is protected and cannot be attacked right now");
  }

  const removedCard = moveCardFromHand(actorState.hand, handCard.instanceId);
  const summary = describePlay(match, actorSeat.seatNumber, definition, request, effectiveTargetSeatNumbers);
  appendServerDebugLog(
    match,
    "play_card",
    `Seat ${actorSeat.seatNumber} plays ${definition.name} (${request.mode})${request.targetSeatNumber != null ? ` -> seat ${request.targetSeatNumber}` : ""}${request.targetObjectInstanceId != null ? ` -> object ${request.targetObjectInstanceId}` : ""}`
  );

  if (request.mode === "inactive") {
    game.discardPile.push(removedCard);
    appendDealerMessage(match, summary);
    game.lastPlayedCard = {
      actorSeatNumber: actorSeat.seatNumber,
      targetSeatNumbers: effectiveTargetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeat.seatNumber);
    return;
  }

  const responderSeatNumbers = getResponderSeatNumbers(game, actorSeat.seatNumber, definition, effectiveTargetSeatNumbers);
  if (
    forcedFollowUp == null &&
    (definition.rules.requiresDefenseWindow || definition.rules.requiresResistanceCheck || definition.defenseBand?.annulationAllowed === true) &&
    responderSeatNumbers.length > 0 &&
    definition.defenseBand != null
  ) {
    beginPendingAction(match, actorSeat.seatNumber, removedCard, definition, request, effectiveTargetSeatNumbers);
    refreshSeatSummaries(match);
    return;
  }

  const boxId = randomUUID();
  appendServerDebugLog(match, "box", `Opened box ${boxId} for seat ${actorSeat.seatNumber} using ${definition.name}`);
  pushGameEvent(match, {
    id: randomUUID(),
    boxId,
    type: "action_start",
    createdAt: new Date().toISOString(),
    actorSeatNumber: actorSeat.seatNumber,
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
      actorSeat.seatNumber,
      removedCard,
      definition,
      effect,
      effectiveTargetSeatNumbers,
      request.targetObjectInstanceId,
      boxId,
      damageMultiplier,
      finalizeActorSeatNumber
    );
    if (pausedForObjectChoice) {
      if (definition.rules.staysInPlay) {
        movePersistentCard(match, actorSeat.seatNumber, effectiveTargetSeatNumbers, removedCard, definition);
      } else {
        game.discardPile.push(removedCard);
      }

      appendDealerMessage(match, summary);
      game.lastPlayedCard = {
        actorSeatNumber: actorSeat.seatNumber,
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

  if (definition.rules.staysInPlay) {
    movePersistentCard(match, actorSeat.seatNumber, effectiveTargetSeatNumbers, removedCard, definition);
  } else {
    game.discardPile.push(removedCard);
  }

  appendDealerMessage(match, summary);
  game.lastPlayedCard = {
    actorSeatNumber: actorSeat.seatNumber,
    targetSeatNumbers: effectiveTargetSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    mode: request.mode,
    summary,
    resolvedAt: new Date().toISOString()
  };
  if (wasForcedFollowUp) {
    game.forcedFollowUp = undefined;
    appendServerDebugLog(match, "forced_follow_up", `Seat ${actorSeat.seatNumber} completed Colère du magicien follow-up with ${definition.name}`);
  }
  finalizeResolvedAction(match, finalizeActorSeatNumber ?? actorSeat.seatNumber, boxId);
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

  const seatState = getStoredSeat(game, seatNumber);
  for (const handCard of seatState.hand) {
    const definition = requireDefinition(handCard.cardId);
    const playState = canPlayCardActively(match, seatNumber, handCard);
    if (!playState.canPlay) {
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
          listTargetableObjectOwners(game, seatNumber).filter((candidateSeatNumber) =>
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
