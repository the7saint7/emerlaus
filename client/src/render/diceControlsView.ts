interface DiceControlsParams {
  disabled: boolean;
  statusText: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDiceControlsView({ disabled, statusText }: DiceControlsParams): string {
  return `
    <div class="dice-test-controls">
      <button
        data-action="roll-test-dice"
        class="action-button"
        ${disabled ? "disabled" : ""}
      >
        ${disabled ? "Rolling..." : "Test Roll"}
      </button>
      <span class="dice-test-status">${escapeHtml(statusText)}</span>
    </div>
  `;
}
