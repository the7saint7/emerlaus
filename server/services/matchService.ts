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
  PendingPublicHandRevealReadyRequest,
  PendingSacrificeChoiceRequest,
  PendingActionResponseRequest,
  PlayCardRequest,
  SeatState,
  SpectatorState,
  StartMatchRequest
} from "../../shared/types.js";
import {
  acknowledgePendingHandInspection,
  acknowledgePendingPublicHandReveal,
  appendServerDebugLog,
  buildBotPendingResponse,
  buildBotPlayRequest,
  buildPublicMatchState,
  getCurrentTurnSeat,
  initializeMatchGame,
  passForcedFollowUp,
  resolvePendingPublicHandReveal,
  passTurnWithoutPlaying,
  playCardFromHand,
  resolvePendingBoardResetKeep,
  resolvePendingDeathSearch,
  resolvePendingDeathSearchForBot,
  resolvePendingPickpocket,
  resolvePendingSacrificeChoice,
  resolvePendingCurseRelease,
  respondToPendingAction,
  selectPendingObject
} from "./gameEngine.js";
import type { StoredMatchState } from "./gameEngineTypes.js";
import { config } from "../config.js";
import { getMatch, getOrCreateMatch, saveMatch } from "../store/matchStore.js";
import { issuePlayerSession, revokePlayerSession } from "../store/playerSessionStore.js";
import { notifyMatchUpdated } from "../store/sseStore.js";
import { canUseDevCardPickerFromDiscordRole } from "./discordOAuth.js";

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

function isSpectator(match: StoredMatchState, userId: string): boolean {
  return match.spectators.some((spectator) => spectator.userId === userId);
}

function requireNotSpectator(match: StoredMatchState, userId: string): void {
  if (isSpectator(match, userId)) {
    throw new Error("Spectators cannot perform this action");
  }
}

function requireHumanSeat(match: StoredMatchState, userId: string): SeatState {
  requireNotSpectator(match, userId);
  const seat = getSeatByUserId(match, userId);
  if (seat == null || seat.controllerType !== "human") {
    throw new Error("Only active human players can perform this action");
  }

  return seat;
}

function findNextBotDisplayIndex(match: StoredMatchState): number {
  const usedIndexes = new Set<number>();
  for (const seat of match.seats) {
    const matchResult = seat.displayName.match(/^Bot (\d+)$/);
    if (matchResult == null) {
      continue;
    }

    const index = Number(matchResult[1]);
    if (Number.isInteger(index) && index > 0) {
      usedIndexes.add(index);
    }
  }

  for (let index = 1; index <= match.maxSeats; index += 1) {
    if (!usedIndexes.has(index)) {
      return index;
    }
  }

  return usedIndexes.size + 1;
}

