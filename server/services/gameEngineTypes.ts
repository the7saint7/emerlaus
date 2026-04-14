import type {
  CombatPresentationEvent,
  DebugLogEntry,
  DiceRollEvent,
  GameEvent,
  MatchState,
  PendingActionState,
  PendingActionResponderState,
  PlayCardRequest,
  PlayedCardState,
  ResponseChoiceType
} from "../../shared/types.js";
import type { CardCategoryCode, CardEffect } from "../../shared/cards/index.js";

export interface StoredCardInstance {
  instanceId: string;
  cardId: string;
  attachedCards?: StoredCardInstance[];
}

export interface StoredSeatStatus {
  instanceId: string;
  cardId: string;
  sourceSeatNumber: number;
  remainingTurnTriggers?: number;
  bodyBound?: boolean;
  activatesNextTurn?: boolean;
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
  sourceZone?: "hand" | "object";
  skipStoredCardResolution?: boolean;
  sharedSacrificeAmount?: number;
  deferredMirrorHits?: Array<{ sourceSeatNumber: number; targetSeatNumber: number }>;
  continuation?: {
    mode: "resume_turn" | "advance_turn_without_play";
    seatNumber: number;
  };
}

export interface StoredForcedFollowUpState {
  sourceCardId: string;
  actorSeatNumber: number;
  targetSeatNumber: number;
  turnOwnerSeatNumber: number;
  allowedCategories: CardCategoryCode[];
  doubleHpLossDamage: boolean;
  suppressDefenseWindow: boolean;
  suppressResistanceCheck: boolean;
  consumeMode?: boolean;
}

export interface StoredExtraPlayModeState {
  sourceCardId: string;
  actorSeatNumber: number;
  allowedCategories: CardCategoryCode[] | "any";
  requiredActivePlaysRemaining: number;
  remainingRestrictedPlays: number;
  temporaryPowerBonus: number;
  temporaryResistanceModifier: number;
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
    mode: "remove" | "steal" | "discard_ring";
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
  pendingDeathSearch?: {
    chooserSeatNumber: number;
    sourceCard: StoredCardInstance;
    corpses: Array<{
      seatNumber: number;
      cards: StoredCardInstance[];
    }>;
    selectedCorpseSeatNumber?: number;
    continuationActorSeatNumber?: number;
    continuationBoxId?: string;
  };
  pendingPickpocket?: {
    boxId?: string;
    chooserSeatNumber: number;
    targetSeatNumber: number;
    sourceCard: StoredCardInstance;
    takeCardCount: number;
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
  pendingRepeatedPlay?: {
    actorSeatNumber: number;
    cardId: string;
    request: PlayCardRequest;
    forcedFollowUp?: StoredForcedFollowUpState;
  };
  pausedSequentialAction?: StoredPendingActionState;
  extraPlayMode?: StoredExtraPlayModeState;
  forcedPlayCategories?: CardCategoryCode[] | "any";
  forcedFollowUp?: StoredForcedFollowUpState;
}

export type StoredMatchState = MatchState & {
  internalGame?: StoredGameState;
};
