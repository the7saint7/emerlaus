import type { CardCategoryCode, DefenseBandRules } from "./cards";

export type MatchStatus = "lobby" | "in_progress" | "finished";

export type ControllerType = "human" | "bot";

export type CardSelectionMode = "none" | "confirm" | "target";
export type ResponseChoiceType = "pending" | "pass" | "resist" | "annulation" | "resistance_accrue" | "mirror";

export type CardTargetMode =
  | "self"
  | "single_opponent"
  | "all_opponents"
  | "left_opponent"
  | "target_object"
  | "single_player_or_object"
  | "none";

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  content: string;
  createdAt: string;
}

export interface SeatState {
  seatNumber: number;
  controllerType: ControllerType;
  userId: string;
  displayName: string;
  avatarUrl: string;
  handCount: number;
  hp: number;
  connected: boolean;
  isHost: boolean;
  powerLevel?: number;
  isAlive?: boolean;
  hand?: CardView[];
  objects?: CardView[];
  statuses?: CardView[];
  difficulty?: string;
  disconnectedUserId?: string;
}

export interface CardView {
  instanceId: string;
  cardId: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryCode: CardCategoryCode;
  categoryLabel: string;
  selectionMode: CardSelectionMode;
  targets: CardTargetMode;
  defenseBand: DefenseBandRules | null;
  canPlay: boolean;
  disabledReason?: string;
  zone: "hand" | "object" | "status" | "discard";
}

export interface PlayedCardState {
  actorSeatNumber: number;
  targetSeatNumbers: number[];
  targetObjectInstanceId?: string;
  card: CardView;
  mode: "active" | "inactive";
  summary: string;
  resolvedAt: string;
}

export interface DiceRollEvent {
  id: string;
  seatNumber?: number;
  notation: string;
  total: number;
  values: number[];
  rolledAt: string;
}

export interface DiceRollPlaybackEvent {
  id: string;
  boxId?: string;
  type: "dice_roll";
  createdAt: string;
  seatNumber?: number;
  notation: string;
  total: number;
  values: number[];
}

export interface ActionStartEvent {
  id: string;
  boxId: string;
  type: "action_start";
  createdAt: string;
  actorSeatNumber: number;
  targetSeatNumbers: number[];
  targetObjectInstanceId?: string;
  card: CardView;
  summary: string;
}

export interface CombatPresentationEvent {
  id: string;
  boxId?: string;
  type: "response_choice" | "resistance_start" | "resistance_result" | "attack_impact" | "hp_loss" | "hp_gain";
  createdAt: string;
  seatNumber?: number;
  actorSeatNumber?: number;
  targetSeatNumber?: number;
  cardName?: string;
  responseChoice?: ResponseChoiceType;
  bonus?: number;
  threshold?: number;
  success?: boolean;
  fatalFailure?: boolean;
  criticalSuccess?: boolean;
  amount?: number;
}

export type GameEvent = ActionStartEvent | DiceRollPlaybackEvent | CombatPresentationEvent;

export interface DebugLogEntry {
  id: string;
  createdAt: string;
  source: "server" | "client";
  scope: string;
  message: string;
}

export interface PendingActionResponderState {
  seatNumber: number;
  state: "pending" | "locked";
  choice: ResponseChoiceType;
  card?: CardView;
  cards?: CardView[];
}

export interface PendingActionOption {
  choice: Exclude<ResponseChoiceType, "pending">;
  label: string;
  description: string;
}

export interface PendingActionState {
  boxId: string;
  actorSeatNumber: number;
  targetSeatNumbers: number[];
  responderSeatNumbers: number[];
  targetObjectInstanceId?: string;
  card: CardView;
  summary: string;
  responseMode: "per_target" | "collective";
  responders: PendingActionResponderState[];
  fromMirror?: boolean;
  mirrorOriginActorSeatNumber?: number;
}

export interface GameState {
  turnNumber: number;
  currentTurnSeatNumber: number;
  minimumHandSize: number;
  deckCount: number;
  discardCount: number;
  discardTop?: CardView;
  lastPlayedCard?: PlayedCardState;
  diceRolls: DiceRollEvent[];
  presentationEvents: CombatPresentationEvent[];
  eventLog: GameEvent[];
  debugLog: DebugLogEntry[];
  pendingAction?: PendingActionState;
  pendingResponseOptions?: PendingActionOption[];
  winnerSeatNumber?: number;
}

export interface MatchState {
  instanceId: string;
  status: MatchStatus;
  maxSeats: number;
  seats: SeatState[];
  chatMessages: ChatMessage[];
  game?: GameState;
  createdAt: string;
  startedAt?: string;
}

export interface JoinRequest {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface JoinResponse {
  match: MatchState;
  localSeatNumber: number;
  playerSessionToken: string;
}

export interface MatchConfigResponse {
  discordClientId: string;
}

export interface DisconnectRequest {
}

export interface AddBotRequest {
  difficulty?: string;
}

export interface StartMatchRequest {
}

export interface KickPlayerRequest {
  seatNumber: number;
}

export interface SendChatMessageRequest {
  content: string;
}

export interface AnnounceDiceRollRequest {
  notation: string;
  total: number;
  values: number[];
  seatNumber?: number;
}

export interface PlayCardRequest {
  cardInstanceId: string;
  mode: "active" | "inactive";
  targetSeatNumber?: number;
  targetObjectInstanceId?: string;
}

export interface PendingActionResponseRequest {
  choice: Exclude<ResponseChoiceType, "pending">;
}

export interface DiscordAuthTokenRequest {
  code: string;
}

export interface DiscordAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface LocalUserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string;
}
