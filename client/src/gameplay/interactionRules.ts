import type { CardView, MatchState, PendingActionResponderState, ResponseChoiceType, SeatState } from "../../../shared/types";

function isAttackCard(card: CardView): boolean {
  return ["AD", "AM", "S", "E", "CO", "ST", "SO"].includes(card.categoryCode);
}

const RED_ARROW_SELF_TARGET_CARD_IDS = new Set([
  "expulsion-temporaire",
  "la-ceinture-qui-disparait"
]);

function cardUsesRedArrowSelfTargeting(card: CardView): boolean {
  return RED_ARROW_SELF_TARGET_CARD_IDS.has(card.cardId);
}

export function getEffectiveInteractionTargets(card: CardView, viergeReplayCard?: CardView): CardView["targets"] {
  if (card.cardId === "vierge" && viergeReplayCard != null) {
    return viergeReplayCard.targets;
  }

  return card.targets;
}

export function cardNeedsArrow(card: CardView, viergeReplayCard?: CardView): boolean {
  const targets = getEffectiveInteractionTargets(card, viergeReplayCard);
  return (
    targets === "single_opponent"
    || targets === "target_object"
    || card.cardId === "depouillement"
    || cardUsesRedArrowSelfTargeting(card)
  );
}

export function cardIsLiftPlayable(card: CardView, viergeReplayCard?: CardView): boolean {
  const targets = getEffectiveInteractionTargets(card, viergeReplayCard);
  const usesViergeReplayTargets = card.cardId === "vierge" && viergeReplayCard != null;
  return (
    card.categoryCode === "O"
    || targets === "self"
    || targets === "self_or_single_opponent"
    || targets === "all_opponents"
    || targets === "left_opponent"
    || targets === "none"
    || (!usesViergeReplayTargets && card.selectionMode === "confirm")
  );
}

export function canDiscardCard(match: MatchState, localSeatNumber: number): boolean {
  return (
    match.status === "in_progress"
    && match.game?.currentTurnSeatNumber === localSeatNumber
    && match.game.pendingAction == null
    && match.game.forcedFollowUp == null
    && match.game.pendingCurseRelease == null
  );
}

export function getResponseChoiceForCard(
  card: CardView | undefined
): Exclude<ResponseChoiceType, "pending" | "pass" | "resist"> | null {
  if (card == null) {
    return null;
  }

  switch (card.cardId) {
    case "annulation":
      return "annulation";
    case "ordre-demmerlaus":
      return "ordre-demmerlaus";
    case "resistance-accrue":
      return "resistance_accrue";
    case "miroir":
      return "mirror";
    default:
      return null;
  }
}

export function getLocalPendingResponder(
  match: MatchState,
  localSeatNumber: number
): PendingActionResponderState | undefined {
  return match.game?.pendingAction?.responders.find((responder) => responder.seatNumber === localSeatNumber);
}

export function canPassPendingResponse(match: MatchState): boolean {
  return (match.game?.pendingResponseOptions ?? []).some((option) => option.choice === "pass");
}

export function canDropIntoResponseSlot(
  match: MatchState,
  localSeatNumber: number,
  card: CardView | undefined
): boolean {
  const choice = getResponseChoiceForCard(card);
  if (choice == null || card?.canPlay !== true) {
    return false;
  }

  const localResponder = getLocalPendingResponder(match, localSeatNumber);
  if (match.game?.pendingAction == null || localResponder?.state !== "pending") {
    return false;
  }

  return (match.game.pendingResponseOptions ?? []).some((option) => option.choice === choice);
}

export function shouldHighlightOrdreDemmerlausResponse(
  match: MatchState,
  localSeatNumber: number,
  card: CardView | undefined
): boolean {
  if (card?.cardId !== "ordre-demmerlaus" || card.canPlay !== true) {
    return false;
  }

  const localResponder = getLocalPendingResponder(match, localSeatNumber);
  if (match.game?.pendingAction == null || localResponder?.state !== "pending") {
    return false;
  }

  const responseChoices = new Set((match.game.pendingResponseOptions ?? []).map((option) => option.choice));
  return responseChoices.has("ordre-demmerlaus") && !responseChoices.has("annulation");
}

