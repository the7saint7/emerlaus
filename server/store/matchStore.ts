import { createEmptyMatch } from "../../shared/matchRules";
import type { MatchState } from "../../shared/types";

const matches = new Map<string, MatchState>();

export function getOrCreateMatch(instanceId: string): MatchState {
  const existing = matches.get(instanceId);
  if (existing != null) {
    return existing;
  }

  const created = createEmptyMatch(instanceId);
  matches.set(instanceId, created);
  return created;
}

export function getMatch(instanceId: string): MatchState | undefined {
  return matches.get(instanceId);
}

export function saveMatch(match: MatchState): MatchState {
  matches.set(match.instanceId, match);
  return match;
}
