import type { CardView, MatchState } from "../../../shared/types";

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
  telepathyPreviewCardInstanceId: string;
  telepathyPanelScrollTop: number;
  telepathyListScrollTop: number;
  inspectedSeatNumber: number;
  seenGameEventIds: string[];
  seenEventMessageIds: string[];
  clientDebugLog: string[];
  errorMessage: string;
  confirmingLeave: boolean;
  confirmingKickSeatNumber: number;
  confirmingDiscardCardInstanceId: string;
  leftMessage: string;
  chatDraft: string;
  chatExpanded: boolean;
  chatHidden: boolean;
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
  activeCombatFx: {
    message: string;
    tone: "info" | "success" | "failure";
    seatNumber?: number;
  } | null;
  activeDamageBurst: {
    seatNumber: number;
    amount: number;
  } | null;
  activeHealBurst: {
    seatNumber: number;
    amount: number;
  } | null;
  impactTargetSeatNumber: number;
  /** Confirmed target seat for opponents currently doing an arrow drag */
  opponentCursors: Record<number, { targetSeatNumber: number | null; ts: number }>;
}
