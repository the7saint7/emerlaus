import { randomUUID } from "node:crypto";

interface PlayerSession {
  instanceId: string;
  userId: string;
  canUseDevCardPicker: boolean;
}

const sessionsByToken = new Map<string, PlayerSession>();
const tokenByPlayerKey = new Map<string, string>();

function buildPlayerKey(instanceId: string, userId: string): string {
  return `${instanceId}:${userId}`;
}

export function issuePlayerSession(
  instanceId: string,
  userId: string,
  options: { canUseDevCardPicker?: boolean } = {}
): string {
  revokePlayerSession(instanceId, userId);

  const token = randomUUID();
  sessionsByToken.set(token, {
    instanceId,
    userId,
    canUseDevCardPicker: options.canUseDevCardPicker === true
  });
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

export function canPlayerSessionUseDevCardPicker(instanceId: string, token: string): boolean {
  const session = sessionsByToken.get(token);
  if (session == null || session.instanceId !== instanceId) {
    return false;
  }

  return session.canUseDevCardPicker;
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
