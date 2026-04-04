import { getLocalSeat, getOpponentSeats } from "../../../shared/seating";
import type { CardView, MatchState, PendingActionResponderState, SeatState } from "../../../shared/types";
import type { DragHoverTarget } from "../app/state";
import type { OpponentAnchor } from "./opponentLayout";
import { getOpponentAnchorsForPlayerCount } from "./opponentLayout";

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
  draggingCardInstanceId: string;
  dragPointerX: number;
  dragPointerY: number;
  dragHoverTarget: DragHoverTarget | null;
  inspectedSeatNumber: number;
  errorMessage: string;
  chatMarkup: string;
  eventLogMarkup: string;
  activeCombatFx: {
    message: string;
    tone: "info" | "success" | "failure";
    seatNumber?: number;
  } | null;
  activeDamageBurst: {
    seatNumber: number;
    amount: number;
  } | null;
  impactTargetSeatNumber: number;
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

function isSeatTargetable(selectedCard: CardView | undefined, seat: SeatState, localSeatNumber: number): boolean {
  if (selectedCard == null || !selectedCard.canPlay || seat.seatNumber === localSeatNumber || seat.isAlive === false) {
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
  if (card == null || !card.canPlay) {
    return false;
  }

  return (
    card.categoryCode === "O" ||
    card.targets === "self" ||
    card.targets === "all_opponents" ||
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
          class="seat-object-card ${objectTargetable ? "seat-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectTargetable ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          ${renderCardTooltip(card)}
        </button>
      `).join("")}
      ${statuses.map((card) => `
        <div class="seat-status-card">
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
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
          class="seat-inline-object ${objectTargetable ? "seat-inline-object--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-inline-object--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectTargetable ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
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
  impactActive?: boolean
): string {
  const targetable = isSeatTargetable(draggedCard, seat, localSeatNumber);
  const inspectable = draggedCard == null && seat.controllerType === "human";
  const showKickButton = localIsHost && inspectedSeatNumber === seat.seatNumber && seat.controllerType === "human" && !seat.isHost;
  const currentTurn = currentTurnSeatNumber === seat.seatNumber;
  const hpBarPercent = Math.max(0, Math.min(100, (displayedHp / 50) * 100));
  return `
    <article
      class="table-seat ${targetable ? "table-seat--targetable" : ""} ${currentTurn ? "table-seat--current-turn" : ""} ${impactActive ? "table-seat--impact" : ""} ${isHoverTarget(hoverTarget, "seat", seat.seatNumber) ? "table-seat--hovered" : ""}"
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
      ${renderSeatCards({ ...seat, objects: [] }, draggedCard, hoverTarget)}
      ${inspectable ? `<button class="action-button action-button--secondary seat-inspect-button" data-action="inspect-seat" data-seat-number="${seat.seatNumber}">${inspectedSeatNumber === seat.seatNumber ? "Close" : "Player"}</button>` : ""}
      ${showKickButton ? `<button class="action-button action-button--danger seat-kick-button" data-action="kick-seat" data-seat-number="${seat.seatNumber}">Kick Player</button>` : ""}
    </article>
  `;
}

function renderHandCards(hand: CardView[], draggingCardInstanceId: string, pendingActionActive: boolean): string {
  return hand.map((card) => {
    const selected = card.instanceId === draggingCardInstanceId;
    const disableSelection = !card.canPlay;
    const responsePlayable = pendingActionActive && card.canPlay;
    return `
      <article class="hand-card ${card.canPlay ? "hand-card--playable" : "hand-card--disabled"} ${selected ? "hand-card--selected" : ""} ${responsePlayable ? "hand-card--response-playable" : ""}">
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

function renderLocalObjects(objects: CardView[], draggedCard: CardView | undefined, hoverTarget: DragHoverTarget | null, localSeatNumber: number): string {
  if (objects.length === 0) {
    return "";
  }

  const objectTargetable = isObjectTargetable(draggedCard);

  return `
    <div class="local-object-strip">
      ${objects.map((card) => `
        <article
          class="local-object-card ${objectTargetable ? "local-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", localSeatNumber, card.instanceId) ? "local-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectTargetable ? `data-drop-target="object" data-seat-number="${localSeatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          ${renderCardTooltip(card)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderCenterPlayArea(
  match: MatchState,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  activeCombatFx: TableViewParams["activeCombatFx"],
  impactActive: boolean,
  presentationLockActive: boolean,
  activeActionVisual: TableViewParams["activeActionVisual"],
  centerResponseCards: TableViewParams["centerResponseCards"]
): string {
  const pendingAction = presentationLockActive ? undefined : match.game?.pendingAction;
  const displayedAction = activeActionVisual ?? pendingAction;
  const fallbackResponseCards = pendingAction?.responders
    .flatMap((responder) => responder.cards ?? (responder.card != null ? [responder.card] : []))
    .filter((card) => card.cardId === "annulation" || card.cardId === "resistance-accrue" || card.cardId === "miroir")
    ?? [];
  const stackedCards = [
    ...((displayedAction != null && match.game?.lastPlayedCard?.card.instanceId !== displayedAction.card.instanceId)
      ? [match.game?.lastPlayedCard?.card]
      : displayedAction == null
        ? [match.game?.lastPlayedCard?.card]
        : []
    ).flatMap((card) => card == null ? [] : [card]),
    ...(displayedAction != null ? [displayedAction.card] : []),
    ...(centerResponseCards.length > 0 ? centerResponseCards : fallbackResponseCards)
  ].slice(-4);
  const options = presentationLockActive ? [] : match.game?.pendingResponseOptions ?? [];
  const playSlotCompatible = isPlaySlotCompatible(draggedCard);
  const responseSlotCompatible = displayedAction != null && draggedCard?.categoryCode === "CA" && draggedCard.canPlay;
  const visibleOptions = options.filter((option) => option.choice === "pass" || option.choice === "resist");

  return `
    <section class="center-play-area">
      ${activeCombatFx != null ? `<div class="combat-fx-banner combat-fx-banner--${activeCombatFx.tone}">${escapeHtml(activeCombatFx.message)}</div>` : ""}
      <div class="center-play-slots">
        <article
          class="center-play-slot center-play-slot--action ${stackedCards.length > 0 ? "center-play-slot--filled" : ""} ${impactActive ? "center-play-slot--impact" : ""} ${(playSlotCompatible || responseSlotCompatible) ? "center-play-slot--targetable" : ""} ${(isHoverTarget(hoverTarget, "play-slot") || isHoverTarget(hoverTarget, "response-slot")) ? "center-play-slot--hovered" : ""}"
          data-center-card-stack="true"
          ${displayedAction != null ? `data-pending-card-center="true"` : ""}
          ${(responseSlotCompatible || playSlotCompatible) ? `data-drop-target="${responseSlotCompatible ? "response-slot" : "play-slot"}"` : ""}
        >
          ${stackedCards.length > 0
            ? `
              <div class="center-card-stack">
                ${stackedCards.map((card, index) => `
                  <div class="center-card-stack__card center-card-stack__card--${index === stackedCards.length - 1 ? "top" : "under"}" style="--stack-offset:${index * 8}px; --stack-lift:${index * 4}px;">
                    <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
                    ${renderCardTooltip(card)}
                  </div>
                `).join("")}
              </div>
            `
            : `<div class="center-play-slot-placeholder"></div>`}
        </article>
        <article
          class="center-play-slot center-play-slot--discard ${draggedCard != null ? "center-play-slot--targetable" : ""} ${isHoverTarget(hoverTarget, "discard") ? "center-play-slot--hovered" : ""}"
          data-drop-target="discard"
        >
          <img src="/assets/cards/back.png" alt="Discard pile" />
        </article>
      </div>
      ${visibleOptions.length > 0 ? `
        <div class="center-play-options">
          ${visibleOptions.map((option) => `
            <button type="button" class="action-button ${option.choice === "pass" ? "action-button--secondary" : ""}" data-action="respond-pending" data-choice="${option.choice}" title="${escapeHtml(option.description)}">
              ${escapeHtml(option.label)}
            </button>
          `).join("")}
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

export function renderTableView({
  match,
  localSeatNumber,
  displayedHpBySeat,
  presentationLockActive,
  activeActionVisual,
  centerResponseCards,
  activeCardFlight,
  draggingCardInstanceId,
  dragPointerX,
  dragPointerY,
  dragHoverTarget,
  inspectedSeatNumber,
  errorMessage,
  chatMarkup,
  eventLogMarkup,
  activeCombatFx,
  activeDamageBurst,
  impactTargetSeatNumber
}: TableViewParams): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const localIsHost = localSeat?.isHost === true;
  const visibleCurrentTurnSeatNumber = presentationLockActive ? undefined : match.game?.currentTurnSeatNumber;
  const isLocalTurn = visibleCurrentTurnSeatNumber === localSeat?.seatNumber;
  const opponents = getOpponentSeats(match, localSeatNumber);
  const anchors = getOpponentAnchorsForPlayerCount(match.seats.length);
  const draggedCard = localSeat?.hand?.find((card) => card.instanceId === draggingCardInstanceId);
  const pendingAction = presentationLockActive ? undefined : match.game?.pendingAction;
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
      activeDamageBurst?.seatNumber === seat.seatNumber ? activeDamageBurst.amount : undefined,
      impactTargetSeatNumber === seat.seatNumber
    );
  }).join("");

  return `
    <main class="shell shell--table">
      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="table-shell">
        <div class="table-actions">
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

        <div class="table-surface ${isLocalTurn ? "table-surface--local-turn" : ""} ${impactTargetSeatNumber !== 0 ? "table-surface--impact" : ""}">
          <svg class="action-target-overlay" data-action-target-overlay="true" aria-hidden="true"></svg>
          ${renderCenterPlayArea(match, draggedCard, dragHoverTarget, activeCombatFx, impactTargetSeatNumber !== 0, presentationLockActive, activeActionVisual, centerResponseCards)}
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

          <section class="local-hand-panel ${isLocalTurn ? "local-hand-panel--current-turn" : ""} ${impactTargetSeatNumber === localSeatNumber ? "local-hand-panel--impact" : ""}" data-seat-area="true" data-seat-number="${localSeatNumber}">
            <div class="local-seat-summary">
              <strong>${escapeHtml(localSeat?.displayName ?? "You")}</strong>
              <span>Seat ${localSeat?.seatNumber ?? "-"}</span>
              <span>Power ${localSeat?.powerLevel ?? 1}</span>
              <span>${visibleCurrentTurnSeatNumber === localSeat?.seatNumber ? "Active turn" : "Waiting"}</span>
            </div>
            ${renderLocalObjects(localSeat?.objects ?? [], draggedCard, dragHoverTarget, localSeatNumber)}
            <div class="hand-row">
              ${renderHandCards(localSeat?.hand ?? [], draggingCardInstanceId, pendingAction != null)}
            </div>
          </section>
        </div>

        <aside class="local-hp-panel">
          <strong>${localDisplayedHp}</strong>
          ${activeDamageBurst?.seatNumber === localSeatNumber ? `<div class="local-damage-burst">-${activeDamageBurst.amount} HP</div>` : ""}
        </aside>

        ${chatMarkup}
        ${renderDragPreview(draggedCard, dragPointerX, dragPointerY)}
      </section>
    </main>
  `;
}
