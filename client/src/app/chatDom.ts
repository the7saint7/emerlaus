export interface ChatDomSnapshot {
  previousScrollTop: number;
  previousBottomOffset: number;
  shouldStickToBottom: boolean;
}

export function captureChatDomSnapshot(rootElement: HTMLDivElement): ChatDomSnapshot {
  const previousChatHistory = rootElement.querySelector<HTMLElement>("[data-chat-history='true']");

  return {
    previousScrollTop: previousChatHistory?.scrollTop ?? 0,
    previousBottomOffset: previousChatHistory == null
      ? 0
      : previousChatHistory.scrollHeight - previousChatHistory.scrollTop,
    shouldStickToBottom:
      previousChatHistory != null &&
      previousChatHistory.scrollHeight - previousChatHistory.scrollTop - previousChatHistory.clientHeight < 36
  };
}

export function restoreChatDomState(
  rootElement: HTMLDivElement,
  snapshot: ChatDomSnapshot,
  _expanded: boolean
): void {
  const chatHistory = rootElement.querySelector<HTMLElement>("[data-chat-history='true']");
  if (chatHistory != null) {
    if (snapshot.shouldStickToBottom) {
      chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
      chatHistory.scrollTop = Math.max(0, chatHistory.scrollHeight - snapshot.previousBottomOffset);
    }
  }
}
