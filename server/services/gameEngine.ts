import { randomUUID } from "node:crypto";
import {
  baseCardDefinitionById,
  baseCardDefinitions,
  type BaseCardDefinition,
  type CardCategoryCode,
  type CardEffect,
  type RollExpression
} from "../../shared/cards";
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
} from "../../shared/types";
import type {
  StoredCardInstance,
  StoredGameState,
  StoredMatchState,
  StoredPendingActionResponderState,
  StoredSeatState,
  StoredSeatStatus,
  StoredPendingActionState
} from "./gameEngineTypes";

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
    attackImmunityTurns: 0
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

  appendDealerMessage(
    match,
    `Dealer rolled ${notation.toUpperCase()}: ${total}${values.length > 0 ? ` [${values.join(", ")}]` : ""}`
  );
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

  appendDealerMessage(
    match,
    `Dealer rolled ${notation.toUpperCase()} for seat ${seatNumber}: ${total}${values.length > 0 ? ` [${values.join(", ")}]` : ""}`
  );
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
    .filter((seat) => seat.seatNumber !== actorSeatNumber && seat.objects.length > 0 && seat.alive)
    .map((seat) => seat.seatNumber);
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

      return base;
    }
    case "fixed":
      if (expression.scaleBy === "power") {
        return expression.amount + actorSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      if (expression.scaleBy === "target_power" && targetSeat != null) {
        return expression.amount + targetSeat.powerLevel! * (expression.bonusPerPower ?? 1);
      }

      return expression.amount;
    case "current_hp_fraction":
      return Math.max(1, Math.ceil((targetSeat?.hp ?? 0) * expression.numerator / expression.denominator));
    case "sacrifice_amount":
      return actorSeat.hp;
    case "total_active_players_times":
      return expression.amount;
  }
}

