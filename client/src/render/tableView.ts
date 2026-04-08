import { getLocalSeat, getOpponentSeats } from "../../../shared/seating";
import type { CardView, MatchState, PendingActionResponderState, SeatState } from "../../../shared/types";
import { baseCardDefinitions } from "../../../shared/cards";
import type { ArrowDragState, DragHoverTarget } from "../app/state";
import type { OpponentAnchor } from "./opponentLayout";
import { getOpponentAnchorsForPlayerCount } from "./opponentLayout";

// Track which hand cards have been seen so newly dealt cards can be animated in.
const _knownHandCardIds = new Set<string>();
const _dealAnimatingUntil = new Map<string, number>(); // instanceId → epoch ms when animation ends
const DEAL_ANIMATION_MS = 950; // slightly longer than the CSS duration
let _handInitialized = false;

interface TableViewParams {
  match: MatchState;
  localSeatNumber: number;
  displayedHpBySeat: Record<number, number>;
  presentationLockActive: boolean;
  activeActionVisual: {
    actorSeatNumber: number;
    targetSeatNumbers: number[];
    targetObjectInstanceId?: string;
    card: CardView;
    summary: string;
  } | null;
  centerResponseCards: CardView[];
  activeCardFlight: {
    card: CardView;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    width: number;
    height: number;
    settled: boolean;
    tone: "action" | "response";
  } | null;
  activeReturnCardFlight: {
    card: CardView;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    width: number;
    height: number;
    settled: boolean;
  } | null;
  draggingCardInstanceId: string;
  dragPointerX: number;
  dragPointerY: number;
  dragHoverTarget: DragHoverTarget | null;
  arrowDrag: ArrowDragState | null;
  inspectedSeatNumber: number;
  telepathyPreviewCardInstanceId: string;
  boardResetKeepPreviewCardInstanceId: string;
  sacrificeAmountInput: string;
  errorMessage: string;
  chatMarkup: string;
  eventLogMarkup: string;
  activeCombatFx: {
    message: string;
    tone: "info" | "success" | "failure";
    seatNumber?: number;
  } | null;
  activeDamageBursts: Record<number, number>;
  activeHealBursts: Record<number, number>;
  impactTargetSeatNumbers: number[];
  returningHandCardInstanceId: string;
  hiddenHandCardInstanceIds: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTooltip(card: CardView): string {
  return `${card.name}\n\n${card.description}`;
}

function renderDefenseTooltip(card: CardView): string {
  const defenseBand = card.defenseBand;
  if (defenseBand == null) {
    return "";
  }

  return `
    <div class="card-tooltip-defense">
      <span class="card-defense-pill card-defense-pill--${defenseBand.resistance.color}">
        Resist ${defenseBand.resistance.color === "red" ? "No" : `${Math.max(1, defenseBand.resistance.rollsRequired)}x`}
      </span>
      <span class="card-defense-pill ${defenseBand.resistanceAccrueAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        RA ${defenseBand.resistanceAccrueAllowed ? "Yes" : "No"}
      </span>
      <span class="card-defense-pill ${defenseBand.annulationAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        Cancel ${defenseBand.annulationAllowed ? `${Math.max(1, defenseBand.annulationCardsRequired)}x` : "No"}
      </span>
      <span class="card-defense-pill ${defenseBand.mirrorAllowed ? "card-defense-pill--allowed" : "card-defense-pill--blocked"}">
        Mirror ${defenseBand.mirrorAllowed ? "Yes" : "No"}
      </span>
    </div>
  `;
}

function renderCardTooltip(card: CardView): string {
  return `
    <div class="card-tooltip">
      <strong>${escapeHtml(card.name)}</strong>
      <p>${escapeHtml(card.description).replaceAll("\n", "<br />")}</p>
      ${renderDefenseTooltip(card)}
    </div>
  `;
}

function isAttackCard(card: CardView): boolean {
  return ["AD", "AM", "S", "E", "CO"].includes(card.categoryCode);
}

function isSeatTargetable(selectedCard: CardView | undefined, seat: SeatState, localSeatNumber: number, forcedTargetSeatNumber?: number): boolean {
  if (selectedCard == null || !selectedCard.canPlay || seat.seatNumber === localSeatNumber || seat.isAlive === false) {
    return false;
  }

  if (forcedTargetSeatNumber != null && seat.seatNumber !== forcedTargetSeatNumber) {
    return false;
  }

  if (isAttackCard(selectedCard) && (seat.objects ?? []).some((card) => card.cardId === "sanctuaire-demmerlaus")) {
    return false;
  }

  if (selectedCard.cardId === "dissipation-dun-anneau" && !(seat.objects ?? []).some((card) => card.cardId.startsWith("anneau"))) {
    return false;
  }

  if (selectedCard.cardId === "la-main-qui-vole" && (seat.objects ?? []).length === 0) {
    return false;
  }

  return selectedCard.targets === "single_opponent" || selectedCard.targets === "single_player_or_object";
}

function isObjectTargetable(selectedCard: CardView | undefined): boolean {
  if (selectedCard == null || !selectedCard.canPlay) {
    return false;
  }

  return selectedCard.targets === "target_object" || selectedCard.targets === "single_player_or_object";
}

function objectCardMatchesSelectedTargeting(selectedCard: CardView | undefined, objectCard: CardView): boolean {
  if (!isObjectTargetable(selectedCard) || objectCard.categoryCode !== "O") {
    return false;
  }

  if (selectedCard?.cardId === "dissipation-dun-anneau") {
    return objectCard.cardId.startsWith("anneau");
  }

  return true;
}

function responseLabel(choice: PendingActionResponderState["choice"]): string {
  switch (choice) {
    case "resist":
      return "Resist";
    case "annulation":
      return "Annulation";
    case "resistance_accrue":
      return "Resistance accrue";
    case "pass":
      return "Pass";
    case "mirror":
      return "Mirror";
    default:
      return "Waiting";
  }
}

function isPlaySlotCompatible(card: CardView | undefined): boolean {
  if (card == null || !card.canPlay || card.categoryCode === "CA") {
    return false;
  }

  return (
    card.categoryCode === "O" ||
    card.targets === "self" ||
    card.targets === "all_opponents" ||
    card.targets === "left_opponent" ||
    card.targets === "none" ||
    card.selectionMode === "confirm"
  );
}

function isHoverTarget(hoverTarget: DragHoverTarget | null, kind: DragHoverTarget["kind"], seatNumber?: number, objectInstanceId?: string): boolean {
  return hoverTarget?.kind === kind
    && (seatNumber == null || hoverTarget.seatNumber === seatNumber)
    && (objectInstanceId == null || hoverTarget.objectInstanceId === objectInstanceId);
}

function renderSeatCards(seat: SeatState, draggedCard: CardView | undefined, hoverTarget: DragHoverTarget | null): string {
  const objects = seat.objects ?? [];
  const statuses = seat.statuses ?? [];
  const objectTargetable = isObjectTargetable(draggedCard);

  return `
    <div class="seat-card-strip">
      ${objects.map((card) => `
        <button
          class="seat-object-card ${objectCardMatchesSelectedTargeting(draggedCard, card) ? "seat-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card) ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="seat-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card)}
        </button>
      `).join("")}
      ${statuses.map((card) => `
        <div class="seat-status-card">
          <div class="seat-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeatInlineObjects(seat: SeatState, draggedCard: CardView | undefined, hoverTarget: DragHoverTarget | null): string {
  const objects = seat.objects ?? [];
  if (objects.length === 0) {
    return "";
  }

