import type {
  CombatPresentationEvent,
  DebugLogEntry,
  DiceRollEvent,
  GameEvent,
  MatchState,
  PendingActionState,
  PendingActionResponderState,
  PlayedCardState,
  ResponseChoiceType
} from "../../shared/types";
import type { CardCategoryCode } from "../../shared/cards";

export interface StoredCardInstance {
  instanceId: string;
  cardId: string;
}

export interface StoredSeatStatus {
  instanceId: string;
  cardId: string;
  sourceSeatNumber: number;
}

export interface StoredSeatState {
  seatNumber: number;
  hand: StoredCardInstance[];
  objects: StoredCardInstance[];
  statuses: StoredSeatStatus[];
  alive: boolean;
  skipTurnsRemaining: number;
  pendingExtraPlays: number;
  attackImmunityTurns: number;
  handInspectionTargetSeatNumber?: number;
}

export interface StoredPendingActionResponderState extends Omit<PendingActionResponderState, "card" | "cards"> {
  consumedCards: StoredCardInstance[];
}

export interface StoredPendingActionState extends Omit<PendingActionState, "card" | "responders"> {
  storedCard: StoredCardInstance;
  responders: StoredPendingActionResponderState[];
  createdAt: string;
  sharedSacrificeAmount?: number;
}

export interface StoredGameState {
  deck: StoredCardInstance[];
  discardPile: StoredCardInstance[];
  seatStates: StoredSeatState[];
  currentTurnSeatNumber: number;
  turnNumber: number;
  minimumHandSize: number;
  winnerSeatNumber?: number;
  lastPlayedCard?: PlayedCardState;
  diceRolls: DiceRollEvent[];
  presentationEvents: CombatPresentationEvent[];
  eventLog: GameEvent[];
  debugLog: DebugLogEntry[];
  pendingAction?: StoredPendingActionState;
  forcedPlayCategories?: CardCategoryCode[] | "any";
}

export type StoredMatchState = MatchState & {
  internalGame?: StoredGameState;
};
