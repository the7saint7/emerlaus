import type { BugReportRecord, BugReportStatus, BugReportSummary } from "../../../shared/types";
import { loadStoredLanguage, persistLanguage, t, type AppLanguage } from "../i18n";
import { deleteBugReport, fetchBugReport, fetchBugReports, saveBugReportStatus } from "./bugReportsApi";
import { renderBugReportsView } from "./renderBugReportsView";

interface BugReportsState {
  language: AppLanguage;
  summaries: BugReportSummary[];
  selectedReportId: string;
  selectedReport: BugReportRecord | null;
  statusFilter: "all" | BugReportStatus;
  loadingList: boolean;
  loadingDetail: boolean;
  updatingStatus: boolean;
  deletingReport: boolean;
  errorMessage: string;
}

function filteredSummaries(state: BugReportsState): BugReportSummary[] {
  if (state.statusFilter === "all") {
    return state.summaries;
  }

  return state.summaries.filter((summary) => summary.status === state.statusFilter);
}

function buildCodexPrompt(report: BugReportRecord): string {
  const baseUrl = report.reportedFromBaseUrl ?? window.location.origin;
  const logsUrl = (() => {
    try {
      return new URL(`/api/dev/bug-reports/${report.id}/logs`, `${baseUrl}/`).toString();
    } catch {
      return `/api/dev/bug-reports/${report.id}/logs`;
    }
  })();

  return [
    `Please inspect session ${report.shortId} and analyze this bug report.`,
    "",
    `Session id: ${report.shortId}`,
    `Instance id: ${report.instanceId}`,
    `Base URL: ${baseUrl}`,
    `Logs endpoint: ${logsUrl}`,
    `Runtime logs folder: ${report.runtimeLogDirectoryName}`,
    report.turnNumber == null ? "Reported turn: unknown" : `Reported turn: ${report.turnNumber}`,
    "",
    "Reported bug:",
    report.description,
    "",
    "Use the saved logs endpoint for that session and explain the likely cause."
  ].join("\n");
}

