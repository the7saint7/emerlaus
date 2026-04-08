import type { ChatMessage } from "../../../shared/types";
import type { AppLanguage } from "../i18n";
import { t } from "../i18n";

interface ChatViewParams {
  chatMessages: ChatMessage[];
  draft: string;
  expanded: boolean;
  language: AppLanguage;
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

function renderMessage(message: ChatMessage): string {
  return `
    <article class="chat-message">
      <img class="chat-avatar" src="${escapeHtml(message.avatarUrl)}" alt="${escapeHtml(message.displayName)}" />
      <div class="chat-bubble">
        <strong>${escapeHtml(message.displayName)}</strong>
        <p>${formatChatContent(message.content)}</p>
      </div>
    </article>
  `;
}

export function renderChatView({ chatMessages, draft, expanded, language }: ChatViewParams): string {
  const playerMessages = chatMessages.filter((message) => message.userId !== "dealer");
  const visibleMessages = expanded ? playerMessages : playerMessages.slice(-2);
  const messageMarkup =
    visibleMessages.length > 0
      ? visibleMessages.map((message) => renderMessage(message)).join("")
      : `<p class="chat-empty">${t(language, "chat.empty")}</p>`;

  return `
    <section class="chat-panel ${expanded ? "chat-panel--expanded" : "chat-panel--compact"}" data-chat-panel="true">
      <header class="chat-header">
        <div>
          <strong>${t(language, "chat.title")}</strong>
          <span>${expanded ? t(language, "chat.history.expanded") : t(language, "chat.history.recent")}</span>
        </div>
        <button
          data-action="${expanded ? "collapse-chat" : "expand-chat"}"
          class="chat-toggle"
          type="button"
        >
          ${expanded ? t(language, "chat.close") : t(language, "chat.open")}
        </button>
      </header>

      <button data-action="hide-chat" class="chat-hide-button" type="button">
        ${t(language, "chat.hide")}
      </button>

      <div class="chat-history" data-chat-history="true">
        ${messageMarkup}
      </div>

      <form class="chat-composer" data-chat-form="true">
        <textarea
          class="chat-input"
          data-chat-input="true"
          rows="${expanded ? "3" : "2"}"
          placeholder="${escapeHtml(t(language, "chat.placeholder"))}"
        >${escapeHtml(draft)}</textarea>
        <button class="action-button chat-send-button" type="submit">${t(language, "chat.send")}</button>
      </form>
    </section>
  `;
}

export function renderHiddenChatButton(language: AppLanguage): string {
  return `
    <button data-action="show-chat" class="chat-dock-button" type="button">
      ${t(language, "chat.dock")}
    </button>
  `;
}
