import type { CardView, MatchState } from "../../../shared/types";

export interface DragHoverTarget {
  kind: "discard" | "play-slot" | "response-slot" | "seat" | "object";
  seatNumber?: number;
  objectInstanceId?: string;
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
  impactTargetSeatNumber: number;
}
