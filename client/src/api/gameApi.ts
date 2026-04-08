import type {
  AnnounceDiceRollRequest,
  JoinResponse,
  KickPlayerRequest,
  LocalUserProfile,
  MatchConfigResponse,
  MatchState,
  PendingBoardResetKeepRequest,
  PendingCurseReleaseRequest,
  PendingHandInspectionRequest,
  PendingObjectChoiceRequest,
  PendingSacrificeChoiceRequest,
  PendingActionResponseRequest,
  PlayCardRequest
} from "../../../shared/types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function buildPlayerHeaders(playerSessionToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-player-session-token": playerSessionToken
  };
}

export async function fetchConfig(): Promise<MatchConfigResponse> {
  const response = await fetch("/api/config");
  return parseJson<MatchConfigResponse>(response);
}

export async function joinMatch(instanceId: string, profile: LocalUserProfile): Promise<JoinResponse> {
  const response = await fetch(`/api/matches/${instanceId}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  });

  return parseJson<JoinResponse>(response);
}

export async function fetchMatch(instanceId: string, playerSessionToken: string): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}`, {
    headers: buildPlayerHeaders(playerSessionToken)
  });
  return parseJson<MatchState>(response);
}

export async function requestAddBot(instanceId: string, playerSessionToken: string): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/host/add-bot`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({
      difficulty: "normal"
    })
  });

  return parseJson<MatchState>(response);
}

export async function requestStartMatch(instanceId: string, playerSessionToken: string): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/host/start`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({})
  });

  return parseJson<MatchState>(response);
}

export async function requestKickPlayer(
  instanceId: string,
  playerSessionToken: string,
  request: KickPlayerRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/host/kick-player`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function sendChatMessage(
  instanceId: string,
  playerSessionToken: string,
  content: string
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/chat`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({
      content
    })
  });

  return parseJson<MatchState>(response);
}

export async function disconnectFromMatch(instanceId: string, playerSessionToken: string): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/disconnect`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({})
  });

  return parseJson<MatchState>(response);
}

export async function playCard(
  instanceId: string,
  playerSessionToken: string,
  request: PlayCardRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/play-card`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function announceDiceRoll(
  instanceId: string,
  playerSessionToken: string,
  request: AnnounceDiceRollRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/dice-roll`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function devDrawCard(
  instanceId: string,
  playerSessionToken: string,
  cardId: string
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/dev/draw-card`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({ cardId })
  });
  return parseJson<MatchState>(response);
}

export interface DevRandomDiceResult {
  notation: string;
  total: number;
  values: number[];
  seatNumber: number;
}

export async function devRandomDiceRoll(
  instanceId: string,
  playerSessionToken: string,
  seatNumber: number
): Promise<DevRandomDiceResult> {
  const response = await fetch(`/api/matches/${instanceId}/dev/random-dice`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({ seatNumber })
  });
  return parseJson<DevRandomDiceResult>(response);
}

export async function respondToPendingAction(
  instanceId: string,
  playerSessionToken: string,
  request: PendingActionResponseRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/respond`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function selectPendingObject(
  instanceId: string,
  playerSessionToken: string,
  request: PendingObjectChoiceRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/select-object`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function acknowledgePendingHandInspection(
  instanceId: string,
  playerSessionToken: string,
  request: PendingHandInspectionRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/hand-inspection/ack`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function resolvePendingBoardResetKeep(
  instanceId: string,
  playerSessionToken: string,
  request: PendingBoardResetKeepRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/board-reset/keep`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function resolvePendingSacrificeChoice(
  instanceId: string,
  playerSessionToken: string,
  request: PendingSacrificeChoiceRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/sacrifice-choice`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function resolvePendingCurseRelease(
  instanceId: string,
  playerSessionToken: string,
  request: PendingCurseReleaseRequest
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/curse-release`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify(request)
  });

  return parseJson<MatchState>(response);
}

export async function passForcedFollowUp(
  instanceId: string,
  playerSessionToken: string
): Promise<MatchState> {
  const response = await fetch(`/api/matches/${instanceId}/forced-follow-up/pass`, {
    method: "POST",
    headers: buildPlayerHeaders(playerSessionToken),
    body: JSON.stringify({})
  });

  return parseJson<MatchState>(response);
}
