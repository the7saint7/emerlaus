import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AddBotRequest,
  AnnounceDiceRollRequest,
  CreateBugReportRequest,
  DisconnectRequest,
  DiscordAuthTokenRequest,
  DevDrawCardRequest,
  JoinRequest,
  FireObjectRequest,
  KickPlayerRequest,
  MatchConfigResponse,
  UpdateExpansionRequest,
  PendingBoardResetKeepRequest,
  PendingDeathSearchRequest,
  PendingPickpocketRequest,
  PendingCurseReleaseRequest,
  PendingHandInspectionRequest,
  PendingObjectChoiceRequest,
  PendingOrdreInterruptRequest,
  PendingPublicHandRevealReadyRequest,
  PendingSacrificeChoiceRequest,
  PendingSorcellerieSacrificeChoiceRequest,
  PendingActionResponseRequest,
  PlayCardRequest,
  StartMatchRequest,
  UpdateBugReportStatusRequest
} from "../shared/types.js";
import type { SaveBaseDefenseBandMappingRequest } from "../shared/cards/types.js";
import type { SaveBaseCardDefinitionRequest } from "../shared/cards/types.js";
import type { DevCardCatalogId } from "../shared/cards/types.js";
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
  createBugReport,
  deleteBugReport,
  listBugReports,
  readBugReport,
  readBugReportLogs,
  updateBugReportStatus
} from "./services/bugReportService.js";
import {
  addBot,
  announceDiceRoll,
  devDrawCard,
  devRandomDiceRoll,
  disconnectPlayer,
  getMatchState,
  acknowledgeMatchHandInspection,
  acknowledgeMatchPublicHandReveal,
  joinMatch,
  kickPlayer,
  passMatchForcedFollowUp,
  fireMatchObject,
  playMatchCard,
  resolveMatchBoardResetKeep,
  resolveMatchDeathSearch,
  resolveMatchPickpocket,
  resolveMatchSacrificeChoice,
  resolveMatchSorcellerieSacrificeChoice,
  resolveMatchOrdreInterrupt,
  resolveMatchCurseRelease,
  respondMatchAction,
  selectMatchObject,
  updateExpansion,
  startMatch
} from "./services/matchService.js";
import { persistClientLogSnapshot } from "./services/localLogService.js";
import { getMatch } from "./store/matchStore.js";
import { canPlayerSessionUseDevCardPicker, getPlayerSessionUserId } from "./store/playerSessionStore.js";
import { addSseConnection, broadcastCursorMove } from "./store/sseStore.js";

const app = express();
const currentModuleUrl = typeof import.meta.url === "string" ? import.meta.url : null;
const currentDir = currentModuleUrl != null && currentModuleUrl.startsWith("file:")
  ? path.dirname(fileURLToPath(currentModuleUrl))
  : null;
const builtClientDir = currentDir == null
  ? null
  : [
      path.resolve(currentDir, "../dist/client"),
      path.resolve(currentDir, "../client"),
      path.resolve(currentDir, "../../client")
    ].find((candidate) => {
      return existsSync(path.join(candidate, "index.html")) && existsSync(path.join(candidate, "assets"));
    });

app.use(express.json());

app.get("/api/dev/bug-reports", (_request, response) => {
  try {
    response.json(listBugReports());
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to list bug reports"
    });
  }
});

app.get("/api/dev/bug-reports/:reportId", (request, response) => {
  try {
    response.json(readBugReport(request.params.reportId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to read bug report"
    });
  }
});

app.get("/api/dev/bug-reports/:reportId/logs", (request, response) => {
  try {
    response.json(readBugReportLogs(request.params.reportId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to read bug report logs"
    });
  }
});

app.post("/api/dev/bug-reports/:reportId/status", (request, response) => {
  try {
    const body = request.body as UpdateBugReportStatusRequest;
    response.json(updateBugReportStatus(request.params.reportId, body.status));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to update bug report status"
    });
  }
});

