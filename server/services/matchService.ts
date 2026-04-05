import { randomUUID } from "node:crypto";
import {
  assignHost,
  findNextOpenSeat,
  getSeatByUserId,
  seedSkeletonStats
} from "../../shared/matchRules";
import { baseCardDefinitionById } from "../../shared/cards";
import type {
  AddBotRequest,
  AnnounceDiceRollRequest,
  DisconnectRequest,
  JoinRequest,
  JoinResponse,
  KickPlayerRequest,
  MatchState,
  PendingActionResponseRequest,
  PlayCardRequest,
  SeatState,
  SendChatMessageRequest,
  StartMatchRequest
} from "../../shared/types";
import {
  appendServerDebugLog,
  buildBotPendingResponse,
  buildBotPlayRequest,
  buildPublicMatchState,
  getCurrentTurnSeat,
  initializeMatchGame,
  playCardFromHand,
  respondToPendingAction
} from "./gameEngine";
import type { StoredMatchState } from "./gameEngineTypes";
import { getMatch, getOrCreateMatch, saveMatch } from "../store/matchStore";
import { issuePlayerSession, revokePlayerSession } from "../store/playerSessionStore";

const MAX_CHAT_MESSAGES = 100;
const botTurnTimers = new Map<string, NodeJS.Timeout>();

function getBotTurnTimerKey(instanceId: string): string {
  return `${instanceId}:turn`;
}

function getBotResponderTimerKey(instanceId: string, seatNumber: number): string {
  return `${instanceId}:response:${seatNumber}`;
}

function buildAvatarFallback(displayName: string): string {
  return `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(displayName)}`;
}

function cleanupReconnectedBotSeats(match: StoredMatchState): void {
  if (match.status !== "lobby") {
    return;
  }

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

function findRejoinableBotSeat(match: StoredMatchState, userId: string): SeatState | undefined {
  return match.seats.find(
    (seat) => seat.controllerType === "bot" && seat.disconnectedUserId === userId
  );
}

function requireMatch(instanceId: string): StoredMatchState {
  const match = getMatch(instanceId);
  if (match == null) {
    throw new Error("Match not found");
  }

  return match;
}

function requireHost(match: StoredMatchState, userId: string): void {
  const requesterSeat = getSeatByUserId(match, userId);
  if (requesterSeat == null || !requesterSeat.isHost) {
    throw new Error("Only the host can perform this action");
  }
}

function requireHumanSeat(match: StoredMatchState, userId: string): SeatState {
  const seat = getSeatByUserId(match, userId);
  if (seat == null || seat.controllerType !== "human") {
    throw new Error("Only active human players can perform this action");
  }

  return seat;
}

function createBotSeat(match: StoredMatchState, difficulty = "normal"): SeatState {
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
    hp: 50,
    connected: true,
    isHost: false,
    difficulty
  };
}

function replaceSeatWithBot(match: StoredMatchState, seat: SeatState, difficulty = "normal"): void {
  const replacedName = seat.displayName;

  seat.controllerType = "bot";
  seat.difficulty = difficulty;
  seat.disconnectedUserId = seat.userId;
  seat.userId = `bot-${randomUUID()}`;
  seat.displayName = `${replacedName} (Bot)`;
  seat.avatarUrl = buildAvatarFallback(seat.displayName);
  seat.connected = true;
  seat.isHost = false;
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
      match: buildPublicMatchState(match, request.userId),
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
      match: buildPublicMatchState(match, request.userId),
      localSeatNumber: rejoinableSeat.seatNumber,
      playerSessionToken: issuePlayerSession(instanceId, request.userId)
    };
  }

  if (match.status !== "lobby") {
    throw new Error("You can only join a running match by reclaiming your previous seat");
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
    handCount: 0,
    hp: 50,
    connected: true,
    isHost: match.seats.length === 0
  };

  match.seats.push(seat);

  if (!match.seats.some((candidate) => candidate.isHost)) {
    assignHost(match, request.userId);
  }

  saveMatch(match);

  return {
    match: buildPublicMatchState(match, request.userId),
    localSeatNumber: seatNumber,
    playerSessionToken: issuePlayerSession(instanceId, request.userId)
  };
}

