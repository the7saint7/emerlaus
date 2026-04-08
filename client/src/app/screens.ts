import type { AppLanguage } from "../i18n";
import { t } from "../i18n";

export function renderLoadingScreen(language: AppLanguage): string {
  return `<main class="loading-screen">${t(language, "loading.match")}</main>`;
}

export function renderLeftMatchScreen(message: string, language: AppLanguage): string {
  return `
    <main class="left-match-screen">
      <section class="left-match-card">
        <h1>${t(language, "left.title")}</h1>
        <p>${message}</p>
      </section>
    </main>
  `;
}

export function renderLeaveConfirmationModal(confirmingLeave: boolean, language: AppLanguage): string {
  if (!confirmingLeave) {
    return "";
  }

  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>${t(language, "leave.confirm.title")}</h2>
        <p>${t(language, "leave.confirm.body")}</p>
        <div class="modal-actions">
          <button data-action="leave-cancel" class="action-button action-button--secondary">${t(language, "common.cancel")}</button>
          <button data-action="leave-confirm" class="action-button action-button--danger">${t(language, "leave.confirm.action")}</button>
        </div>
      </section>
    </div>
  `;
}

export function renderKickConfirmationModal(playerName: string, language: AppLanguage): string {
  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>${t(language, "kick.confirm.title")}</h2>
        <p>${t(language, "kick.confirm.body", { playerName })}</p>
        <div class="modal-actions">
          <button data-action="kick-cancel" class="action-button action-button--secondary">${t(language, "defense.no")}</button>
          <button data-action="kick-confirm" class="action-button action-button--danger">${t(language, "defense.yes")}</button>
        </div>
      </section>
    </div>
  `;
}

export function renderDiscardConfirmationModal(confirmingDiscard: boolean, language: AppLanguage): string {
  if (!confirmingDiscard) {
    return "";
  }

  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>${t(language, "discard.confirm.title")}</h2>
        <p>${t(language, "discard.confirm.body")}</p>
        <div class="modal-actions">
          <button data-action="discard-cancel" class="action-button action-button--secondary">${t(language, "defense.no")}</button>
          <button data-action="discard-confirm" class="action-button action-button--danger">${t(language, "defense.yes")}</button>
        </div>
      </section>
    </div>
  `;
}
