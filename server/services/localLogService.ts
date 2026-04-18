import fs from "node:fs";
import path from "node:path";
import type { DebugLogEntry } from "../../shared/types.js";
import type { StoredMatchState } from "./gameEngineTypes.js";

const LOG_ROOT = path.resolve(process.cwd(), "runtime-logs");

export function sanitizePathSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "unknown";
  }

  return trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

export function getInstanceLogDirectoryName(instanceId: string, shortId?: string): string {
  return shortId != null
    ? `${shortId}-${sanitizePathSegment(instanceId)}`
    : sanitizePathSegment(instanceId);
}

function ensureInstanceLogDir(instanceId: string, shortId?: string): string {
  const folderName = getInstanceLogDirectoryName(instanceId, shortId);
  const instanceDir = path.join(LOG_ROOT, folderName);
  fs.mkdirSync(instanceDir, { recursive: true });
  return instanceDir;
}

function formatDebugLogEntries(entries: DebugLogEntry[]): string {
  return entries.map((entry) => `${entry.createdAt} [${entry.source}:${entry.scope}] ${entry.message}`).join("\n");
}

export function persistMatchLogs(match: StoredMatchState): void {
  if (match.internalGame == null) {
    return;
  }

  const instanceDir = ensureInstanceLogDir(match.instanceId, match.shortId);
  const currentTurnSeatNumber = match.internalGame.currentTurnSeatNumber;
  const currentTurnSeat = match.seats.find((seat) => seat.seatNumber === currentTurnSeatNumber);
  const snapshot = {
    instanceId: match.instanceId,
    status: match.status,
    createdAt: match.createdAt,
    startedAt: match.startedAt,
    currentTurnSeatNumber,
    currentTurnDisplayName: currentTurnSeat?.displayName ?? null,
    turnNumber: match.internalGame.turnNumber,
    pendingAction: match.internalGame.pendingAction == null
      ? null
      : {
          actorSeatNumber: match.internalGame.pendingAction.actorSeatNumber,
          targetSeatNumbers: match.internalGame.pendingAction.targetSeatNumbers,
          responseMode: match.internalGame.pendingAction.responseMode,
          responders: match.internalGame.pendingAction.responders.map((responder) => ({
            seatNumber: responder.seatNumber,
            state: responder.state,
            choice: responder.choice
          }))
        },
    pendingObjectChoice: match.internalGame.pendingObjectChoice == null
      ? null
      : {
          chooserSeatNumber: match.internalGame.pendingObjectChoice.chooserSeatNumber,
          ownerSeatNumber: match.internalGame.pendingObjectChoice.ownerSeatNumber,
          mode: match.internalGame.pendingObjectChoice.mode
        },
    pendingCurseRelease: match.internalGame.pendingCurseRelease == null
      ? null
      : {
          seatNumber: match.internalGame.pendingCurseRelease.seatNumber,
          sourceCardId: match.internalGame.pendingCurseRelease.sourceCardId
        },
    forcedFollowUp: match.internalGame.forcedFollowUp == null
      ? null
      : {
          actorSeatNumber: match.internalGame.forcedFollowUp.actorSeatNumber,
          targetSeatNumber: match.internalGame.forcedFollowUp.targetSeatNumber,
          sourceCardId: match.internalGame.forcedFollowUp.sourceCardId
        },
    seats: match.seats.map((seat) => {
      const storedSeat = match.internalGame?.seatStates.find((candidate) => candidate.seatNumber === seat.seatNumber);
      return {
        seatNumber: seat.seatNumber,
        displayName: seat.displayName,
        controllerType: seat.controllerType,
        connected: seat.connected,
        handCount: storedSeat?.hand.length ?? seat.handCount,
        objectCount: storedSeat?.objects.length ?? 0,
        statusCount: storedSeat?.statuses.length ?? 0,
        hp: seat.hp,
        isAlive: storedSeat?.alive ?? seat.isAlive ?? true
      };
    })
  };

  fs.writeFileSync(path.join(instanceDir, "server.log"), formatDebugLogEntries(match.internalGame.debugLog), "utf8");
  fs.writeFileSync(path.join(instanceDir, "match-state.json"), JSON.stringify(snapshot, null, 2), "utf8");
}

export function persistClientLogSnapshot(
  instanceId: string,
  shortId: string | undefined,
  userId: string,
  displayName: string,
  entries: string[]
): void {
  const instanceDir = ensureInstanceLogDir(instanceId, shortId);
  const fileLabel = `${sanitizePathSegment(displayName)}-${sanitizePathSegment(userId)}`;
  fs.writeFileSync(path.join(instanceDir, `client-${fileLabel}.log`), entries.join("\n"), "utf8");
}
