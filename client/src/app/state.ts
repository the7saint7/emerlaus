import type { CardView, MatchState } from "../../../shared/types";
import type { AppLanguage } from "../i18n";

export interface DragHoverTarget {
  kind: "discard" | "play-slot" | "response-slot" | "seat" | "object";
  seatNumber?: number;
  objectInstanceId?: string;
}

export interface ArrowDragState {
  cardInstanceId: string;
  /** Viewport coordinates of the arrow origin (card center) */
  originX: number;
  originY: number;
  /** Current pointer viewport coordinates */
  pointerX: number;
  pointerY: number;
  /** Seat number of nearest valid target, null if none close enough */
  nearestSeatNumber: number | null;
}

export interface AppState {
  language: AppLanguage;
  instanceId: string;
  playerSessionToken: string;
  match: MatchState | null;
  localSeatNumber: number;
  displayedHpBySeat: Record<number, number>;
  draggingCardInstanceId: string;
  dragPointerX: number;
  dragPointerY: number;
  dragHoverTarget: DragHoverTarget | null;
  /** Arrow drag state for single-target cards (Phase 3) */
  arrowDrag: ArrowDragState | null;
  /** Instance ID of the card currently showing the zoom hover state (empty = none) */
  hoveredCardInstanceId: string;
  /** Prevent immediate re-hover zoom after dropping a card until the pointer leaves and re-enters. */
  hoverZoomBlockedCardInstanceId: string;
  /** Which center stack is currently hovered, used to keep center-card zoom stable across rerenders. */
  hoveredCenterSlotKind: "" | "attack" | "response";
  telepathyPreviewCardInstanceId: string;
  boardResetKeepPreviewCardInstanceId: string;
  cardReferencePreviewCardId: string;
  sacrificeAmountInput: string;
  telepathyPanelScrollTop: number;
  telepathyListScrollTop: number;
  cardReferenceListScrollTop: number;
  inspectedSeatNumber: number;
  seenGameEventIds: string[];
  seenEventMessageIds: string[];
  clientDebugLog: string[];
  errorMessage: string;
  confirmingLeave: boolean;
  confirmingKickSeatNumber: number;
  confirmingDiscardCardInstanceId: string;
  pendingAnnulationChoice:
    | {
      cardInstanceId: string;
      maxCount: number;
      neededCount: number;
    }
    | null;
  cardReferenceOpen: boolean;
  eventLogPanelWidth: number;
  eventLogPanelHeight: number;
  leftMessage: string;
  chatExpanded: boolean;
  eventPlaybackActive: boolean;
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
  returningHandCardInstanceId: string;
  hiddenHandCardInstanceIds: string[];
  activeCombatFx: {
    message: string;
    tone: "info" | "success" | "failure";
    seatNumber?: number;
  } | null;
  activeDamageBursts: Record<number, number>;
  activeHealBursts: Record<number, number>;
  impactTargetSeatNumbers: number[];
  /** Confirmed target seat for opponents currently doing an arrow drag */
  opponentCursors: Record<number, { targetSeatNumber: number | null; ts: number }>;
}
