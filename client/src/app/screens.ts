export function renderLoadingScreen(): string {
  return `<main class="loading-screen">Loading match...</main>`;
}

export function renderLeftMatchScreen(message: string): string {
  return `
    <main class="left-match-screen">
      <section class="left-match-card">
        <h1>You left the match</h1>
        <p>${message}</p>
      </section>
    </main>
  `;
}

export function renderLeaveConfirmationModal(confirmingLeave: boolean): string {
  if (!confirmingLeave) {
    return "";
  }

  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>Are you sure?</h2>
        <p>Leaving the match will replace your seat with a bot.</p>
        <div class="modal-actions">
          <button data-action="leave-cancel" class="action-button action-button--secondary">Cancel</button>
          <button data-action="leave-confirm" class="action-button action-button--danger">Leave Match</button>
        </div>
      </section>
    </div>
  `;
}

export function renderKickConfirmationModal(playerName: string): string {
  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>Kick player?</h2>
        <p>${playerName} will be replaced by a bot.</p>
        <div class="modal-actions">
          <button data-action="kick-cancel" class="action-button action-button--secondary">No</button>
          <button data-action="kick-confirm" class="action-button action-button--danger">Yes</button>
        </div>
      </section>
    </div>
  `;
}

export function renderDiscardConfirmationModal(confirmingDiscard: boolean): string {
  if (!confirmingDiscard) {
    return "";
  }

  return `
    <div class="modal-backdrop">
      <section class="modal-card">
        <h2>Discard this card?</h2>
        <p>This will discard the card without using its effect.</p>
        <div class="modal-actions">
          <button data-action="discard-cancel" class="action-button action-button--secondary">No</button>
          <button data-action="discard-confirm" class="action-button action-button--danger">Yes</button>
        </div>
      </section>
    </div>
  `;
}
