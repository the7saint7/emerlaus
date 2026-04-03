import express from "express";
import type {
  AddBotRequest,
  DisconnectRequest,
  DiscordAuthTokenRequest,
  JoinRequest,
  MatchConfigResponse,
  SendChatMessageRequest,
  StartMatchRequest
} from "../shared/types";
import { config } from "./config";
import { exchangeDiscordCode } from "./services/discordOAuth";
import {
  addBot,
  disconnectPlayer,
  getMatchState,
  joinMatch,
  sendChatMessage,
  startMatch
} from "./services/matchService";
import { getPlayerSessionUserId } from "./store/playerSessionStore";

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

app.get("/api/matches/:instanceId", (request, response) => {
  response.json(getMatchState(request.params.instanceId));
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

app.listen(config.port, () => {
  console.log(`Emerlaus server listening on http://localhost:${config.port}`);
});
