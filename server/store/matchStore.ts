import { createEmptyMatch } from "../../shared/matchRules.js";
import type { StoredMatchState } from "../services/gameEngineTypes.js";
import { persistMatchLogs } from "../services/localLogService.js";
import { notifyMatchUpdated } from "./sseStore.js";

const matches = new Map<string, StoredMatchState>();

export function getOrCreateMatch(instanceId: string): StoredMatchState {
  const existing = matches.get(instanceId);
  if (existing != null) {
    return existing;
  }

  const created = createEmptyMatch(instanceId);
  matches.set(instanceId, created);
  return created;
}

export function getMatch(instanceId: string): StoredMatchState | undefined {
  return matches.get(instanceId);
}

export function saveMatch(match: StoredMatchState, quiet = false): StoredMatchState {
  matches.set(match.instanceId, match);
  if (!quiet) {
    persistMatchLogs(match);
    notifyMatchUpdated(match.instanceId);
  }
  return match;
}
