import { randomUUID } from "node:crypto";
import { buildAvatarDataUrl } from "../../shared/avatar.js";
import {
  assignHost,
  findNextOpenSeat,
  getSeatByUserId,
  seedSkeletonStats
} from "../../shared/matchRules.js";
import { baseCardDefinitionById } from "../../shared/cards/index.js";
import type {
  AddBotRequest,
  AnnounceDiceRollRequest,
  DisconnectRequest,
  ExpansionKey,
  JoinRequest,
  JoinResponse,
  KickPlayerRequest,
  MatchState,
  PendingBoardResetKeepRequest,
  PendingDeathSearchRequest,
  PendingPickpocketRequest,
  PendingSacrificeChoiceRequest,
  PendingActionResponseRequest,
  PlayCardRequest,
  SeatState,
  StartMatchRequest
} from "../../shared/types.js";
import {
  acknowledgePendingHandInspection,
  appendServerDebugLog,
  buildBotPendingResponse,
  buildBotPlayRequest,
  buildPublicMatchState,
  getCurrentTurnSeat,
  initializeMatchGame,
  passForcedFollowUp,
  passTurnWithoutPlaying,
  playCardFromHand,
  resolvePendingBoardResetKeep,
  resolvePendingDeathSearch,
  resolvePendingPickpocket,
  resolvePendingSacrificeChoice,
  resolvePendingCurseRelease,
  respondToPendingAction,
  selectPendingObject
} from "./gameEngine.js";
import type { StoredMatchState } from "./gameEngineTypes.js";
import { getMatch, getOrCreateMatch, saveMatch } from "../store/matchStore.js";
import { issuePlayerSession, revokePlayerSession } from "../store/playerSessionStore.js";
import { notifyMatchUpdated } from "../store/sseStore.js";

const MAX_CHAT_MESSAGES = 100;
const botTurnTimers = new Map<string, NodeJS.Timeout>();

function getBotTurnTimerKey(instanceId: string): string {
  return `${instanceId}:turn`;
}

function getBotResponderTimerKey(instanceId: string, seatNumber: number): string {
  return `${instanceId}:response:${seatNumber}`;
}