function clearBotTurnTimer(instanceId: string): void {
  for (const [key, timer] of botTurnTimers.entries()) {
    if (!key.startsWith(`${instanceId}:`)) {
      continue;
    }

    clearTimeout(timer);
    botTurnTimers.delete(key);
  }
}

function scheduleBotTurnIfNeeded(instanceId: string): void {
  const match = getMatch(instanceId);
  if (match == null || match.status !== "in_progress") {
    return;
  }

  const pendingAction = match.internalGame?.pendingAction;
  if (pendingAction != null) {
    const pendingResponders =
      pendingAction.responseMode === "collective"
        ? pendingAction.responders.filter((responder) => responder.state === "pending").slice(0, 1)
        : pendingAction.responders.filter((responder) => responder.state === "pending");
    const pendingBotResponders = pendingResponders
      .map((responder) => responder.seatNumber)
      .flatMap((seatNumber) => {
        const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);
        return seat?.controllerType === "bot" ? [{ seatNumber, userId: seat.userId }] : [];
      });

    for (const responderSeat of pendingBotResponders) {
      const timerKey = getBotResponderTimerKey(instanceId, responderSeat.seatNumber);
      if (botTurnTimers.has(timerKey)) {
        continue;
      }

      const delayMs = 1000 + Math.floor(Math.random() * 2001);
      const timer = setTimeout(() => {
        botTurnTimers.delete(timerKey);
        const latestMatch = getMatch(instanceId);
        if (latestMatch == null || latestMatch.status !== "in_progress") {
          return;
        }

        const latestResponderSeat = latestMatch.seats.find((seat) => seat.seatNumber === responderSeat.seatNumber);
        const latestPendingResponder = latestMatch.internalGame?.pendingAction?.responders
          .find((responder) => responder.seatNumber === responderSeat.seatNumber && responder.state === "pending");
        if (latestResponderSeat?.controllerType !== "bot" || latestPendingResponder == null) {
          scheduleBotTurnIfNeeded(instanceId);
          return;
        }

        const botResponse = buildBotPendingResponse(latestMatch, responderSeat.seatNumber);
        if (botResponse != null) {
          respondToPendingAction(latestMatch, latestResponderSeat.userId, botResponse);
          saveMatch(latestMatch);
        }

        scheduleBotTurnIfNeeded(instanceId);
      }, delayMs);

      botTurnTimers.set(timerKey, timer);
    }
    return;
  }

  const turnTimerKey = getBotTurnTimerKey(instanceId);
  if (botTurnTimers.has(turnTimerKey)) {
    return;
  }

  const currentSeat = getCurrentTurnSeat(match);
  if (currentSeat == null || currentSeat.controllerType !== "bot") {
    return;
  }

  const delayMs = 1000 + Math.floor(Math.random() * 2001);
  const timer = setTimeout(() => {
    botTurnTimers.delete(turnTimerKey);
    const latestMatch = getMatch(instanceId);
    if (latestMatch == null || latestMatch.status !== "in_progress") {
      return;
    }

    const latestCurrentSeat = getCurrentTurnSeat(latestMatch);
    if (latestCurrentSeat == null || latestCurrentSeat.controllerType !== "bot") {
      return;
    }

    const botRequest = buildBotPlayRequest(latestMatch, latestCurrentSeat.seatNumber);
    if (botRequest != null) {
      playCardFromHand(latestMatch, latestCurrentSeat.userId, botRequest);
      saveMatch(latestMatch);
    }

    scheduleBotTurnIfNeeded(instanceId);
  }, delayMs);

  botTurnTimers.set(turnTimerKey, timer);
}

export function getMatchState(instanceId: string, viewerUserId?: string): MatchState {
  const match = getOrCreateMatch(instanceId);
  cleanupReconnectedBotSeats(match);
  saveMatch(match, true);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, viewerUserId);
}

