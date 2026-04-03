import { randomUUID } from "node:crypto";

interface PlayerSession {
  instanceId: string;
  userId: string;
}

const sessionsByToken = new Map<string, PlayerSession>();
const tokenByPlayerKey = new Map<string, string>();

function buildPlayerKey(instanceId: string, userId: string): string {
  return `${instanceId}:${userId}`;
}

export function issuePlayerSession(instanceId: string, userId: string): string {
  revokePlayerSession(instanceId, userId);

  const token = randomUUID();
  sessionsByToken.set(token, { instanceId, userId });
  tokenByPlayerKey.set(buildPlayerKey(instanceId, userId), token);
  return token;
}

export function getPlayerSessionUserId(instanceId: string, token: string): string | undefined {
  const session = sessionsByToken.get(token);
  if (session == null || session.instanceId !== instanceId) {
    return undefined;
  }

  return session.userId;
}

export function revokePlayerSession(instanceId: string, userId: string): void {
  const playerKey = buildPlayerKey(instanceId, userId);
  const token = tokenByPlayerKey.get(playerKey);
  if (token == null) {
    return;
  }

  tokenByPlayerKey.delete(playerKey);
  sessionsByToken.delete(token);
}
