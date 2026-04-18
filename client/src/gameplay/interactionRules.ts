import type { CardView, MatchState, PendingActionResponderState, ResponseChoiceType, SeatState } from "../../../shared/types";

function isAttackCard(card: CardView): boolean {
  return ["AD", "AM", "S", "E", "CO", "ST", "SO"].includes(card.categoryCode);
}

export function cardNeedsArrow(card: CardView): boolean {
  return card.targets === "single_opponent";
}

export function cardIsLiftPlayable(card: CardView): boolean {
  return (
    card.categoryCode === "O"
    || card.targets === "self"
    || card.targets === "self_or_single_opponent"
    || card.targets === "all_opponents"
    || card.targets === "left_opponent"
    || card.targets === "none"
    || card.selectionMode === "confirm"
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
  forcedTargetSeatNumber?: number
): boolean {
  if (selectedCard == null || seat.seatNumber === localSeatNumber || seat.isAlive === false) {
    return false;
  }

  if (forcedTargetSeatNumber != null && seat.seatNumber !== forcedTargetSeatNumber) {
    return false;
  }

  if ((seat.objects ?? []).some((card) => card.cardId === "sanctuaire-demmerlaus")) {
    return false;
  }

  if ((seat.statuses ?? []).some((card) => card.cardId === "potion-dinvincibilite")) {
    return false;
  }

  if (selectedCard.cardId === "dissipation-dun-anneau" && !(seat.objects ?? []).some((card) => card.cardId.startsWith("anneau"))) {
    return false;
  }

  if (selectedCard.cardId === "la-main-qui-vole" && (seat.objects ?? []).length === 0) {
    return false;
  }

  return (
    selectedCard.targets === "single_opponent"
    || selectedCard.targets === "self_or_single_opponent"
    || selectedCard.targets === "single_player_or_object"
  );
}

export function canLoadMassAttackStaff(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number
): boolean {
  return selectedCard != null
    && selectedCard.categoryCode === "AM"
    && ownerSeatNumber === localSeatNumber
    && objectCard.cardId === "baton-dattaque-massive";
}

export function isObjectTargetable(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number,
  ownerObjects?: CardView[]
): boolean {
  if (selectedCard == null) {
    return false;
  }

  if (
    ownerSeatNumber !== localSeatNumber
    && ownerObjects != null
    && ownerObjects.some((card) => card.cardId === "sanctuaire-demmerlaus")
  ) {
    return false;
  }

  return canLoadMassAttackStaff(selectedCard, objectCard, ownerSeatNumber, localSeatNumber)
    || selectedCard.targets === "target_object"
    || selectedCard.targets === "single_player_or_object";
}

export function objectCardMatchesSelectedTargeting(
  selectedCard: CardView | undefined,
  objectCard: CardView,
  ownerSeatNumber: number,
  localSeatNumber: number,
  ownerObjects?: CardView[]
): boolean {
  if (!isObjectTargetable(selectedCard, objectCard, ownerSeatNumber, localSeatNumber, ownerObjects) || objectCard.categoryCode !== "O") {
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
