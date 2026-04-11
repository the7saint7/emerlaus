import { getLocalSeat, getOpponentSeats } from "../../../shared/seating";
import type { CardView, MatchState, PendingActionResponderState, SeatState } from "../../../shared/types";
import { allCardDefinitions } from "../../../shared/cards";
import type { ArrowDragState, DragHoverTarget } from "../app/state";
import {
  canLoadMassAttackStaff,
  isObjectTargetable,
  isSeatTargetable,
  objectCardMatchesSelectedTargeting
} from "../gameplay/interactionRules";
import type { AppLanguage } from "../i18n";
import { getLocalizedCardImageUrl, getLocalizedCategoryLabel, t } from "../i18n";
import type { OpponentAnchor } from "./opponentLayout";
import { getOpponentAnchorsForPlayerCount } from "./opponentLayout";

// Track which hand cards have been seen so newly dealt cards can be animated in.
const _knownHandCardIds = new Set<string>();
const _dealAnimatingUntil = new Map<string, number>(); // instanceId → epoch ms when animation ends
const DEAL_ANIMATION_MS = 950; // slightly longer than the CSS duration
let _handInitialized = false;

interface TableViewParams {
  language: AppLanguage;
  match: MatchState;
  localSeatNumber: number;
  displayedHpBySeat: Record<number, number>;
  displayedAliveBySeat: Record<number, boolean>;
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
  deathSearchPreviewCardInstanceId: string;
  deathSearchSelectedCardInstanceIds: string[];
  pickpocketPreviewCardInstanceId: string;
  pickpocketSelectedCardInstanceIds: string[];
  cardReferencePreviewCardId: string;
  cardReferenceSearchQuery: string;
  cardReferenceShowBase: boolean;
  cardReferenceShowAbondance: boolean;
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
  hoveredCardInstanceId: string;
  hoveredCenterSlotKind: "" | "attack" | "response";
  cardReferenceOpen: boolean;
  showVictoryCelebration: boolean;
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

function renderCardTooltip(card: CardView, language: AppLanguage): string {
  return `
    <div class="card-tooltip">
      <strong>${escapeHtml(card.name)}</strong>
      <p>${escapeHtml(card.description).replaceAll("\n", "<br />")}</p>
      ${renderDefenseTooltip(card, language)}
    </div>
  `;
}

function renderAttachedCardCountBadge(card: CardView): string {
  if ((card.attachedCardCount ?? 0) <= 0) {
    return "";
  }

  return `<span class="object-stack-count">+${card.attachedCardCount}</span>`;
}

function responseLabel(choice: PendingActionResponderState["choice"], language: AppLanguage): string {
  switch (choice) {
    case "resist":
      return t(language, "response.resist");
    case "annulation":
      return t(language, "response.annulation");
    case "resistance_accrue":
      return t(language, "response.resistance_accrue");
    case "pass":
      return t(language, "response.pass");
    case "mirror":
      return t(language, "response.mirror");
    default:
      return t(language, "response.waiting");
  }
}

function isPlaySlotCompatible(card: CardView | undefined): boolean {
  if (card == null || !card.canPlay || card.categoryCode === "CA") {
    return false;
  }

  return (
    card.categoryCode === "O" ||
    card.targets === "self" ||
    card.targets === "self_or_single_opponent" ||
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

function renderSeatCards(
  seat: SeatState,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  localSeatNumber: number,
  language: AppLanguage
): string {
  const objects = seat.objects ?? [];
  const statuses = seat.statuses ?? [];

  return `
    <div class="seat-card-strip">
      ${objects.map((card) => `
        <button
          class="seat-object-card ${objectCardMatchesSelectedTargeting(draggedCard, card, seat.seatNumber, localSeatNumber) ? "seat-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card, seat.seatNumber, localSeatNumber) ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="seat-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
            ${renderAttachedCardCountBadge(card)}
          </div>
          ${renderCardTooltip(card, language)}
        </button>
      `).join("")}
      ${statuses.map((card) => `
        <div class="seat-status-card">
          <div class="seat-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
          </div>
          ${renderCardTooltip(card, language)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderSeatInlineObjects(
  seat: SeatState,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  localSeatNumber: number,
  language: AppLanguage
): string {
  const objects = seat.objects ?? [];
  if (objects.length === 0) {
    return "";
  }

  return `
    <div class="seat-inline-objects">
      ${objects.map((card) => `
        <button
          class="seat-inline-object ${objectCardMatchesSelectedTargeting(draggedCard, card, seat.seatNumber, localSeatNumber) ? "seat-inline-object--targetable" : ""} ${isHoverTarget(hoverTarget, "object", seat.seatNumber, card.instanceId) ? "seat-inline-object--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card, seat.seatNumber, localSeatNumber) ? `data-drop-target="object" data-seat-number="${seat.seatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="seat-inline-object__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
            ${renderAttachedCardCountBadge(card)}
          </div>
          ${renderCardTooltip(card, language)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderOpponentSeat(
  seat: SeatState,
  displayedHp: number,
  displayedAlive: boolean,
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
  forcedTargetSeatNumber?: number,
  language?: AppLanguage
): string {
  const targetable = isSeatTargetable(draggedCard, seat, localSeatNumber, forcedTargetSeatNumber);
  const inspectable = draggedCard == null && seat.controllerType === "human";
  const showKickButton = localIsHost && inspectedSeatNumber === seat.seatNumber && seat.controllerType === "human" && !seat.isHost;
  const currentTurn = currentTurnSeatNumber === seat.seatNumber;
  const horizontalAnchorClass =
    anchor.x <= 24 ? "table-seat--edge-left"
    : anchor.x >= 76 ? "table-seat--edge-right"
    : "table-seat--center-x";
  const verticalAnchorClass =
    anchor.y <= 24 ? "table-seat--edge-top"
    : anchor.y >= 76 ? "table-seat--edge-bottom"
    : "table-seat--center-y";
  return `
    <article
      class="table-seat ${horizontalAnchorClass} ${verticalAnchorClass} ${!displayedAlive ? "table-seat--dead" : ""} ${targetable ? "table-seat--targetable" : ""} ${currentTurn ? "table-seat--current-turn" : ""} ${impactActive ? "table-seat--impact" : ""} ${isHoverTarget(hoverTarget, "seat", seat.seatNumber) ? "table-seat--hovered" : ""} ${healBurstActive ? "table-seat--heal-active" : ""}"
      style="left:${anchor.x}%; top:${anchor.y}%;"
      data-seat-area="true"
      data-seat-number="${seat.seatNumber}"
      ${targetable ? `data-drop-target="seat" data-seat-number="${seat.seatNumber}"` : ""}
    >
      <img class="seat-avatar seat-avatar--table" src="${seat.avatarUrl}" alt="${escapeHtml(seat.displayName)}" />
      <div class="seat-details-row">
        <div class="seat-hp-chip">${displayedHp}</div>
        <div class="seat-meta">
          <strong>${escapeHtml(seat.displayName)}</strong>
          <span>${t(language ?? "en", "stat.power")} ${seat.powerLevel ?? 1}</span>
          ${currentTurnSeatNumber === seat.seatNumber ? `<span class="seat-turn-indicator seat-turn-indicator--thinking">${t(language ?? "en", "table.thinking")}<span class="seat-thinking-dots" aria-hidden="true">...</span></span>` : ""}
          ${pendingResponder != null ? `<span class="seat-response-chip seat-response-chip--${pendingResponder.choice}">${responseLabel(pendingResponder.choice, language ?? "en")}</span>` : ""}
        </div>
        ${renderSeatInlineObjects(seat, draggedCard, hoverTarget, localSeatNumber, language ?? "en")}
      </div>
      ${damageBurstAmount != null ? `<div class="seat-damage-burst">-${damageBurstAmount}</div>` : ""}
      ${healBurstActive ? renderHealBurst() : ""}
      ${renderSeatCards({ ...seat, objects: [] }, draggedCard, hoverTarget, localSeatNumber, language ?? "en")}
      ${inspectable ? `<button class="action-button action-button--secondary seat-inspect-button" data-action="inspect-seat" data-seat-number="${seat.seatNumber}">${inspectedSeatNumber === seat.seatNumber ? t(language ?? "en", "chat.close") : t(language ?? "en", "table.player")}</button>` : ""}
      ${showKickButton ? `<button class="action-button action-button--danger seat-kick-button" data-action="kick-seat" data-seat-number="${seat.seatNumber}">${t(language ?? "en", "table.kickPlayer")}</button>` : ""}
    </article>
  `;
}

function renderHandCards(
  hand: CardView[],
  draggingCardInstanceId: string,
  arrowDragCardInstanceId: string,
  returningHandCardInstanceId: string,
  hiddenHandCardInstanceIds: string[],
  hoveredCardInstanceId: string,
  pendingActionActive: boolean,
  isLocalTurn: boolean,
  language: AppLanguage
): string {
  const total = hand.length;
  const FAN_RADIUS = 700;
  const FAN_SPREAD_DEG = total <= 1 ? 0 : Math.min(34, 8 + (total - 2) * 4);
  const CUT_OFF_PX = 80; // hides the defense band at card bottom
  const SPREAD_PX = 110;
  const EDGE_SPREAD_MULTIPLIER = 1.5;
  const spreadAnchorCardInstanceId = arrowDragCardInstanceId || draggingCardInstanceId || hoveredCardInstanceId;
  const spreadAnchorIndex = spreadAnchorCardInstanceId === ""
    ? -1
    : hand.findIndex((card) => card.instanceId === spreadAnchorCardInstanceId);

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
    const hovered = hoveredCardInstanceId !== "" && card.instanceId === hoveredCardInstanceId && !selected && !arrowActive;
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
    const spreadMagnitude =
      spreadAnchorIndex >= 0 && (spreadAnchorIndex === 0 || spreadAnchorIndex === total - 1)
        ? SPREAD_PX * EDGE_SPREAD_MULTIPLIER
        : SPREAD_PX;
    const spreadOffset =
      spreadAnchorIndex >= 0 && card.instanceId !== spreadAnchorCardInstanceId
        ? Math.sign(i - spreadAnchorIndex) * spreadMagnitude
        : 0;
    // Rightmost card (dealt last) sits on top
    const fanZ = i + 1;
    const animUntil = _dealAnimatingUntil.get(card.instanceId);
    const isNew = animUntil !== undefined;
    // Negative delay resumes the animation at the correct point on re-renders,
    // preventing the animation from restarting from scratch each time.
    const dealElapsed = isNew ? Math.min(now - (animUntil! - DEAL_ANIMATION_MS), DEAL_ANIMATION_MS) : 0;

    return `
      <article
        class="hand-card ${isNew ? "hand-card--new" : ""} ${card.canPlay ? "hand-card--playable" : ""} ${selected ? "hand-card--selected" : ""} ${hovered ? "hand-card--js-hovered" : ""} ${arrowActive ? "hand-card--arrow-active" : ""} ${responsePlayable ? "hand-card--response-playable" : ""} ${returning ? "hand-card--returning-target" : ""} ${overlayHidden ? "hand-card--overlay-hidden" : ""}"
        style="--fan-x:${(fanX + spreadOffset).toFixed(1)}px;--fan-y:${fanY.toFixed(1)}px;--fan-rotate:${fanRotate.toFixed(2)}deg;--fan-z:${fanZ};${isNew ? `--deal-elapsed:${dealElapsed.toFixed(0)}ms;` : ""}"
        data-card-instance-id="${card.instanceId}"
        data-base-fan-x="${fanX.toFixed(1)}"
      >
        <button
          class="hand-card-button"
          ${disableSelection ? "" : `data-action="drag-card" data-card-instance-id="${card.instanceId}"`}
          ${disableSelection ? "disabled" : ""}
        >
          <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" draggable="false" />
          ${renderCardTooltip(card, language)}
        </button>
      </article>
    `;
  }).join("");
}

function renderLocalObjects(objects: CardView[], draggedCard: CardView | undefined, hoverTarget: DragHoverTarget | null, localSeatNumber: number, stripClass: string, language: AppLanguage): string {
  if (objects.length === 0) {
    return "";
  }

  return `
    <div class="${stripClass}">
      ${objects.map((card) => `
        <article
          class="local-object-card ${objectCardMatchesSelectedTargeting(draggedCard, card, localSeatNumber, localSeatNumber) ? "local-object-card--targetable" : ""} ${isHoverTarget(hoverTarget, "object", localSeatNumber, card.instanceId) ? "local-object-card--hovered" : ""}"
          data-object-instance-id="${card.instanceId}"
          ${objectCardMatchesSelectedTargeting(draggedCard, card, localSeatNumber, localSeatNumber) ? `data-drop-target="object" data-seat-number="${localSeatNumber}" data-object-instance-id="${card.instanceId}"` : ""}
        >
          <div class="local-object-card__art">
            <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
            ${renderAttachedCardCountBadge(card)}
          </div>
          ${renderCardTooltip(card, language)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderLocalStatuses(statuses: CardView[], stripClass: string, language: AppLanguage): string {
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
          ${renderCardTooltip(card, language)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderCenterPlayArea(
  language: AppLanguage,
  match: MatchState,
  localSeatNumber: number,
  draggedCard: CardView | undefined,
  hoverTarget: DragHoverTarget | null,
  activeCombatFx: TableViewParams["activeCombatFx"],
  impactActive: boolean,
  presentationLockActive: boolean,
  activeActionVisual: TableViewParams["activeActionVisual"],
  centerResponseCards: TableViewParams["centerResponseCards"],
  hoveredCenterSlotKind: TableViewParams["hoveredCenterSlotKind"]
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
  // Show a Pass button only when the player is the current responder and has CA cards to choose from
  // (auto-pass fires when they have no CA cards; this lets them deliberately pass despite having options)
  const options = presentationLockActive ? [] : match.game?.pendingResponseOptions ?? [];
  const showPassButton = options.some((option) => option.choice === "pass");
  const localSeat = getLocalSeat(match, localSeatNumber);
  const pendingCurseRelease = presentationLockActive ? undefined : match.game?.pendingCurseRelease;
  const localPlayableCardCount = localSeat?.hand?.filter((card) => card.canPlay).length ?? 0;
  const showNoPlayableDiscardPrompt =
    localSeat?.seatNumber === match.game?.currentTurnSeatNumber
    && pendingAction == null
    && forcedFollowUp == null
    && pendingCurseRelease == null
    && (localSeat?.hand?.length ?? 0) > 0
    && localPlayableCardCount === 0;
  const discardSlotCompatible = showNoPlayableDiscardPrompt && draggedCard != null;
  const centerDropTargetKind =
    responseSlotCompatible
      ? "response-slot"
      : discardSlotCompatible
        ? "discard"
        : playSlotCompatible
          ? "play-slot"
          : undefined;
  const isDropReady =
    (responseSlotCompatible && isHoverTarget(hoverTarget, "response-slot"))
    || (discardSlotCompatible && isHoverTarget(hoverTarget, "discard"));
  const localForcedCards = localSeat?.hand?.filter((card) =>
    card.canPlay && forcedFollowUp?.allowedCategories.includes(card.categoryCode)
  ) ?? [];
  const showForcedPassButton =
    forcedFollowUp?.actorSeatNumber === localSeatNumber &&
    localForcedCards.length === 0;
  const showCurseReleaseOptions = pendingCurseRelease?.seatNumber === localSeatNumber;
  const forcedPrompt = forcedFollowUp == null
    ? ""
    : t(language, "forced.followUp", {
        actorName: getLocalSeat(match, forcedFollowUp.actorSeatNumber)?.displayName ?? t(language, "fallback.unknownPlayer"),
        categories: forcedFollowUp.allowedCategories.join("/"),
        targetName: getLocalSeat(match, forcedFollowUp.targetSeatNumber)?.displayName ?? t(language, "fallback.unknownPlayer"),
        cardName: forcedFollowUp.sourceCardName
      });
  const cursePrompt = pendingCurseRelease == null
    ? ""
    : t(language, "forced.cursePrompt", {
        actorName: getLocalSeat(match, pendingCurseRelease.seatNumber)?.displayName ?? t(language, "fallback.unknownPlayer"),
        count: pendingCurseRelease.releaseCardCount,
        releaseCardName: pendingCurseRelease.releaseCardName,
        cardName: pendingCurseRelease.cardName
      });

  const isShowingLastPlayed = singleStackCards.length > 0 && displayedAction == null;

  // Attack slot classes (shared between split and single layouts)
  const attackSlotClass = [
    "center-play-slot",
    singleStackCards.length > 0 || splitView ? "center-play-slot--filled" : "",
    hoveredCenterSlotKind === "attack" ? "center-play-slot--js-hovered" : "",
    impactActive ? "center-play-slot--impact" : "",
    (playSlotCompatible || responseSlotCompatible || discardSlotCompatible) ? "center-play-slot--targetable" : "",
    (isHoverTarget(hoverTarget, "play-slot") || isHoverTarget(hoverTarget, "response-slot") || isHoverTarget(hoverTarget, "discard")) ? "center-play-slot--hovered" : "",
    isDropReady ? "center-play-slot--drop-ready" : ""
  ].filter(Boolean).join(" ");

  const responseSlotClass = [
    "center-play-slot",
    "center-play-slot--filled",
    "center-play-slot--response-cards",
    hoveredCenterSlotKind === "response" ? "center-play-slot--js-hovered" : ""
  ].filter(Boolean).join(" ");

  const renderSingleCard = (card: CardView, isTop: boolean, offset: number, lift: number) => `
    <div class="center-card-stack__card center-card-stack__card--${isTop ? "top" : "under"}" style="--stack-offset:${offset}px; --stack-lift:${lift}px;">
      <div class="center-card-stack__art">
        <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
      </div>
      ${renderCardTooltip(card, language)}
    </div>
  `;

  return `
    <section class="center-play-area">
      <div class="combat-fx-banner ${activeCombatFx != null ? `combat-fx-banner--${activeCombatFx.tone}` : "combat-fx-banner--idle"}">${activeCombatFx != null ? escapeHtml(activeCombatFx.message) : "\u00a0"}</div>
      ${forcedPrompt !== "" ? `<div class="forced-follow-up-banner">${escapeHtml(forcedPrompt)}</div>` : ""}
      ${cursePrompt !== "" ? `<div class="forced-follow-up-banner">${escapeHtml(cursePrompt)}</div>` : ""}
        <div class="center-play-slots${splitView ? " center-play-slots--split" : ""}">
        ${splitView ? `
          <article class="${responseSlotClass}" data-center-hover-slot="response">
            <div class="center-card-stack">
              ${activeResponseCards.map((card, i) => renderSingleCard(card, i === activeResponseCards.length - 1, i * 4, i * 4)).join("")}
            </div>
          </article>
        ` : ""}
        <article
          class="${attackSlotClass}"
          data-center-hover-slot="attack"
          data-center-card-stack="true"
          ${displayedAction != null ? `data-pending-card-center="true"` : ""}
          ${centerDropTargetKind != null ? `data-drop-target="${centerDropTargetKind}"` : ""}
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
          <button type="button" class="action-button action-button--secondary" data-action="respond-pending" data-choice="pass">${t(language, "response.pass")}</button>
        </div>
      ` : ""}
      ${showForcedPassButton ? `
        <div class="center-play-options">
          <button type="button" class="action-button action-button--secondary" data-action="pass-forced-follow-up">${t(language, "response.pass")}</button>
        </div>
      ` : ""}
      ${showCurseReleaseOptions ? `
        <div class="center-play-options">
          <button type="button" class="action-button action-button--secondary" data-action="resolve-curse-release" data-choice="accept">${t(language, "curse.accept")}</button>
          <button type="button" class="action-button action-button--secondary" data-action="resolve-curse-release" data-choice="pass">${t(language, "curse.pass")}</button>
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

function seededUnit(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

function renderVictoryCelebration(match: MatchState, language: AppLanguage, enabled: boolean): string {
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
    </div>
  `;
}

function renderDevDrawPanel(language: AppLanguage): string {
  const optionsMarkup = [...allCardDefinitions]
    .sort((a, b) => {
      const left = a.localization?.[language]?.name ?? a.name;
      const right = b.localization?.[language]?.name ?? b.name;
      return left.localeCompare(right);
    })
    .map((card) => {
      const localizedName = card.localization?.[language]?.name ?? card.name;
      const devLabel = card.id === "annulation"
        ? `${localizedName} / ${language === "fr" ? "Cancel" : "Cancel"}`
        : localizedName;
      return `<option value="${escapeHtml(card.id)}">[${card.category.code}] ${escapeHtml(devLabel)}</option>`;
    })
    .join("");

  return `
    <div class="dev-draw-panel">
      <select class="dev-draw-select" data-action="dev-draw-card" title="${escapeHtml(language === "fr" ? "Dev : piger une carte dans la main" : "Dev: draw card into hand")}">
        <option value="">${language === "fr" ? "+ Piger une carte" : "+ Draw card"}</option>
        ${optionsMarkup}
      </select>
    </div>
  `;
}

function renderPendingObjectChoice(match: MatchState, localSeatNumber: number): string {
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
  const choice = match.game?.pendingObjectChoice;
  if (choice == null) {
    return "";
  }

  const ownerName = match.seats.find((seat) => seat.seatNumber === choice.ownerSeatNumber)?.displayName ?? t(language, "seat.label", { seatNumber: choice.ownerSeatNumber });
  const chooserName = match.seats.find((seat) => seat.seatNumber === choice.chooserSeatNumber)?.displayName ?? t(language, "seat.label", { seatNumber: choice.chooserSeatNumber });
  const isLocalChooser = choice.chooserSeatNumber === localSeatNumber;
  const chooserPrompt = choice.prompt.toLowerCase().includes("steal")
    ? t(language, "objectChoice.stealTitle")
    : t(language, "objectChoice.removeTitle");

  return `
    <section class="object-choice-overlay">
      <article class="object-choice-panel">
        <p class="eyebrow">${escapeHtml(choice.cardName)}</p>
        <h2>${isLocalChooser ? chooserPrompt : t(language, "objectChoice.chooserWaiting", { chooserName })}</h2>
        <p>${isLocalChooser ? chooserPrompt : t(language, "objectChoice.waitingBody", { chooserName, ownerName })}</p>
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
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
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
      <article class="telepathy-panel" data-modal-panel-scroll="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingInspection.cardName)}</p>
            <h2>${isLocalViewer ? t(language, "telepathy.viewerTitle", { targetName: targetSeat.displayName }) : t(language, "telepathy.inProgress")}</h2>
            <p>${isLocalViewer ? t(language, "telepathy.viewerBody") : t(language, "telepathy.waitingBody", { viewerName: viewerSeat.displayName, targetName: targetSeat.displayName })}</p>
          </div>
          ${isLocalViewer ? `<button type="button" class="action-button action-button--secondary" data-action="dismiss-telepathy">${t(language, "telepathy.close")}</button>` : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalViewer
            ? `<p class="telepathy-empty">${t(language, "telepathy.blocked")}</p>`
            : revealedHand.length === 0
            ? `<p class="telepathy-empty">${t(language, "telepathy.empty")}</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard, language)}
                  </div>
                `}
              </div>
              <div class="telepathy-list" data-modal-list-scroll="true">
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
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
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
      <article class="telepathy-panel" data-modal-panel-scroll="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingKeep.cardName)}</p>
            <h2>${isLocalChooser ? t(language, "boardReset.title", { count: pendingKeep.keepCardCount, plural: pendingKeep.keepCardCount === 1 ? "" : "s" }) : t(language, "boardReset.inProgress")}</h2>
            <p>${isLocalChooser ? t(language, "boardReset.body", { selectionLabel: pendingKeep.keepCardCount === 1 ? (language === "fr" ? "la seule carte" : "the one card") : language === "fr" ? `${pendingKeep.keepCardCount} cartes` : `${pendingKeep.keepCardCount} cards`, stayVerb: pendingKeep.keepCardCount === 1 ? (language === "fr" ? "reste" : "stays") : language === "fr" ? "restent" : "stay" }) : t(language, "boardReset.waitingBody", { chooserName: chooserSeat.displayName })}</p>
          </div>
          ${isLocalChooser ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-board-reset-keep" ${previewCard == null ? "disabled" : ""}>${t(language, "boardReset.keepAction")}</button>` : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalChooser
            ? `<p class="telepathy-empty">${t(language, "boardReset.blocked")}</p>`
            : keepableCards.length === 0
            ? `<p class="telepathy-empty">${t(language, "boardReset.empty")}</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard, language)}
                  </div>
                `}
              </div>
              <div class="telepathy-list" data-modal-list-scroll="true">
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
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
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
            <h2>${isLocalActor ? t(language, "sacrifice.title") : t(language, "sacrifice.inProgress")}</h2>
            <p>${isLocalActor ? t(language, "sacrifice.body", { maxAmount: pendingSacrificeChoice.maxAmount }) : t(language, "sacrifice.waitingBody", { playerName: actorSeat.displayName })}</p>
          </div>
        </div>
        ${!isLocalActor
          ? `<p class="telepathy-empty">${t(language, "telepathy.blocked")}</p>`
          : `
            <div class="sacrifice-choice-form">
              <label class="sacrifice-choice-form__label" for="sacrifice-amount-input">${t(language, "sacrifice.label")}</label>
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
              <p class="sacrifice-choice-form__hint">${t(language, "sacrifice.hint", { maxAmount: pendingSacrificeChoice.maxAmount })}</p>
              <button
                type="button"
                class="action-button action-button--secondary"
                data-action="confirm-sacrifice-amount"
                ${isValidAmount ? "" : "disabled"}
              >
                ${t(language, "sacrifice.confirm")}
              </button>
            </div>
          `}
      </article>
    </section>
  `;
}

function renderPendingDeathSearchModal(
  match: MatchState,
  localSeatNumber: number,
  deathSearchPreviewCardInstanceId: string,
  deathSearchSelectedCardInstanceIds: string[]
): string {
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
  const pendingDeathSearch = match.game?.pendingDeathSearch;
  if (pendingDeathSearch == null) {
    return "";
  }

  const chooserSeat = match.seats.find((seat) => seat.seatNumber === pendingDeathSearch.chooserSeatNumber);
  if (chooserSeat == null) {
    return "";
  }

  const isLocalChooser = pendingDeathSearch.chooserSeatNumber === localSeatNumber;
  const selectedCorpse = pendingDeathSearch.corpseOptions.find((corpse) => corpse.seatNumber === pendingDeathSearch.selectedCorpseSeatNumber);
  const previewCard = !isLocalChooser
    ? undefined
    : pendingDeathSearch.cardOptions.find((card) => card.instanceId === deathSearchPreviewCardInstanceId) ?? pendingDeathSearch.cardOptions[0];
  const selectedCardIdSet = new Set(deathSearchSelectedCardInstanceIds);
  const keepSelectionReady = deathSearchSelectedCardInstanceIds.length === pendingDeathSearch.keepCardCount;

  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel" data-modal-panel-scroll="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingDeathSearch.cardName)}</p>
            <h2>${isLocalChooser ? t(language, "deathSearch.title") : t(language, "deathSearch.inProgress")}</h2>
            <p>${isLocalChooser
              ? selectedCorpse == null
                ? t(language, "deathSearch.chooseCorpseBody")
                : t(language, "deathSearch.keepBody", { corpseName: selectedCorpse.displayName, count: pendingDeathSearch.keepCardCount })
              : t(language, "deathSearch.waitingBody", { chooserName: chooserSeat.displayName })}</p>
          </div>
          ${isLocalChooser && selectedCorpse != null
            ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-death-search-keep" ${keepSelectionReady ? "" : "disabled"}>${t(language, "deathSearch.keepAction")}</button>`
            : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalChooser
            ? `<p class="telepathy-empty">${t(language, "deathSearch.blocked")}</p>`
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
                      <span>${t(language, "deathSearch.corpseCardCount", { count: corpse.cardCount })}</span>
                    </div>
                  </button>
                `).join("")}
              </div>
            `
            : pendingDeathSearch.cardOptions.length === 0
            ? `<p class="telepathy-empty">${t(language, "deathSearch.empty")}</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <span>${t(language, previewCard.source === "self" ? "deathSearch.sourceSelf" : "deathSearch.sourceCorpse", { ownerName: previewCard.ownerDisplayName })}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard, language)}
                  </div>
                `}
              </div>
              <div class="telepathy-list" data-modal-list-scroll="true">
                ${pendingDeathSearch.cardOptions.map((card) => `
                  <button
                    type="button"
                    class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""} ${selectedCardIdSet.has(card.instanceId) ? "telepathy-card--selected" : ""}"
                    data-action="toggle-death-search-card"
                    data-card-instance-id="${card.instanceId}"
                  >
                    <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
                    <div class="telepathy-card__meta">
                      <strong>${escapeHtml(card.name)}</strong>
                      <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                      <span>${t(language, card.source === "self" ? "deathSearch.sourceSelf" : "deathSearch.sourceCorpse", { ownerName: card.ownerDisplayName })}</span>
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

function renderPendingPickpocketModal(
  match: MatchState,
  localSeatNumber: number,
  pickpocketPreviewCardInstanceId: string,
  pickpocketSelectedCardInstanceIds: string[]
): string {
  const language = (match as MatchState & { __language?: AppLanguage }).__language ?? "en";
  const pendingPickpocket = match.game?.pendingPickpocket;
  if (pendingPickpocket == null) {
    return "";
  }

  const chooserSeat = match.seats.find((seat) => seat.seatNumber === pendingPickpocket.chooserSeatNumber);
  const targetSeat = match.seats.find((seat) => seat.seatNumber === pendingPickpocket.targetSeatNumber);
  if (chooserSeat == null || targetSeat == null) {
    return "";
  }

  const isLocalChooser = pendingPickpocket.chooserSeatNumber === localSeatNumber;
  const previewCard = !isLocalChooser
    ? undefined
    : pendingPickpocket.cardOptions.find((card) => card.instanceId === pickpocketPreviewCardInstanceId) ?? pendingPickpocket.cardOptions[0];
  const selectedCardIdSet = new Set(pickpocketSelectedCardInstanceIds);
  const takeSelectionReady = pickpocketSelectedCardInstanceIds.length === pendingPickpocket.takeCardCount;

  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel" data-modal-panel-scroll="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${escapeHtml(pendingPickpocket.cardName)}</p>
            <h2>${isLocalChooser ? t(language, "pickpocket.title") : t(language, "pickpocket.inProgress")}</h2>
            <p>${isLocalChooser
              ? t(language, "pickpocket.body", { count: pendingPickpocket.takeCardCount, targetName: targetSeat.displayName })
              : t(language, "pickpocket.waitingBody", { chooserName: chooserSeat.displayName })}</p>
          </div>
          ${isLocalChooser
            ? `<button type="button" class="action-button action-button--secondary" data-action="confirm-pickpocket-take" ${takeSelectionReady ? "" : "disabled"}>${t(language, "pickpocket.takeAction")}</button>`
            : ""}
        </div>
        <div class="telepathy-grid">
          ${!isLocalChooser
            ? `<p class="telepathy-empty">${t(language, "pickpocket.blocked")}</p>`
            : pendingPickpocket.cardOptions.length === 0
            ? `<p class="telepathy-empty">${t(language, "pickpocket.empty")}</p>`
            : `
              <div class="telepathy-preview">
                ${previewCard == null ? "" : `
                  <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
                  <div class="telepathy-preview__meta">
                    <strong>${escapeHtml(previewCard.name)}</strong>
                    <span>[${escapeHtml(previewCard.categoryCode)}] ${escapeHtml(previewCard.categoryLabel)}</span>
                    <span>${t(language, previewCard.source === "hand" ? "pickpocket.sourceHand" : "pickpocket.sourceObject", { ownerName: previewCard.ownerDisplayName })}</span>
                    <p>${escapeHtml(previewCard.description).replaceAll("\n", "<br />")}</p>
                    ${renderDefenseTooltip(previewCard, language)}
                  </div>
                `}
              </div>
              <div class="telepathy-list" data-modal-list-scroll="true">
                ${pendingPickpocket.cardOptions.map((card) => `
                  <button
                    type="button"
                    class="telepathy-card ${previewCard?.instanceId === card.instanceId ? "telepathy-card--active" : ""} ${selectedCardIdSet.has(card.instanceId) ? "telepathy-card--selected" : ""}"
                    data-action="toggle-pickpocket-card"
                    data-card-instance-id="${card.instanceId}"
                  >
                    <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
                    <div class="telepathy-card__meta">
                      <strong>${escapeHtml(card.name)}</strong>
                      <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                      <span>${t(language, card.source === "hand" ? "pickpocket.sourceHand" : "pickpocket.sourceObject", { ownerName: card.ownerDisplayName })}</span>
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

function renderCardReferenceModal(
  language: AppLanguage,
  previewCardId: string,
  searchQuery: string,
  showBase: boolean,
  showAbondance: boolean,
  open: boolean
): string {
  if (!open) {
    return "";
  }

  const collator = new Intl.Collator(language, { sensitivity: "base" });
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLocaleLowerCase(language);
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
    const inAbondance = card.includedDecks.includes("Abondance");
    if ((!showBase || !inBase) && (!showAbondance || !inAbondance)) {
      return false;
    }

    if (normalizedSearchQuery === "") {
      return true;
    }

    return card.name.toLocaleLowerCase(language).includes(normalizedSearchQuery);
  }).sort((left, right) => {
    const categoryComparison = collator.compare(left.categoryLabel, right.categoryLabel);
    if (categoryComparison !== 0) {
      return categoryComparison;
    }

    return collator.compare(left.name, right.name);
  });

  const previewCard =
    catalogCards.find((card) => card.cardId === previewCardId)
    ?? catalogCards[0];

  if (previewCard == null) {
    return `
      <section class="telepathy-overlay">
        <article class="telepathy-panel card-reference-panel" data-card-reference-panel="true">
          <div class="telepathy-panel__header">
            <div>
              <p class="eyebrow">${t(language, "reference.title")}</p>
              <h2>${t(language, "reference.title")}</h2>
              <p>${t(language, "reference.body")}</p>
            </div>
            <button type="button" class="action-button action-button--secondary" data-action="close-card-reference">${t(language, "reference.close")}</button>
          </div>
          <div class="card-reference-search">
            <label class="card-reference-search__label" for="card-reference-search-input">${t(language, "reference.searchLabel")}</label>
            <input
              id="card-reference-search-input"
              class="card-reference-search__input"
              data-action="edit-reference-search"
              type="text"
              value="${escapeHtml(searchQuery)}"
              placeholder="${escapeHtml(t(language, "reference.searchPlaceholder"))}"
            />
          </div>
          <div class="card-reference-filters">
            <span class="card-reference-filters__label">${t(language, "reference.decksLabel")}</span>
            <div class="card-reference-filters__row">
              <button type="button" class="card-reference-filter ${showBase ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="base">${t(language, "reference.deckBase")}</button>
              <button type="button" class="card-reference-filter ${showAbondance ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="abondance">${t(language, "reference.deckAbondance")}</button>
            </div>
          </div>
          <p class="telepathy-empty">${t(language, "reference.empty")}</p>
        </article>
      </section>
    `;
  }

  return `
    <section class="telepathy-overlay">
      <article class="telepathy-panel card-reference-panel" data-card-reference-panel="true">
        <div class="telepathy-panel__header">
          <div>
            <p class="eyebrow">${t(language, "reference.title")}</p>
            <h2>${t(language, "reference.title")}</h2>
            <p>${t(language, "reference.body")}</p>
          </div>
          <button type="button" class="action-button action-button--secondary" data-action="close-card-reference">${t(language, "reference.close")}</button>
        </div>
        <div class="card-reference-search">
          <label class="card-reference-search__label" for="card-reference-search-input">${t(language, "reference.searchLabel")}</label>
          <input
            id="card-reference-search-input"
            class="card-reference-search__input"
            data-action="edit-reference-search"
            type="text"
            value="${escapeHtml(searchQuery)}"
            placeholder="${escapeHtml(t(language, "reference.searchPlaceholder"))}"
          />
        </div>
        <div class="card-reference-filters">
          <span class="card-reference-filters__label">${t(language, "reference.decksLabel")}</span>
          <div class="card-reference-filters__row">
            <button type="button" class="card-reference-filter ${showBase ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="base">${t(language, "reference.deckBase")}</button>
            <button type="button" class="card-reference-filter ${showAbondance ? "card-reference-filter--active" : ""}" data-action="toggle-reference-deck" data-reference-deck="abondance">${t(language, "reference.deckAbondance")}</button>
          </div>
        </div>
        <div class="card-reference-grid">
          <div class="card-reference-list telepathy-list" data-card-reference-list="true">
            ${catalogCards.map((card) => `
              <button
                type="button"
                class="telepathy-card ${previewCard.cardId === card.cardId ? "telepathy-card--active" : ""}"
                data-action="preview-reference-card"
                data-card-id="${card.cardId}"
              >
                <img src="${card.imageUrl}" alt="${escapeHtml(card.name)}" />
                <div class="telepathy-card__meta">
                  <strong>${escapeHtml(card.name)}</strong>
                  <span>[${escapeHtml(card.categoryCode)}] ${escapeHtml(card.categoryLabel)}</span>
                </div>
              </button>
            `).join("")}
          </div>
          <div class="telepathy-preview card-reference-preview">
            <img class="telepathy-preview__image" src="${previewCard.imageUrl}" alt="${escapeHtml(previewCard.name)}" />
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
    </section>
  `;
}

export function renderTableView({
  language,
  match,
  localSeatNumber,
  displayedHpBySeat,
  displayedAliveBySeat,
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
  deathSearchPreviewCardInstanceId,
  deathSearchSelectedCardInstanceIds,
  pickpocketPreviewCardInstanceId,
  pickpocketSelectedCardInstanceIds,
  cardReferencePreviewCardId,
  cardReferenceSearchQuery,
  cardReferenceShowBase,
  cardReferenceShowAbondance,
  sacrificeAmountInput,
  errorMessage,
  chatMarkup,
  eventLogMarkup,
  activeCombatFx,
  activeDamageBursts,
  activeHealBursts,
  impactTargetSeatNumbers,
  returningHandCardInstanceId,
  hiddenHandCardInstanceIds,
  hoveredCardInstanceId,
  hoveredCenterSlotKind,
  cardReferenceOpen,
  showVictoryCelebration
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
  const localizedMatch = { ...match, __language: language } as MatchState & { __language: AppLanguage };
  const seatMarkup = anchors.map((anchor, index) => {
    const seat = opponents[index];
    if (seat == null) {
      return "";
    }

    return renderOpponentSeat(
      seat,
      displayedHpBySeat[seat.seatNumber] ?? seat.hp ?? 0,
      displayedAliveBySeat[seat.seatNumber] ?? (seat.isAlive !== false),
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
      forcedFollowUp?.actorSeatNumber === localSeatNumber ? forcedFollowUp.targetSeatNumber : undefined,
      language
    );
  }).join("");

  return `
    <main class="shell shell--table">
      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="table-shell">
        <div class="table-actions">
          ${renderDevDrawPanel(language)}
          ${localIsHost ? `
            <button
              data-action="download-server-log"
              class="action-button action-button--secondary"
            >
              ${t(language, "table.serverLog")}
            </button>
            <button
              data-action="download-client-log"
              class="action-button action-button--secondary"
            >
              ${t(language, "table.clientLog")}
            </button>
          ` : ""}
          <button
            data-action="leave-match"
            class="action-button action-button--danger"
          >
            ${t(language, "table.leaveMatch")}
          </button>
          <button
            data-action="open-card-reference"
            class="action-button action-button--secondary"
          >
            ${t(language, "table.cardReference")}
          </button>
        </div>

        <div class="table-surface ${isLocalTurn ? "table-surface--local-turn" : ""} ${impactTargetSeatNumbers.length > 0 ? "table-surface--impact" : ""}">
          <svg class="action-target-overlay" data-action-target-overlay="true" aria-hidden="true"></svg>
          ${renderVictoryCelebration(localizedMatch, language, showVictoryCelebration)}
          ${renderCenterPlayArea(language, localizedMatch, localSeatNumber, draggedCard, dragHoverTarget, activeCombatFx, impactTargetSeatNumbers.length > 0, presentationLockActive, activeActionVisual, centerResponseCards, hoveredCenterSlotKind)}
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

          <section class="local-hand-panel ${!(displayedAliveBySeat[localSeatNumber] ?? (localSeat?.isAlive !== false)) ? "local-hand-panel--dead" : ""} ${isLocalTurn ? "local-hand-panel--current-turn" : ""} ${impactTargetSeatNumbers.includes(localSeatNumber) ? "local-hand-panel--impact" : ""} ${activeHealBursts[localSeatNumber] != null ? "local-hand-panel--heal-active" : ""}" data-seat-area="true" data-seat-number="${localSeatNumber}">
            <aside class="local-hp-panel">
              <strong>${localDisplayedHp}</strong>
              ${activeDamageBursts[localSeatNumber] != null ? `<div class="local-damage-burst">-${activeDamageBursts[localSeatNumber]} ${t(language, "stat.hp")}</div>` : ""}
            </aside>
            ${activeHealBursts[localSeatNumber] != null ? renderHealBurst(true) : ""}
            ${renderLocalStatuses(localSeat?.statuses ?? [], "local-status-strip", language)}
            ${renderLocalObjects((localSeat?.objects ?? []).filter(c => c.cardId.startsWith("anneau")), draggedCard, dragHoverTarget, localSeatNumber, "local-rings-strip", language)}
            ${showNoPlayableDiscardPrompt ? `
              <div class="local-turn-discard-prompt">
                ${t(language, "table.noPlayableDiscard")}
              </div>
            ` : ""}
            <div class="hand-fan">
              ${renderHandCards(localSeat?.hand ?? [], draggingCardInstanceId, arrowDrag?.cardInstanceId ?? "", returningHandCardInstanceId, hiddenHandCardInstanceIds, hoveredCardInstanceId, pendingAction != null, isLocalTurn || forcedFollowUp?.actorSeatNumber === localSeatNumber, language)}
            </div>
            ${renderLocalObjects((localSeat?.objects ?? []).filter(c => !c.cardId.startsWith("anneau")), draggedCard, dragHoverTarget, localSeatNumber, "local-equipment-strip", language)}
            ${(draggingCardInstanceId || showNoPlayableDiscardPrompt) ? `
              <div
                class="hand-discard-zone ${showNoPlayableDiscardPrompt && !draggingCardInstanceId ? "hand-discard-zone--idle" : ""} ${isHoverTarget(dragHoverTarget, "discard") ? "hand-discard-zone--hovered" : ""}"
                data-drop-target="discard"
              >✕ ${t(language, "table.discard")}</div>
            ` : ""}
          </section>
        </div>

        ${renderPendingObjectChoice(localizedMatch, localSeatNumber)}
        ${renderTelepathyInspectionModal(localizedMatch, localSeatNumber, telepathyPreviewCardInstanceId)}
        ${renderBoardResetKeepModal(localizedMatch, localSeatNumber, boardResetKeepPreviewCardInstanceId)}
        ${renderPendingDeathSearchModal(localizedMatch, localSeatNumber, deathSearchPreviewCardInstanceId, deathSearchSelectedCardInstanceIds)}
        ${renderPendingPickpocketModal(localizedMatch, localSeatNumber, pickpocketPreviewCardInstanceId, pickpocketSelectedCardInstanceIds)}
        ${renderPendingSacrificeChoiceModal(localizedMatch, localSeatNumber, sacrificeAmountInput)}
        ${renderCardReferenceModal(language, cardReferencePreviewCardId, cardReferenceSearchQuery, cardReferenceShowBase, cardReferenceShowAbondance, cardReferenceOpen)}
        ${chatMarkup}
        ${renderDragPreview(normalDragPreviewCard, dragPointerX, dragPointerY)}
        ${renderReturnCardFlight(activeReturnCardFlight)}
        <svg class="arrow-drag-overlay" aria-hidden="true"></svg>
      </section>
    </main>
  `;
}