function createBotSeat(match: StoredMatchState, difficulty = "normal"): SeatState {
  const seatNumber = findNextOpenSeat(match);
  if (seatNumber == null) {
    throw new Error("No open seats remain");
  }

  const botIndex = findNextBotDisplayIndex(match);

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

function createSpectator(request: JoinRequest): SpectatorState {
  return {
    userId: request.userId,
    displayName: request.displayName,
    avatarUrl: request.avatarUrl || buildAvatarFallback(request.displayName),
    joinedAt: new Date().toISOString()
  };
}

function upsertSpectator(match: StoredMatchState, request: JoinRequest): void {
  const existingSpectator = match.spectators.find((spectator) => spectator.userId === request.userId);
  if (existingSpectator != null) {
    existingSpectator.displayName = request.displayName;
    existingSpectator.avatarUrl = request.avatarUrl || buildAvatarFallback(request.displayName);
    return;
  }

  match.spectators.push(createSpectator(request));
}

function removeSpectator(match: StoredMatchState, userId: string): void {
  match.spectators = match.spectators.filter((spectator) => spectator.userId !== userId);
}

async function resolveDevCardPickerAccess(request: JoinRequest): Promise<boolean> {
  if (config.enableDevTools) {
    return true;
  }

  if (config.devCardPickerRoleIds.length === 0) {
    return false;
  }

  if (request.discordAccessToken == null || request.discordGuildId == null) {
    return false;
  }

  try {
    return await canUseDevCardPickerFromDiscordRole(request.discordAccessToken, request.discordGuildId);
  } catch (error) {
    console.warn(
      "Unable to resolve Discord role override for dev card picker:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

export async function joinMatch(instanceId: string, request: JoinRequest): Promise<JoinResponse> {
  const match = getOrCreateMatch(instanceId);
  cleanupReconnectedBotSeats(match);
  const canUseDevCardPicker = await resolveDevCardPickerAccess(request);

  const existingSeat = getSeatByUserId(match, request.userId);

  if (existingSeat != null) {
    existingSeat.displayName = request.displayName;
    existingSeat.avatarUrl = request.avatarUrl || buildAvatarFallback(request.displayName);
    existingSeat.connected = true;
    existingSeat.controllerType = "human";
    existingSeat.disconnectedUserId = undefined;
    removeSpectator(match, request.userId);
    saveMatch(match);

    return {
      match: buildPublicMatchState(match, request.userId),
      localSeatNumber: existingSeat.seatNumber,
      playerSessionToken: issuePlayerSession(instanceId, request.userId, { canUseDevCardPicker }),
      canUseDevCardPicker
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
    removeSpectator(match, request.userId);
    saveMatch(match);

    return {
      match: buildPublicMatchState(match, request.userId),
      localSeatNumber: rejoinableSeat.seatNumber,
      playerSessionToken: issuePlayerSession(instanceId, request.userId, { canUseDevCardPicker }),
      canUseDevCardPicker
    };
  }

  if (match.status !== "lobby") {
    upsertSpectator(match, request);
    saveMatch(match);

    return {
      match: buildPublicMatchState(match, request.userId),
      localSeatNumber: null,
      playerSessionToken: issuePlayerSession(instanceId, request.userId, { canUseDevCardPicker }),
      canUseDevCardPicker
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
    handCount: 0,
    hp: 50,
    connected: true,
    isHost: match.seats.length === 0
  };

  match.seats.push(seat);
  removeSpectator(match, request.userId);

  if (!match.seats.some((candidate) => candidate.isHost)) {
    assignHost(match, request.userId);
  }

  saveMatch(match);

  return {
    match: buildPublicMatchState(match, request.userId),
    localSeatNumber: seatNumber,
    playerSessionToken: issuePlayerSession(instanceId, request.userId, { canUseDevCardPicker }),
    canUseDevCardPicker
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
  const pendingPublicHandReveal = match.internalGame?.pendingPublicHandReveal;
  if (pendingPublicHandReveal != null) {
    const timerKey = `${instanceId}:public-hand-reveal`;
    for (const [key, timer] of botTurnTimers.entries()) {
      if (!key.startsWith(`${instanceId}:`) || key === timerKey) {
        continue;
      }

      clearTimeout(timer);
      botTurnTimers.delete(key);
    }
    if (!botTurnTimers.has(timerKey)) {
      const delayMs = Math.max(0, new Date(pendingPublicHandReveal.expiresAt).getTime() - Date.now());
      const timer = setTimeout(() => {
        botTurnTimers.delete(timerKey);
        const latestMatch = getMatch(instanceId);
        const latestReveal = latestMatch?.internalGame?.pendingPublicHandReveal;
        if (latestMatch != null && latestReveal != null) {
          resolvePendingPublicHandReveal(latestMatch);
          saveMatch(latestMatch);
          notifyMatchUpdated(instanceId);
        }
        scheduleBotTurnIfNeeded(instanceId);
      }, delayMs);
      botTurnTimers.set(timerKey, timer);
    }
    return;
  }

  if (pendingObjectChoice != null) {
    const chooserSeat = match.seats.find((seat) => seat.seatNumber === pendingObjectChoice.chooserSeatNumber);
    const ownerState = match.internalGame?.seatStates.find((seat) => seat.seatNumber === pendingObjectChoice.ownerSeatNumber);
    if (chooserSeat?.controllerType === "bot" && ownerState != null) {
      const timerKey = `${instanceId}:object:${chooserSeat.seatNumber}`;
      if (!botTurnTimers.has(timerKey)) {
        const timer = setTimeout(() => {
          botTurnTimers.delete(timerKey);
          const latestMatch = getMatch(instanceId);
          const latestChoice = latestMatch?.internalGame?.pendingObjectChoice;
          const latestChooser = latestMatch?.seats.find((seat) => seat.seatNumber === latestChoice?.chooserSeatNumber);
          const latestOwner = latestMatch?.internalGame?.seatStates.find((seat) => seat.seatNumber === latestChoice?.ownerSeatNumber);
          if (latestMatch != null && latestChoice != null && latestChooser?.controllerType === "bot" && latestOwner != null) {
            try {
              if (latestChoice.mode === "mass_attack_staff_turn") {
                const staff = latestOwner.objects.find((card) => card.instanceId === latestChoice.sourceCard.instanceId);
                const amCards = latestOwner.hand.filter((card) => baseCardDefinitionById[card.cardId]?.category.code === "AM");
                const shouldLoad = amCards.length > 0 && (staff?.attachedCards?.length ?? 0) < 2 && Math.random() < 0.45;
                const choiceId = shouldLoad
                  ? amCards[Math.floor(Math.random() * amCards.length)]?.instanceId
                  : latestChoice.sourceCard.instanceId;
                if (choiceId != null) {
                  selectPendingObject(latestMatch, latestChooser.userId, choiceId);
                  saveMatch(latestMatch);
                  notifyMatchUpdated(instanceId);
                }
              } else {
                const object = latestOwner.objects[Math.floor(Math.random() * latestOwner.objects.length)];
                if (object != null) {
                  selectPendingObject(latestMatch, latestChooser.userId, object.instanceId);
                  saveMatch(latestMatch);
                  notifyMatchUpdated(instanceId);
                }
              }
            } catch (error) {
              appendServerDebugLog(
                latestMatch,
                "bot_ai",
                `Seat ${latestChooser.seatNumber} object choice failed: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }
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
    if (pendingResponders.length === 0) {
      // Some action flows pause with the pending action still present while a
      // follow-up state (for example Fouille de mort) takes over. Let the
      // scheduler fall through to those dedicated handlers.
    } else {
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
            try {
              resolvePendingDeathSearchForBot(latestMatch, latestSeat.seatNumber);
              saveMatch(latestMatch);
              notifyMatchUpdated(instanceId);
            } catch (error) {
              appendServerDebugLog(
                latestMatch,
                "bot_ai",
                `Seat ${latestSeat.seatNumber} death search failed: ${error instanceof Error ? error.message : "Unknown error"}`
              );
            }
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

    let attemptedBotCardName: string | undefined;
    try {
      const botRequest = buildBotPlayRequest(latestMatch, latestCurrentSeat.seatNumber);
      if (botRequest != null) {
        const actorSeatState = latestMatch.internalGame?.seatStates.find(
          (seatState) => seatState.seatNumber === latestCurrentSeat.seatNumber
        );
        const attemptedCardId = actorSeatState?.hand.find(
          (card) => card.instanceId === botRequest.cardInstanceId
        )?.cardId;
        attemptedBotCardName = attemptedCardId == null
          ? undefined
          : (baseCardDefinitionById[attemptedCardId]?.name ?? attemptedCardId);
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
      const attemptedCardLabel = attemptedBotCardName == null ? "" : ` with ${attemptedBotCardName}`;
      appendServerDebugLog(
        latestMatch,
        "bot_ai",
        `Seat ${latestCurrentSeat.seatNumber} turn failed${attemptedCardLabel}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      passTurnWithoutPlaying(
        latestMatch,
        latestCurrentSeat.seatNumber,
        attemptedBotCardName == null ? "bot action failed" : `bot action failed on ${attemptedBotCardName}`
      );
    }
    saveMatch(latestMatch);

    scheduleBotTurnIfNeeded(instanceId);
  }, delayMs);

  botTurnTimers.set(turnTimerKey, timer);
}

export function getMatchState(instanceId: string, viewerUserId?: string): MatchState {
  const match = getOrCreateMatch(instanceId);
  cleanupReconnectedBotSeats(match);
  const pendingPublicHandReveal = match.internalGame?.pendingPublicHandReveal;
  if (pendingPublicHandReveal != null && new Date(pendingPublicHandReveal.expiresAt).getTime() <= Date.now()) {
    resolvePendingPublicHandReveal(match);
  }
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


  saveMatch(match);
  notifyMatchUpdated(instanceId);

  return { notation, total, values, seatNumber: targetSeatNumber };
}

export function disconnectPlayer(instanceId: string, userId: string, _request: DisconnectRequest): MatchState {
  const match = requireMatch(instanceId);
  if (isSpectator(match, userId)) {
    removeSpectator(match, userId);
    revokePlayerSession(instanceId, userId);
    saveMatch(match);
    return buildPublicMatchState(match, userId);
  }

  const seat = getSeatByUserId(match, userId);
  if (seat == null) {
    return match;
  }

  const wasHost = seat.isHost;

  if (match.status === "lobby") {
    match.seats = match.seats.filter((candidate) => candidate.userId !== userId);
    revokePlayerSession(instanceId, userId);
  } else {
    const aliveSeatNumbersBeforeDisconnect = match.internalGame?.seatStates
      .filter((seatState) => seatState.alive)
      .map((seatState) => seatState.seatNumber)
      ?? [];
    replaceSeatWithBot(match, seat, "normal");
    revokePlayerSession(instanceId, userId);

    if (aliveSeatNumbersBeforeDisconnect.length === 2 && aliveSeatNumbersBeforeDisconnect.includes(seat.seatNumber)) {
      const winnerSeatNumber = aliveSeatNumbersBeforeDisconnect.find((seatNumber) => seatNumber !== seat.seatNumber);
      if (winnerSeatNumber != null && match.internalGame != null) {
        match.internalGame.winnerSeatNumber = winnerSeatNumber;
        match.status = "finished";
      }
    }
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

  if (match.status === "lobby" && targetSeat.controllerType === "bot") {
    match.seats = match.seats.filter((seat) => seat.seatNumber !== targetSeat.seatNumber);
    saveMatch(match);
    return buildPublicMatchState(match, userId);
  }

  if (targetSeat.controllerType !== "human") {
    throw new Error("Only human players can be kicked");
  }

  const kickedUserId = targetSeat.userId;
  replaceSeatWithBot(match, targetSeat, "normal");
  targetSeat.disconnectedUserId = undefined;
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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);
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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

  clearBotTurnTimer(instanceId);
  acknowledgePendingHandInspection(match, userId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function acknowledgeMatchPublicHandReveal(instanceId: string, userId: string, _request: PendingPublicHandRevealReadyRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }
  requireNotSpectator(match, userId);

  clearBotTurnTimer(instanceId);
  acknowledgePendingPublicHandReveal(match, userId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}

export function resolveMatchBoardResetKeep(instanceId: string, userId: string, request: PendingBoardResetKeepRequest): MatchState {
  const match = requireMatch(instanceId);
  if (match.status !== "in_progress") {
    throw new Error("The match is not in progress");
  }
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

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
  requireNotSpectator(match, userId);

  clearBotTurnTimer(instanceId);
  passForcedFollowUp(match, userId);
  saveMatch(match);
  scheduleBotTurnIfNeeded(instanceId);
  return buildPublicMatchState(match, userId);
}
