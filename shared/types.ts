export type MatchStatus = "lobby" | "in_progress" | "finished";

export type ControllerType = "human" | "bot";

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
  maxHp: number;
  connected: boolean;
  isHost: boolean;
  difficulty?: string;
  disconnectedUserId?: string;
}

export interface MatchState {
  instanceId: string;
  status: MatchStatus;
  maxSeats: number;
  seats: SeatState[];
  chatMessages: ChatMessage[];
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

export interface SendChatMessageRequest {
  content: string;
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
