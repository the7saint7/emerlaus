import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BugReportLogsResponse,
  BugReportRecord,
  BugReportStatus,
  BugReportSummary,
  CreateBugReportRequest
} from "../../shared/types.js";
import type { StoredMatchState } from "./gameEngineTypes.js";
import {
  getInstanceLogDirPath,
  getInstanceLogDirectoryName,
  persistMatchLogs
} from "./localLogService.js";

const BUG_REPORT_ROOT = path.resolve(process.cwd(), "runtime-bug-reports");
const BUG_REPORT_SCHEMA_VERSION = 1;
const MAX_DESCRIPTION_LENGTH = 4_000;

interface StoredBugReportFile extends BugReportRecord {
  schemaVersion: number;
}

function ensureBugReportDir(): void {
  fs.mkdirSync(BUG_REPORT_ROOT, { recursive: true });
}

function bugReportPath(reportId: string): string {
  return path.join(BUG_REPORT_ROOT, `${reportId}.json`);
}

function normalizeDescription(description: string): string {
  return description.replace(/\r\n/g, "\n").trim();
}

function buildDescriptionPreview(description: string): string {
  const flattened = description.replace(/\s+/g, " ").trim();
  if (flattened.length <= 120) {
    return flattened;
  }

  return `${flattened.slice(0, 117).trimEnd()}...`;
}

function writeBugReport(record: BugReportRecord): void {
  ensureBugReportDir();
  const payload: StoredBugReportFile = {
    schemaVersion: BUG_REPORT_SCHEMA_VERSION,
    ...record
  };
  fs.writeFileSync(bugReportPath(record.id), JSON.stringify(payload, null, 2), "utf8");
}

function readBugReportFile(reportId: string): StoredBugReportFile {
  ensureBugReportDir();
  const filePath = bugReportPath(reportId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Unknown bug report: ${reportId}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as StoredBugReportFile;
}

function toRecord(file: StoredBugReportFile): BugReportRecord {
  const { schemaVersion: _schemaVersion, ...record } = file;
  return {
    ...record,
    reportedFromBaseUrl: record.reportedFromBaseUrl ?? null
  };
}

function toSummary(record: BugReportRecord): BugReportSummary {
  return {
    id: record.id,
    instanceId: record.instanceId,
    shortId: record.shortId,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    reporterDisplayName: record.reporterDisplayName,
    reporterSeatNumber: record.reporterSeatNumber,
    turnNumber: record.turnNumber,
    currentTurnSeatNumber: record.currentTurnSeatNumber,
    descriptionPreview: record.descriptionPreview,
    runtimeLogDirectoryName: record.runtimeLogDirectoryName,
    reportedFromBaseUrl: record.reportedFromBaseUrl
  };
}

export function createBugReport(
  match: StoredMatchState,
  userId: string,
  request: CreateBugReportRequest,
  reportedFromBaseUrl: string | null
): BugReportRecord {
  const description = normalizeDescription(request.description);
  if (description === "") {
    throw new Error("Bug report description is required");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Bug report description must stay under ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  persistMatchLogs(match);

  const reporterSeat = match.seats.find((seat) => seat.userId === userId) ?? null;
  const currentTurnSeatNumber = match.internalGame?.currentTurnSeatNumber ?? null;
  const currentTurnDisplayName = currentTurnSeatNumber == null
    ? null
    : match.seats.find((seat) => seat.seatNumber === currentTurnSeatNumber)?.displayName ?? null;
  const now = new Date().toISOString();
  const record: BugReportRecord = {
    id: randomUUID(),
    instanceId: match.instanceId,
    shortId: match.shortId,
    status: "open",
    createdAt: now,
    updatedAt: now,
    reporterDisplayName: reporterSeat?.displayName ?? userId,
    reporterSeatNumber: reporterSeat?.seatNumber ?? null,
    turnNumber: match.internalGame?.turnNumber ?? null,
    currentTurnSeatNumber,
    descriptionPreview: buildDescriptionPreview(description),
    runtimeLogDirectoryName: getInstanceLogDirectoryName(match.instanceId, match.shortId),
    reportedFromBaseUrl,
    reporterUserId: userId,
    currentTurnDisplayName,
    matchStatus: match.status,
    description
  };

  writeBugReport(record);
  return record;
}

export function listBugReports(): BugReportSummary[] {
  ensureBugReportDir();
  return fs.readdirSync(BUG_REPORT_ROOT)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const file = JSON.parse(fs.readFileSync(path.join(BUG_REPORT_ROOT, entry), "utf8")) as StoredBugReportFile;
      return toSummary(toRecord(file));
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function readBugReport(reportId: string): BugReportRecord {
  return toRecord(readBugReportFile(reportId));
}

export function updateBugReportStatus(reportId: string, status: BugReportStatus): BugReportRecord {
  if (status !== "open" && status !== "fixed" && status !== "ignored") {
    throw new Error(`Unknown bug report status: ${status}`);
  }

  const current = toRecord(readBugReportFile(reportId));
  const nextRecord: BugReportRecord = {
    ...current,
    status,
    updatedAt: new Date().toISOString()
  };
  writeBugReport(nextRecord);
  return nextRecord;
}

function readLogFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

export function readBugReportLogs(reportId: string): BugReportLogsResponse {
  const report = readBugReport(reportId);
  const logDir = getInstanceLogDirPath(report.runtimeLogDirectoryName);
  const clientLogs = fs.existsSync(logDir)
    ? fs.readdirSync(logDir)
      .filter((entry) => entry.startsWith("client-") && entry.endsWith(".log"))
      .sort((left, right) => left.localeCompare(right))
      .map((filename) => ({
        filename,
        content: fs.readFileSync(path.join(logDir, filename), "utf8")
      }))
    : [];

  const serverLogContent = readLogFile(path.join(logDir, "server.log"));
  const matchStateContent = readLogFile(path.join(logDir, "match-state.json"));
  return {
    reportId: report.id,
    instanceId: report.instanceId,
    shortId: report.shortId,
    runtimeLogDirectoryName: report.runtimeLogDirectoryName,
    reportedFromBaseUrl: report.reportedFromBaseUrl,
    serverLog: serverLogContent == null ? null : { filename: "server.log", content: serverLogContent },
    matchState: matchStateContent == null ? null : { filename: "match-state.json", content: matchStateContent },
    clientLogs
  };
}
