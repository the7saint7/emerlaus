import { randomUUID } from "node:crypto";
import {
  assignHost,
  findNextOpenSeat,
  getSeatByUserId,
  seedSkeletonStats
} from "../../shared/matchRules";
import type {
  AddBotRequest,
  DisconnectRequest,
  JoinRequest,
  JoinResponse,
  MatchState,
  SeatState,
  SendChatMessageRequest,
  StartMatchRequest
} from "../../shared/types";
import { getMatch, getOrCreateMatch, saveMatch } from "../store/matchStore";
import { issuePlayerSession, revokePlayerSession } from "../store/playerSessionStore";

const MAX_CHAT_MESSAGES = 100;

function buildAvatarFallback(displayName: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(displayName)}`;
}

function cleanupReconnectedBotSeats(match: MatchState): void {
  const activeHumanIds = new Set(
    match.seats
      .filter((seat) => seat.controllerType === "human")
      .map((seat) => seat.userId)
  );

  match.seats = match.seats.filter((seat) => {
    if (seat.controllerType !== "bot" || seat.disconnectedUserId == null) {
      return true;
    }

    return !activeHumanIds.has(seat.disconnectedUserId);
  });
}

function findRejoinableBotSeat(match: MatchState, userId: string): SeatState | undefined {
  return match.seats.find(
    (seat) => seat.controllerType === "bot" && seat.disconnectedUserId === userId
  );
}

function requireMatch(instanceId: string): MatchState {
  const match = getMatch(instanceId);
  if (match == null) {
    throw new Error("Match not found");
  }

  return match;
}

function requireHost(match: MatchState, userId: string): void {
  const requesterSeat = getSeatByUserId(match, userId);
  if (requesterSeat == null || !requesterSeat.isHost) {
    throw new Error("Only the host can perform this action");
  }
}

function requireHumanSeat(match: MatchState, userId: string): SeatState {
  const seat = getSeatByUserId(match, userId);
  if (seat == null || seat.controllerType !== "human") {
    throw new Error("Only active human players can perform this action");
  }

  return seat;
}

function createBotSeat(match: MatchState, difficulty = "normal"): SeatState {
  const seatNumber = findNextOpenSeat(match);
  if (seatNumber == null) {
    throw new Error("No open seats remain");
  }

  const botIndex = match.seats.filter((seat) => seat.controllerType === "bot").length + 1;

  return {
    seatNumber,
    controllerType: "bot",
    userId: `bot-${randomUUID()}`,
    displayName: `Bot ${botIndex}`,
    avatarUrl: buildAvatarFallback(`Bot ${botIndex}`),
    handCount: 0,
    hp: 10,
    maxHp: 50,
    connected: true,
    isHost: false,
    difficulty
  };
}

export function joinMatch(instanceId: string, request: JoinRequest): JoinResponse {
  const match = getOrCreateMatch(instanceId);
  cleanupReconnectedBotSeats(match);

  const existingSeat = getSeatByUserId(match, request.userId);

  if (existingSeat != null) {
    existingSeat.displayName = request.displayName;
    existingSeat.avatarUrl = request.avatarUrl || buildAvatarFallback(request.displayName);
    existingSeat.connected = true;
    existingSeat.controllerType = "human";
    existingSeat.disconnectedUserId = undefined;
    saveMatch(match);

    return {
      match,
      localSeatNumber: existingSeat.seatNumber,
      playerSessionToken: issuePlayerSession(instanceId, request.userId)
    };
  }

  const rejoinableSeat = findRejoinableBotSeat(match, request.userId);
  if (rejoinableSeat != null) {
    rejoinableSeat.controllerType = "human";
    rejoinableSeat.userId = request.userId;
    rejoinableSeat.displayName = request.displayName;
    rejoinableSeat.avatarUrl = request.avatarUrl || buildAvatarFallback(request.displayName);
    rejoinableSeat.connected = true;
    rejoinableSeat.isHost = rejoinableSeat.isHost || match.seats.every((seat) => !seat.isHost);
    rejoinableSeat.disconnectedUserId = undefined;
    rejoinableSeat.difficulty = undefined;
    saveMatch(match);

    return {
      match,
      localSeatNumber: rejoinableSeat.seatNumber,
      playerSessionToken: issuePlayerSession(instanceId, request.userId)
    };
  }

  const seatNumber = findNextOpenSeat(match);
  if (seatNumber == null) {
    throw new Error("The table is full");
  }

  const seat: SeatState = {
    seatNumber,
    controllerType: "human",
    userId: request.userId,
    displayName: request.displayName,
    avatarUrl: request.avatarUrl || buildAvatarFallback(request.displayName),
    handCount: match.status === "in_progress" ? 4 : 0,
    hp: 10,
    maxHp: 50,
    connected: true,
    isHost: match.seats.length === 0
  };

  match.seats.push(seat);

  if (!match.seats.some((candidate) => candidate.isHost)) {
    assignHost(match, request.userId);
  }

  saveMatch(match);

  return {
    match,
    localSeatNumber: seatNumber,
    playerSessionToken: issuePlayerSession(instanceId, request.userId)
  };
}

export function getMatchState(instanceId: string): MatchState {
  const match = getOrCreateMatch(instanceId);
  cleanupReconnectedBotSeats(match);
  saveMatch(match);
  return match;
}

export function addBot(instanceId: string, userId: string, request: AddBotRequest): MatchState {
  const match = requireMatch(instanceId);
  requireHost(match, userId);

  if (match.status !== "lobby") {
    throw new Error("Bots can only be added before the game starts");
  }

  match.seats.push(createBotSeat(match, request.difficulty));
  saveMatch(match);
  return match;
}

export function startMatch(instanceId: string, userId: string, _request: StartMatchRequest): MatchState {
  const match = requireMatch(instanceId);
  requireHost(match, userId);

  if (match.status !== "lobby") {
    throw new Error("Match already started");
  }

  if (match.seats.length < 2) {
    throw new Error("At least two seats are required to start");
  }

  match.status = "in_progress";
  match.startedAt = new Date().toISOString();
  seedSkeletonStats(match);
  saveMatch(match);
  return match;
}

export function sendChatMessage(instanceId: string, userId: string, request: SendChatMessageRequest): MatchState {
  const match = requireMatch(instanceId);
  const seat = requireHumanSeat(match, userId);
  const content = request.content.trim();

  if (content.length === 0) {
    throw new Error("Chat message cannot be empty");
  }

  match.chatMessages.push({
    id: randomUUID(),
    userId: seat.userId,
    displayName: seat.displayName,
    avatarUrl: seat.avatarUrl,
    content: content.slice(0, 500),
    createdAt: new Date().toISOString()
  });

  if (match.chatMessages.length > MAX_CHAT_MESSAGES) {
    match.chatMessages = match.chatMessages.slice(-MAX_CHAT_MESSAGES);
  }

  saveMatch(match);
  return match;
}

export function disconnectPlayer(instanceId: string, userId: string, _request: DisconnectRequest): MatchState {
  const match = requireMatch(instanceId);
  const seat = getSeatByUserId(match, userId);
  if (seat == null) {
    return match;
  }

  const wasHost = seat.isHost;

  if (match.status === "lobby") {
    match.seats = match.seats.filter((candidate) => candidate.userId !== userId);
    revokePlayerSession(instanceId, userId);
  } else {
    const replacedName = seat.displayName;

    seat.controllerType = "bot";
    seat.difficulty = "normal";
    seat.disconnectedUserId = userId;
    seat.userId = `bot-${randomUUID()}`;
    seat.displayName = `${replacedName} (Bot)`;
    seat.avatarUrl = buildAvatarFallback(seat.displayName);
    seat.connected = true;
    seat.isHost = false;
    revokePlayerSession(instanceId, userId);
  }

  if (wasHost) {
    assignHost(match, undefined);
  }

  if (match.seats.every((candidate) => candidate.controllerType === "bot")) {
    match.status = "finished";
  }

  saveMatch(match);
  return match;
}
