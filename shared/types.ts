import type { CardCategoryCode, DefenseBandRules } from "./cards/index.js";

export type MatchStatus = "lobby" | "in_progress" | "finished";

export type ControllerType = "human" | "bot";
export type ExpansionKey =
  | "sorcellerie"
  | "invocation"
  | "abondance"
  | "puissance"
  | "communion"
  | "destin"
  | "compagnons"
  | "allies";

export interface MatchExpansionSettings {
  sorcellerie: boolean;
  invocation: boolean;
  abondance: boolean;
  puissance: boolean;
  communion: boolean;
  destin: boolean;
  compagnons: boolean;
  allies: boolean;
}

export const defaultMatchExpansionSettings: MatchExpansionSettings = {
  sorcellerie: false,
  invocation: false,
  abondance: true,
  puissance: true,
  communion: false,
  destin: false,
  compagnons: false,
  allies: false
};

export type CardSelectionMode = "none" | "confirm" | "target";
export type ResponseChoiceType =
  | "pending"
  | "pass"
  | "resist"
  | "annulation"
  | "ordre-demmerlaus"
  | "resistance_accrue"
  | "mirror";

export type CardTargetMode =
  | "self"
  | "single_opponent"
  | "self_or_single_opponent"
  | "all_opponents"
  | "left_opponent"
  | "target_object"
  | "single_player_or_object"
  | "none";

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
  handInspectionTargetSeatNumber?: number;
}

