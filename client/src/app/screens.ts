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
