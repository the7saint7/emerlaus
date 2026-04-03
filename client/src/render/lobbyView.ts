import { getLocalSeat } from "../../../shared/seating";
import type { LocalUserProfile, MatchState } from "../../../shared/types";

interface LobbyViewParams {
  match: MatchState;
  localSeatNumber: number;
  currentUser: LocalUserProfile;
  sessionMode: "browser" | "discord";
  errorMessage: string;
}

export function renderLobbyView({
  match,
  localSeatNumber,
  currentUser,
  sessionMode,
  errorMessage
}: LobbyViewParams): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const hostSeat = match.seats.find((seat) => seat.isHost);
  const amHost = localSeat?.isHost === true;

  const seatCards = Array.from({ length: match.maxSeats }, (_value, index) => {
    const seatNumber = index + 1;
    const seat = match.seats.find((candidate) => candidate.seatNumber === seatNumber);

    if (seat == null) {
      return `
        <article class="lobby-seat lobby-seat--empty">
          <span class="seat-tag">Seat ${seatNumber}</span>
          <strong>Open Seat</strong>
          <p>Available for a player or a bot.</p>
        </article>
      `;
    }

    return `
      <article class="lobby-seat">
        <span class="seat-tag">Seat ${seatNumber}</span>
        <img class="seat-avatar" src="${seat.avatarUrl}" alt="${seat.displayName}" />
        <strong>${seat.displayName}</strong>
        <p>${seat.controllerType === "bot" ? `Bot • ${seat.difficulty ?? "normal"}` : seat.connected ? "Connected" : "Disconnected"}</p>
        ${seat.isHost ? `<span class="host-chip">Host</span>` : ""}
      </article>
    `;
  }).join("");

  return `
    <main class="shell">
      <section class="hero-panel">
        <div>
          <p class="eyebrow">Emerlaus Activity</p>
          <h1>Card Table Lobby</h1>
          <p class="hero-copy">
            Seats are fixed in match order. Your screen will always rotate the table so your own hand stays at the bottom.
          </p>
        </div>
        <div class="status-stack">
          <span class="status-pill">${sessionMode === "discord" ? "Discord Activity" : "Browser Mock Mode"}</span>
          <span class="status-pill">Instance ${match.instanceId}</span>
          <span class="status-pill">${match.seats.length}/${match.maxSeats} seats filled</span>
        </div>
      </section>

      <section class="control-panel">
        <div class="control-card">
          <h2>Local Player</h2>
          <p>${currentUser.displayName}</p>
          <p>Seat ${localSeatNumber}</p>
        </div>
        <div class="control-card">
          <h2>Host</h2>
          <p>${hostSeat?.displayName ?? "Unassigned"}</p>
          <p>${amHost ? "You control setup actions." : "Waiting for host actions."}</p>
        </div>
        <div class="control-card control-card--actions">
          <button data-action="refresh" class="action-button action-button--secondary">Refresh</button>
          <button data-action="add-bot" class="action-button" ${amHost ? "" : "disabled"}>Add Bot</button>
          <button data-action="start-match" class="action-button action-button--accent" ${amHost ? "" : "disabled"}>Start Match</button>
        </div>
      </section>

      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="lobby-grid">
        ${seatCards}
      </section>
    </main>
  `;
}
