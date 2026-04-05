import { createEmptyMatch } from "../../shared/matchRules";
import type { StoredMatchState } from "../services/gameEngineTypes";
import { notifyMatchUpdated } from "./sseStore";

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
    notifyMatchUpdated(match.instanceId);
  }
  return match;
}
