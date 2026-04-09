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
} from "../../shared/types.js";
import type { CardCategoryCode, CardEffect } from "../../shared/cards/index.js";

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
  noRiposteTurnsRemaining: number;
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
  deferredMirrorHits?: Array<{ sourceSeatNumber: number; targetSeatNumber: number }>;
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
  pendingObjectChoice?: {
    boxId?: string;
    chooserSeatNumber: number;
    ownerSeatNumber: number;
    sourceCard: StoredCardInstance;
    mode: "remove" | "steal";
    finalizeActorSeatNumber?: number;
  };
  pendingHandInspection?: {
    boxId?: string;
    viewerSeatNumber: number;
    targetSeatNumber: number;
    sourceCard: StoredCardInstance;
    finalizeActorSeatNumber?: number;
  };
  pendingBoardResetKeep?: {
    boxId?: string;
    chooserSeatNumber: number;
    sourceCard: StoredCardInstance;
    effectIndex: number;
  };
  pendingSacrificeChoice?: {
    boxId?: string;
    actorSeatNumber: number;
    sourceCard: StoredCardInstance;
    maxAmount: number;
  };
  pendingCurseRelease?: {
    seatNumber: number;
    statusInstanceId: string;
    sourceCardId: string;
    releaseCardId: string;
    releaseCardCount: number;
  };
  pausedSequentialAction?: StoredPendingActionState;
  forcedPlayCategories?: CardCategoryCode[] | "any";
  forcedFollowUp?: {
    sourceCardId: "colere-du-magicien";
    actorSeatNumber: number;
    targetSeatNumber: number;
    turnOwnerSeatNumber: number;
    allowedCategories: CardCategoryCode[];
    doubleHpLossDamage: boolean;
    suppressDefenseWindow: boolean;
    suppressResistanceCheck: boolean;
  };
}

export type StoredMatchState = MatchState & {
  internalGame?: StoredGameState;
};