function isTargetDependentRollExpression(expression: RollExpression): boolean {
  if (expression.kind === "current_hp_fraction") {
    return true;
  }

  return "scaleBy" in expression && expression.scaleBy === "target_power";
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

  if (game.pendingAction != null) {
    return { canPlay: false, reason: "Resolve the current action first" };
  }

  if (game.currentTurnSeatNumber !== actorSeatNumber) {
    return { canPlay: false, reason: "Wait for your turn" };
  }

  const actorSeat = getStoredSeat(game, actorSeatNumber);
  if (!actorSeat.alive) {
    return { canPlay: false, reason: "Dead players cannot act" };
  }

  const definition = requireDefinition(card.cardId);
  if (definition.category.code === "CA") {
    return { canPlay: false, reason: "Counter cards are only used as reactions" };
  }

  switch (definition.rules.targets) {
    case "self":
    case "all_opponents":
    case "none":
      return { canPlay: true };
    case "single_opponent":
      return nextLivingOpponentSeatNumbers(game, actorSeatNumber).length > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No valid opponent target" };
    case "left_opponent":
      return getLeftOpponentSeatNumber(game, actorSeatNumber) != null
        ? { canPlay: true }
        : { canPlay: false, reason: "No left opponent available" };
    case "target_object":
      return listTargetableObjectOwners(game, actorSeatNumber).length > 0
        ? { canPlay: true }
        : { canPlay: false, reason: "No target object available" };
    case "single_player_or_object":
      return nextLivingOpponentSeatNumbers(game, actorSeatNumber).length > 0 || listTargetableObjectOwners(game, actorSeatNumber).length > 0
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

  const currentResponder = getCurrentPendingResponder(pendingAction);
  if (currentResponder?.seatNumber !== seatNumber) {
    return [];
  }

  const seatState = getStoredSeat(game, seatNumber);
  const annulations = seatState.hand.filter((card) => card.cardId === "annulation");
  const options: PendingActionOption[] = [
    {
      choice: "pass",
      label: "Pass",
      description: "Do not defend against the current action."
    }
  ];

  if (
    pendingAction.targetSeatNumbers.includes(seatNumber) &&
    pendingDefinition.defenseBand != null &&
    pendingDefinition.defenseBand.resistance.color !== "red"
  ) {
    options.push({
      choice: "resist",
      label: "Resist",
      description: "Attempt a resistance roll against this action."
    });
  }

  if (
    pendingDefinition.defenseBand?.annulationAllowed &&
    annulations.length >= pendingDefinition.defenseBand.annulationCardsRequired
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

  return options;
}

function canPlayCardAsPendingResponse(match: StoredMatchState, seatNumber: number, card: StoredCardInstance): { canPlay: boolean; reason?: string } {
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
    return { canPlay: false, reason: "Mirror resolution is not implemented yet" };
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
  appendServerDebugLog(match, "swap", `Seat ${leftSeatNumber} swapped bodies with seat ${rightSeatNumber}`);
}

function requestObjectOwnerSeatNumber(
  match: StoredMatchState,
  actorSeatNumber: number,
  targetSeatNumbers: number[],
  targetObjectInstanceId?: string
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

    return owner.seatNumber;
  }

  const targetSeatNumber = targetSeatNumbers[0] ?? listTargetableObjectOwners(game, actorSeatNumber)[0];
  if (targetSeatNumber == null) {
    throw new Error("A target object is required");
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

function movePersistentCard(match: StoredMatchState, actorSeatNumber: number, targetSeatNumbers: number[], card: StoredCardInstance, definition: BaseCardDefinition): void {
  const game = match.internalGame;
  if (game == null) {
    return;
  }

  if (definition.category.code === "O") {
    getStoredSeat(game, actorSeatNumber).objects.push(card);
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
  boxId?: string
): void {
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

      for (const targetSeatNumber of targetSeatNumbers) {
        const targetSeat = getPublicSeat(match, targetSeatNumber);
        const amount = sacrificeAmount ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId);
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
        const aliveOpponents = targetSeatNumbers.length > 0 ? targetSeatNumbers : nextLivingOpponentSeatNumbers(game, actorSeatNumber);
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
        const amount = evaluateRoll(match, effect.amount, actorSeat, effect.powerSource === "target" ? targetSeat : actorSeat, actorSeatNumber, boxId);
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
        targetSeat.hp = evaluateRoll(match, effect.amount, actorSeat, targetSeat, actorSeatNumber, boxId);
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
      if (effect.mode === "all") {
        for (const targetSeatNumber of targetSeatNumbers) {
          const removed = removeObjectFromSeat(match, targetSeatNumber);
          discardInstances(game, removed);
        }
      } else {
        const ownerSeatNumber = requestObjectOwnerSeatNumber(match, actorSeatNumber, targetSeatNumbers, targetObjectInstanceId);
        const removed = removeObjectFromSeat(match, ownerSeatNumber, targetObjectInstanceId);
        discardInstances(game, removed);
        if (removed[0] != null) {
          appendServerDebugLog(match, "object", `${definition.name} discarded ${requireDefinition(removed[0].cardId).name} from seat ${ownerSeatNumber}${boxId != null ? ` [box ${boxId}]` : ""}`);
        }
      }
      break;
    case "steal_target_object": {
      const ownerSeatNumber = requestObjectOwnerSeatNumber(match, actorSeatNumber, targetSeatNumbers, targetObjectInstanceId);
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
      if (effect.duration === "until_removed" && definition.category.code !== "O") {
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
      break;
    case "paralyze_for_bonus_attack":
      appendDealerMessage(match, `${actorSeat.displayName} played ${definition.name}. Forced reaction handling will be completed in the next rules pass.`);
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
      const kept = actorState.hand.splice(0, Math.min(effect.keeperCards, actorState.hand.length));
      const recycled: StoredCardInstance[] = [];

      for (const seatState of game.seatStates) {
        if (seatState.seatNumber === actorSeatNumber) {
          recycled.push(...actorState.hand.splice(0));
        } else {
          recycled.push(...seatState.hand.splice(0));
        }

        recycled.push(...seatState.objects.splice(0));
        recycled.push(...seatState.statuses.splice(0).map((status) => ({ instanceId: status.instanceId, cardId: status.cardId })));
      }

      actorState.hand = kept;
      game.deck = shuffle([...game.deck, ...game.discardPile, ...recycled]);
      game.discardPile = [];
      actorSeat.hp += effect.attackerHpBonus;
      if (effect.attackerHpBonus > 0) {
        pushPresentationEvent(match, {
          boxId,
          type: "hp_gain",
          seatNumber: actorSeatNumber,
          cardName: definition.name,
          amount: effect.attackerHpBonus
        });
      }
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
      }
      break;
    case "dealer_message":
      appendDealerMessage(match, effect.messageKey);
      break;
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

    game.currentTurnSeatNumber = candidateSeat.seatNumber;
    game.turnNumber += 1;
    candidateSeat.pendingExtraPlays = 0;
    candidateSeat.handInspectionTargetSeatNumber = undefined;
    if (candidateSeat.attackImmunityTurns > 0) {
      candidateSeat.attackImmunityTurns -= 1;
    }
    appendServerDebugLog(match, "turn", `Turn advanced to seat ${candidateSeat.seatNumber} (turn ${game.turnNumber})`);
    return;
  }
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
    responders: pendingAction.responders.map((responder) => ({
      seatNumber: responder.seatNumber,
      state: responder.state,
      choice: responder.choice,
      card: responder.consumedCards[0] == null
        ? undefined
        : buildCardView(responder.consumedCards[0], requireDefinition(responder.consumedCards[0].cardId), "discard", false),
      cards: responder.consumedCards.map((card) => buildCardView(card, requireDefinition(card.cardId), "discard", false))
    }))
  };
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
  const actorSeat = getPublicSeat(match, actorSeatNumber);
  const boxId = randomUUID();
  const sharedSacrificeAmount = definition.rules.effects
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
    sharedSacrificeAmount: sharedSacrificeAmount != null
      ? evaluateRoll(match, sharedSacrificeAmount.amount, actorSeat, undefined, actorSeatNumber, boxId)
      : undefined,
    responders: responderSeatNumbers.map((seatNumber) => ({
      seatNumber,
      state: "pending",
      choice: "pending",
      consumedCards: []
    })),
    createdAt: new Date().toISOString()
  };
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

  if (responder.choice === "annulation") {
    discardInstances(game, responder.consumedCards);
    appendDealerMessage(match, `${getPublicSeat(match, targetSeatNumber).displayName} canceled ${definition.name}.`);
    appendServerDebugLog(match, "resolve", `Seat ${targetSeatNumber} canceled ${definition.name}`);
    return;
  }

  let resisted = false;
  let fatalFailure = false;
  if (definition.rules.requiresResistanceCheck && definition.defenseBand != null && definition.defenseBand.resistance.color !== "red") {
    const attemptedResistance = responder.choice === "resist" || responder.choice === "resistance_accrue";
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
          continue;
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
        fatalFailure
      });

      if (resisted) {
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
      if (effect.type !== "damage") {
        if (!resisted) {
          applyEffect(
            match,
            pendingAction.actorSeatNumber,
            pendingAction.storedCard,
            definition,
            effect,
            [targetSeatNumber],
            pendingAction.targetObjectInstanceId,
            pendingAction.boxId
          );
        }
        continue;
      }

      const actorSeat = getPublicSeat(match, pendingAction.actorSeatNumber);
      const targetSeat = getPublicSeat(match, targetSeatNumber);
      let amount = effect.amount.kind === "sacrifice_amount"
        ? (pendingAction.sharedSacrificeAmount ?? evaluateRoll(match, effect.amount, actorSeat, targetSeat, pendingAction.actorSeatNumber, pendingAction.boxId))
        : evaluateRoll(match, effect.amount, actorSeat, targetSeat, pendingAction.actorSeatNumber, pendingAction.boxId);

      if (resisted) {
        if (definition.defenseBand?.resistance.color === "yellow" || effect.grantsHalfDamageOnResistance) {
          amount = Math.max(1, Math.ceil(amount / 2));
        } else {
          amount = 0;
        }
      }

      if (fatalFailure) {
        amount *= 2;
      }

      if (amount > 0) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "attack_impact",
          actorSeatNumber: pendingAction.actorSeatNumber,
          targetSeatNumber,
          cardName: definition.name
        });
      }

      appendServerDebugLog(match, "resolve", `Applying ${definition.name} damage ${amount} to seat ${targetSeatNumber}`);
      applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId);

      if (effect.amount.kind === "sacrifice_amount" && pendingAction.responders[0]?.seatNumber === targetSeatNumber) {
        actorSeat.hp -= pendingAction.sharedSacrificeAmount ?? amount;
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
    pendingAction.responders.filter((responder) => responder.choice === "annulation").length >= Math.max(1, annulationRequired);

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
    appendDealerMessage(match, `${definition.name} was canceled before resolving.`);
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

  const canceledTargets = new Set<number>();
  for (const responder of pendingAction.responders) {
    if (responder.choice === "annulation") {
      canceledTargets.add(responder.seatNumber);
    }
  }

  const resistedTargets = new Set<number>();
  const fatalResistanceTargets = new Set<number>();
  if (definition.rules.requiresResistanceCheck && definition.defenseBand != null && definition.defenseBand.resistance.color !== "red") {
    const rollsRequired = Math.max(1, definition.defenseBand.resistance.rollsRequired || 1);
    for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
      if (canceledTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        continue;
      }

      const responder = pendingAction.responders.find((candidate) => candidate.seatNumber === targetSeatNumber);
      const resistanceAttempted = responder?.choice === "resist" || responder?.choice === "resistance_accrue";
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

      for (let rollIndex = 0; rollIndex < rollsRequired; rollIndex += 1) {
        const roll = rollDiceNotationDetailed("1D20");
        publishSeatDiceRoll(match, targetSeatNumber, "1D20", roll.total, roll.values, pendingAction.boxId);
        if (roll.total === 20) {
          success = false;
          fatalFailure = true;
          break;
        }

        if (roll.total === 1) {
          continue;
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
        fatalFailure
      });

      if (success) {
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
    if (effect.type !== "damage") {
      const remainingTargets = pendingAction.targetSeatNumbers.filter(
        (seatNumber) => !canceledTargets.has(seatNumber) && !resistedTargets.has(seatNumber)
      );
      applyEffect(
        match,
        pendingAction.actorSeatNumber,
        pendingAction.storedCard,
        definition,
        effect,
        remainingTargets,
        pendingAction.targetObjectInstanceId,
        pendingAction.boxId
      );
      continue;
    }

    const actorSeat = getPublicSeat(match, pendingAction.actorSeatNumber);
    const damageTargetSeatNumbers = pendingAction.targetSeatNumbers.filter((targetSeatNumber) => {
      if (canceledTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        return false;
      }

      return (
        !resistedTargets.has(targetSeatNumber)
        || definition.defenseBand?.resistance.color === "yellow"
        || effect.grantsHalfDamageOnResistance
      );
    });

    const usesSharedDamageBase =
      damageTargetSeatNumbers.length > 0
      && !isTargetDependentRollExpression(effect.amount);
    const sharedDamageBase = usesSharedDamageBase
      ? evaluateRoll(
        match,
        effect.amount,
        actorSeat,
        damageTargetSeatNumbers.length > 0 ? getPublicSeat(match, damageTargetSeatNumbers[0]) : undefined,
        pendingAction.actorSeatNumber,
        pendingAction.boxId
      )
      : undefined;

    if (sharedDamageBase != null) {
      appendServerDebugLog(
        match,
        "resolve",
        `Collected ${definition.name} shared damage ${sharedDamageBase} for targets ${damageTargetSeatNumbers.join(", ")}`
      );
    }

    for (const targetSeatNumber of pendingAction.targetSeatNumbers) {
      if (canceledTargets.has(targetSeatNumber) || !getStoredSeat(game, targetSeatNumber).alive) {
        continue;
      }

      const targetSeat = getPublicSeat(match, targetSeatNumber);
      const willTakeDamageAfterResistance =
        !resistedTargets.has(targetSeatNumber)
        || definition.defenseBand?.resistance.color === "yellow"
        || effect.grantsHalfDamageOnResistance;
      if (willTakeDamageAfterResistance) {
        pushPresentationEvent(match, {
          boxId: pendingAction.boxId,
          type: "attack_impact",
          actorSeatNumber: pendingAction.actorSeatNumber,
          targetSeatNumber,
          cardName: definition.name
        });
      }

      let amount = sharedDamageBase
        ?? evaluateRoll(
          match,
          effect.amount,
          actorSeat,
          targetSeat,
          pendingAction.actorSeatNumber,
          pendingAction.boxId
        );

      if (resistedTargets.has(targetSeatNumber)) {
        if (definition.defenseBand?.resistance.color === "yellow" || effect.grantsHalfDamageOnResistance) {
          amount = Math.max(1, Math.ceil(amount / 2));
        } else {
          amount = 0;
        }
      }

      if (fatalResistanceTargets.has(targetSeatNumber)) {
        amount *= 2;
      }

      applyDamage(match, targetSeatNumber, amount, definition, false, pendingAction.boxId);
    }

    if (effect.amount.kind === "sacrifice_amount" && sharedDamageBase != null) {
      actorSeat.hp -= sharedDamageBase;
      handleSeatDeath(match, pendingAction.actorSeatNumber, false);
    }
  }

  discardInstances(game, pendingAction.responders.flatMap((responder) => responder.consumedCards));
  const resolvedTargetSeatNumbers = pendingAction.targetSeatNumbers.filter(
    (seatNumber) => !canceledTargets.has(seatNumber) && !resistedTargets.has(seatNumber)
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
    responder.consumedCards = consumeHandCardsById(seatState.hand, "annulation", requiredCount);
  } else if (request.choice === "resistance_accrue") {
    responder.consumedCards = consumeHandCardsById(seatState.hand, "resistance-accrue", 1);
  } else {
    responder.consumedCards = [];
  }

  if (pendingAction.responseMode === "per_target") {
    resolvePerTargetResponder(match, responder);
    if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      finalizePendingAction(match);
    } else {
      refreshSeatSummaries(match);
    }
  } else {
    if (request.choice === "annulation") {
      resolvePendingAction(match);
    } else if (pendingAction.responders.every((candidate) => candidate.state !== "pending")) {
      resolvePendingAction(match);
    } else {
      refreshSeatSummaries(match);
    }
  }
}