app.delete("/api/dev/bug-reports/:reportId", (request, response) => {
  try {
    deleteBugReport(request.params.reportId);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to delete bug report"
    });
  }
});

function requireDevToolsEnabled(
  _request: express.Request,
  response: express.Response,
  next: express.NextFunction
): void {
  if (config.enableDevTools) {
    next();
    return;
  }

  response.status(404).json({ error: "Not found" });
}

app.use("/api/dev", requireDevToolsEnabled);

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/config", (_request, response) => {
  const payload: MatchConfigResponse = {
    discordClientId: config.discordClientId,
    enableDevTools: config.enableDevTools,
    devCardPickerRoleOverrideEnabled: config.devCardPickerRoleIds.length > 0
  };

  response.json(payload);
});

app.get("/api/dev/base-defense-band-mappings", (_request, response) => {
  response.json(readBaseDefenseBandMappings());
});

app.get("/api/dev/base-cards", (_request, response) => {
  try {
    const catalogId = (_request.query.deck as DevCardCatalogId | undefined) ?? "base";
    if (catalogId !== "base" && catalogId !== "abondance" && catalogId !== "puissance" && catalogId !== "communion" && catalogId !== "sorcellerie") {
      throw new Error(`Unknown card catalog: ${catalogId}`);
    }
    response.json(readBaseCardCatalog(catalogId));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to read base card catalog"
    });
  }
});

app.post("/api/dev/base-cards/:cardId", (request, response) => {
  try {
    const body = request.body as SaveBaseCardDefinitionRequest;
    const catalogId = (request.query.deck as DevCardCatalogId | undefined) ?? "base";
    if (catalogId !== "base" && catalogId !== "abondance" && catalogId !== "puissance" && catalogId !== "communion" && catalogId !== "sorcellerie") {
      throw new Error(`Unknown card catalog: ${catalogId}`);
    }
    response.json(writeBaseCardDefinition(catalogId, request.params.cardId, body.card));
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

function requireDevCardPickerAccess(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
): void {
  if (config.enableDevTools) {
    next();
    return;
  }

  const token = request.header("x-player-session-token");
  if (token == null || token.trim() === "") {
    response.status(404).json({ error: "Not found" });
    return;
  }

  const instanceId = Array.isArray(request.params.instanceId)
    ? request.params.instanceId[0]
    : request.params.instanceId;
  if (canPlayerSessionUseDevCardPicker(instanceId, token)) {
    next();
    return;
  }

  response.status(404).json({ error: "Not found" });
}

function requestBaseUrl(request: express.Request): string | null {
  const forwardedProto = request.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.header("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = forwardedProto != null && forwardedProto !== ""
    ? forwardedProto
    : request.protocol;
  const host = forwardedHost != null && forwardedHost !== ""
    ? forwardedHost
    : request.get("host");
  if (host == null || host.trim() === "") {
    return null;
  }

  return `${protocol}://${host.trim()}`;
}

app.post("/api/matches/:instanceId/join", async (request, response) => {
  try {
    const body = request.body as JoinRequest;
    response.json(await joinMatch(request.params.instanceId, body));
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

app.post("/api/matches/:instanceId/host/expansion", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as UpdateExpansionRequest;
    response.json(updateExpansion(request.params.instanceId, userId, body.expansion, body.enabled));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to update expansion"
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

app.post("/api/matches/:instanceId/dev/draw-card", requireDevCardPickerAccess, (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const instanceId = Array.isArray(request.params.instanceId)
      ? request.params.instanceId[0]
      : request.params.instanceId;
    const { cardId, targetSeatNumber } = request.body as DevDrawCardRequest;
    response.json(devDrawCard(instanceId, userId, cardId, targetSeatNumber));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to draw card"
    });
  }
});

app.post("/api/matches/:instanceId/dev/random-dice", requireDevToolsEnabled, (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const instanceId = Array.isArray(request.params.instanceId)
      ? request.params.instanceId[0]
      : request.params.instanceId;
    const { seatNumber } = request.body as { seatNumber: number };
    response.json(devRandomDiceRoll(instanceId, userId, seatNumber));
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
      ? body.entries.filter((entry): entry is string => typeof entry === "string")
      : [];
    const matchForLog = getMatch(request.params.instanceId);
    const displayName = matchForLog?.seats.find((seat) => seat.userId === userId)?.displayName ?? userId;

    persistClientLogSnapshot(request.params.instanceId, matchForLog?.shortId, userId, displayName, entries);
    response.status(204).end();
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to persist client log"
    });
  }
});

app.post("/api/matches/:instanceId/bug-report", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as CreateBugReportRequest;
    const match = getMatch(request.params.instanceId);
    if (match == null) {
      throw new Error("Match not found");
    }
    const reporterSeat = match.seats.find((seat) => seat.userId === userId);
    if (reporterSeat == null) {
      throw new Error("Spectators cannot submit bug reports");
    }

    response.json(createBugReport(match, userId, body, requestBaseUrl(request)));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to save bug report"
    });
  }
});

