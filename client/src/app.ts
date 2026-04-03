import {
  disconnectFromMatch,
  fetchMatch,
  joinMatch,
  requestAddBot,
  requestStartMatch,
  sendChatMessage
} from "./api/gameApi";
import { captureChatDomSnapshot, restoreChatDomState } from "./app/chatDom";
import type { AppState } from "./app/state";
import {
  renderLeaveConfirmationModal,
  renderLeftMatchScreen,
  renderLoadingScreen
} from "./app/screens";
import { createDiscordSession } from "./discord/session";
import { diceController } from "./features/dice/diceController";
import { buildRandomTestDiceNotation } from "./features/dice/diceNotation";
import { renderChatView, renderHiddenChatButton } from "./render/chatView";
import { renderDiceControlsView } from "./render/diceControlsView";
import { renderLobbyView } from "./render/lobbyView";
import { renderTableView } from "./render/tableView";

export async function createApp(rootElement: HTMLDivElement): Promise<void> {
  const session = await createDiscordSession();
  const joined = await joinMatch(session.instanceId, session.currentUser);

  const state: AppState = {
    instanceId: session.instanceId,
    playerSessionToken: joined.playerSessionToken,
    match: joined.match,
    localSeatNumber: joined.localSeatNumber,
    errorMessage: "",
    confirmingLeave: false,
    leftMessage: "",
    chatDraft: "",
    chatExpanded: false,
    chatHidden: false,
    diceRolling: false,
    diceStatusText: "Temporary test roll button"
  };

  const syncMatch = async (): Promise<void> => {
    if (state.leftMessage !== "") {
      return;
    }

    state.match = await fetchMatch(state.instanceId);
    render();
  };

  const handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!state.chatExpanded || state.confirmingLeave) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-chat-panel='true']") == null) {
      state.chatExpanded = false;
      render();
    }
  };

  const leaveCurrentMatch = async (): Promise<void> => {
    try {
      await disconnectFromMatch(state.instanceId, state.playerSessionToken);
      state.errorMessage = "";
      state.confirmingLeave = false;

      if (session.mode === "browser") {
        state.instanceId = `local-dev-instance-${crypto.randomUUID()}`;
        const freshJoin = await joinMatch(state.instanceId, session.currentUser);
        state.playerSessionToken = freshJoin.playerSessionToken;
        state.match = freshJoin.match;
        state.localSeatNumber = freshJoin.localSeatNumber;
        state.leftMessage = "";
      } else {
        state.match = null;
        state.leftMessage = "Your seat was replaced by a bot. Start a new Activity session to enter a new lobby.";
      }
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to leave match";
    }

    render();
  };

  const sendCurrentChatMessage = async (): Promise<void> => {
    const content = state.chatDraft.trim();
    if (content.length === 0) {
      return;
    }

    try {
      state.match = await sendChatMessage(state.instanceId, state.playerSessionToken, content);
      state.chatDraft = "";
      state.chatExpanded = true;
      state.errorMessage = "";
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to send message";
    }

    render();
  };

  const render = (): void => {
    const chatSnapshot = captureChatDomSnapshot(rootElement);

    if (state.leftMessage !== "") {
      diceController.hide();
      rootElement.innerHTML = renderLeftMatchScreen(state.leftMessage);
      return;
    }

    if (state.match == null) {
      diceController.hide();
      rootElement.innerHTML = renderLoadingScreen();
      return;
    }

    const chatMarkup =
      state.match.status === "in_progress"
        ? state.chatHidden
          ? renderHiddenChatButton()
          : renderChatView({
              chatMessages: state.match.chatMessages,
              draft: state.chatDraft,
              expanded: state.chatExpanded
            })
        : "";

    const diceControlsMarkup =
      state.match.status === "in_progress"
        ? renderDiceControlsView({
            disabled: state.diceRolling,
            statusText: state.diceStatusText
          })
        : "";

    const baseView =
      state.match.status === "lobby"
        ? renderLobbyView({
            match: state.match,
            localSeatNumber: state.localSeatNumber,
            currentUser: session.currentUser,
            sessionMode: session.mode,
            errorMessage: state.errorMessage
          })
        : renderTableView({
            match: state.match,
            localSeatNumber: state.localSeatNumber,
            errorMessage: state.errorMessage,
            chatMarkup,
            diceControlsMarkup
          });

    rootElement.innerHTML = `${baseView}${renderLeaveConfirmationModal(state.confirmingLeave)}`;

    rootElement.querySelector<HTMLButtonElement>("[data-action='add-bot']")?.addEventListener("click", async () => {
      try {
        state.match = await requestAddBot(state.instanceId, state.playerSessionToken);
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : "Unable to add bot";
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='start-match']")?.addEventListener("click", async () => {
      try {
        state.match = await requestStartMatch(state.instanceId, state.playerSessionToken);
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : "Unable to start match";
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => {
      void syncMatch();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='roll-test-dice']")?.addEventListener("click", async () => {
      const notation = buildRandomTestDiceNotation();
      state.diceRolling = true;
      state.diceStatusText = `Rolling ${notation}`;
      render();

      try {
        const result = await diceController.roll(notation);
        state.diceStatusText = `${result.notation} = ${result.total} [${result.values.join(", ")}]`;
        state.errorMessage = "";
      } catch (error) {
        state.diceStatusText = "Dice roll failed";
        state.errorMessage = error instanceof Error ? error.message : "Unable to roll dice";
      } finally {
        state.diceRolling = false;
        render();
      }
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='leave-match']")?.addEventListener("click", () => {
      state.confirmingLeave = true;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='leave-cancel']")?.addEventListener("click", () => {
      state.confirmingLeave = false;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='leave-confirm']")?.addEventListener("click", () => {
      void leaveCurrentMatch();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='expand-chat']")?.addEventListener("click", () => {
      state.chatExpanded = true;
      render();
      rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']")?.focus();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='collapse-chat']")?.addEventListener("click", () => {
      state.chatExpanded = false;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='hide-chat']")?.addEventListener("click", () => {
      state.chatHidden = true;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='show-chat']")?.addEventListener("click", () => {
      state.chatHidden = false;
      render();
    });

    rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']")?.addEventListener("focus", () => {
      if (!state.chatExpanded) {
        state.chatExpanded = true;
        render();
        rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']")?.focus();
      }
    });

    rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']")?.addEventListener("input", (event) => {
      state.chatDraft = (event.currentTarget as HTMLTextAreaElement).value;
    });

    rootElement.querySelector<HTMLFormElement>("[data-chat-form='true']")?.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendCurrentChatMessage();
    });

    rootElement.querySelector<HTMLTextAreaElement>("[data-chat-input='true']")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendCurrentChatMessage();
      }
    });

    restoreChatDomState(rootElement, chatSnapshot, state.chatExpanded);

    if (state.match.status !== "in_progress") {
      diceController.hide();
    } else {
      void diceController.init();
    }

  };

  render();
  document.addEventListener("pointerdown", handleDocumentPointerDown);

  const pollInterval = window.setInterval(() => {
    void syncMatch();
  }, 3000);

  const unsubscribe = session.subscribeToParticipantUpdates(() => {
    void syncMatch();
  });

  window.addEventListener("beforeunload", () => {
    window.clearInterval(pollInterval);
    unsubscribe();
    document.removeEventListener("pointerdown", handleDocumentPointerDown);

    if (session.mode === "discord" && state.leftMessage === "") {
      void disconnectFromMatch(state.instanceId, state.playerSessionToken);
    }
  });
}