export function playCardFromHand(match: StoredMatchState, userId: string, request: PlayCardRequest): void {
  const game = match.internalGame;
  if (game == null) {
    throw new Error("The match has not started");
  }

  const actorSeat = match.seats.find((seat) => seat.userId === userId);
  if (actorSeat == null) {
    throw new Error("Player seat not found");
  }

  if (game.currentTurnSeatNumber !== actorSeat.seatNumber) {
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
  const playState = canPlayCardActively(match, actorSeat.seatNumber, handCard);
  if (request.mode === "active" && !playState.canPlay) {
    throw new Error(playState.reason ?? "That card cannot be played right now");
  }

  const removedCard = moveCardFromHand(actorState.hand, handCard.instanceId);
  const targetSeatNumbers = request.mode === "inactive"
    ? []
    : getTargetSeatNumbers(game, actorSeat.seatNumber, request, definition.rules.targets);

  const summary = describePlay(match, actorSeat.seatNumber, definition, request, targetSeatNumbers);
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
      targetSeatNumbers,
      targetObjectInstanceId: request.targetObjectInstanceId,
      card: buildCardView(removedCard, definition, "discard", false),
      mode: request.mode,
      summary,
      resolvedAt: new Date().toISOString()
    };
    finalizeResolvedAction(match, actorSeat.seatNumber);
    return;
  }

  const responderSeatNumbers = getResponderSeatNumbers(game, actorSeat.seatNumber, definition, targetSeatNumbers);
  if (
    (definition.rules.requiresDefenseWindow || definition.rules.requiresResistanceCheck || definition.defenseBand?.annulationAllowed === true) &&
    responderSeatNumbers.length > 0 &&
    definition.defenseBand != null
  ) {
    beginPendingAction(match, actorSeat.seatNumber, removedCard, definition, request, targetSeatNumbers);
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
    targetSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    summary
  });

  for (const effect of definition.rules.effects) {
    applyEffect(match, actorSeat.seatNumber, removedCard, definition, effect, targetSeatNumbers, request.targetObjectInstanceId, boxId);
  }

  if (definition.rules.staysInPlay) {
    movePersistentCard(match, actorSeat.seatNumber, targetSeatNumbers, removedCard, definition);
  } else {
    game.discardPile.push(removedCard);
  }

  appendDealerMessage(match, summary);
  game.lastPlayedCard = {
    actorSeatNumber: actorSeat.seatNumber,
    targetSeatNumbers,
    targetObjectInstanceId: request.targetObjectInstanceId,
    card: buildCardView(removedCard, definition, "discard", false),
    mode: request.mode,
    summary,
    resolvedAt: new Date().toISOString()
  };
  finalizeResolvedAction(match, actorSeat.seatNumber, boxId);
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
        request.targetSeatNumber = pickRandom(nextLivingOpponentSeatNumbers(game, seatNumber));
        break;
      case "left_opponent":
        request.targetSeatNumber = getLeftOpponentSeatNumber(game, seatNumber);
        break;
      case "single_player_or_object":
        request.targetSeatNumber = pickRandom(nextLivingOpponentSeatNumbers(game, seatNumber));
        break;
      case "target_object": {
        const ownerSeatNumber = pickRandom(listTargetableObjectOwners(game, seatNumber));
        if (ownerSeatNumber == null) {
          continue;
        }

        const ownerState = getStoredSeat(game, ownerSeatNumber);
        request.targetObjectInstanceId = pickRandom(ownerState.objects)?.instanceId;
        break;
      }
      default:
        break;
    }

    return request;
  }

  const discardCard = seatState.hand[0];
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

  const availableChoices = new Set(options.map((option) => option.choice));
  const preferredChoice =
    availableChoices.has("annulation")
      ? "annulation"
      : availableChoices.has("resistance_accrue")
        ? "resistance_accrue"
        : availableChoices.has("resist")
          ? "resist"
          : "pass";

  appendServerDebugLog(
    match,
    "bot_response",
    `Seat ${seatNumber} bot options=${options.map((option) => option.choice).join(",")} chose=${preferredChoice}`
  );

  return { choice: preferredChoice };
}
