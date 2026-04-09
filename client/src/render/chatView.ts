import type { AppLanguage } from "../i18n";
import { t } from "../i18n";
import type { EventLogEntry } from "./eventLog";

interface ChatViewParams {
  entries: EventLogEntry[];
  language: AppLanguage;
  panelWidth: number;
  panelHeight: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatChatContent(content: string): string {
  return escapeHtml(content).replaceAll("\n", "<br />");
}

function renderMessage(message: EventLogEntry): string {
  return `
    <article class="chat-message">
      <div class="chat-bubble">
        <p>${formatChatContent(message.content)}</p>
      </div>
    </article>
  `;
}

export function renderChatView({ entries, language, panelWidth, panelHeight }: ChatViewParams): string {
  const messageMarkup =
    entries.length > 0
      ? entries.map((message) => renderMessage(message)).join("")
      : `<p class="chat-empty">${t(language, "chat.empty")}</p>`;
  const panelStyle = `style="--event-log-panel-width:${panelWidth}px; --event-log-panel-height:${panelHeight}px;"`;

  return `
    <section class="chat-panel chat-panel--expanded" data-chat-panel="true" ${panelStyle}>
      <header class="chat-header">
        <div>
          <strong>${t(language, "chat.title")}</strong>
          <span>${t(language, "chat.history.expanded")}</span>
        </div>
      </header>

      <div class="chat-history" data-chat-history="true">
        ${messageMarkup}
      </div>

      <button
        type="button"
        class="chat-resize-handle"
        data-action="resize-event-log"
        aria-label="Resize event log"
        title="Resize"
      ></button>
    </section>
  `;
}
