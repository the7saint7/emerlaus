import { createEmptyMatch } from "../../shared/matchRules";
import type { StoredMatchState } from "../services/gameEngineTypes";

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

export function saveMatch(match: StoredMatchState): StoredMatchState {
  matches.set(match.instanceId, match);
  return match;
}
