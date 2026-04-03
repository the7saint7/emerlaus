import { getLocalSeat, getOpponentSeats } from "../../../shared/seating";
import type { MatchState, SeatState } from "../../../shared/types";
import type { OpponentAnchor } from "./opponentLayout";
import { getOpponentAnchorsForPlayerCount } from "./opponentLayout";

interface TableViewParams {
  match: MatchState;
  localSeatNumber: number;
  errorMessage: string;
  chatMarkup: string;
  diceControlsMarkup: string;
}

function renderOpponentSeat(
  seat: SeatState,
  anchor: OpponentAnchor
): string {
  return `
    <article
      class="table-seat"
      style="left:${anchor.x}%; top:${anchor.y}%;"
    >
      <div class="seat-health-row">
        <div class="seat-health-bar">
          <span style="width:${(seat.hp / seat.maxHp) * 100}%"></span>
        </div>
        <span class="seat-health-numbers">${seat.hp}/${seat.maxHp}</span>
      </div>
      <img class="seat-avatar seat-avatar--table" src="${seat.avatarUrl}" alt="${seat.displayName}" />
      <div class="seat-meta">
        <strong>${seat.displayName}</strong>
        <span>Seat ${seat.seatNumber}</span>
        <span>${seat.handCount} cards</span>
        <span>${seat.controllerType === "bot" ? "Bot" : seat.connected ? "Connected" : "Disconnected"}</span>
      </div>
    </article>
  `;
}

function renderHandCards(cardCount: number): string {
  return Array.from({ length: cardCount }, (_value, index) => {
    return `<div class="hand-card"><span>Card ${index + 1}</span></div>`;
  }).join("");
}

export function renderTableView({
  match,
  localSeatNumber,
  errorMessage,
  chatMarkup,
  diceControlsMarkup
}: TableViewParams): string {
  const localSeat = getLocalSeat(match, localSeatNumber);
  const opponents = getOpponentSeats(match, localSeatNumber);
  const anchors = getOpponentAnchorsForPlayerCount(match.seats.length);
  const seatMarkup = anchors.map((anchor, index) => {
    const seat = opponents[index];
    if (seat == null) {
      return "";
    }

    return renderOpponentSeat(seat, anchor);
  }).join("");

  return `
    <main class="shell shell--table">
      ${errorMessage ? `<p class="error-banner">${errorMessage}</p>` : ""}

      <section class="table-shell">
        <div class="table-actions">
          ${diceControlsMarkup}
          <button
            data-action="leave-match"
            class="action-button action-button--danger"
          >
            Leave Match
          </button>
        </div>

        <div class="table-surface">
          <div class="table-center-label">
            <span>Center Space</span>
            <small>Deck, discard pile, turn banner, and effects can live here later.</small>
          </div>

          ${seatMarkup}

          <section class="local-hand-panel">
            <div class="hand-row">
              ${renderHandCards(Math.max(localSeat?.handCount ?? 0, 4))}
            </div>
          </section>
        </div>

        <aside class="local-hp-panel">
          <strong>${localSeat?.hp ?? 10}/${localSeat?.maxHp ?? 50}</strong>
        </aside>

        ${chatMarkup}
      </section>
    </main>
  `;
}