export interface SpectatorState {
  userId: string;
  displayName: string;
  avatarUrl: string;
  joinedAt: string;
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
  attachedCardCount?: number;
  remainingTurnTriggers?: number;
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
  fromMirror?: boolean;
  mirrorOriginActorSeatNumber?: number;
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

export interface DealerMessageEvent {
  id: string;
  boxId?: string;
  type: "dealer_message";
  createdAt: string;
  content: string;
}

export interface SeatSnapshotEvent {
  id: string;
  boxId: string;
  type: "seat_snapshot";
  createdAt: string;
  seatNumber: number;
  seat: SeatState;
}

export type GameEvent = ActionStartEvent | DiceRollPlaybackEvent | CombatPresentationEvent | DealerMessageEvent | SeatSnapshotEvent;

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
  committedCardCount?: number;
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

export interface PendingObjectChoiceState {
  boxId?: string;
  chooserSeatNumber: number;
  ownerSeatNumber: number;
  cardName: string;
  prompt: string;
  objectOptions: CardView[];
}

export interface PendingHandInspectionState {
  viewerSeatNumber: number;
  targetSeatNumber: number;
  cardName: string;
}

export interface PendingPublicHandRevealState {
  actorSeatNumber: number;
  targetSeatNumbers: number[];
  cardName: string;
  expiresAt: string;
  readySeatNumbers: number[];
  requiredReadySeatNumbers: number[];
}

export interface PendingBoardResetKeepState {
  chooserSeatNumber: number;
  cardName: string;
  keepCardCount: number;
  cardOptions: CardView[];
}

export interface PendingDeathSearchCorpseOption {
  seatNumber: number;
  displayName: string;
  cardCount: number;
}

export interface PendingDeathSearchCardOption extends CardView {
  source: "self" | "corpse";
  ownerSeatNumber: number;
  ownerDisplayName: string;
}

export interface PendingDeathSearchState {
  chooserSeatNumber?: number;
  cardName: string;
  keepCardCount: number;
  corpseOptions: PendingDeathSearchCorpseOption[];
  selectedCorpseSeatNumber?: number;
  cardOptions: PendingDeathSearchCardOption[];
}

export interface PendingPickpocketCardOption extends CardView {
  source: "hand" | "object";
  ownerSeatNumber: number;
  ownerDisplayName: string;
}

export interface PendingPickpocketState {
  chooserSeatNumber: number;
  targetSeatNumber: number;
  cardName: string;
  takeCardCount: number;
  cardOptions: PendingPickpocketCardOption[];
}

export interface PendingSacrificeChoiceState {
  actorSeatNumber: number;
  cardName: string;
  maxAmount: number;
}

export interface PendingCurseReleaseState {
  seatNumber: number;
  cardName: string;
  releaseCardName: string;
  releaseCardCount: number;
}

export interface ForcedFollowUpState {
  sourceCardName: string;
  actorSeatNumber: number;
  targetSeatNumber: number;
  allowedCategories: CardCategoryCode[];
  doubleHpLossDamage: boolean;
  consumeMode?: boolean;
}

export interface SeatSessionStats {
  seatNumber: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  healingReceived: number;
  biggestHit: number;
  biggestHeal: number;
  kills: number;
  cardsPlayed: number;
  activeCardsPlayed: number;
  inactiveCardsPlayed: number;
  responseCardsPlayed: number;
  objectsWorn: number;
  longestObjectHoldTurns: number;
  longestObjectHoldCardName: string | null;
  resistAttempts: number;
  resistSuccesses: number;
  resistCriticalSuccesses: number;
  resistFatalFailures: number;
  luckyRolls: number;
  unluckyRolls: number;
  neutralRolls: number;
  timesTargeted: number;
  lowestHpSurvived: number | null;
}

export interface MatchSessionStats {
  seatStats: SeatSessionStats[];
}

export interface GameState {
  turnNumber: number;
  currentTurnSeatNumber: number;
  minimumHandSize: number;
  deckCount: number;
  discardCount: number;
  discardTop?: CardView;
  viergeReplayCard?: CardView;
  lastPlayedCard?: PlayedCardState;
  diceRolls: DiceRollEvent[];
  presentationEvents: CombatPresentationEvent[];
  eventLog: GameEvent[];
  debugLog: DebugLogEntry[];
  pendingAction?: PendingActionState;
  pendingResponseOptions?: PendingActionOption[];
  pendingObjectChoice?: PendingObjectChoiceState;
  pendingHandInspection?: PendingHandInspectionState;
  pendingPublicHandReveal?: PendingPublicHandRevealState;
  pendingBoardResetKeep?: PendingBoardResetKeepState;
  pendingDeathSearch?: PendingDeathSearchState;
  pendingPickpocket?: PendingPickpocketState;
  pendingSacrificeChoice?: PendingSacrificeChoiceState;
  pendingCurseRelease?: PendingCurseReleaseState;
  forcedFollowUp?: ForcedFollowUpState;
  sessionStats: MatchSessionStats;
  winnerSeatNumber?: number;
}

export interface MatchState {
  instanceId: string;
  shortId: string;
  status: MatchStatus;
  maxSeats: number;
  enabledExpansions: MatchExpansionSettings;
  seats: SeatState[];
  spectators: SpectatorState[];
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
  localSeatNumber: number | null;
  playerSessionToken: string;
}

export interface MatchConfigResponse {
  discordClientId: string;
  enableDevTools: boolean;
}

export type BugReportStatus = "open" | "fixed" | "ignored";

export interface BugReportSummary {
  id: string;
  instanceId: string;
  shortId: string;
  status: BugReportStatus;
  createdAt: string;
  updatedAt: string;
  reporterDisplayName: string;
  reporterSeatNumber: number | null;
  turnNumber: number | null;
  currentTurnSeatNumber: number | null;
  descriptionPreview: string;
  runtimeLogDirectoryName: string;
  reportedFromBaseUrl: string | null;
}

export interface BugReportRecord extends BugReportSummary {
  reporterUserId: string;
  currentTurnDisplayName: string | null;
  matchStatus: MatchStatus;
  description: string;
}

export interface BugReportLogFile {
  filename: string;
  content: string;
}

export interface BugReportLogsResponse {
  reportId: string;
  instanceId: string;
  shortId: string;
  runtimeLogDirectoryName: string;
  reportedFromBaseUrl: string | null;
  serverLog: BugReportLogFile | null;
  matchState: BugReportLogFile | null;
  clientLogs: BugReportLogFile[];
}

export interface DisconnectRequest {
}

export interface AddBotRequest {
  difficulty?: string;
}

export interface StartMatchRequest {
}

export interface UpdateExpansionRequest {
  expansion: ExpansionKey;
  enabled: boolean;
}

export interface KickPlayerRequest {
  seatNumber: number;
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
  annulationCount?: number;
}

export interface PendingObjectChoiceRequest {
  objectInstanceId: string;
}

export interface PendingHandInspectionRequest {
}

export interface PendingPublicHandRevealReadyRequest {
}

export interface PendingBoardResetKeepRequest {
  cardInstanceId: string;
}

export interface PendingDeathSearchRequest {
  corpseSeatNumber?: number;
  keepCardInstanceIds?: string[];
  decline?: boolean;
}

export interface PendingPickpocketRequest {
  takeCardInstanceIds: string[];
}

export interface PendingSacrificeChoiceRequest {
  amount: number;
}

export interface PendingCurseReleaseRequest {
  choice: "accept" | "pass";
}

export interface CreateBugReportRequest {
  description: string;
}

export interface UpdateBugReportStatusRequest {
  status: BugReportStatus;
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
