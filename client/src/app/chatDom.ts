export interface ChatDomSnapshot {
  previousScrollTop: number;
  selectionEnd: number | null;
  selectionStart: number | null;
  shouldRestoreFocus: boolean;
  shouldStickToBottom: boolean;
}

export function captureChatDomSnapshot(rootElement: HTMLDivElement): ChatDomSnapshot {
  const previousChatInput = rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']");
  const previousChatHistory = rootElement.querySelector<HTMLElement>("[data-chat-history='true']");

  return {
    previousScrollTop: previousChatHistory?.scrollTop ?? 0,
    selectionEnd: previousChatInput?.selectionEnd ?? null,
    selectionStart: previousChatInput?.selectionStart ?? null,
    shouldRestoreFocus: previousChatInput != null && document.activeElement === previousChatInput,
    shouldStickToBottom:
      previousChatHistory != null &&
      previousChatHistory.scrollHeight - previousChatHistory.scrollTop - previousChatHistory.clientHeight < 36
  };
}

export function restoreChatDomState(
  rootElement: HTMLDivElement,
  snapshot: ChatDomSnapshot,
  expanded: boolean
): void {
  const chatHistory = rootElement.querySelector<HTMLElement>("[data-chat-history='true']");
  if (chatHistory != null && expanded) {
    if (snapshot.shouldStickToBottom) {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
      chatHistory.scrollTop = snapshot.previousScrollTop;
    }
  }

  if (!snapshot.shouldRestoreFocus) {
    return;
  }

  const currentChatInput = rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']");
  currentChatInput?.focus();

  if (
    currentChatInput != null &&
    snapshot.selectionStart != null &&
    snapshot.selectionEnd != null
  ) {
    currentChatInput.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}
