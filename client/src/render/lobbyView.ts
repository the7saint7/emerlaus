import { getLocalSeat } from "../../../shared/seating";
import type { LocalUserProfile, MatchState } from "../../../shared/types";
import type { AppLanguage } from "../i18n";
import { t } from "../i18n";

interface LobbyViewParams {
  match: MatchState;
  localSeatNumber: number;
  currentUser: LocalUserProfile;
  sessionMode: "browser" | "discord";
  errorMessage: string;
  language: AppLanguage;
}

const EXPANSION_DECKS = [
  { key: "sorcellerie", label: "Sorcellerie", available: false },
  { key: "invocation", label: "Invocation", available: false },
  { key: "abondance", label: "Abondance", available: true },
  { key: "puissance", label: "Puissance", available: false },
  { key: "communion", label: "Communion", available: false },
  { key: "destin", label: "Destin", available: false },
  { key: "compagnons", label: "Compagnons", available: false },
  { key: "allies", label: "Alliés", available: false }
] as const;

export function renderLobbyView({
  match,
  localSeatNumber,
  currentUser,
  sessionMode,
  errorMessage,
  language
}: LobbyViewParams): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const hostSeat = match.seats.find((seat) => seat.isHost);
  const amHost = localSeat?.isHost === true;
  const expansionToggleMarkup = EXPANSION_DECKS.map((deck) => {
    const isEnabled = match.enabledExpansions[deck.key];
    const isInteractive = amHost && deck.available;
    const stateLabel = !deck.available
      ? t(language, "lobby.expansionDisabled")
      : isEnabled
        ? t(language, "lobby.expansionEnabled")
        : t(language, "lobby.expansionOff");
    return `
      <button
        type="button"
        class="expansion-toggle ${isEnabled ? "expansion-toggle--enabled" : ""}"
        data-action="${deck.available ? "toggle-expansion" : ""}"
        data-expansion-key="${deck.key}"
        aria-pressed="${isEnabled ? "true" : "false"}"
        ${isInteractive ? "" : "disabled"}
      >
        <span class="expansion-toggle__name">${deck.label}</span>
        <span class="expansion-toggle__state">${stateLabel}</span>
      </button>
    `;
  }).join("");

  const seatCards = Array.from({ length: match.maxSeats }, (_value, index) => {
    const seatNumber = index + 1;
    const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);

    if (seat == null) {
      return `
        <article class="lobby-seat lobby-seat--empty">
          <span class="seat-tag">${t(language, "seat.label", { seatNumber })}</span>
          <strong>${t(language, "lobby.openSeat")}</strong>
          <p>${t(language, "lobby.seatAvailable")}</p>
        </article>
      `;
    }

    return `
      <article class="lobby-seat">
        <span class="seat-tag">${t(language, "seat.label", { seatNumber })}</span>
        <img class="seat-avatar" src="${seat.avatarUrl}" alt="${seat.displayName}" />
        <strong>${seat.displayName}</strong>
        <p>${seat.controllerType === "bot" ? t(language, "seat.bot", { difficulty: seat.difficulty ?? "normal" }) : seat.connected ? t(language, "seat.connected") : t(language, "seat.disconnected")}</p>
        ${seat.isHost ? `<span class="host-chip">${t(language, "seat.host")}</span>` : ""}
      </article>
    `;
  }).join("");

  return `
    <main class="shell">
      <section class="hero-panel">
        <div>
          <p class="eyebrow">${t(language, "lobby.activity")}</p>
          <h1>${t(language, "lobby.title")}</h1>
          <p class="hero-copy">
            ${t(language, "lobby.copy")}
          </p>
        </div>
        <div class="status-stack">
          <span class="status-pill">${sessionMode === "discord" ? t(language, "lobby.discord") : t(language, "lobby.browser")}</span>
          <span class="status-pill">${t(language, "lobby.instance", { instanceId: match.instanceId })}</span>
          <span class="status-pill">${t(language, "lobby.seatsFilled", { filled: match.seats.length, max: match.maxSeats })}</span>
        </div>
      </section>

      <section class="control-panel">
        <div class="control-card">
          <h2>${t(language, "lobby.localPlayer")}</h2>
          <p>${currentUser.displayName}</p>
          <p>${t(language, "seat.label", { seatNumber: localSeatNumber })}</p>
        </div>
        <div class="control-card">
          <h2>${t(language, "lobby.host")}</h2>
          <p>${hostSeat?.displayName ?? t(language, "lobby.unassigned")}</p>
          <p>${amHost ? t(language, "lobby.hostControl") : t(language, "lobby.hostWaiting")}</p>
        </div>
        <div class="control-card control-card--actions">
          <button data-action="refresh" class="action-button action-button--secondary">${t(language, "lobby.refresh")}</button>
          <button data-action="add-bot" class="action-button" ${amHost ? "" : "disabled"}>${t(language, "lobby.addBot")}</button>
          <button data-action="start-match" class="action-button action-button--accent" ${amHost ? "" : "disabled"}>${t(language, "lobby.startMatch")}</button>
        </div>
      </section>

      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="lobby-grid">
        ${seatCards}
      </section>

      <section class="control-card lobby-expansions">
        <div class="lobby-expansions__header">
          <div>
            <h2>${t(language, "lobby.expansions")}</h2>
            <p>${t(language, "lobby.expansionsHint")}</p>
          </div>
          <span class="status-pill">${amHost ? t(language, "lobby.hostControl") : t(language, "lobby.hostWaiting")}</span>
        </div>
        <div class="lobby-expansions__row">
          ${expansionToggleMarkup}
        </div>
      </section>
    </main>
  `;
}