  const objectTargetable = isObjectTargetable(draggedCard);

  return `
    <div class="seat-inline-objects">
      ${objects.map((card) => `
        <button
          class="seat-inline-object ${objectCardMatchesSelectedTargeting(draggedCard, card) ? "seat-inline-object--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-inline-object--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card) ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="seat-inline-object__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderOpponentSeat(
  seat: SeatState,
  displayedHp: number,
  anchor: OpponentAnchor,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  localSeatNumber: number,
  localIsHost: boolean,
  inspectedSeatNumber: number,
  currentTurnSeatNumber?: number,
  pendingResponder?: PendingActionResponderState,
  damageBurstAmount?: number,
  impactActive?: boolean,
  healBurstActive?: boolean,
  forcedTargetSeatNumber?: number
): string {
  const targetable = isSeatTargetable(draggedCard, seat, localSeatNumber, forcedTargetSeatNumber);
  const inspectable = draggedCard == null && seat.controllerType === "human";
  const showKickButton = localIsHost && inspectedSeatNumber === seat.seatNumber && seat.controllerType === "human" && !seat.isHost;
  const currentTurn = currentTurnSeatNumber === seat.seatNumber;
  const hpBarPercent = Math.max(0, Math.min(100, (displayedHp / 50) * 100));
  return `
    <article
      class="table-seat ${targetable ? "table-seat--targetable" : ""} ${currentTurn ? "table-seat--current-turn" : ""} ${impactActive ? "table-seat--impact" : ""} ${isHoverTarget(hoverTarget, "seat", seat.seatNumber) ? "table-seat--hovered" : ""} ${healBurstActive ? "table-seat--heal-active" : ""}"
      style="left:${anchor.x}%; top:${anchor.y}%;"
      data-seat-area="true"
      data-seat-number="${seat.seatNumber}"
      ${targetable ? `data-drop-target="seat" data-seat-number="${seat.seatNumber}"` : ""}
    >
      <div class="seat-health-row">
        <div class="seat-health-bar">
          <span style="width:${hpBarPercent}%"></span>
        </div>
        <span class="seat-health-numbers">${displayedHp}</span>
    </div>
    <img class="seat-avatar seat-avatar--table" src="${seat.avatarUrl}" alt="${escapeHtml(seat.displayName)}" />
      <div class="seat-details-row">
        <div class="seat-meta">
          <strong>${escapeHtml(seat.displayName)}</strong>
          <span>Power ${seat.powerLevel ?? 1}</span>
          ${currentTurnSeatNumber === seat.seatNumber ? `<span class="seat-turn-indicator">Current turn</span>` : ""}
          ${pendingResponder != null ? `<span class="seat-response-chip seat-response-chip--${pendingResponder.choice}">${responseLabel(pendingResponder.choice)}</span>` : ""}
        </div>
        ${renderSeatInlineObjects(seat, draggedCard, hoverTarget)}
      </div>
      ${damageBurstAmount != null ? `<div class="seat-damage-burst">-${damageBurstAmount}</div>` : ""}
      ${healBurstActive ? renderHealBurst() : ""}
      ${renderSeatCards({ ...seat, objects: [] }, draggedCard, hoverTarget)}
      ${inspectable ? `<button class="action-button action-button--secondary seat-inspect-button" data-action="inspect-seat" data-seat-number="${seat.seatNumber}">${inspectedSeatNumber === seat.seatNumber ? "Close" : "Player"}</button>` : ""}
      ${showKickButton ? `<button class="action-button action-button--danger seat-kick-button" data-action="kick-seat" data-seat-number="${seat.seatNumber}">Kick Player</button>` : ""}
    </article>
  `;
}