app.post("/api/matches/:instanceId/cursor", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const match = getMatch(request.params.instanceId);
    if (match == null || !match.seats.some((seat) => seat.userId === userId)) {
      throw new Error("Spectators cannot broadcast cursor targeting");
    }
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

app.post("/api/matches/:instanceId/fire-object", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as FireObjectRequest;
    response.json(fireMatchObject(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to fire object"
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

app.post("/api/matches/:instanceId/ordre-interrupt", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingOrdreInterruptRequest;
    response.json(resolveMatchOrdreInterrupt(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to resolve Ordre d'Emmerlaus interrupt"
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

app.post("/api/matches/:instanceId/public-hand-reveal/ack", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingPublicHandRevealReadyRequest;
    response.json(acknowledgeMatchPublicHandReveal(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to acknowledge public hand reveal"
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

app.post("/api/matches/:instanceId/death-search", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingDeathSearchRequest;
    response.json(resolveMatchDeathSearch(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to resolve death search"
    });
  }
});

app.post("/api/matches/:instanceId/pickpocket", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingPickpocketRequest;
    response.json(resolveMatchPickpocket(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to resolve pickpocket"
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

app.post("/api/matches/:instanceId/sorcellerie-sacrifice-choice", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingSorcellerieSacrificeChoiceRequest;
    response.json(resolveMatchSorcellerieSacrificeChoice(request.params.instanceId, userId, body));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : "Unable to choose Sorcellerie sacrifice option"
    });
  }
});

app.post("/api/matches/:instanceId/curse-release", (request, response) => {
  try {
    const userId = requireAuthenticatedUserId(request);
    const body = request.body as PendingCurseReleaseRequest;
    response.json(resolveMatchCurseRelease(request.params.instanceId, userId, body));
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
  const builtTermsHtml = path.join(builtClientDir, "terms.html");
  const builtPrivacyHtml = path.join(builtClientDir, "privacy.html");
  const builtChangelogJson = path.join(builtClientDir, "changelog.json");
  const builtVersionJson = path.join(builtClientDir, "version.json");

  app.use("/assets", express.static(builtAssetsDir));

  app.get("/changelog.json", (_request, response) => {
    if (existsSync(builtChangelogJson)) {
      response.sendFile(builtChangelogJson);
      return;
    }

    response.status(404).json({ error: "Changelog not found" });
  });

  app.get("/version.json", (_request, response) => {
    if (existsSync(builtVersionJson)) {
      response.sendFile(builtVersionJson);
      return;
    }

    response.status(404).json({ error: "Version not found" });
  });

  app.get(["/terms", "/terms.html"], (_request, response) => {
    if (existsSync(builtTermsHtml)) {
      response.sendFile(builtTermsHtml);
      return;
    }

    response.status(404).send("Terms page not found");
  });

  app.get(["/privacy", "/privacy.html"], (_request, response) => {
    if (existsSync(builtPrivacyHtml)) {
      response.sendFile(builtPrivacyHtml);
      return;
    }

    response.status(404).send("Privacy page not found");
  });

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