async function writeToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText != null) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export async function createBugReportsApp(rootElement: HTMLDivElement): Promise<void> {
  const state: BugReportsState = {
    language: loadStoredLanguage(),
    summaries: [],
    selectedReportId: "",
    selectedReport: null,
    statusFilter: "all",
    loadingList: true,
    loadingDetail: false,
    updatingStatus: false,
    deletingReport: false,
    errorMessage: ""
  };

  const render = (): void => {
    rootElement.innerHTML = renderBugReportsView({
      language: state.language,
      summaries: filteredSummaries(state),
      selectedReportId: state.selectedReportId,
      selectedReport: state.selectedReport,
      statusFilter: state.statusFilter,
      loadingList: state.loadingList,
      loadingDetail: state.loadingDetail,
      updatingStatus: state.updatingStatus,
      deletingReport: state.deletingReport,
      errorMessage: state.errorMessage
    });
    bindEvents();
  };

  const loadReportDetail = async (reportId: string): Promise<void> => {
    state.selectedReportId = reportId;
    state.loadingDetail = true;
    state.errorMessage = "";
    render();

    try {
      state.selectedReport = await fetchBugReport(reportId);
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to load bug report";
    } finally {
      state.loadingDetail = false;
      render();
    }
  };

  const refreshList = async (): Promise<void> => {
    state.loadingList = true;
    state.errorMessage = "";
    render();

    try {
      state.summaries = await fetchBugReports();
      const visible = filteredSummaries(state);
      const nextSelectedId = visible.some((summary) => summary.id === state.selectedReportId)
        ? state.selectedReportId
        : visible[0]?.id ?? "";
      state.selectedReportId = nextSelectedId;
      if (nextSelectedId === "") {
        state.selectedReport = null;
      }
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to load bug reports";
    } finally {
      state.loadingList = false;
      render();
    }

    if (state.selectedReportId !== "") {
      await loadReportDetail(state.selectedReportId);
    }
  };

  const updateStatus = async (status: BugReportStatus): Promise<void> => {
    if (state.selectedReportId === "") {
      return;
    }

    state.updatingStatus = true;
    state.errorMessage = "";
    render();

    try {
      const updated = await saveBugReportStatus(state.selectedReportId, status);
      state.selectedReport = updated;
      state.summaries = state.summaries.map((summary) =>
        summary.id === updated.id
          ? {
              ...summary,
              status: updated.status,
              updatedAt: updated.updatedAt
            }
          : summary
      );
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to update bug report";
    } finally {
      state.updatingStatus = false;
      render();
    }
  };

  const removeReport = async (): Promise<void> => {
    if (state.selectedReportId === "") {
      return;
    }

    const reportId = state.selectedReportId;
    if (!window.confirm(t(state.language, "bugInbox.deleteConfirm"))) {
      return;
    }

    state.deletingReport = true;
    state.errorMessage = "";
    render();

    try {
      await deleteBugReport(reportId);
      state.summaries = state.summaries.filter((summary) => summary.id !== reportId);
      const visible = filteredSummaries(state);
      state.selectedReportId = visible[0]?.id ?? "";
      state.selectedReport = null;
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.deleteBugReport");
    } finally {
      state.deletingReport = false;
      render();
    }

    if (state.selectedReportId !== "") {
      await loadReportDetail(state.selectedReportId);
    }
  };

  const copyPrompt = async (reportId: string): Promise<void> => {
    state.errorMessage = "";
    render();

    try {
      const report = state.selectedReport?.id === reportId
        ? state.selectedReport
        : await fetchBugReport(reportId);
      if (report == null) {
        throw new Error("Unable to load bug report");
      }

      await writeToClipboard(buildCodexPrompt(report));
      if (state.selectedReport?.id !== reportId) {
        state.selectedReport = report;
        state.selectedReportId = report.id;
      }
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.copyBugPrompt");
    } finally {
      render();
    }
  };

  const bindEvents = (): void => {
    rootElement.querySelectorAll<HTMLButtonElement>("[data-bug-inbox-action='set-language']").forEach((button) => {
      button.addEventListener("click", () => {
        state.language = button.dataset.language === "en" ? "en" : "fr";
        persistLanguage(state.language);
        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-bug-inbox-action='refresh']")?.addEventListener("click", () => {
      void refreshList();
    });

    rootElement.querySelector<HTMLSelectElement>("[data-bug-inbox-action='set-filter']")?.addEventListener("change", (event) => {
      const nextValue = (event.currentTarget as HTMLSelectElement).value;
      state.statusFilter = nextValue === "open" || nextValue === "fixed" || nextValue === "ignored" ? nextValue : "all";
      const visible = filteredSummaries(state);
      if (!visible.some((summary) => summary.id === state.selectedReportId)) {
        state.selectedReportId = visible[0]?.id ?? "";
        state.selectedReport = null;
        render();
        if (state.selectedReportId !== "") {
          void loadReportDetail(state.selectedReportId);
        }
        return;
      }
      render();
    });

    rootElement.querySelectorAll<HTMLElement>("[data-bug-inbox-action='select-report']").forEach((element) => {
      const handleSelect = () => {
        const reportId = element.dataset.reportId ?? "";
        if (reportId !== "" && reportId !== state.selectedReportId) {
          void loadReportDetail(reportId);
        }
      };

      element.addEventListener("click", handleSelect);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelect();
        }
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-bug-inbox-action='copy-prompt']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const reportId = button.dataset.reportId ?? "";
        if (reportId !== "") {
          void copyPrompt(reportId);
        }
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-bug-inbox-action='mark-status']").forEach((button) => {
      button.addEventListener("click", () => {
        const status = button.dataset.status;
        if (status === "open" || status === "fixed" || status === "ignored") {
          void updateStatus(status);
        }
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-bug-inbox-action='delete-report']")?.addEventListener("click", () => {
      void removeReport();
    });
  };

  render();
  await refreshList();
}
