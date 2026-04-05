import express from "express";
import type {
  AddBotRequest,
  AnnounceDiceRollRequest,
  DisconnectRequest,
  DiscordAuthTokenRequest,
  JoinRequest,
  KickPlayerRequest,
  MatchConfigResponse,
  PendingActionResponseRequest,
  PlayCardRequest,
  SendChatMessageRequest,
  StartMatchRequest
} from "../shared/types";
import type { SaveBaseDefenseBandMappingRequest } from "../shared/cards/types";
import { config } from "./config";
import {
  readBaseDefenseBandMappings,
  writeBaseDefenseBandMapping
} from "./services/baseDefenseBandMappingService";
import { exchangeDiscordCode } from "./services/discordOAuth";
import {
  addBot,
  announceDiceRoll,
  devDrawCard,
  disconnectPlayer,
  getMatchState,
  joinMatch,
  kickPlayer,
  playMatchCard,
  respondMatchAction,
  sendChatMessage,
  startMatch
} from "./services/matchService";
import { getPlayerSessionUserId } from "./store/playerSessionStore";
import { addSseConnection } from "./store/sseStore";

const app = express();

app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/config", (_request, response) => {
  const payload: MatchConfigResponse = {
    discordClientId: config.discordClientId
  };

  response.json(payload);
});

app.get("/api/dev/base-defense-band-mappings", (_request, response) => {
  response.json(readBaseDefenseBandMappings());
});

app.post("/api/dev/base-defense-band-mappings/:cardId", (request, response) => {
  try {
    const body = request.body as SaveBaseDefenseBandMappingRequest;
    response.json(writeBaseDefenseBandMapping(request.params.cardId, body.mapping));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to save defense band mapping"
    });
  }
});

app.post("/api/token", async (request, response) => {
  try {
    const body = request.body as DiscordAuthTokenRequest;
    const tokenResponse = await exchangeDiscordCode(body.code);
    response.json(tokenResponse);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Discord token exchange failed"
    });
  }
});

app.get("/api/matches/:instanceId/events", (request, response) => {
  const { instanceId } = request.params;

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  response.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  const keepAlive = setInterval(() => {
    response.write(": ping\n\n");
  }, 25000);

  const cleanup = addSseConnection(instanceId, response);

  request.on("close", () => {
    clearInterval(keepAlive);
    cleanup();
  });
});

app.get("/api/matches/:instanceId", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    response.json(getMatchState(request.params.instanceId, userId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to load match"
    });
  }
});

function requireAuthenticatedUserId(request: express.Request): string {
  const token = request.header("x-player-session-token");
  if (token == null || token.trim() === "") {
    throw new Error("Missing player session token");
  }

  const instanceId = Array.isArray(request.params.instanceId)
    ? request.params.instanceId[0]
    : request.params.instanceId;
  const userId = getPlayerSessionUserId(instanceId, token);
  if (userId == null) {
    throw new Error("Invalid player session token");
  }

  return userId;
}

app.post("/api/matches/:instanceId/join", (request, response) => {
  try {
    const body = request.body as JoinRequest;
    response.json(joinMatch(request.params.instanceId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to join match"
    });
  }
});

app.post("/api/matches/:instanceId/host/add-bot", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as AddBotRequest;
    response.json(addBot(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to add bot"
    });
  }
});

app.post("/api/matches/:instanceId/host/start", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as StartMatchRequest;
    response.json(startMatch(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to start match"
    });
  }
});

app.post("/api/matches/:instanceId/host/kick-player", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as KickPlayerRequest;
    response.json(kickPlayer(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to kick player"
    });
  }
});

app.post("/api/matches/:instanceId/dev/draw-card", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const { cardId } = request.body as { cardId: string };
    response.json(devDrawCard(request.params.instanceId, userId, cardId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to draw card"
    });
  }
});

app.post("/api/matches/:instanceId/disconnect", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as DisconnectRequest;
    response.json(disconnectPlayer(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to disconnect player"
    });
  }
});

app.post("/api/matches/:instanceId/chat", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as SendChatMessageRequest;
    response.json(sendChatMessage(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to send chat message"
    });
  }
});

app.post("/api/matches/:instanceId/dice-roll", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as AnnounceDiceRollRequest;
    response.json(announceDiceRoll(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to announce dice roll"
    });
  }
});

app.post("/api/matches/:instanceId/play-card", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PlayCardRequest;
    response.json(playMatchCard(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to play card"
    });
  }
});

app.post("/api/matches/:instanceId/respond", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingActionResponseRequest;
    response.json(respondMatchAction(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to respond to pending action"
    });
  }
});

app.listen(config.port, () => {
  console.log(`Emerlaus server listening on http://localhost:${config.port}`);
});