export function getCollectiveAnnulationPrompt(
  match: MatchState,
  localSeatNumber: number,
  localHand: CardView[],
  draggedCard: CardView | undefined
): { maxCount: number; neededCount: number } | null {
  if (draggedCard?.cardId !== "annulation") {
    return null;
  }

  const pendingAction = match.game?.pendingAction;
  if (pendingAction == null || pendingAction.responseMode !== "collective") {
    return null;
  }

  const requiredCount = pendingAction.card.defenseBand?.annulationCardsRequired ?? 0;
  if (requiredCount < 2) {
    return null;
  }

  const localResponder = getLocalPendingResponder(match, localSeatNumber);
  if (localResponder?.state !== "pending") {
    return null;
  }

  const alreadyCommitted = pendingAction.responders.reduce((count, responder) => (
    responder.choice === "annulation"
      ? count + (responder.committedCardCount ?? responder.cards?.length ?? 0)
      : count
  ), 0);
  const neededCount = Math.max(0, requiredCount - alreadyCommitted);
  const availableCount = localHand.filter((card) => card.cardId === "annulation").length;
  if (neededCount < 2 || availableCount < 2) {
    return null;
  }

  return {
    maxCount: Math.min(availableCount, neededCount),
    neededCount
  };
}

export function isSeatTargetable(
  selectedCard: CardView | undefined,
  seat: SeatState,
  localSeatNumber: number,
  forcedTargetSeatNumber?: number,
  viergeReplayCard?: CardView,
  lapidationTargetSeatNumbers?: number[]
): boolean {
  if (selectedCard == null || seat.isAlive === false) {
    return false;
  }

  const targets = getEffectiveInteractionTargets(selectedCard, viergeReplayCard);
  const canTargetSelf = cardUsesRedArrowSelfTargeting(selectedCard);
  if (seat.seatNumber === localSeatNumber && !canTargetSelf) {
    return false;
  }

  if (forcedTargetSeatNumber != null && seat.seatNumber !== forcedTargetSeatNumber) {
    return false;
  }

  if (
    selectedCard.categoryCode === "AD"
    && lapidationTargetSeatNumbers != null
    && !lapidationTargetSeatNumbers.includes(seat.seatNumber)
  ) {
    return false;
  }

  if ((seat.objects ?? []).some((card) => card.cardId === "sanctuaire-demmerlaus")) {
    return false;
  }

  if ((seat.statuses ?? []).some((card) =>
    card.cardId === "potion-dinvincibilite"
    || card.cardId === "expulsion-temporaire"
    || card.cardId === "invisibilite"
  )) {
    return false;
  }

  if (selectedCard.cardId === "dissipation-dun-anneau" && !(seat.objects ?? []).some((card) => card.cardId.startsWith("anneau"))) {
    return false;
  }

  if (selectedCard.cardId === "la-main-qui-vole" && (seat.objects ?? []).length === 0) {
    return false;
  }

  return (
    targets === "single_opponent"
    || targets === "self_or_single_opponent"
    || targets === "single_player_or_object"
  );
}

export function canLoadMassAttackStaff(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number
): boolean {
  if (
    selectedCard == null
    || selectedCard.zone !== "hand"
    || objectCard.zone !== "object"
    || ownerSeatNumber !== localSeatNumber
  ) {
    return false;
  }

  if (objectCard.cardId === "baton-dattaque") {
    return selectedCard.categoryCode === "AD";
  }

  if (objectCard.cardId === "baton-dattaque-massive") {
    return selectedCard.categoryCode === "AM";
  }

  return false;
}

export function isObjectTargetable(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number,
  ownerObjects?: CardView[],
  viergeReplayCard?: CardView
): boolean {
  if (selectedCard == null) {
    return false;
  }

  const isOrdreDemmerlaus = selectedCard.cardId === "ordre-demmerlaus";

  if (
    !isOrdreDemmerlaus &&
    ownerSeatNumber !== localSeatNumber
    && ownerObjects != null
    && ownerObjects.some((card) => card.cardId === "sanctuaire-demmerlaus")
  ) {
    return false;
  }

  if (objectCard.zone === "status" && !isOrdreDemmerlaus) {
    return false;
  }

  const targets = getEffectiveInteractionTargets(selectedCard, viergeReplayCard);
  return canLoadMassAttackStaff(selectedCard, objectCard, ownerSeatNumber, localSeatNumber)
    || targets === "target_object"
    || targets === "single_player_or_object";
}

export function objectCardMatchesSelectedTargeting(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number,
  ownerObjects?: CardView[],
  viergeReplayCard?: CardView
): boolean {
  if (!isObjectTargetable(selectedCard, objectCard, ownerSeatNumber, localSeatNumber, ownerObjects, viergeReplayCard)) {
    return false;
  }

  if (selectedCard?.cardId === "ordre-demmerlaus") {
    return true;
  }

  if (objectCard.categoryCode !== "O") {
    return false;
  }

  if (canLoadMassAttackStaff(selectedCard, objectCard, ownerSeatNumber, localSeatNumber)) {
    return true;
  }

  if (selectedCard?.cardId === "dissipation-dun-anneau") {
    return objectCard.cardId.startsWith("anneau");
  }

  return true;
}