function buildAvatarFallback(displayName: string): string {
  return buildAvatarDataUrl(displayName);
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

  const pendingObjectChoice = match.internalGame?.pendingObjectChoice;
  if (pendingObjectChoice != null) {
    const chooserSeat = match.seats.find((seat) => seat.seatNumber === pendingObjectChoice.chooserSeatNumber);
    const ownerState = match.internalGame?.seatStates.find((seat) => seat.seatNumber === pendingObjectChoice.ownerSeatNumber);
    if (chooserSeat?.controllerType === "bot" && ownerState != null && ownerState.objects[0] != null) {
      const timerKey = `${instanceId}:object:${chooserSeat.seatNumber}`;
      if (!botTurnTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          botTurnTimers.delete(timerKey);
          const latestMatch = getMatch(instanceId);
          const latestChoice = latestMatch?.internalGame?.pendingObjectChoice;
          const latestChooser = latestMatch?.seats.find((seat) => seat.seatNumber === latestChoice?.chooserSeatNumber);
          const latestOwner = latestMatch?.internalGame?.seatStates.find((seat) => seat.seatNumber === latestChoice?.ownerSeatNumber);
          const object = latestOwner == null ? undefined : latestOwner.objects[Math.floor(Math.random() * latestOwner.objects.length)];
          if (latestMatch != null && latestChooser?.controllerType === "bot" && object != null) {
            selectPendingObject(latestMatch, latestChooser.userId, object.instanceId);
            saveMatch(latestMatch);
            notifyMatchUpdated(instanceId);
          }
          scheduleBotTurnIfNeeded(instanceId);
        }, 500 + Math.floor(Math.random() * 500));
        botTurnTimers.set(timerKey, timer);
      }
    }
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

      const delayMs = 500 + Math.floor(Math.random() * 1001);
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

        try {
          const botResponse = buildBotPendingResponse(latestMatch, responderSeat.seatNumber);
          if (botResponse != null) {
            respondToPendingAction(latestMatch, latestResponderSeat.userId, botResponse);
            saveMatch(latestMatch);
          }
        } catch (error) {
          appendServerDebugLog(
            latestMatch,
            "bot_ai",
            `Seat ${latestResponderSeat.seatNumber} response failed: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }

        scheduleBotTurnIfNeeded(instanceId);
      }, delayMs);

      botTurnTimers.set(timerKey, timer);
    }
    return;
  }

  const pendingCurseRelease = match.internalGame?.pendingCurseRelease;
  if (pendingCurseRelease != null) {
    const seat = match.seats.find((candidate) => candidate.seatNumber === pendingCurseRelease.seatNumber);
    if (seat?.controllerType === "bot") {
      const timerKey = `${instanceId}:curse:${seat.seatNumber}`;
      if (!botTurnTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          botTurnTimers.delete(timerKey);
          const latestMatch = getMatch(instanceId);
          const latestCurseRelease = latestMatch?.internalGame?.pendingCurseRelease;
          const latestSeat = latestMatch?.seats.find((candidate) => candidate.seatNumber === latestCurseRelease?.seatNumber);
          if (latestMatch != null && latestCurseRelease != null && latestSeat?.controllerType === "bot") {
            resolvePendingCurseRelease(latestMatch, latestSeat.userId, "accept");
            saveMatch(latestMatch);
            notifyMatchUpdated(instanceId);
          }
          scheduleBotTurnIfNeeded(instanceId);
        }, 450 + Math.floor(Math.random() * 400));
        botTurnTimers.set(timerKey, timer);
      }
    }
    return;
  }

  const pendingDeathSearch = match.internalGame?.pendingDeathSearch;
  if (pendingDeathSearch != null) {
    const seat = match.seats.find((candidate) => candidate.seatNumber === pendingDeathSearch.chooserSeatNumber);
    if (seat?.controllerType === "bot") {
      const timerKey = `${instanceId}:death-search:${seat.seatNumber}`;
      if (!botTurnTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          botTurnTimers.delete(timerKey);
          const latestMatch = getMatch(instanceId);
          const latestPending = latestMatch?.internalGame?.pendingDeathSearch;
          const latestSeat = latestMatch?.seats.find((candidate) => candidate.seatNumber === latestPending?.chooserSeatNumber);
          if (latestMatch != null && latestPending != null && latestSeat?.controllerType === "bot") {
            const selectedCorpseSeatNumber = latestPending.selectedCorpseSeatNumber
              ?? (latestPending.corpses.length === 1
                ? latestPending.corpses[0]?.seatNumber
                : [...latestPending.corpses].sort((left, right) => right.cards.length - left.cards.length)[0]?.seatNumber);
            const chooserState = latestMatch.internalGame?.seatStates.find((candidate) => candidate.seatNumber === latestPending.chooserSeatNumber);
            const selectedCorpse = latestPending.corpses.find((corpse) => corpse.seatNumber === selectedCorpseSeatNumber);
            const combinedCards = [
              ...(chooserState?.hand.filter((card) => card.instanceId !== latestPending.sourceCard.instanceId) ?? []),
              ...(selectedCorpse?.cards ?? [])
            ];
            resolvePendingDeathSearch(latestMatch, latestSeat.userId, {
              corpseSeatNumber: selectedCorpseSeatNumber,
              keepCardInstanceIds: combinedCards.slice(0, Math.min(5, combinedCards.length)).map((card) => card.instanceId)
            });
            saveMatch(latestMatch);
            notifyMatchUpdated(instanceId);
          }
          scheduleBotTurnIfNeeded(instanceId);
        }, 450 + Math.floor(Math.random() * 400));
        botTurnTimers.set(timerKey, timer);
      }
    }
    return;
  }

  const forcedFollowUp = match.internalGame?.forcedFollowUp;
  if (forcedFollowUp != null) {
    const forcedActor = match.seats.find((seat) => seat.seatNumber === forcedFollowUp.actorSeatNumber);
    if (forcedActor?.controllerType === "bot") {
      const timerKey = `${instanceId}:forced-follow-up:${forcedActor.seatNumber}`;
      if (!botTurnTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          botTurnTimers.delete(timerKey);
          const latestMatch = getMatch(instanceId);
          const latestForced = latestMatch?.internalGame?.forcedFollowUp;
          const latestActor = latestMatch?.seats.find((seat) => seat.seatNumber === latestForced?.actorSeatNumber);
          if (latestMatch != null && latestForced != null && latestActor?.controllerType === "bot") {
            try {
              const botRequest = buildBotPlayRequest(latestMatch, latestActor.seatNumber);
              if (botRequest != null) {
                playCardFromHand(latestMatch, latestActor.userId, botRequest);
              } else {
                passForcedFollowUp(latestMatch, latestActor.userId);
              }
            } catch (error) {
              appendServerDebugLog(
                latestMatch,
                "bot_ai",
                `Seat ${latestActor.seatNumber} forced follow-up failed: ${error instanceof Error ? error.message : "Unknown error"}`
              );
              passForcedFollowUp(latestMatch, latestActor.userId);
            }
            saveMatch(latestMatch);
            notifyMatchUpdated(instanceId);
          }
          scheduleBotTurnIfNeeded(instanceId);
        }, 500 + Math.floor(Math.random() * 1001));
        botTurnTimers.set(timerKey, timer);
      }
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

  const delayMs = 500 + Math.floor(Math.random() * 1001);
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

    try {
      const botRequest = buildBotPlayRequest(latestMatch, latestCurrentSeat.seatNumber);
      if (botRequest != null) {
        playCardFromHand(latestMatch, latestCurrentSeat.userId, botRequest);
      } else {
        appendServerDebugLog(
          latestMatch,
          "bot_ai",
          `Seat ${latestCurrentSeat.seatNumber} had no playable bot action; forcing turn advance`
        );
        passTurnWithoutPlaying(latestMatch, latestCurrentSeat.seatNumber, "bot had no playable action");
      }
    } catch (error) {
      appendServerDebugLog(
        latestMatch,
        "bot_ai",
        `Seat ${latestCurrentSeat.seatNumber} turn failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      passTurnWithoutPlaying(latestMatch, latestCurrentSeat.seatNumber, "bot action failed");
    }
    saveMatch(latestMatch);

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

export function updateExpansion(instanceId: string, userId: string, expansion: ExpansionKey, enabled: boolean): MatchState {
  const match = requireMatch(instanceId);
  requireHost(match, userId);

  if (match.status !== "lobby") {
    throw new Error("Expansion settings can only be changed before the game starts");
  }

  match.enabledExpansions[expansion] = enabled;
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

const DEV_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;

export interface DevRandomDiceResult {
  notation: string;
  total: number;
  values: number[];
  seatNumber: number;
}

export function devRandomDiceRoll(instanceId: string, userId: string, targetSeatNumber: number): DevRandomDiceResult {
  const match = requireMatch(instanceId);
  requireHumanSeat(match, userId);

  const sides = DEV_DICE_SIDES[Math.floor(Math.random() * DEV_DICE_SIDES.length)];
  const notation = `1D${sides}`;
  const values = [Math.floor(Math.random() * sides) + 1];
  const total = values.reduce((a, b) => a + b, 0);

  match.chatMessages.push({
    id: randomUUID(),
    userId: "dealer",
    displayName: "Dealer",
    avatarUrl: "",
    content: `[DEV] Seat ${targetSeatNumber} rolls ${notation} → expected ${total} (${values.join(" + ")})`,
    createdAt: new Date().toISOString()
  });

  if (match.internalGame != null) {
    match.internalGame.diceRolls.push({
      id: randomUUID(),
      seatNumber: targetSeatNumber,
      notation,
      total,
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
  notifyMatchUpdated(instanceId);

  return { notation, total, values, seatNumber: targetSeatNumber };
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

export function selectMatchObject(instanceId: string, userId: string, objectInstanceId: string): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  selectPendingObject(match, userId, objectInstanceId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function acknowledgeMatchHandInspection(instanceId: string, userId: string): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  acknowledgePendingHandInspection(match, userId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchBoardResetKeep(instanceId: string, userId: string, request: PendingBoardResetKeepRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  resolvePendingBoardResetKeep(match, userId, request.cardInstanceId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchDeathSearch(instanceId: string, userId: string, request: PendingDeathSearchRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  resolvePendingDeathSearch(match, userId, request);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchPickpocket(instanceId: string, userId: string, request: PendingPickpocketRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  resolvePendingPickpocket(match, userId, request);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchSacrificeChoice(instanceId: string, userId: string, request: PendingSacrificeChoiceRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  resolvePendingSacrificeChoice(match, userId, request.amount);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchCurseRelease(instanceId: string, userId: string, choice: "accept" | "pass"): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  resolvePendingCurseRelease(match, userId, choice);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function passMatchForcedFollowUp(instanceId: string, userId: string): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }

  clearBotTurnTimer(instanceId);
  passForcedFollowUp(match, userId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}
