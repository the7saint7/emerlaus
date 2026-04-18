import { t, type AppLanguage } from "../i18n";
import type { BugReportRecord, BugReportStatus, BugReportSummary } from "../../../shared/types";

export interface BugReportsViewParams {
  language: AppLanguage;
  summaries: BugReportSummary[];
  selectedReportId: string;
  selectedReport: BugReportRecord | null;
  statusFilter: "all" | BugReportStatus;
  loadingList: boolean;
  loadingDetail: boolean;
  updatingStatus: boolean;
  errorMessage: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function selected(value: string, candidate: string): string {
  return value === candidate ? "selected" : "";
}

function statusLabel(language: AppLanguage, status: BugReportStatus): string {
  switch (status) {
    case "open":
      return t(language, "bugInbox.open");
    case "fixed":
      return t(language, "bugInbox.fixed");
    case "ignored":
      return t(language, "bugInbox.ignored");
  }
}

function formatDate(language: AppLanguage, value: string): string {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function renderBugReportsView({
  language,
  summaries,
  selectedReportId,
  selectedReport,
  statusFilter,
  loadingList,
  loadingDetail,
  updatingStatus,
  errorMessage
}: BugReportsViewParams): string {
  return `
    <main class="mapper-screen bug-inbox-screen">
      <section class="mapper-topbar">
        <div>
          <p class="eyebrow">Dev Only</p>
          <h1>${escapeHtml(t(language, "bugInbox.title"))}</h1>
          <p class="hero-copy">${escapeHtml(t(language, "bugInbox.subtitle"))}</p>
        </div>
        <div class="mapper-stats bug-inbox-topbar__actions">
          <div class="pixi-language-switch">
            <button type="button" class="pixi-lang-button ${language === "fr" ? "pixi-lang-button--active" : ""}" data-bug-inbox-action="set-language" data-language="fr">FR</button>
            <button type="button" class="pixi-lang-button ${language === "en" ? "pixi-lang-button--active" : ""}" data-bug-inbox-action="set-language" data-language="en">EN</button>
          </div>
          <button type="button" class="action-button action-button--secondary" data-bug-inbox-action="refresh">${escapeHtml(t(language, "bugInbox.refresh"))}</button>
        </div>
      </section>

      ${errorMessage === "" ? "" : `<p class="error-banner">${escapeHtml(errorMessage)}</p>`}

      <section class="bug-inbox-controls">
        <label for="bug-inbox-filter">${escapeHtml(t(language, "bugInbox.filterLabel"))}</label>
        <select id="bug-inbox-filter" class="card-editor-picker" data-bug-inbox-action="set-filter">
          <option value="all" ${selected(statusFilter, "all")}>${escapeHtml(t(language, "bugInbox.filterAll"))}</option>
          <option value="open" ${selected(statusFilter, "open")}>${escapeHtml(t(language, "bugInbox.open"))}</option>
          <option value="fixed" ${selected(statusFilter, "fixed")}>${escapeHtml(t(language, "bugInbox.fixed"))}</option>
          <option value="ignored" ${selected(statusFilter, "ignored")}>${escapeHtml(t(language, "bugInbox.ignored"))}</option>
        </select>
      </section>

      <section class="bug-inbox-grid">
        <aside class="bug-inbox-list">
          ${loadingList
            ? `<p class="telepathy-empty">${escapeHtml(t(language, "bugInbox.loadingList"))}</p>`
            : summaries.length === 0
              ? `<p class="telepathy-empty">${escapeHtml(t(language, "bugInbox.empty"))}</p>`
              : summaries.map((summary) => `
                <article
                  class="bug-inbox-item ${summary.id === selectedReportId ? "bug-inbox-item--active" : ""}"
                  data-bug-inbox-action="select-report"
                  data-report-id="${summary.id}"
                  tabindex="0"
                >
                  <div class="bug-inbox-item__header">
                    <strong>${escapeHtml(summary.shortId)}</strong>
                    <span class="status-pill bug-inbox-status bug-inbox-status--${summary.status}">${escapeHtml(statusLabel(language, summary.status))}</span>
                  </div>
                  <span>${escapeHtml(summary.reporterDisplayName)}</span>
                  <p>${escapeHtml(summary.descriptionPreview)}</p>
                  <div class="bug-inbox-item__footer">
                    <small>${escapeHtml(formatDate(language, summary.createdAt))}</small>
                    <div class="bug-inbox-item__actions">
                      <button
                        type="button"
                        class="action-button action-button--secondary bug-inbox-item__action"
                        data-bug-inbox-action="copy-prompt"
                        data-report-id="${summary.id}"
                      >
                        ${escapeHtml(t(language, "bugInbox.copyPrompt"))}
                      </button>
                    </div>
                  </div>
                </article>
              `).join("")}
        </aside>

        <section class="bug-inbox-detail">
          ${loadingDetail
            ? `<p class="telepathy-empty">${escapeHtml(t(language, "bugInbox.loadingDetail"))}</p>`
            : selectedReport == null
              ? `<p class="telepathy-empty">${escapeHtml(t(language, "bugInbox.noSelection"))}</p>`
              : `
                <div class="bug-inbox-detail__header">
                  <div>
                    <p class="eyebrow">${escapeHtml(selectedReport.shortId)}</p>
                    <h2>${escapeHtml(selectedReport.shortId)} <span class="status-pill bug-inbox-status bug-inbox-status--${selectedReport.status}">${escapeHtml(statusLabel(language, selectedReport.status))}</span></h2>
                  </div>
                  <div class="modal-actions bug-inbox-detail__actions">
                    <button type="button" class="action-button action-button--secondary" data-bug-inbox-action="copy-prompt" data-report-id="${selectedReport.id}">${escapeHtml(t(language, "bugInbox.copyPrompt"))}</button>
                    <button type="button" class="action-button action-button--secondary" data-bug-inbox-action="mark-status" data-status="open" ${updatingStatus || selectedReport.status === "open" ? "disabled" : ""}>${escapeHtml(t(language, "bugInbox.markOpen"))}</button>
                    <button type="button" class="action-button action-button--secondary" data-bug-inbox-action="mark-status" data-status="fixed" ${updatingStatus || selectedReport.status === "fixed" ? "disabled" : ""}>${escapeHtml(t(language, "bugInbox.markFixed"))}</button>
                    <button type="button" class="action-button action-button--secondary" data-bug-inbox-action="mark-status" data-status="ignored" ${updatingStatus || selectedReport.status === "ignored" ? "disabled" : ""}>${escapeHtml(t(language, "bugInbox.markIgnored"))}</button>
                  </div>
                </div>

                <div class="bug-inbox-detail__meta">
                  <div><strong>${escapeHtml(t(language, "bugInbox.reportedBy"))}</strong><span>${escapeHtml(selectedReport.reporterDisplayName)}${selectedReport.reporterSeatNumber == null ? "" : ` (${escapeHtml(t(language, "seat.label", { seatNumber: selectedReport.reporterSeatNumber }))})`}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.session"))}</strong><span>${escapeHtml(selectedReport.shortId)} / ${escapeHtml(selectedReport.instanceId)}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.createdAt"))}</strong><span>${escapeHtml(formatDate(language, selectedReport.createdAt))}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.updatedAt"))}</strong><span>${escapeHtml(formatDate(language, selectedReport.updatedAt))}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.turn"))}</strong><span>${selectedReport.turnNumber == null ? "-" : escapeHtml(String(selectedReport.turnNumber))}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.currentTurn"))}</strong><span>${selectedReport.currentTurnDisplayName == null ? "-" : escapeHtml(`${selectedReport.currentTurnDisplayName}${selectedReport.currentTurnSeatNumber == null ? "" : ` (${t(language, "seat.label", { seatNumber: selectedReport.currentTurnSeatNumber })})`}`)}</span></div>
                  <div><strong>${escapeHtml(t(language, "bugInbox.logs"))}</strong><span>${escapeHtml(selectedReport.runtimeLogDirectoryName)}</span></div>
                </div>

                <div class="bug-inbox-detail__body">
                  <strong>${escapeHtml(t(language, "bugInbox.description"))}</strong>
                  <pre>${escapeHtml(selectedReport.description)}</pre>
                </div>
              `}
        </section>
      </section>
    </main>
  `;
}
