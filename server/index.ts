import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AddBotRequest,
  AnnounceDiceRollRequest,
  DisconnectRequest,
  DiscordAuthTokenRequest,
  JoinRequest,
  KickPlayerRequest,
  MatchConfigResponse,
  PendingBoardResetKeepRequest,
  PendingCurseReleaseRequest,
  PendingHandInspectionRequest,
  PendingObjectChoiceRequest,
  PendingSacrificeChoiceRequest,
  PendingActionResponseRequest,
  PlayCardRequest,
  StartMatchRequest
} from "../shared/types.js";
import type { SaveBaseDefenseBandMappingRequest } from "../shared/cards/types.js";
import type { SaveBaseCardDefinitionRequest } from "../shared/cards/types.js";
import { config } from "./config.js";
import {
  readBaseCardCatalog,
  writeBaseCardDefinition
} from "./services/baseCardCatalogService.js";
import {
  readBaseDefenseBandMappings,
  writeBaseDefenseBandMapping
} from "./services/baseDefenseBandMappingService.js";
import { exchangeDiscordCode } from "./services/discordOAuth.js";
import {
  addBot,
  announceDiceRoll,
  devDrawCard,
  devRandomDiceRoll,
  disconnectPlayer,
  getMatchState,
  acknowledgeMatchHandInspection,
  joinMatch,
  kickPlayer,
  passMatchForcedFollowUp,
  playMatchCard,
  resolveMatchBoardResetKeep,
  resolveMatchSacrificeChoice,
  resolveMatchCurseRelease,
  respondMatchAction,
  selectMatchObject,
  startMatch
} from "./services/matchService.js";
import { persistClientLogSnapshot } from "./services/localLogService.js";
import { getMatch } from "./store/matchStore.js";
import { getPlayerSessionUserId } from "./store/playerSessionStore.js";
import { addSseConnection, broadcastCursorMove } from "./store/sseStore.js";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const builtClientDir = [
  path.resolve(currentDir, "../dist/client"),
  path.resolve(currentDir, "../client"),
  path.resolve(currentDir, "../../client")
].find((candidate) => {
  return existsSync(path.join(candidate, "index.html")) && existsSync(path.join(candidate, "assets"));
});

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

app.get("/api/dev/base-cards", (_request, response) => {
  try {
    response.json(readBaseCardCatalog());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to read base card catalog"
    });
  }
});

app.post("/api/dev/base-cards/:cardId", (request, response) => {
  try {
    const body = request.body as SaveBaseCardDefinitionRequest;
    response.json(writeBaseCardDefinition(request.params.cardId, body.card));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to save base card"
    });
  }
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

app.post("/api/matches/:instanceId/dev/random-dice", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const { seatNumber } = request.body as { seatNumber: number };
    response.json(devRandomDiceRoll(request.params.instanceId, userId, seatNumber));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to roll dice"
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

app.post("/api/matches/:instanceId/client-log", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as { entries?: unknown };
    const entries = Array.isArray(body.entries)
      ? body.entries.filter((entry): entry is string => typeof entry === "string").slice(-300)
      : [];
    const displayName =
      getMatch(request.params.instanceId)?.seats.find((seat) => seat.userId === userId)?.displayName ?? userId;

    persistClientLogSnapshot(request.params.instanceId, userId, displayName, entries);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to persist client log"
    });
  }
});

app.post("/api/matches/:instanceId/cursor", (request, response) => {
  try {
    const { seatNumber, targetSeatNumber } = request.body as { seatNumber: number; targetSeatNumber: number | null };
    broadcastCursorMove(request.params.instanceId, seatNumber, targetSeatNumber);
    response.status(204).end();
  } catch {
    response.status(400).end();
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

app.post("/api/matches/:instanceId/select-object", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingObjectChoiceRequest;
    response.json(selectMatchObject(request.params.instanceId, userId, body.objectInstanceId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to select object"
    });
  }
});

app.post("/api/matches/:instanceId/hand-inspection/ack", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const _body = request.body as PendingHandInspectionRequest;
    response.json(acknowledgeMatchHandInspection(request.params.instanceId, userId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to close hand inspection"
    });
  }
});

app.post("/api/matches/:instanceId/board-reset/keep", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingBoardResetKeepRequest;
    response.json(resolveMatchBoardResetKeep(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to keep card"
    });
  }
});

app.post("/api/matches/:instanceId/sacrifice-choice", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingSacrificeChoiceRequest;
    response.json(resolveMatchSacrificeChoice(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to choose sacrifice amount"
    });
  }
});

app.post("/api/matches/:instanceId/curse-release", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingCurseReleaseRequest;
    response.json(resolveMatchCurseRelease(request.params.instanceId, userId, body.choice));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to resolve curse release"
    });
  }
});

app.post("/api/matches/:instanceId/forced-follow-up/pass", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    response.json(passMatchForcedFollowUp(request.params.instanceId, userId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to pass forced follow-up"
    });
  }
});

if (builtClientDir != null) {
  const builtAssetsDir = path.join(builtClientDir, "assets");
  const builtIndexHtml = path.join(builtClientDir, "index.html");

  app.use("/assets", express.static(builtAssetsDir));

  app.get("/", (_request, response) => {
    response.sendFile(builtIndexHtml);
  });

  app.get("/index.html", (_request, response) => {
    response.sendFile(builtIndexHtml);
  });

  app.use((request, response, next) => {
    if (
      request.method !== "GET" ||
      request.path.startsWith("/api/") ||
      request.path === "/health" ||
      path.extname(request.path) !== ""
    ) {
      next();
      return;
    }

    response.sendFile(builtIndexHtml);
  });
}

app.listen(config.port, () => {
  const staticMessage =
    builtClientDir == null ? "no built client detected" : `serving ${builtClientDir}`;
  console.log(`Emerlaus server listening on http://localhost:${config.port} (${staticMessage})`);
});