function renderHandCards(
  hand: CardView[],
  draggingCardInstanceId: string,
  arrowDragCardInstanceId: string,
  returningHandCardInstanceId: string,
  hiddenHandCardInstanceIds: string[],
  pendingActionActive: boolean,
  isLocalTurn: boolean
): string {
  const total = hand.length;
  const FAN_RADIUS = 700;
  const FAN_SPREAD_DEG = total <= 1 ? 0 : Math.min(34, 8 + (total - 2) * 4);
  const CUT_OFF_PX = 80; // hides the defense band at card bottom

  // Detect newly dealt cards and keep the animation class alive for the full duration,
  // even if the component re-renders multiple times before the animation finishes.
  const now = Date.now();
  const currentIds = new Set(hand.map(c => c.instanceId));

  if (_handInitialized) {
    for (const card of hand) {
      if (!_knownHandCardIds.has(card.instanceId)) {
        _dealAnimatingUntil.set(card.instanceId, now + DEAL_ANIMATION_MS);
      }
    }
  }
  _handInitialized = true;

  for (const id of [..._knownHandCardIds]) { if (!currentIds.has(id)) _knownHandCardIds.delete(id); }
  for (const id of currentIds) _knownHandCardIds.add(id);
  for (const [id, until] of [..._dealAnimatingUntil]) {
    if (now > until || !currentIds.has(id)) _dealAnimatingUntil.delete(id);
  }

  return hand.map((card, i) => {
    // Ghost effect only for normal drag, not for arrow-drag (arrow is the visual indicator)
    const selected = card.instanceId === draggingCardInstanceId && arrowDragCardInstanceId === "";
    // Keep the arrow-source card in its zoomed hover state while aiming
    const arrowActive = card.instanceId === arrowDragCardInstanceId;
    // During a pending action only response cards (canPlay) are draggable.
    // On your own turn, ALL cards can be dragged so reaction-only cards (e.g.
    // annulation, resistance-accrue) can at least be discarded.
    const disableSelection = pendingActionActive ? !card.canPlay : !isLocalTurn;
    const responsePlayable = pendingActionActive && card.canPlay;
    const returning = card.instanceId === returningHandCardInstanceId;
    const overlayHidden = hiddenHandCardInstanceIds.includes(card.instanceId);

    // Fan geometry: cards arc along a large imaginary circle below the hand panel
    const angleRad = total <= 1 ? 0 : (-FAN_SPREAD_DEG / 2 + (i / (total - 1)) * FAN_SPREAD_DEG) * (Math.PI / 180);
    const fanX = Math.sin(angleRad) * FAN_RADIUS;
    const fanY = (1 - Math.cos(angleRad)) * FAN_RADIUS + CUT_OFF_PX;
    const fanRotate = angleRad * 180 / Math.PI;
    // Rightmost card (dealt last) sits on top
    const fanZ = i + 1;
    const animUntil = _dealAnimatingUntil.get(card.instanceId);
    const isNew = animUntil !== undefined;
    // Negative delay resumes the animation at the correct point on re-renders,
    // preventing the animation from restarting from scratch each time.
    const dealElapsed = isNew ? Math.min(now - (animUntil! - DEAL_ANIMATION_MS), DEAL_ANIMATION_MS) : 0;

    return `
      <article
        class="hand-card ${isNew ? "hand-card--new" : ""} ${card.canPlay ? "hand-card--playable" : ""} ${selected ? "hand-card--selected" : ""} ${arrowActive ? "hand-card--arrow-active" : ""} ${responsePlayable ? "hand-card--response-playable" : ""} ${returning ? "hand-card--returning-target" : ""} ${overlayHidden ? "hand-card--overlay-hidden" : ""}"
        style="--fan-x:${fanX.toFixed(1)}px;--fan-y:${fanY.toFixed(1)}px;--fan-rotate:${fanRotate.toFixed(2)}deg;--fan-z:${fanZ};${isNew ? `--deal-elapsed:${dealElapsed.toFixed(0)}ms;` : ""}"
        data-card-instance-id="${card.instanceId}"
        data-base-fan-x="${fanX.toFixed(1)}"
      >
        <button
          class="hand-card-button"
          ${disableSelection ? "" : `data-action="drag-card" data-card-instance-id="${card.instanceId}"`}
          ${disableSelection ? "disabled" : ""}
        >
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          ${renderCardTooltip(card)}
        </button>
      </article>
    `;
  }).join("");
}