export function addBot(instanceId: string, userId: string, request: AddBotRequest): MatchState {
  const match = requireMatch(instanceId);
  requireHost(match, userId);

  if (match.status !== "lobby") {
    throw new Error("Bots can only be added before the game starts");
  }

  match.seats.push(createBotSeat(match, request.difficulty));
  saveMatch(match);
  return buildPublicMatchState(match, userId);
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
  initializeMatchGame(match);
  appendServerDebugLog(match, "session", `Match session started by ${userId} with ${match.seats.length} seats`);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
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
  return buildPublicMatchState(match, userId);
}

export function announceDiceRoll(instanceId: string, userId: string, request: AnnounceDiceRollRequest): MatchState {
  const match = requireMatch(instanceId);
  const seat = requireHumanSeat(match, userId);

  const notation = request.notation.trim().toUpperCase();
  if (notation.length === 0) {
    throw new Error("Dice notation is required");
  }

  const values = request.values.filter((value) => Number.isFinite(value)).slice(0, 20);
  const valuesSummary = values.length > 0 ? ` [${values.join(", ")}]` : "";

  match.chatMessages.push({
    id: randomUUID(),
    userId: "dealer",
    displayName: "Dealer",
    avatarUrl: "",
    content: `Dealer rolled ${notation}: ${request.total}${valuesSummary}`,
    createdAt: new Date().toISOString()
  });

  if (match.internalGame != null) {
    match.internalGame.diceRolls.push({
      id: randomUUID(),
      seatNumber: request.seatNumber ?? seat.seatNumber,
      notation,
      total: request.total,
      values,
      rolledAt: new Date().toISOString()
    });
    if (match.internalGame.diceRolls.length > 20) {
      match.internalGame.diceRolls = match.internalGame.diceRolls.slice(-20);
    }
  }

  if (match.chatMessages.length > MAX_CHAT_MESSAGES) {
    match.chatMessages = match.chatMessages.slice(-MAX_CHAT_MESSAGES);
  }

  saveMatch(match);
  return buildPublicMatchState(match, userId);
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
    replaceSeatWithBot(match, seat, "normal");
    revokePlayerSession(instanceId, userId);
  }

  if (wasHost) {
    assignHost(match, undefined);
  }

  if (match.seats.every((candidate) => candidate.controllerType === "bot")) {
    match.status = "finished";
  }

  saveMatch(match);
  clearBotTurnTimer(instanceId);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function kickPlayer(instanceId: string, userId: string, request: KickPlayerRequest): MatchState {
  const match = requireMatch(instanceId);
  requireHost(match, userId);

  const targetSeat = match.seats.find((seat) => seat.seatNumber === request.seatNumber);
  if (targetSeat == null) {
    throw new Error("Target seat not found");
  }

  if (targetSeat.isHost) {
    throw new Error("The host cannot kick their own seat");
  }

  if (targetSeat.controllerType !== "human") {
    throw new Error("Only human players can be kicked");
  }

  const kickedUserId = targetSeat.userId;
  replaceSeatWithBot(match, targetSeat, "normal");
  revokePlayerSession(instanceId, kickedUserId);

  saveMatch(match);
  clearBotTurnTimer(instanceId);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function playMatchCard(instanceId: string, userId: string, request: PlayCardRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  playCardFromHand(match, userId, request);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function devDrawCard(instanceId: string, userId: string, cardId: string): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }
  if (baseCardDefinitionById[cardId] == null) {
    throw new Error(`Unknown card: ${cardId}`);
  }

  const seat = requireHumanSeat(match, userId);
  const seatState = match.internalGame?.seatStates.find((s) => s.seatNumber === seat.seatNumber);
  if (seatState == null) {
    throw new Error("Seat state not found");
  }

  seatState.hand.push({ instanceId: randomUUID(), cardId });
  saveMatch(match);
  return buildPublicMatchState(match, userId);
}

export function respondMatchAction(instanceId: string, userId: string, request: PendingActionResponseRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  respondToPendingAction(match, userId, request);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}
