import type { ChatMessage } from "../../../shared/types";

interface EventLogViewParams {
  messages: ChatMessage[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatContent(content: string): string {
  return escapeHtml(content).replaceAll("\n", "<br />");
}

export function renderEventLogView({ messages }: EventLogViewParams): string {
  const eventMessages = messages.filter((message) => message.userId === "dealer");
  const visibleMessages = eventMessages.slice(-20).reverse();

  return `
    <section class="event-log-panel">
      <header class="event-log-header">
        <strong>Event Log</strong>
        <span>Dealer and system events</span>
      </header>
      <div class="event-log-history">
        ${visibleMessages.length > 0
          ? visibleMessages.map((message) => `
            <article class="event-log-entry">
              <p>${formatContent(message.content)}</p>
            </article>
          `).join("")
          : `<p class="event-log-empty">No events yet.</p>`}
      </div>
    </section>
  `;
}