function renderLocalObjects(objects: CardView[], draggedCard: CardView | undefined, hoverTarget: DragHoverTarget | null, localSeatNumber: number, stripClass: string): string {
  if (objects.length === 0) {
    return "";
  }

  const objectTargetable = isObjectTargetable(draggedCard);

  return `
    <div class="${stripClass}">
      ${objects.map((card) => `
        <article
          class="local-object-card ${objectCardMatchesSelectedTargeting(draggedCard, card) ? "local-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", localSeatNumber, card.instanceId) ? "local-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card) ? `data-drop-target="object" data-seat-number="${localSeatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="local-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderLocalStatuses(statuses: CardView[], stripClass: string): string {
  if (statuses.length === 0) {
    return "";
  }

  return `
    <div class="${stripClass}">
      ${statuses.map((card) => `
        <article class="local-object-card local-object-card--status">
          <div class="local-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderCenterPlayArea(
  match: MatchState,
  localSeatNumber: number,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  activeCombatFx: TableViewParams["activeCombatFx"],
  impactActive: boolean,
  presentationLockActive: boolean,
  activeActionVisual: TableViewParams["activeActionVisual"],
  centerResponseCards: TableViewParams["centerResponseCards"]
): string {
  const pendingAction = presentationLockActive ? undefined : match.game?.pendingAction;
  const forcedFollowUp = presentationLockActive ? undefined : match.game?.forcedFollowUp;
  const displayedAction = activeActionVisual ?? pendingAction;
  const activeResponseCards = centerResponseCards.length > 0
    ? centerResponseCards
    : (pendingAction?.responders
        .flatMap((responder) => responder.cards ?? (responder.card != null ? [responder.card] : []))
        .filter((card) => card.cardId === "annulation" || card.cardId === "resistance-accrue" || card.cardId === "miroir")
      ?? []);

  // When CA response cards exist alongside the attack card, split into two visible slots:
  // left = CA response cards, right = attack card (so neither hides the other).
  // When no CA cards are present, use the single stacked slot as before.
  const splitView = displayedAction != null && activeResponseCards.length > 0;

  // Single-slot stacked cards (used when not splitting)
  const attackUnderCards = ((displayedAction != null && match.game?.lastPlayedCard?.card.instanceId !== displayedAction.card.instanceId)
    ? [match.game?.lastPlayedCard?.card]
    : displayedAction == null
      ? [match.game?.lastPlayedCard?.card]
      : []
  ).flatMap((card) => card == null ? [] : [card]);
  const singleStackCards = [
    ...attackUnderCards,
    ...(displayedAction != null ? [displayedAction.card] : []),
    ...(!splitView ? activeResponseCards : [])
  ].slice(-4);

  const playSlotCompatible = isPlaySlotCompatible(draggedCard);
  const responseSlotCompatible = displayedAction != null && draggedCard?.categoryCode === "CA" && draggedCard.canPlay;
  const isDropReady = responseSlotCompatible && isHoverTarget(hoverTarget, "response-slot");
  // Show a Pass button only when the player is the current responder and has CA cards to choose from
  // (auto-pass fires when they have no CA cards; this lets them deliberately pass despite having options)
  const options = presentationLockActive ? [] : match.game?.pendingResponseOptions ?? [];
  const showPassButton = options.some((option) => option.choice === "pass");
  const localSeat = getLocalSeat(match, localSeatNumber);
  const localForcedCards = localSeat?.hand?.filter((card) =>
    card.canPlay && forcedFollowUp?.allowedCategories.includes(card.categoryCode)
  ) ?? [];
  const showForcedPassButton =
    forcedFollowUp?.actorSeatNumber === localSeatNumber &&
    localForcedCards.length === 0;
  const pendingCurseRelease = presentationLockActive ? undefined : match.game?.pendingCurseRelease;
  const showCurseReleaseOptions = pendingCurseRelease?.seatNumber === localSeatNumber;
  const forcedPrompt = forcedFollowUp == null
    ? ""
    : `${getLocalSeat(match, forcedFollowUp.actorSeatNumber)?.displayName ?? `Seat ${forcedFollowUp.actorSeatNumber}`} must play ${forcedFollowUp.allowedCategories.join("/")} on ${getLocalSeat(match, forcedFollowUp.targetSeatNumber)?.displayName ?? `Seat ${forcedFollowUp.targetSeatNumber}`} for ${forcedFollowUp.sourceCardName}.`;
  const cursePrompt = pendingCurseRelease == null
    ? ""
    : `${getLocalSeat(match, pendingCurseRelease.seatNumber)?.displayName ?? `Seat ${pendingCurseRelease.seatNumber}`} may discard ${pendingCurseRelease.releaseCardCount} ${pendingCurseRelease.releaseCardName} to remove ${pendingCurseRelease.cardName}.`;

  const isShowingLastPlayed = singleStackCards.length > 0 && displayedAction == null;

  // Attack slot classes (shared between split and single layouts)
  const attackSlotClass = [
    "center-play-slot",
    singleStackCards.length > 0 || splitView ? "center-play-slot--filled" : "",
    impactActive ? "center-play-slot--impact" : "",
    (playSlotCompatible || responseSlotCompatible) ? "center-play-slot--targetable" : "",
    (isHoverTarget(hoverTarget, "play-slot") || isHoverTarget(hoverTarget, "response-slot")) ? "center-play-slot--hovered" : "",
    isDropReady ? "center-play-slot--drop-ready" : ""
  ].filter(Boolean).join(" ");

  const renderSingleCard = (card: CardView, isTop: boolean, offset: number, lift: number) => `
    <div class="center-card-stack__card center-card-stack__card--${isTop ? "top" : "under"}" style="--stack-offset:${offset}px; --stack-lift:${lift}px;">
      <div class="center-card-stack__art">
        <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
      </div>
      ${renderCardTooltip(card)}
    </div>
  `;

  return `
    <section class="center-play-area">
      <div class="combat-fx-banner ${activeCombatFx != null ? `combat-fx-banner--${activeCombatFx.tone}` : "combat-fx-banner--idle"}">${activeCombatFx != null ? escapeHtml(activeCombatFx.message) : "\u00a0"}</div>
      ${forcedPrompt !== "" ? `<div class="forced-follow-up-banner">${escapeHtml(forcedPrompt)}</div>` : ""}
      ${cursePrompt !== "" ? `<div class="forced-follow-up-banner">${escapeHtml(cursePrompt)}</div>` : ""}
      <div class="center-play-slots${splitView ? " center-play-slots--split" : ""}">
        ${splitView ? `
          <article class="center-play-slot center-play-slot--filled center-play-slot--response-cards">
            <div class="center-card-stack">
              ${activeResponseCards.map((card, i) => renderSingleCard(card, i === activeResponseCards.length - 1, i * 4, i * 4)).join("")}
            </div>
          </article>
        ` : ""}
        <article
          class="${attackSlotClass}"
          data-center-card-stack="true"
          ${displayedAction != null ? `data-pending-card-center="true"` : ""}
          ${(responseSlotCompatible || playSlotCompatible) ? `data-drop-target="${responseSlotCompatible ? "response-slot" : "play-slot"}"` : ""}
        >
          ${splitView
            ? `
              <div class="center-card-stack">
                ${attackUnderCards.map((card, i) => renderSingleCard(card, false, i * 8, i * 4)).join("")}
                ${renderSingleCard(displayedAction!.card, attackUnderCards.length === 0, attackUnderCards.length * 8, attackUnderCards.length * 4)}
              </div>
            `
            : singleStackCards.length > 0
              ? `
                <div class="center-card-stack">
                  ${singleStackCards.map((card, index) => renderSingleCard(card, index === singleStackCards.length - 1, index * 8, index * 4)).join("")}
                </div>
              `
              : `<div class="center-play-slot-placeholder"></div>`}
        </article>
      </div>
      ${showPassButton ? `
        <div class="center-play-options">
          <button type="button" class="action-button action-button--secondary" data-action="respond-pending" data-choice="pass">Pass</button>
        </div>
      ` : ""}
      ${showForcedPassButton ? `
        <div class="center-play-options">
          <button type="button" class="action-button action-button--secondary" data-action="pass-forced-follow-up">Pass</button>
        </div>
      ` : ""}
      ${showCurseReleaseOptions ? `
        <div class="center-play-options">
          <button type="button" class="action-button action-button--secondary" data-action="resolve-curse-release" data-choice="accept">Accept</button>
          <button type="button" class="action-button action-button--secondary" data-action="resolve-curse-release" data-choice="pass">Pass</button>
        </div>
      ` : ""}
    </section>
  `;
}

function renderDragPreview(card: CardView | undefined, x: number, y: number): string {
  if (card == null) {
    return "";
  }

  return `
    <div class="drag-card-preview" data-drag-card-preview style="left:${x}px; top:${y}px;">
      <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
    </div>
  `;
}

function renderReturnCardFlight(
  returnFlight: TableViewParams["activeReturnCardFlight"]
): string {
  if (returnFlight == null) {
    return "";
  }

  return `
    <div
      class="drag-return-flight ${returnFlight.settled ? "drag-return-flight--settled" : ""}"
      style="left:${returnFlight.fromX}px; top:${returnFlight.fromY}px; width:${returnFlight.width}px; height:${returnFlight.height}px; --drag-return-dx:${returnFlight.toX - returnFlight.fromX}px; --drag-return-dy:${returnFlight.toY - returnFlight.fromY}px;"
      aria-hidden="true"
    >
      <img src="${returnFlight.card.imageUrl}" alt="${escapeHtml(returnFlight.card.name)}" />
    </div>
  `;
}

const HEAL_PARTICLES = [
  // big/slow/near (foreground)
  { x: "10%",  delay: "0ms",   size: "1.5em",  dist: "44px",  dur: "1700ms" },
  { x: "42%",  delay: "120ms", size: "1.4em",  dist: "50px",  dur: "1650ms" },
  { x: "74%",  delay: "55ms",  size: "1.3em",  dist: "46px",  dur: "1750ms" },
  { x: "26%",  delay: "280ms", size: "1.45em", dist: "42px",  dur: "1800ms" },
  { x: "60%",  delay: "190ms", size: "1.35em", dist: "48px",  dur: "1600ms" },
  // mid
  { x: "18%",  delay: "80ms",  size: "1.0em",  dist: "65px",  dur: "1350ms" },
  { x: "50%",  delay: "210ms", size: "0.95em", dist: "70px",  dur: "1300ms" },
  { x: "82%",  delay: "340ms", size: "1.05em", dist: "62px",  dur: "1400ms" },
  { x: "34%",  delay: "150ms", size: "0.9em",  dist: "68px",  dur: "1250ms" },
  { x: "66%",  delay: "30ms",  size: "1.1em",  dist: "60px",  dur: "1450ms" },
  // small/fast/far (background)
  { x: "6%",   delay: "250ms", size: "0.65em", dist: "95px",  dur: "950ms"  },
  { x: "30%",  delay: "370ms", size: "0.6em",  dist: "105px", dur: "900ms"  },
  { x: "55%",  delay: "100ms", size: "0.7em",  dist: "90px",  dur: "1000ms" },
  { x: "78%",  delay: "430ms", size: "0.62em", dist: "100px", dur: "920ms"  },
  { x: "46%",  delay: "310ms", size: "0.68em", dist: "98px",  dur: "970ms"  },
  { x: "88%",  delay: "160ms", size: "0.72em", dist: "88px",  dur: "1050ms" },
];

const HEAL_PARTICLES_LOCAL = [
  // foreground
  { x: "3%",  delay: "0ms",   size: "1.5em",  dist: "44px",  dur: "1700ms" },
  { x: "11%", delay: "140ms", size: "1.4em",  dist: "50px",  dur: "1650ms" },
  { x: "19%", delay: "55ms",  size: "1.3em",  dist: "46px",  dur: "1750ms" },
  { x: "27%", delay: "280ms", size: "1.45em", dist: "42px",  dur: "1800ms" },
  { x: "35%", delay: "190ms", size: "1.35em", dist: "48px",  dur: "1600ms" },
  { x: "43%", delay: "70ms",  size: "1.5em",  dist: "44px",  dur: "1720ms" },
  { x: "51%", delay: "220ms", size: "1.4em",  dist: "52px",  dur: "1680ms" },
  { x: "59%", delay: "330ms", size: "1.3em",  dist: "45px",  dur: "1760ms" },
  { x: "67%", delay: "40ms",  size: "1.45em", dist: "43px",  dur: "1810ms" },
  { x: "75%", delay: "170ms", size: "1.35em", dist: "49px",  dur: "1630ms" },
  { x: "83%", delay: "260ms", size: "1.4em",  dist: "47px",  dur: "1700ms" },
  { x: "91%", delay: "100ms", size: "1.3em",  dist: "51px",  dur: "1670ms" },
  // mid
  { x: "6%",  delay: "310ms", size: "1.0em",  dist: "65px",  dur: "1350ms" },
  { x: "14%", delay: "80ms",  size: "0.95em", dist: "70px",  dur: "1300ms" },
  { x: "22%", delay: "380ms", size: "1.05em", dist: "62px",  dur: "1400ms" },
  { x: "30%", delay: "150ms", size: "0.9em",  dist: "68px",  dur: "1250ms" },
  { x: "38%", delay: "480ms", size: "1.1em",  dist: "60px",  dur: "1450ms" },
  { x: "46%", delay: "30ms",  size: "1.0em",  dist: "66px",  dur: "1380ms" },
  { x: "54%", delay: "270ms", size: "0.95em", dist: "72px",  dur: "1310ms" },
  { x: "62%", delay: "420ms", size: "1.05em", dist: "63px",  dur: "1420ms" },
  { x: "70%", delay: "110ms", size: "0.9em",  dist: "69px",  dur: "1270ms" },
  { x: "78%", delay: "350ms", size: "1.1em",  dist: "61px",  dur: "1460ms" },
  { x: "86%", delay: "200ms", size: "1.0em",  dist: "67px",  dur: "1360ms" },
  { x: "94%", delay: "460ms", size: "0.95em", dist: "71px",  dur: "1320ms" },
  // background
  { x: "2%",  delay: "230ms", size: "0.65em", dist: "95px",  dur: "950ms"  },
  { x: "9%",  delay: "400ms", size: "0.6em",  dist: "105px", dur: "900ms"  },
  { x: "17%", delay: "120ms", size: "0.7em",  dist: "90px",  dur: "1000ms" },
  { x: "25%", delay: "490ms", size: "0.62em", dist: "100px", dur: "920ms"  },
  { x: "33%", delay: "60ms",  size: "0.68em", dist: "98px",  dur: "970ms"  },
  { x: "41%", delay: "340ms", size: "0.72em", dist: "88px",  dur: "1050ms" },
  { x: "49%", delay: "180ms", size: "0.65em", dist: "96px",  dur: "940ms"  },
  { x: "57%", delay: "440ms", size: "0.6em",  dist: "106px", dur: "890ms"  },
  { x: "65%", delay: "90ms",  size: "0.7em",  dist: "91px",  dur: "1010ms" },
  { x: "73%", delay: "370ms", size: "0.62em", dist: "101px", dur: "930ms"  },
  { x: "81%", delay: "250ms", size: "0.68em", dist: "99px",  dur: "960ms"  },
  { x: "89%", delay: "520ms", size: "0.72em", dist: "89px",  dur: "1040ms" },
  { x: "97%", delay: "130ms", size: "0.65em", dist: "97px",  dur: "945ms"  },
];

function renderHealBurst(large = false): string {
  const particles = large ? HEAL_PARTICLES_LOCAL : HEAL_PARTICLES;
  return `
    <div class="seat-heal-burst" aria-hidden="true">
      ${particles.map(({ x, delay, size, dist, dur }) =>
        `<span class="heal-particle" style="--hx:${x};--hdelay:${delay};--hsize:${size};--hdist:${dist};--hdur:${dur}">+</span>`
      ).join("")}
    </div>
  `;
}

const DEV_CARD_OPTIONS = [...baseCardDefinitions]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((card) => {
    const devLabel = card.id === "annulation"
      ? `${card.name} / Cancel`
      : card.name;
    return `<option value="${escapeHtml(card.id)}">[${card.category.code}] ${escapeHtml(devLabel)}</option>`;
  })
  .join("");

function renderDevDrawPanel(): string {
  return `
    <div class="dev-draw-panel">
      <select class="dev-draw-select" data-action="dev-draw-card" title="Dev: draw card into hand">
        <option value="">+ Draw card</option>
        ${DEV_CARD_OPTIONS}
      </select>
    </div>
  `;
}

function renderPendingObjectChoice(match: MatchState, localSeatNumber: number): string {
  const choice = match.game?.pendingObjectChoice;
  if (choice == null) {
    return "";
  }

  const ownerName = match.seats.find((seat) => seat.seatNumber === choice.ownerSeatNumber)?.displayName ?? `Seat ${choice.ownerSeatNumber}`;
  const chooserName = match.seats.find((seat) => seat.seatNumber === choice.chooserSeatNumber)?.displayName ?? `Seat ${choice.chooserSeatNumber}`;
  const isLocalChooser = choice.chooserSeatNumber === localSeatNumber;

  return `
    <section class="object-choice-overlay">
      <article class="object-choice-panel">
        <p class="eyebrow">${escapeHtml(choice.cardName)}</p>
        <h2>${isLocalChooser ? "Choose an object to remove" : `${escapeHtml(chooserName)} is choosing an object`}</h2>
        <p>${isLocalChooser ? escapeHtml(choice.prompt) : `Waiting for ${escapeHtml(chooserName)} to choose one of ${escapeHtml(ownerName)}'s objects.`}</p>
        <div class="object-choice-grid">
          ${choice.objectOptions.map((card) => `
            <button
              type="button"
              class="object-choice-card"
              data-action="select-pending-object"
              data-object-instance-id="${card.instanceId}"
              ${isLocalChooser ? "" : "disabled"}
            >
              <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
              <span>${escapeHtml(card.name)}</span>
            </button>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderTelepathyInspectionModal(
  match: MatchState,
  localSeatNumber: number,
  telepathyPreviewCardInstanceId: string
): string {
  const pendingInspection = match.game?.pendingHandInspection;
  if (pendingInspection == null) {
    return "";
  }

  const viewerSeat = match.seats.find((seat) => seat.seatNumber === pendingInspection.viewerSeatNumber);
  const targetSeat = match.seats.find((seat) => seat.seatNumber === pendingInspection.targetSeatNumber);
  if (viewerSeat == null || targetSeat == null) {
    return "";
  }

  const isLocalViewer = pendingInspection.viewerSeatNumber === localSeatNumber;
  const revealedHand = isLocalViewer ? (targetSeat.hand ?? []) : [];
  const previewCard = !isLocalViewer
    ? undefined
    : revealedHand.find((card) => card.instanceId === telepathyPreviewCardInstanceId) ?? revealedHand[0];
  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingInspection.cardName)}</p>
            <h2>${isLocalViewer ? `${escapeHtml(targetSeat.displayName)}'s hand` : "Telepathie in progress"}</h2>
            <p>${isLocalViewer ? "Review the revealed hand, then close this window to continue the game." : `Waiting for ${escapeHtml(viewerSeat.displayName)} to finish viewing ${escapeHtml(targetSeat.displayName)}'s hand.`}</p>
          </div>
          ${isLocalViewer ? `<button type="button" class="action-button action-button--secondary" data-action="dismiss-telepathy">Close</button>` : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalViewer
            ? `<p class="telepathy-empty">No other actions can continue until the viewer closes this window.</p>`
            : revealedHand.length === 0
            ? `<p class="telepathy-empty">This player has no cards in hand.</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard)}
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
                    <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
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
    </section>
  `;
}

function renderBoardResetKeepModal(
  match: MatchState,
  localSeatNumber: number,
  boardResetKeepPreviewCardInstanceId: string
): string {
  const pendingKeep = match.game?.pendingBoardResetKeep;
  if (pendingKeep == null) {
    return "";
  }

  const chooserSeat = match.seats.find((seat) => seat.seatNumber === pendingKeep.chooserSeatNumber);
  if (chooserSeat == null) {
    return "";
  }

  const isLocalChooser = pendingKeep.chooserSeatNumber === localSeatNumber;
  const keepableCards = isLocalChooser ? pendingKeep.cardOptions : [];
  const previewCard = !isLocalChooser
    ? undefined
    : keepableCards.find((card) => card.instanceId === boardResetKeepPreviewCardInstanceId) ?? keepableCards[0];

  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingKeep.cardName)}</p>
            <h2>${isLocalChooser ? `Choose ${pendingKeep.keepCardCount} Card${pendingKeep.keepCardCount === 1 ? "" : "s"} To Keep` : "Intervention divine in progress"}</h2>
            <p>${isLocalChooser ? `Select the ${pendingKeep.keepCardCount === 1 ? "one card" : `${pendingKeep.keepCardCount} cards`} that stay${pendingKeep.keepCardCount === 1 ? "s" : ""} in your hand before the rest of the board is cleared and reshuffled.` : `Waiting for ${escapeHtml(chooserSeat.displayName)} to choose which card to keep.`}</p>
          </div>
          ${isLocalChooser ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-board-reset-keep" ${previewCard == null ? "disabled" : ""}>Keep This Card</button>` : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalChooser
            ? `<p class="telepathy-empty">No other actions can continue until the keeper card is chosen.</p>`
            : keepableCards.length === 0
            ? `<p class="telepathy-empty">There are no cards left in hand to keep.</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard)}
                  </div>
                `}
              </div>
              <div class="telepathy-list">
                ${keepableCards.map((card) => `
                  <button
                    type="button"
                    class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""}"
                    data-action="preview-board-reset-card"
                    data-card-instance-id="${card.instanceId}"
                  >
                    <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
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
    </section>
  `;
}

function renderPendingSacrificeChoiceModal(
  match: MatchState,
  localSeatNumber: number,
  sacrificeAmountInput: string
): string {
  const pendingSacrificeChoice = match.game?.pendingSacrificeChoice;
  if (pendingSacrificeChoice == null) {
    return "";
  }

  const actorSeat = match.seats.find((seat) => seat.seatNumber === pendingSacrificeChoice.actorSeatNumber);
  if (actorSeat == null) {
    return "";
  }

  const isLocalActor = pendingSacrificeChoice.actorSeatNumber === localSeatNumber;
  const parsedAmount = Number(sacrificeAmountInput);
  const isValidAmount =
    Number.isInteger(parsedAmount)
    && parsedAmount >= 0
    && parsedAmount <= pendingSacrificeChoice.maxAmount;

  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel telepathy-panel--compact">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingSacrificeChoice.cardName)}</p>
            <h2>${isLocalActor ? "Choose Sacrifice Amount" : "Sacrifice in progress"}</h2>
            <p>${isLocalActor ? `Enter how many HP to sacrifice. Choose a whole number from 0 to ${pendingSacrificeChoice.maxAmount}.` : `Waiting for ${escapeHtml(actorSeat.displayName)} to choose how many HP to sacrifice.`}</p>
          </div>
        </div>
        ${!isLocalActor
          ? `<p class="telepathy-empty">No other actions can continue until the sacrifice amount is chosen.</p>`
          : `
            <div class="sacrifice-choice-form">
              <label class="sacrifice-choice-form__label" for="sacrifice-amount-input">HP to sacrifice</label>
              <input
                id="sacrifice-amount-input"
                class="sacrifice-choice-form__input"
                data-action="edit-sacrifice-amount"
                type="number"
                min="0"
                max="${pendingSacrificeChoice.maxAmount}"
                step="1"
                inputmode="numeric"
                value="${escapeHtml(sacrificeAmountInput)}"
              />
              <p class="sacrifice-choice-form__hint">Maximum: ${pendingSacrificeChoice.maxAmount} HP. You may reduce yourself to 0.</p>
              <button
                type="button"
                class="action-button action-button--secondary"
                data-action="confirm-sacrifice-amount"
                ${isValidAmount ? "" : "disabled"}
              >
                Confirm
              </button>
            </div>
          `}
      </article>
    </section>
  `;
}

export function renderTableView({
  match,
  localSeatNumber,
  displayedHpBySeat,
  presentationLockActive,
  activeActionVisual,
  centerResponseCards,
  activeCardFlight,
  activeReturnCardFlight,
  draggingCardInstanceId,
  dragPointerX,
  dragPointerY,
  dragHoverTarget,
  arrowDrag,
  inspectedSeatNumber,
  telepathyPreviewCardInstanceId,
  boardResetKeepPreviewCardInstanceId,
  sacrificeAmountInput,
  errorMessage,
  chatMarkup,
  eventLogMarkup,
  activeCombatFx,
  activeDamageBursts,
  activeHealBursts,
  impactTargetSeatNumbers,
  returningHandCardInstanceId,
  hiddenHandCardInstanceIds
}: TableViewParams): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const localIsHost = localSeat?.isHost === true;
  const visibleCurrentTurnSeatNumber = presentationLockActive ? undefined : match.game?.currentTurnSeatNumber;
  const isLocalTurn = visibleCurrentTurnSeatNumber === localSeat?.seatNumber;
  const opponents = getOpponentSeats(match, localSeatNumber);
  const anchors = getOpponentAnchorsForPlayerCount(match.seats.length);
  // The "active" dragging card: either the arrow-drag card (shown as ghost) or a normal drag
  const effectiveDraggingId = arrowDrag?.cardInstanceId ?? draggingCardInstanceId;
  // draggedCard drives seat targetability and drag preview; use effectiveDraggingId so arrow-drag cards
  // also highlight valid target seats. For normal drag, the preview card follows the cursor.
  const draggedCard = localSeat?.hand?.find((card) => card.instanceId === effectiveDraggingId);
  const normalDragPreviewCard = arrowDrag == null
    ? draggedCard
    : undefined; // no drag preview when arrow is active
  const pendingAction = presentationLockActive ? undefined : match.game?.pendingAction;
  const forcedFollowUp = presentationLockActive ? undefined : match.game?.forcedFollowUp;
  const pendingCurseRelease = presentationLockActive ? undefined : match.game?.pendingCurseRelease;
  const localPlayableCardCount = localSeat?.hand?.filter((card) => card.canPlay).length ?? 0;
  const showNoPlayableDiscardPrompt =
    isLocalTurn
    && pendingAction == null
    && forcedFollowUp == null
    && pendingCurseRelease == null
    && (localSeat?.hand?.length ?? 0) > 0
    && localPlayableCardCount === 0;
  const localDisplayedHp = localSeat == null ? 0 : displayedHpBySeat[localSeat.seatNumber] ?? localSeat.hp ?? 0;
  const seatMarkup = anchors.map((anchor, index) => {
    const seat = opponents[index];
    if (seat == null) {
      return "";
    }

    return renderOpponentSeat(
      seat,
      displayedHpBySeat[seat.seatNumber] ?? seat.hp ?? 0,
      anchor,
      draggedCard,
      dragHoverTarget,
      localSeatNumber,
      localIsHost,
      inspectedSeatNumber,
      visibleCurrentTurnSeatNumber,
      pendingAction?.responders.find((responder) => responder.seatNumber === seat.seatNumber),
      activeDamageBursts[seat.seatNumber],
      impactTargetSeatNumbers.includes(seat.seatNumber),
      activeHealBursts[seat.seatNumber] != null,
      forcedFollowUp?.actorSeatNumber === localSeatNumber ? forcedFollowUp.targetSeatNumber : undefined
    );
  }).join("");

  return `
    <main class="shell shell--table">
      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="table-shell">
        <div class="table-actions">
          ${renderDevDrawPanel()}
          ${localIsHost ? `
            <button
              data-action="download-server-log"
              class="action-button action-button--secondary"
            >
              Server Log
            </button>
            <button
              data-action="download-client-log"
              class="action-button action-button--secondary"
            >
              Client Log
            </button>
          ` : ""}
          <button
            data-action="leave-match"
            class="action-button action-button--danger"
          >
            Leave Match
          </button>
        </div>

        <div class="table-surface ${isLocalTurn ? "table-surface--local-turn" : ""} ${impactTargetSeatNumbers.length > 0 ? "table-surface--impact" : ""}">
          <svg class="action-target-overlay" data-action-target-overlay="true" aria-hidden="true"></svg>
          ${renderCenterPlayArea(match, localSeatNumber, draggedCard, dragHoverTarget, activeCombatFx, impactTargetSeatNumbers.length > 0, presentationLockActive, activeActionVisual, centerResponseCards)}
          ${eventLogMarkup}
          ${seatMarkup}
          ${activeCardFlight != null ? `
            <div
              class="card-flight-overlay card-flight-overlay--${activeCardFlight.tone} ${activeCardFlight.settled ? "card-flight-overlay--settled" : ""}"
              style="left:${activeCardFlight.fromX}px; top:${activeCardFlight.fromY}px; width:${activeCardFlight.width}px; height:${activeCardFlight.height}px; --card-flight-dx:${activeCardFlight.toX - activeCardFlight.fromX}px; --card-flight-dy:${activeCardFlight.toY - activeCardFlight.fromY}px;"
              aria-hidden="true"
            >
              <img src="${activeCardFlight.card.imageUrl}" alt="${escapeHtml(activeCardFlight.card.name)}" />
            </div>
          ` : ""}

          <section class="local-hand-panel ${isLocalTurn ? "local-hand-panel--current-turn" : ""} ${impactTargetSeatNumbers.includes(localSeatNumber) ? "local-hand-panel--impact" : ""} ${activeHealBursts[localSeatNumber] != null ? "local-hand-panel--heal-active" : ""}" data-seat-area="true" data-seat-number="${localSeatNumber}">
            ${activeHealBursts[localSeatNumber] != null ? renderHealBurst(true) : ""}
            ${renderLocalStatuses(localSeat?.statuses ?? [], "local-status-strip")}
            ${renderLocalObjects((localSeat?.objects ?? []).filter(c => c.cardId.startsWith("anneau")), draggedCard, dragHoverTarget, localSeatNumber, "local-rings-strip")}
            ${showNoPlayableDiscardPrompt ? `
              <div class="local-turn-discard-prompt">
                You cannot play any card this turn. Choose one card to discard.
              </div>
            ` : ""}
            <div class="hand-fan">
              ${renderHandCards(localSeat?.hand ?? [], draggingCardInstanceId, arrowDrag?.cardInstanceId ?? "", returningHandCardInstanceId, hiddenHandCardInstanceIds, pendingAction != null, isLocalTurn || forcedFollowUp?.actorSeatNumber === localSeatNumber)}
            </div>
            ${renderLocalObjects((localSeat?.objects ?? []).filter(c => !c.cardId.startsWith("anneau")), draggedCard, dragHoverTarget, localSeatNumber, "local-equipment-strip")}
            ${(draggingCardInstanceId || showNoPlayableDiscardPrompt) ? `
              <div
                class="hand-discard-zone ${showNoPlayableDiscardPrompt && !draggingCardInstanceId ? "hand-discard-zone--idle" : ""} ${isHoverTarget(dragHoverTarget, "discard") ? "hand-discard-zone--hovered" : ""}"
                data-drop-target="discard"
              >✕ Discard</div>
            ` : ""}
          </section>
        </div>

        <aside class="local-hp-panel">
          <strong>${localDisplayedHp}</strong>
          ${activeDamageBursts[localSeatNumber] != null ? `<div class="local-damage-burst">-${activeDamageBursts[localSeatNumber]} HP</div>` : ""}
        </aside>

        ${renderPendingObjectChoice(match, localSeatNumber)}
        ${renderTelepathyInspectionModal(match, localSeatNumber, telepathyPreviewCardInstanceId)}
        ${renderBoardResetKeepModal(match, localSeatNumber, boardResetKeepPreviewCardInstanceId)}
        ${renderPendingSacrificeChoiceModal(match, localSeatNumber, sacrificeAmountInput)}
        ${chatMarkup}
        ${renderDragPreview(normalDragPreviewCard, dragPointerX, dragPointerY)}
        ${renderReturnCardFlight(activeReturnCardFlight)}
        <svg class="arrow-drag-overlay" aria-hidden="true"></svg>
      </section>
    </main>
  `;
}
