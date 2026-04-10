import {
  acknowledgePendingHandInspection,
  devDrawCard,
  devRandomDiceRoll,
  disconnectFromMatch,
  fetchMatch,
  joinMatch,
  passForcedFollowUp,
  persistClientLogSnapshot,
  playCard,
  requestAddBot,
  requestKickPlayer,
  requestUpdateExpansion,
  respondToPendingAction,
  resolvePendingBoardResetKeep,
  resolvePendingDeathSearch,
  resolvePendingPickpocket,
  resolvePendingSacrificeChoice,
  resolvePendingCurseRelease,
  requestStartMatch,
  selectPendingObject
} from "./api/gameApi";
import { captureChatDomSnapshot, restoreChatDomState } from "./app/chatDom";
import type { AppState, DragHoverTarget } from "./app/state";
import {
  renderAnnulationChoiceModal,
  renderDiscardConfirmationModal,
  renderKickConfirmationModal,
  renderLeaveConfirmationModal,
  renderLeftMatchScreen,
  renderLoadingScreen
} from "./app/screens";
import { createDiscordSession } from "./discord/session";
import { diceController, type DiceStagePlacement } from "./features/dice/diceController";
import { getSeatDiceColor } from "./features/dice/diceSeatColors";
import {
  loadStoredLanguage,
  localizeCardView,
  localizeMatchState,
  persistLanguage,
  renderLanguageToggle,
  t,
  type AppLanguage
} from "./i18n";
import { renderChatView } from "./render/chatView";
import { buildEventLogEntries } from "./render/eventLog";
import { renderLobbyView } from "./render/lobbyView";
import { renderTableView } from "./render/tableView";
import { baseCardDefinitionById } from "../../shared/cards";
import type { CardView, ExpansionKey, GameEvent, MatchState } from "../../shared/types";

export async function createApp(rootElement: HTMLDivElement): Promise<void> {
  const CARD_FLIGHT_DURATION_MS = 420;
  const CARD_FLIGHT_WIDTH = 112;
  const CARD_FLIGHT_HEIGHT = 156;
  const DEFAULT_EVENT_LOG_PANEL_WIDTH = 380;
  const DEFAULT_EVENT_LOG_PANEL_HEIGHT = 420;
  const session = await createDiscordSession();
  const joined = await joinMatch(session.instanceId, session.currentUser);
  const initialLanguage = loadStoredLanguage();
  const eventLogSizeStorageKey = `emerlaus.eventLogSize.${session.mode}.${session.currentUser.userId}`;

  function clampEventLogPanelSize(width: number, height: number): { width: number; height: number } {
    return {
      width: Math.max(280, Math.min(Math.round(width), window.innerWidth - 36)),
      height: Math.max(220, Math.min(Math.round(height), window.innerHeight - 110))
    };
  }

  const loadStoredEventLogPanelSize = (): { width: number; height: number } => {
    try {
      const raw = window.localStorage.getItem(eventLogSizeStorageKey);
      if (raw == null) {
        return {
          width: DEFAULT_EVENT_LOG_PANEL_WIDTH,
          height: DEFAULT_EVENT_LOG_PANEL_HEIGHT
        };
      }

      const parsed = JSON.parse(raw) as { width?: number; height?: number };
      return clampEventLogPanelSize(
        Number.isFinite(parsed.width) ? parsed.width! : DEFAULT_EVENT_LOG_PANEL_WIDTH,
        Number.isFinite(parsed.height) ? parsed.height! : DEFAULT_EVENT_LOG_PANEL_HEIGHT
      );
    } catch {
      return clampEventLogPanelSize(DEFAULT_EVENT_LOG_PANEL_WIDTH, DEFAULT_EVENT_LOG_PANEL_HEIGHT);
    }
  };

  const initialEventLogPanelSize = loadStoredEventLogPanelSize();

  const state: AppState = {
    language: initialLanguage,
    instanceId: session.instanceId,
    playerSessionToken: joined.playerSessionToken,
    match: joined.match,
    localSeatNumber: joined.localSeatNumber,
    displayedHpBySeat: Object.fromEntries(joined.match.seats.map((seat) => [seat.seatNumber, seat.hp])),
    displayedAliveBySeat: Object.fromEntries(
      joined.match.seats.map((seat) => [seat.seatNumber, seat.isAlive !== false])
    ),
    draggingCardInstanceId: "",
    dragPointerX: 0,
    dragPointerY: 0,
    dragHoverTarget: null,
    arrowDrag: null,
    hoveredCardInstanceId: "",
    hoverZoomBlockedCardInstanceId: "",
    hoveredCenterSlotKind: "",
    telepathyPreviewCardInstanceId: "",
    boardResetKeepPreviewCardInstanceId: "",
    deathSearchPreviewCardInstanceId: "",
    deathSearchSelectedCardInstanceIds: [],
    pickpocketPreviewCardInstanceId: "",
    pickpocketSelectedCardInstanceIds: [],
    cardReferencePreviewCardId: "",
    cardReferenceSearchQuery: "",
    cardReferenceShowBase: true,
    cardReferenceShowAbondance: true,
    sacrificeAmountInput: "0",
    telepathyPanelScrollTop: 0,
    telepathyListScrollTop: 0,
    cardReferencePanelScrollTop: 0,
    cardReferenceListScrollTop: 0,
    inspectedSeatNumber: 0,
    seenGameEventIds: joined.match.game?.eventLog.map((event) => event.id) ?? [],
    seenEventMessageIds: buildEventLogEntries(joined.match, initialLanguage).map((entry) => entry.id),
    clientDebugLog: [],
    errorMessage: "",
    confirmingLeave: false,
    confirmingKickSeatNumber: 0,
    confirmingDiscardCardInstanceId: "",
    pendingAnnulationChoice: null,
    cardReferenceOpen: false,
    eventLogPanelWidth: initialEventLogPanelSize.width,
    eventLogPanelHeight: initialEventLogPanelSize.height,
    leftMessage: "",
    chatExpanded: true,
    eventPlaybackActive: false,
    activeActionVisual: null,
    centerResponseCards: [],
    activeCardFlight: null,
    activeReturnCardFlight: null,
    returningHandCardInstanceId: "",
    hiddenHandCardInstanceIds: [],
    activeCombatFx: null,
    activeDamageBursts: {},
    activeHealBursts: {},
    impactTargetSeatNumbers: [],
    opponentCursors: {}
  };
  let eventReplayChain = Promise.resolve();
  let activeReplayBatchCount = 0;
  let clientLogPersistTimer: number | null = null;
  let eventLogPanelPersistTimer: number | null = null;
  let discordSafetyPollInterval: number | null = null;
  let syncInFlight = false;
  let deferredSyncRequested = false;
  let clientLogDirty = false;
  let lastRealtimeActivityAt = Date.now();
  let victoryCelebrationVisible = false;
  let victoryRevealTimer: number | null = null;
  let victoryRevealWinnerSeatNumber: number | null = null;
  let eventLogResizeDrag:
    | {
      pointerId: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    }
    | null = null;

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const clearVictoryRevealTimer = (): void => {
    if (victoryRevealTimer != null) {
      window.clearTimeout(victoryRevealTimer);
      victoryRevealTimer = null;
    }
  };

  interface HandCardVisualSnapshot {
    rect: DOMRect;
    imageUrl: string;
    name: string;
  }

  let persistentHandAnimationLayer: HTMLDivElement | null = null;

  const ensurePersistentHandAnimationLayer = (): HTMLDivElement => {
    if (persistentHandAnimationLayer != null) {
      return persistentHandAnimationLayer;
    }

    const layer = document.createElement("div");
    layer.className = "hand-animation-layer";
    document.body.appendChild(layer);
    persistentHandAnimationLayer = layer;
    return layer;
  };

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  const logClient = (scope: string, message: string): void => {
    if (scope === "sync" && message === "Fetching latest match state") {
      return;
    }

    const entry = `${new Date().toISOString()} [client:${scope}] ${message}`;
    state.clientDebugLog.push(entry);
    if (state.clientDebugLog.length > 300) {
      state.clientDebugLog = state.clientDebugLog.slice(-300);
    }
    console.info(entry);
    clientLogDirty = true;
    scheduleClientLogPersist();
  };

  const persistEventLogPanelSize = (): void => {
    try {
      window.localStorage.setItem(
        eventLogSizeStorageKey,
        JSON.stringify({
          width: state.eventLogPanelWidth,
          height: state.eventLogPanelHeight
        })
      );
    } catch {
      // Ignore local storage failures; the panel will still be resizable for this session.
    }
  };

  const scheduleEventLogPanelPersist = (): void => {
    if (eventLogPanelPersistTimer != null) {
      return;
    }

    eventLogPanelPersistTimer = window.setTimeout(() => {
      eventLogPanelPersistTimer = null;
      persistEventLogPanelSize();
    }, 250);
  };

  window.addEventListener("pagehide", () => {
    persistEventLogPanelSize();
    void persistClientLogNow();
  });

  (
    window as typeof window & {
      __emerlausDicePatchLog?: (message: string) => void;
    }
  ).__emerlausDicePatchLog = (message: string) => {
    logClient("dice-patch", message);
  };

  const downloadTextFile = (filename: string, content: string): void => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const persistClientLogNow = async (): Promise<void> => {
    if (state.playerSessionToken.trim() === "" || !clientLogDirty) {
      return;
    }

    try {
      await persistClientLogSnapshot(state.instanceId, state.playerSessionToken, state.clientDebugLog);
      clientLogDirty = false;
    } catch (error) {
      console.warn("Unable to persist client log snapshot", error);
    }
  };

  const scheduleClientLogPersist = (): void => {
    if (clientLogPersistTimer != null) {
      return;
    }

    clientLogPersistTimer = window.setTimeout(() => {
      clientLogPersistTimer = null;
      void persistClientLogNow();
    }, 15000);
  };

  const getSeatDisplayName = (seatNumber?: number): string => {
    if (seatNumber == null) {
      return t(state.language, "fallback.unknownPlayer");
    }

    return state.match?.seats.find((seat) => seat.seatNumber === seatNumber)?.displayName ?? `Seat ${seatNumber}`;
  };

  const publicImageUrl = (importedAssetPath?: string | null): string => {
    if (importedAssetPath == null || importedAssetPath === "") {
      return "";
    }

    return `/${importedAssetPath.replace(/^client[\\/]+public[\\/]+/, "").replace(/\\/g, "/")}`;
  };

  const buildPresentationCard = (cardId: string): CardView | null => {
    const definition = baseCardDefinitionById[cardId];
    if (definition == null) {
      return null;
    }

    return {
      instanceId: `presentation-${cardId}`,
      cardId: definition.id,
      name: definition.name,
      description: definition.description,
      imageUrl: publicImageUrl(definition.image.importedAssetPath),
      categoryCode: definition.category.code,
      categoryLabel: definition.category.label,
      selectionMode: definition.rules.selectionMode,
      targets: definition.rules.targets,
      defenseBand: definition.defenseBand,
      canPlay: false,
      zone: "discard"
    };
  };

  const localizeActiveActionVisual = (visual: AppState["activeActionVisual"]): AppState["activeActionVisual"] =>
    visual == null
      ? null
      : {
          ...visual,
          card: localizeCardView(visual.card, state.language)
        };

  const localizeCardList = (cards: CardView[]): CardView[] =>
    cards.map((card) => localizeCardView(card, state.language));

  const getResponsePresentationCard = (choice?: string): CardView | null => {
    switch (choice) {
      case "annulation":
        return buildPresentationCard("annulation");
      case "resistance_accrue":
        return buildPresentationCard("resistance-accrue");
      case "mirror":
        return buildPresentationCard("miroir");
      default:
        return null;
    }
  };

  const hasActiveLocalInteraction = (): boolean => {
    return state.draggingCardInstanceId !== "" || state.arrowDrag != null;
  };

  const getSeatAnchorRect = (seatNumber?: number): DOMRect | null => {
    if (seatNumber == null) {
      return null;
    }

    return rootElement
      .querySelector<HTMLElement>(`[data-seat-area="true"][data-seat-number="${seatNumber}"]`)
      ?.getBoundingClientRect() ?? null;
  };

  const getCenterStackRect = (): DOMRect | null => {
    return rootElement
      .querySelector<HTMLElement>("[data-center-card-stack='true']")
      ?.getBoundingClientRect() ?? null;
  };

  const animateCardFlightToCenter = async (
    card: CardView,
    fromSeatNumber: number | undefined,
    tone: "action" | "response"
  ): Promise<void> => {
    const originRect = getSeatAnchorRect(fromSeatNumber);
    const targetRect = getCenterStackRect();
    if (originRect == null || targetRect == null) {
      return;
    }

    const fromX = originRect.left + (originRect.width / 2) - (CARD_FLIGHT_WIDTH / 2);
    const fromY = originRect.top + (originRect.height / 2) - (CARD_FLIGHT_HEIGHT / 2);
    const toX = targetRect.left + (targetRect.width / 2) - (CARD_FLIGHT_WIDTH / 2);
    const toY = targetRect.top + (targetRect.height / 2) - (CARD_FLIGHT_HEIGHT / 2);

    state.activeCardFlight = {
      card,
      fromX,
      fromY,
      toX,
      toY,
      width: CARD_FLIGHT_WIDTH,
      height: CARD_FLIGHT_HEIGHT,
      settled: false,
      tone
    };
    render();
    await nextFrame();
    await nextFrame();
    if (state.activeCardFlight == null) {
      return;
    }

    state.activeCardFlight = {
      ...state.activeCardFlight,
      settled: true
    };
    render();
    await delay(CARD_FLIGHT_DURATION_MS);
    state.activeCardFlight = null;
    render();
  };

  const getDiceStagePlacement = (seatNumber?: number): DiceStagePlacement | null => {
    if (seatNumber == null) {
      return null;
    }

    const seatArea = rootElement.querySelector<HTMLElement>(`[data-seat-area="true"][data-seat-number="${seatNumber}"]`);
    if (seatArea == null) {
      return null;
    }

    const rect = seatArea.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isLocalSeat = seatNumber === state.localSeatNumber;
    const desiredWidth = Math.min(isLocalSeat ? 300 : 240, Math.max(180, rect.width + (isLocalSeat ? 40 : 60)));
    const desiredHeight = Math.min(isLocalSeat ? 220 : 180, Math.max(140, rect.height + (isLocalSeat ? 24 : 36)));
    const centeredLeft = rect.left + (rect.width / 2) - (desiredWidth / 2);
    const centeredTop = rect.top + (rect.height / 2) - (desiredHeight / 2);

    return {
      left: Math.max(8, Math.min(centeredLeft, viewportWidth - desiredWidth - 8)),
      top: Math.max(8, Math.min(centeredTop, viewportHeight - desiredHeight - 8)),
      width: desiredWidth,
      height: desiredHeight
    };
  };

  const buildDisplayedHpBySeat = (match: MatchState | null): Record<number, number> => {
    if (match == null) {
      return {};
    }

    return Object.fromEntries(match.seats.map((seat) => [seat.seatNumber, seat.hp ?? 0]));
  };

  const buildDisplayedAliveBySeat = (match: MatchState | null): Record<number, boolean> => {
    if (match == null) {
      return {};
    }

    return Object.fromEntries(match.seats.map((seat) => [seat.seatNumber, seat.isAlive !== false]));
  };

  const reconcileDisplayedHp = (): void => {
    if (state.match == null) {
      state.displayedHpBySeat = {};
      return;
    }

    const unseenHpLossSeatNumbers = new Set<number>();
    for (const event of state.match.game?.eventLog ?? []) {
      if (event.type !== "hp_loss" || (event.amount ?? 0) <= 0 || state.seenGameEventIds.includes(event.id)) {
        continue;
      }

      if (event.seatNumber != null) {
        unseenHpLossSeatNumbers.add(event.seatNumber);
      }
    }

    const nextDisplayedHpBySeat: Record<number, number> = {};
    for (const seat of state.match.seats) {
      const actualHp = seat.hp ?? 0;
      if (seat.isAlive === false) {
        nextDisplayedHpBySeat[seat.seatNumber] = 0;
        continue;
      }

      const currentDisplayedHp = state.displayedHpBySeat[seat.seatNumber] ?? actualHp;

      if (actualHp >= currentDisplayedHp) {
        nextDisplayedHpBySeat[seat.seatNumber] = actualHp;
        continue;
      }

      if (unseenHpLossSeatNumbers.has(seat.seatNumber) || state.eventPlaybackActive) {
        nextDisplayedHpBySeat[seat.seatNumber] = currentDisplayedHp;
        continue;
      }

      nextDisplayedHpBySeat[seat.seatNumber] = actualHp;
    }

    state.displayedHpBySeat = nextDisplayedHpBySeat;
  };

  const reconcileDisplayedAlive = (): void => {
    if (state.match == null) {
      state.displayedAliveBySeat = {};
      return;
    }

    const playbackInProgress = state.eventPlaybackActive || hasUnseenGameEvents();
    const nextDisplayedAliveBySeat: Record<number, boolean> = {};
    for (const seat of state.match.seats) {
      const actualAlive = seat.isAlive !== false;
      const currentDisplayedAlive = state.displayedAliveBySeat[seat.seatNumber] ?? actualAlive;

      if (actualAlive) {
        nextDisplayedAliveBySeat[seat.seatNumber] = true;
        continue;
      }

      if (!currentDisplayedAlive) {
        nextDisplayedAliveBySeat[seat.seatNumber] = false;
        continue;
      }

      nextDisplayedAliveBySeat[seat.seatNumber] = playbackInProgress;
    }

    state.displayedAliveBySeat = nextDisplayedAliveBySeat;
  };

  const hasUnseenGameEvents = (): boolean =>
    (state.match?.game?.eventLog ?? []).some((event) => !state.seenGameEventIds.includes(event.id));

  const updateVictoryCelebrationState = (): void => {
    const winnerSeatNumber = state.match?.game?.winnerSeatNumber ?? null;
    const canReveal = winnerSeatNumber != null && !state.eventPlaybackActive && !hasUnseenGameEvents();

    if (winnerSeatNumber == null) {
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = null;
      return;
    }

    if (!canReveal) {
      clearVictoryRevealTimer();
      victoryCelebrationVisible = false;
      victoryRevealWinnerSeatNumber = winnerSeatNumber;
      return;
    }

    if (victoryCelebrationVisible && victoryRevealWinnerSeatNumber === winnerSeatNumber) {
      return;
    }

    if (victoryRevealTimer != null && victoryRevealWinnerSeatNumber === winnerSeatNumber) {
      return;
    }

    clearVictoryRevealTimer();
    victoryCelebrationVisible = false;
    victoryRevealWinnerSeatNumber = winnerSeatNumber;
    victoryRevealTimer = window.setTimeout(() => {
      victoryRevealTimer = null;
      if (
        state.match?.game?.winnerSeatNumber === winnerSeatNumber
        && !state.eventPlaybackActive
        && !hasUnseenGameEvents()
      ) {
        victoryCelebrationVisible = true;
        render();
      }
    }, 1000);
  };

  const applyMatchState = (nextMatch: MatchState | null): void => {
    const previousPendingInspection = state.match?.game?.pendingHandInspection;
    const previousPendingBoardResetKeep = state.match?.game?.pendingBoardResetKeep;
    const previousPendingDeathSearch = state.match?.game?.pendingDeathSearch;
    const previousPendingPickpocket = state.match?.game?.pendingPickpocket;
    const previousPendingSacrificeChoice = state.match?.game?.pendingSacrificeChoice;
    state.match = nextMatch;
    // Clear ghost arrows whenever game state resolves (action is done)
    state.opponentCursors = {};
    if (nextMatch == null) {
      state.displayedHpBySeat = {};
      state.displayedAliveBySeat = {};
      state.centerResponseCards = [];
      state.activeCardFlight = null;
      state.telepathyPreviewCardInstanceId = "";
      state.boardResetKeepPreviewCardInstanceId = "";
      state.deathSearchPreviewCardInstanceId = "";
      state.deathSearchSelectedCardInstanceIds = [];
      state.pickpocketPreviewCardInstanceId = "";
      state.pickpocketSelectedCardInstanceIds = [];
      state.telepathyPanelScrollTop = 0;
      state.telepathyListScrollTop = 0;
      state.hiddenHandCardInstanceIds = [];
      state.pendingAnnulationChoice = null;
      updateVictoryCelebrationState();
      return;
    }

    const nextLocalSeat = nextMatch.seats.find((seat) => seat.userId === session.currentUser.userId)?.seatNumber;
    if (nextLocalSeat != null) {
      state.localSeatNumber = nextLocalSeat;
    }

    const nextPendingInspection = nextMatch.game?.pendingHandInspection;
    const nextPendingBoardResetKeep = nextMatch.game?.pendingBoardResetKeep;
    const nextPendingDeathSearch = nextMatch.game?.pendingDeathSearch;
    const nextPendingPickpocket = nextMatch.game?.pendingPickpocket;
    const nextPendingSacrificeChoice = nextMatch.game?.pendingSacrificeChoice;
    const previousLocalInspectionTargetSeatNumber =
      previousPendingInspection?.viewerSeatNumber === state.localSeatNumber
        ? previousPendingInspection.targetSeatNumber
        : undefined;
    const nextLocalInspectionTargetSeatNumber =
      nextPendingInspection?.viewerSeatNumber === state.localSeatNumber
        ? nextPendingInspection.targetSeatNumber
        : undefined;
    if (nextLocalInspectionTargetSeatNumber == null) {
      state.telepathyPreviewCardInstanceId = "";
      state.telepathyPanelScrollTop = 0;
      state.telepathyListScrollTop = 0;
    } else if (nextLocalInspectionTargetSeatNumber !== previousLocalInspectionTargetSeatNumber) {
      const nextTargetSeat = nextMatch.seats.find((seat) => seat.seatNumber === nextLocalInspectionTargetSeatNumber);
      state.telepathyPreviewCardInstanceId = nextTargetSeat?.hand?.[0]?.instanceId ?? "";
      state.telepathyPanelScrollTop = 0;
      state.telepathyListScrollTop = 0;
    } else if (state.telepathyPreviewCardInstanceId !== "") {
      const nextTargetSeat = nextMatch.seats.find((seat) => seat.seatNumber === nextLocalInspectionTargetSeatNumber);
      if (!(nextTargetSeat?.hand ?? []).some((card) => card.instanceId === state.telepathyPreviewCardInstanceId)) {
        state.telepathyPreviewCardInstanceId = nextTargetSeat?.hand?.[0]?.instanceId ?? "";
      }
    }

    const previousLocalBoardResetKeepChooser =
      previousPendingBoardResetKeep?.chooserSeatNumber === state.localSeatNumber
        ? previousPendingBoardResetKeep.chooserSeatNumber
        : undefined;
    const nextLocalBoardResetKeepChooser =
      nextPendingBoardResetKeep?.chooserSeatNumber === state.localSeatNumber
        ? nextPendingBoardResetKeep.chooserSeatNumber
        : undefined;
    if (nextLocalBoardResetKeepChooser == null) {
      state.boardResetKeepPreviewCardInstanceId = "";
    } else if (nextLocalBoardResetKeepChooser !== previousLocalBoardResetKeepChooser) {
      state.boardResetKeepPreviewCardInstanceId = nextPendingBoardResetKeep?.cardOptions[0]?.instanceId ?? "";
    } else if (state.boardResetKeepPreviewCardInstanceId !== "") {
      if (!(nextPendingBoardResetKeep?.cardOptions ?? []).some((card) => card.instanceId === state.boardResetKeepPreviewCardInstanceId)) {
        state.boardResetKeepPreviewCardInstanceId = nextPendingBoardResetKeep?.cardOptions[0]?.instanceId ?? "";
      }
    }

    const previousLocalDeathSearchChooser =
      previousPendingDeathSearch?.chooserSeatNumber === state.localSeatNumber
        ? previousPendingDeathSearch.chooserSeatNumber
        : undefined;
    const nextLocalDeathSearchChooser =
      nextPendingDeathSearch?.chooserSeatNumber === state.localSeatNumber
        ? nextPendingDeathSearch.chooserSeatNumber
        : undefined;
    if (nextLocalDeathSearchChooser == null) {
      state.deathSearchPreviewCardInstanceId = "";
      state.deathSearchSelectedCardInstanceIds = [];
    } else if (
      nextLocalDeathSearchChooser !== previousLocalDeathSearchChooser
      || previousPendingDeathSearch?.selectedCorpseSeatNumber !== nextPendingDeathSearch?.selectedCorpseSeatNumber
    ) {
      state.deathSearchPreviewCardInstanceId = nextPendingDeathSearch?.cardOptions[0]?.instanceId ?? "";
      state.deathSearchSelectedCardInstanceIds = [];
    } else {
      const nextCardOptions = nextPendingDeathSearch?.cardOptions ?? [];
      if (!nextCardOptions.some((card) => card.instanceId === state.deathSearchPreviewCardInstanceId)) {
        state.deathSearchPreviewCardInstanceId = nextCardOptions[0]?.instanceId ?? "";
      }
      state.deathSearchSelectedCardInstanceIds = state.deathSearchSelectedCardInstanceIds.filter((instanceId) =>
        nextCardOptions.some((card) => card.instanceId === instanceId)
      );
    }

    const previousLocalPickpocketChooser =
      previousPendingPickpocket?.chooserSeatNumber === state.localSeatNumber
        ? previousPendingPickpocket.chooserSeatNumber
        : undefined;
    const nextLocalPickpocketChooser =
      nextPendingPickpocket?.chooserSeatNumber === state.localSeatNumber
        ? nextPendingPickpocket.chooserSeatNumber
        : undefined;
    if (nextLocalPickpocketChooser == null) {
      state.pickpocketPreviewCardInstanceId = "";
      state.pickpocketSelectedCardInstanceIds = [];
    } else if (
      nextLocalPickpocketChooser !== previousLocalPickpocketChooser
      || previousPendingPickpocket?.targetSeatNumber !== nextPendingPickpocket?.targetSeatNumber
    ) {
      state.pickpocketPreviewCardInstanceId = nextPendingPickpocket?.cardOptions[0]?.instanceId ?? "";
      state.pickpocketSelectedCardInstanceIds = [];
    } else {
      const nextCardOptions = nextPendingPickpocket?.cardOptions ?? [];
      if (!nextCardOptions.some((card) => card.instanceId === state.pickpocketPreviewCardInstanceId)) {
        state.pickpocketPreviewCardInstanceId = nextCardOptions[0]?.instanceId ?? "";
      }
      state.pickpocketSelectedCardInstanceIds = state.pickpocketSelectedCardInstanceIds.filter((instanceId) =>
        nextCardOptions.some((card) => card.instanceId === instanceId)
      );
    }

    const previousLocalSacrificePrompt =
      previousPendingSacrificeChoice?.actorSeatNumber === state.localSeatNumber
        ? previousPendingSacrificeChoice.actorSeatNumber
        : undefined;
    const nextLocalSacrificePrompt =
      nextPendingSacrificeChoice?.actorSeatNumber === state.localSeatNumber
        ? nextPendingSacrificeChoice.actorSeatNumber
        : undefined;
    if (nextLocalSacrificePrompt == null) {
      state.sacrificeAmountInput = "0";
    } else if (nextLocalSacrificePrompt !== previousLocalSacrificePrompt) {
      state.sacrificeAmountInput = "0";
    } else if (Number(state.sacrificeAmountInput) > (nextPendingSacrificeChoice?.maxAmount ?? 0)) {
      state.sacrificeAmountInput = String(nextPendingSacrificeChoice?.maxAmount ?? 0);
    }

    reconcileDisplayedHp();
    reconcileDisplayedAlive();
    if (!state.eventPlaybackActive && nextMatch.game?.pendingAction == null) {
      state.centerResponseCards = [];
      state.activeCardFlight = null;
    }
    if (state.pendingAnnulationChoice != null) {
      const localHand = nextMatch.seats.find((seat) => seat.seatNumber === state.localSeatNumber)?.hand ?? [];
      const promptStillValid =
        nextMatch.game?.pendingAction?.responseMode === "collective"
        && localHand.some((card) => card.instanceId === state.pendingAnnulationChoice?.cardInstanceId);
      if (!promptStillValid) {
        state.pendingAnnulationChoice = null;
      }
    }
    syncVisibleEventLog();
    updateVictoryCelebrationState();
  };

  const maybeReplayGameEvents = async (): Promise<void> => {
    const pendingEvents = (state.match?.game?.eventLog ?? []).filter(
      (event) => !state.seenGameEventIds.includes(event.id)
    );
    if (pendingEvents.length === 0) {
      return;
    }

    const showCombatFx = async (
      event: Extract<GameEvent, { type: Exclude<GameEvent["type"], "dice_roll"> }>,
      message: string,
      tone: "info" | "success" | "failure",
      durationMs: number,
      options?: {
        seatNumber?: number;
        damageAmount?: number;
        healAmount?: number;
        impactTargetSeatNumber?: number;
      }
    ): Promise<void> => {
      state.activeCombatFx = {
        message,
        tone,
        seatNumber: options?.seatNumber
      };
      if (options?.damageAmount != null && options?.seatNumber != null) {
        state.activeDamageBursts[options.seatNumber] = options.damageAmount;
      }
      if (options?.healAmount != null && options?.seatNumber != null) {
        state.activeHealBursts[options.seatNumber] = options.healAmount;
      }
      if (options?.impactTargetSeatNumber != null && options.impactTargetSeatNumber !== 0 && !state.impactTargetSeatNumbers.includes(options.impactTargetSeatNumber)) {
        state.impactTargetSeatNumbers = [...state.impactTargetSeatNumbers, options.impactTargetSeatNumber];
      }
      render();
      await delay(durationMs);
      if (state.activeCombatFx?.message === message && state.activeCombatFx.seatNumber === options?.seatNumber) {
        state.activeCombatFx = null;
      }
      if (options?.seatNumber != null && state.activeDamageBursts[options.seatNumber] === options?.damageAmount) {
        const { [options.seatNumber]: _removedBurst, ...remainingDamageBursts } = state.activeDamageBursts;
        state.activeDamageBursts = remainingDamageBursts;
      }
      if (options?.seatNumber != null && state.activeHealBursts[options.seatNumber] === options?.healAmount) {
        const { [options.seatNumber]: _removedBurst, ...remainingHealBursts } = state.activeHealBursts;
        state.activeHealBursts = remainingHealBursts;
      }
      if (options?.impactTargetSeatNumber != null && options.impactTargetSeatNumber !== 0) {
        state.impactTargetSeatNumbers = state.impactTargetSeatNumbers.filter((seatNumber) => seatNumber !== options.impactTargetSeatNumber);
      }
      render();
    };

    const setCombatFx = (
      message: string,
      tone: "info" | "success" | "failure",
      options?: {
        seatNumber?: number;
        impactTargetSeatNumber?: number;
      }
    ): void => {
      state.activeCombatFx = {
        message,
        tone,
        seatNumber: options?.seatNumber
      };
      if (options?.impactTargetSeatNumber != null && options.impactTargetSeatNumber !== 0 && !state.impactTargetSeatNumbers.includes(options.impactTargetSeatNumber)) {
        state.impactTargetSeatNumbers = [...state.impactTargetSeatNumbers, options.impactTargetSeatNumber];
      }
      render();
    };

    const clearCombatFx = (options?: { seatNumber?: number; impactTargetSeatNumber?: number }): void => {
      if (options?.seatNumber == null || state.activeCombatFx?.seatNumber === options.seatNumber) {
        state.activeCombatFx = null;
      }
      if (options?.impactTargetSeatNumber != null && options.impactTargetSeatNumber !== 0) {
        state.impactTargetSeatNumbers = state.impactTargetSeatNumbers.filter((seatNumber) => seatNumber !== options.impactTargetSeatNumber);
      }
      render();
    };

    const getReplayQueueKey = (event: GameEvent): string => {
      if (event.type === "dice_roll") {
        return `seat:${event.seatNumber ?? "global"}`;
      }

      if (event.type === "action_start") {
        return `seat:${event.actorSeatNumber}`;
      }

      if (event.type === "attack_impact") {
        return `seat:${event.targetSeatNumber ?? "global"}`;
      }

      return `seat:${event.seatNumber ?? "global"}`;
    };

    const replaySingleEvent = async (
      event: GameEvent,
      context: {
        currentAction: Extract<GameEvent, { type: "action_start" }> | null;
        rollContextBySeat: Map<number, {
          kind: "resistance" | "damage";
          actorSeatNumber?: number;
          targetSeatNumber?: number;
          cardName?: string;
          bonus?: number;
          threshold?: number;
        }>;
        lastDiceBySeat: Map<number, { notation: string; total: number; values: number[] }>;
      }
    ): Promise<void> => {
      if (event.type === "dice_roll") {
        let impactTargetSeatNumber: number | undefined;
        if (event.seatNumber != null) {
          context.lastDiceBySeat.set(event.seatNumber, {
            notation: event.notation,
            total: event.total,
            values: event.values
          });

          const rollContext = context.rollContextBySeat.get(event.seatNumber);
          if (rollContext?.kind === "resistance") {
            const bonus = rollContext.bonus == null || rollContext.bonus === 0
              ? ""
              : ` ${rollContext.bonus > 0 ? `+${rollContext.bonus}` : `${rollContext.bonus}`}`;
            setCombatFx(
              t(state.language, "combat.rollResistance", {
                playerName: getSeatDisplayName(event.seatNumber),
                notation: event.notation.toUpperCase(),
                bonus,
                threshold: rollContext.threshold ?? 10
              }),
              "info",
              { seatNumber: event.seatNumber }
            );
          } else if (rollContext?.kind === "damage") {
            impactTargetSeatNumber = rollContext.targetSeatNumber;
            setCombatFx(
              t(state.language, "combat.rollDamage", {
                actorName: getSeatDisplayName(rollContext.actorSeatNumber),
                notation: event.notation.toUpperCase(),
                targetName: getSeatDisplayName(rollContext.targetSeatNumber)
              }),
              "failure",
              { seatNumber: rollContext.targetSeatNumber, impactTargetSeatNumber: rollContext.targetSeatNumber }
            );
            context.rollContextBySeat.delete(event.seatNumber);
          } else if (context.currentAction?.actorSeatNumber === event.seatNumber) {
            setCombatFx(
              t(state.language, "combat.rollCard", {
                playerName: getSeatDisplayName(event.seatNumber),
                notation: event.notation.toUpperCase()
              }),
              "info",
              { seatNumber: event.seatNumber }
            );
          }
        }

        const diceResult = await diceController.roll(event.notation, {
          resolvedResult: {
            total: event.total,
            values: event.values
          },
          themeColor: getSeatDiceColor(event.seatNumber),
          placement: getDiceStagePlacement(event.seatNumber)
        });
        logClient(
          "dice",
          `Replay ${event.id} ${event.notation.toUpperCase()}${event.seatNumber != null ? ` seat=${event.seatNumber}` : ""} expected=${event.total}${event.values.length > 0 ? ` [${event.values.join(", ")}]` : ""} animated=${diceResult.animatedTotal}${diceResult.animatedValues.length > 0 ? ` [${diceResult.animatedValues.join(", ")}]` : ""} raw=${diceResult.rawPayload}`
        );
        await delay(250);
        if (impactTargetSeatNumber != null) {
          clearCombatFx({ seatNumber: impactTargetSeatNumber, impactTargetSeatNumber });
        }
        return;
      }

      if (event.type === "action_start") {
        state.centerResponseCards = [];
        render();
        await animateCardFlightToCenter(event.card, event.actorSeatNumber, "action");
        context.currentAction = event;
        const previousActionVisual = state.activeActionVisual;
        const preserveCollectiveTargetingVisual =
          previousActionVisual != null
          && previousActionVisual.card.cardId === event.card.cardId
          && previousActionVisual.targetSeatNumbers.length > 1
          && event.targetSeatNumbers.length === 1;
        state.activeActionVisual = preserveCollectiveTargetingVisual
          ? {
              actorSeatNumber: previousActionVisual.actorSeatNumber,
              targetSeatNumbers: [...previousActionVisual.targetSeatNumbers],
              targetObjectInstanceId: previousActionVisual.targetObjectInstanceId,
              card: event.card,
              summary: previousActionVisual.summary
            }
          : {
              actorSeatNumber: event.actorSeatNumber,
              targetSeatNumbers: [...event.targetSeatNumbers],
              targetObjectInstanceId: event.targetObjectInstanceId,
              card: event.card,
              summary: event.summary
            };
        render();
        await showCombatFx(
          event,
          t(state.language, "combat.actionPlayed", {
            playerName: getSeatDisplayName(event.actorSeatNumber),
            cardName: event.card.name
          }),
          "info",
          1400,
          { seatNumber: event.actorSeatNumber }
        );
        return;
      }

      if (event.type === "response_choice") {
        const responseCard = getResponsePresentationCard(event.responseChoice);
        if (responseCard != null) {
          await animateCardFlightToCenter(responseCard, event.seatNumber, "response");
          state.centerResponseCards = [...state.centerResponseCards, responseCard].slice(-3);
          render();
        }
        let message = t(state.language, "response.waiting");
        switch (event.responseChoice) {
          case "pass":
            message = t(state.language, "combat.response.pass", {
              playerName: getSeatDisplayName(event.seatNumber)
            });
            break;
          case "resist":
            message = t(state.language, "combat.response.resist", {
              playerName: getSeatDisplayName(event.seatNumber)
            });
            break;
          case "resistance_accrue":
            message = t(state.language, "combat.response.resistance_accrue", {
              playerName: getSeatDisplayName(event.seatNumber)
            });
            break;
          case "annulation":
            message = t(state.language, "combat.response.annulation", {
              playerName: getSeatDisplayName(event.seatNumber)
            });
            break;
          case "mirror":
            message = t(state.language, "combat.response.mirror", {
              playerName: getSeatDisplayName(event.seatNumber)
            });
            break;
          default:
            break;
        }

        await showCombatFx(
          event,
          message,
          "info",
          1250,
          { seatNumber: event.seatNumber }
        );
        return;
      }

      if (event.type === "resistance_start") {
        if (event.seatNumber != null) {
          context.rollContextBySeat.set(event.seatNumber, {
            kind: "resistance",
            bonus: event.bonus,
            threshold: event.threshold
          });
        }
        const bonus = event.bonus == null || event.bonus === 0 ? "" : ` ${event.bonus > 0 ? `+${event.bonus}` : `${event.bonus}`}`;
        setCombatFx(
          t(state.language, "combat.resistance.prepare", {
            playerName: getSeatDisplayName(event.seatNumber),
            bonus,
            threshold: event.threshold ?? 10
          }),
          "info",
          { seatNumber: event.seatNumber }
        );
        await delay(180);
        return;
      }

      if (event.type === "resistance_result") {
        const lastRoll = event.seatNumber == null ? undefined : context.lastDiceBySeat.get(event.seatNumber);
        if (event.seatNumber != null) {
          context.rollContextBySeat.delete(event.seatNumber);
        }
        const failed = event.success === false;
        if (failed && context.currentAction?.actorSeatNumber != null && event.seatNumber != null) {
          context.rollContextBySeat.set(context.currentAction.actorSeatNumber, {
            kind: "damage",
            actorSeatNumber: context.currentAction.actorSeatNumber,
            targetSeatNumber: event.seatNumber,
            cardName: event.cardName ?? context.currentAction.card.name
          });
        }
        const resultText = failed
          ? event.fatalFailure
            ? t(state.language, "combat.resistance.failedCritical", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: lastRoll?.total ?? "?"
              })
            : t(state.language, "combat.resistance.failed", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: lastRoll?.total ?? "?"
              })
          : event.criticalSuccess
            ? t(state.language, "combat.resistance.critical", {
                playerName: getSeatDisplayName(event.seatNumber)
              })
            : t(state.language, "combat.resistance.success", {
                playerName: getSeatDisplayName(event.seatNumber),
                total: lastRoll?.total ?? "?"
              });
        await showCombatFx(
          event,
          resultText,
          failed ? "failure" : "success",
          1800,
          { seatNumber: event.seatNumber }
        );
        return;
      }

      if (event.type === "attack_impact") {
        if (event.targetSeatNumber != null) {
          context.rollContextBySeat.set(event.targetSeatNumber, {
            kind: "damage",
            actorSeatNumber: event.actorSeatNumber ?? context.currentAction?.actorSeatNumber,
            targetSeatNumber: event.targetSeatNumber,
            cardName: event.cardName
          });
        }
        setCombatFx(
          t(state.language, "combat.attackIncoming", {
            cardName: event.cardName ?? (state.language === "fr" ? "Attaque" : "Attack"),
            targetName: getSeatDisplayName(event.targetSeatNumber)
          }),
          "failure",
          { seatNumber: event.targetSeatNumber, impactTargetSeatNumber: event.targetSeatNumber }
        );
        await delay(180);
        clearCombatFx({ seatNumber: event.targetSeatNumber, impactTargetSeatNumber: event.targetSeatNumber });
        return;
      }

      if (event.type === "hp_loss" && (event.amount ?? 0) > 0) {
        const amount = event.amount ?? 0;
        if (event.seatNumber != null) {
          context.rollContextBySeat.delete(event.seatNumber);
        }
        if (event.seatNumber != null) {
          const currentDisplayedHp =
            state.displayedHpBySeat[event.seatNumber]
            ?? state.match?.seats.find((seat) => seat.seatNumber === event.seatNumber)?.hp
            ?? 0;
          state.displayedHpBySeat[event.seatNumber] = Math.max(0, currentDisplayedHp - amount);
          const authoritativeSeat = state.match?.seats.find((seat) => seat.seatNumber === event.seatNumber);
          if ((state.displayedHpBySeat[event.seatNumber] ?? 0) <= 0 && authoritativeSeat?.isAlive === false) {
            state.displayedAliveBySeat[event.seatNumber] = false;
          }
        }
        await showCombatFx(
          event,
          t(state.language, "combat.tookDamage", {
            playerName: getSeatDisplayName(event.seatNumber),
            amount
          }),
          "failure",
          1800,
          { seatNumber: event.seatNumber, damageAmount: amount }
        );
        clearCombatFx({ seatNumber: event.seatNumber });
        return;
      }

      if (event.type === "hp_gain" && (event.amount ?? 0) > 0) {
        await showCombatFx(
          event,
          t(state.language, "combat.gainsHp", {
            playerName: getSeatDisplayName(event.seatNumber),
            amount: event.amount ?? 0
          }),
          "success",
          1600,
          { seatNumber: event.seatNumber, healAmount: event.amount }
        );
      }
    };

    const eventBatches: GameEvent[][] = [];
    let currentBatch: GameEvent[] = [];
    let currentBoxId: string | null = null;

    const flushCurrentBatch = (): void => {
      if (currentBatch.length > 0) {
        eventBatches.push(currentBatch);
        currentBatch = [];
        currentBoxId = null;
      }
    };

    for (const event of pendingEvents) {
      state.seenGameEventIds.push(event.id);
      logClient("event", `Replay ${event.type} (${event.id})`);

      const eventBoxId = "boxId" in event ? (event.boxId ?? null) : null;
      if (currentBatch.length === 0) {
        currentBatch = [event];
        currentBoxId = eventBoxId;
        continue;
      }

      if (eventBoxId == null || currentBoxId == null) {
        flushCurrentBatch();
        currentBatch = [event];
        currentBoxId = eventBoxId;
        continue;
      }

      if (eventBoxId !== currentBoxId) {
        flushCurrentBatch();
        currentBatch = [event];
        currentBoxId = eventBoxId;
        continue;
      }

      currentBatch.push(event);
    }

    flushCurrentBatch();

    for (const batch of eventBatches) {
      activeReplayBatchCount += 1;
      state.eventPlaybackActive = true;

      eventReplayChain = eventReplayChain
        .catch(() => undefined)
        .then(async () => {
          try {
            const batchBoxId = ("boxId" in batch[0] ? (batch[0].boxId ?? null) : null) ?? "unboxed";
            logClient("box", `Replay box ${batchBoxId} start (${batch.length} events)`);
            const actionStartEvent = batch.find((event) => event.type === "action_start");
            const replayContext = {
              currentAction: actionStartEvent ?? null,
              rollContextBySeat: new Map<number, {
                kind: "resistance" | "damage";
                actorSeatNumber?: number;
                targetSeatNumber?: number;
                cardName?: string;
                bonus?: number;
                threshold?: number;
              }>(),
              lastDiceBySeat: new Map<number, { notation: string; total: number; values: number[] }>()
            };
            if (actionStartEvent != null) {
              await replaySingleEvent(actionStartEvent, replayContext);
              revealEventLogEntriesUpTo(actionStartEvent.createdAt);
            }

            const remainingEvents = actionStartEvent == null
              ? batch
              : batch.filter((event) => event.id !== actionStartEvent.id);

            const runEventsInParallelQueues = async (events: GameEvent[]): Promise<void> => {
              const queues = new Map<string, Promise<void>>();
              for (const event of events) {
                const queueKey = getReplayQueueKey(event);
                const previous = queues.get(queueKey) ?? Promise.resolve();
                queues.set(
                  queueKey,
                  previous
                    .catch(() => undefined)
                    .then(async () => {
                      await replaySingleEvent(event, replayContext);
                      revealEventLogEntriesUpTo(event.createdAt);
                    })
                );
              }
              await Promise.all([...queues.values()]);
            };

            // Three-phase playback to preserve correct animation order:
            //   Phase 1: response choices + resistance rolls (up to last resistance_result)
            //   Phase 2: attacker's damage/heal dice rolls
            //   Phase 3: attack impacts (shake/zoom) + hp changes
            const lastResistanceResultIndex = remainingEvents.reduce(
              (lastIndex, event, index) => event.type === "resistance_result" ? index : lastIndex,
              -1
            );
            const firstImpactIndex = remainingEvents.findIndex((event) => event.type === "attack_impact");

            const resistanceBoundary = lastResistanceResultIndex + 1; // 0 when no resistance
            const impactBoundary = firstImpactIndex === -1 ? remainingEvents.length : firstImpactIndex;

            if (firstImpactIndex !== -1 && resistanceBoundary > impactBoundary) {
              // Cards such as Main brûlante interleave resistance and damage:
              // resist hit 1 -> damage hit 1 -> resist hit 2 -> ...
              // The normal phased split would overlap the ranges and replay
              // later resistance rolls twice, so preserve the server order.
              for (const event of remainingEvents) {
                await replaySingleEvent(event, replayContext);
                revealEventLogEntriesUpTo(event.createdAt);
              }
            } else {
              const phase1Events = remainingEvents.slice(0, resistanceBoundary);
              const postResistanceEvents = remainingEvents.slice(resistanceBoundary);
              // Area cards such as Carquois de fleches magiques emit
              // dice_roll + hp_loss pairs without attack_impact. Replay
              // all dice first so damage does not appear mid-roll.
              const phase2Events = firstImpactIndex === -1
                ? postResistanceEvents.filter((event) => event.type === "dice_roll")
                : remainingEvents.slice(resistanceBoundary, impactBoundary);
              const phase3Events = firstImpactIndex === -1
                ? postResistanceEvents.filter((event) => event.type !== "dice_roll")
                : remainingEvents.slice(impactBoundary);

              await runEventsInParallelQueues(phase1Events);
              await runEventsInParallelQueues(phase2Events);
              await runEventsInParallelQueues(phase3Events);
            }
            logClient("box", `Replay box ${batchBoxId} end`);
          } finally {
            activeReplayBatchCount = Math.max(0, activeReplayBatchCount - 1);
            state.eventPlaybackActive = activeReplayBatchCount > 0;
            if (!state.eventPlaybackActive) {
              if (state.match?.game?.pendingAction == null) {
                state.activeActionVisual = null;
                state.centerResponseCards = [];
              }
              reconcileDisplayedHp();
              reconcileDisplayedAlive();
              syncVisibleEventLog();
            }
            updateVictoryCelebrationState();
            render();
          }
        });
    }
  };

  const getLocalHand = (): CardView[] =>
    state.match?.seats.find((seat) => seat.seatNumber === state.localSeatNumber)?.hand ?? [];

  const getDraggedCard = () => getLocalHand().find((card) => card.instanceId === state.draggingCardInstanceId);

  const getCollectiveAnnulationPrompt = (
    draggedCard: CardView | undefined
  ): { maxCount: number; neededCount: number } | null => {
    if (draggedCard?.cardId !== "annulation") {
      return null;
    }

    const pendingAction = state.match?.game?.pendingAction;
    if (pendingAction == null || pendingAction.responseMode !== "collective") {
      return null;
    }

    const requiredCount = pendingAction.card.defenseBand?.annulationCardsRequired ?? 0;
    if (requiredCount < 2) {
      return null;
    }

    const localResponder = pendingAction.responders.find((responder) => responder.seatNumber === state.localSeatNumber);
    if (localResponder?.state !== "pending") {
      return null;
    }

    const alreadyCommitted = pendingAction.responders.reduce((count, responder) => (
      responder.choice === "annulation"
        ? count + (responder.committedCardCount ?? responder.cards?.length ?? 0)
        : count
    ), 0);
    const neededCount = Math.max(0, requiredCount - alreadyCommitted);
    const availableCount = getLocalHand().filter((card) => card.cardId === "annulation").length;
    if (neededCount < 2 || availableCount < 2) {
      return null;
    }

    return {
      maxCount: Math.min(availableCount, neededCount),
      neededCount
    };
  };

  const captureHandCardVisuals = (): Map<string, HandCardVisualSnapshot> => {
    const rects = new Map<string, HandCardVisualSnapshot>();
    rootElement.querySelectorAll<HTMLElement>(".hand-card[data-card-instance-id]").forEach((element) => {
      const cardInstanceId = element.dataset.cardInstanceId;
      if (cardInstanceId == null || cardInstanceId === "") {
        return;
      }

      const imageElement = element.querySelector<HTMLImageElement>("img");
      rects.set(cardInstanceId, {
        rect: element.getBoundingClientRect(),
        imageUrl: imageElement?.src ?? "",
        name: imageElement?.alt ?? "Card"
      });
    });
    return rects;
  };

  const getHandSpreadAnchorCardInstanceId = (): string => {
    if (state.arrowDrag != null) {
      return state.arrowDrag.cardInstanceId;
    }
    if (state.draggingCardInstanceId !== "") {
      return state.draggingCardInstanceId;
    }
    return state.hoveredCardInstanceId;
  };

  const getEffectiveHoveredCardInstanceId = (): string =>
    state.hoveredCardInstanceId !== "" && state.hoveredCardInstanceId !== state.hoverZoomBlockedCardInstanceId
      ? state.hoveredCardInstanceId
      : "";

  const blockHoverZoomUntilPointerLeaves = (cardInstanceId: string): void => {
    state.hoveredCardInstanceId = cardInstanceId;
    state.hoverZoomBlockedCardInstanceId = cardInstanceId;
  };

  const clearDragState = (): void => {
    state.draggingCardInstanceId = "";
    state.dragHoverTarget = null;
    state.arrowDrag = null;
    state.hoveredCardInstanceId = "";
  };

  const animateInvalidDragReturn = async (card: CardView, startX: number, startY: number): Promise<void> => {
    const previousVisuals = captureHandCardVisuals();
    const previewRect = rootElement.querySelector<HTMLElement>("[data-drag-card-preview]")?.getBoundingClientRect();
    if (previewRect != null) {
      previousVisuals.set(card.instanceId, {
        rect: previewRect,
        imageUrl: card.imageUrl,
        name: card.name
      });
    }

    clearDragState();
    render();
    await animatePersistentHandReflow(previousVisuals);
  };

  const animatePersistentHandReflow = async (previousVisuals: Map<string, HandCardVisualSnapshot>): Promise<void> => {
    const layer = ensurePersistentHandAnimationLayer();
    layer.innerHTML = "";

    const clones: HTMLDivElement[] = [];
    const hiddenCardIds: string[] = [];

    rootElement.querySelectorAll<HTMLElement>(".hand-card[data-card-instance-id]").forEach((element) => {
      const cardInstanceId = element.dataset.cardInstanceId;
      if (cardInstanceId == null || cardInstanceId === "") {
        return;
      }

      const previous = previousVisuals.get(cardInstanceId);
      if (previous == null) {
        return;
      }

      const nextRect = element.getBoundingClientRect();
      const deltaX = previous.rect.left - nextRect.left;
      const deltaY = previous.rect.top - nextRect.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        return;
      }

      hiddenCardIds.push(cardInstanceId);
      const clone = document.createElement("div");
      clone.className = "hand-animation-card";
      clone.style.left = `${previous.rect.left}px`;
      clone.style.top = `${previous.rect.top}px`;
      clone.style.width = `${previous.rect.width}px`;
      clone.style.height = `${previous.rect.height}px`;
      clone.style.setProperty("--hand-animation-dx", `${-deltaX}px`);
      clone.style.setProperty("--hand-animation-dy", `${-deltaY}px`);
      clone.innerHTML = `<img src="${previous.imageUrl}" alt="${previous.name}" />`;
      layer.appendChild(clone);
      clones.push(clone);
    });

    if (clones.length === 0) {
      state.hiddenHandCardInstanceIds = [];
      render();
      return;
    }

    state.hiddenHandCardInstanceIds = hiddenCardIds;
    render();
    await nextFrame();
    clones.forEach((clone) => clone.classList.add("hand-animation-card--settled"));
    await delay(220);
    layer.innerHTML = "";
    state.hiddenHandCardInstanceIds = [];
    state.returningHandCardInstanceId = "";
    render();
  };

  /** Returns true if the card's targets require aiming at a specific opponent. */
  const cardNeedsArrow = (card: CardView): boolean =>
    card.canPlay && (card.targets === "single_opponent");

  /** Returns true if the card can be played by a "lift out of hand" gesture. */
  const cardIsLiftPlayable = (card: CardView): boolean =>
    card.canPlay && card.categoryCode !== "CA" && (
      card.categoryCode === "O" ||
      card.targets === "self" ||
      card.targets === "self_or_single_opponent" ||
      card.targets === "all_opponents" ||
      card.targets === "left_opponent" ||
      card.targets === "none" ||
      card.selectionMode === "confirm"
    );

  /**
   * Updates the fixed arrow SVG overlay for arrow-drag (Phase 3) and
   * for the "lift to play" indicator (Phase 4). Called after renders
   * and directly during pointermove for smooth updates.
   */
  const updateArrowOverlay = (): void => {
    const svg = rootElement.querySelector<SVGSVGElement>(".arrow-drag-overlay");
    if (svg == null) {
      return;
    }

    const GHOST_TIMEOUT_MS = 500;
    const now = Date.now();

    /** Builds SVG markup for one arrow (local red or ghost grey). */
    const buildArrow = (
      originX: number, originY: number,
      tipX: number, tipY: number,
      color: string, width: number, glowAttr: string
    ): string => {
      const angle = Math.atan2(tipY - originY, tipX - originX);
      const head = 208;
      const spread = 0.42;
      // Line ends at the base of the arrowhead triangle (head * cos(spread) = triangle height)
      const lineEndX = tipX - head * Math.cos(spread) * Math.cos(angle);
      const lineEndY = tipY - head * Math.cos(spread) * Math.sin(angle);
      // Stem curve: cp1 straight up from origin, cp2 straight up from lineEnd.
      // The horizontal gap between origin and lineEnd bends the curve naturally left/right.
      const dist = Math.hypot(lineEndX - originX, lineEndY - originY);
      const lift = Math.max(100, dist * 0.38);
      const cp1x = originX;
      const cp1y = originY - lift;
      const cp2x = lineEndX;
      const cp2y = lineEndY - lift * 0.4;
      const pathD = `M ${originX} ${originY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${lineEndX} ${lineEndY}`;
      const ax1 = tipX - head * Math.cos(angle - spread);
      const ay1 = tipY - head * Math.sin(angle - spread);
      const ax2 = tipX - head * Math.cos(angle + spread);
      const ay2 = tipY - head * Math.sin(angle + spread);
      return `
        <path d="${pathD}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none" ${glowAttr}/>
        <polygon points="${tipX},${tipY} ${ax1},${ay1} ${ax2},${ay2}" fill="${color}" ${glowAttr}/>
      `;
    };

    const parts: string[] = [];

    // Ghost arrows for opponents currently dragging (received via SSE cursor_move).
    // Origin = actor's seat as seen on THIS player's screen.
    // Tip = snapped to target seat when confirmed, otherwise direction vector applied to origin.
    for (const [rawSeat, cursor] of Object.entries(state.opponentCursors)) {
      if (now - cursor.ts > GHOST_TIMEOUT_MS) {
        continue; // stale
      }
      const actorSeat = Number(rawSeat);
      const actorEl = rootElement.querySelector<HTMLElement>(`[data-seat-number='${actorSeat}']`);
      if (actorEl == null) {
        continue;
      }
      const or = actorEl.getBoundingClientRect();
      const ox = or.left + or.width / 2;
      const oy = or.top + or.height / 2;

      if (cursor.targetSeatNumber == null) continue;
      const targetEl = rootElement.querySelector<HTMLElement>(`[data-seat-number='${cursor.targetSeatNumber}']`);
      if (targetEl == null) continue;
      const tr = targetEl.getBoundingClientRect();
      const tipX = tr.left + tr.width / 2;
      const tipY = tr.top + tr.height / 2;

      parts.push(buildArrow(ox, oy, tipX, tipY, "rgba(180,180,180,0.5)", 12, ""));
    }

    // Local player's red targeting arrow
    if (state.arrowDrag != null) {
      const { originX, originY, pointerX, pointerY, nearestSeatNumber } = state.arrowDrag;
      const confirmed = nearestSeatNumber != null;
      let tipX = pointerX;
      let tipY = pointerY;
      if (confirmed) {
        const seatEl = rootElement.querySelector<HTMLElement>(`[data-drop-target='seat'][data-seat-number='${nearestSeatNumber}']`);
        if (seatEl != null) {
          const r = seatEl.getBoundingClientRect();
          tipX = r.left + r.width / 2;
          tipY = r.top + r.height / 2;
        }
      }
      const color = confirmed ? "#cc2222" : "rgba(180, 50, 50, 0.55)";
      const glowAttr = confirmed ? `filter="url(#arrow-glow)"` : "";
      parts.push(buildArrow(originX, originY, tipX, tipY, color, 18, glowAttr));
    }

    if (parts.length === 0) {
      svg.innerHTML = "";
      return;
    }

    svg.innerHTML = `
      <defs>
        <filter id="arrow-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${parts.join("")}
    `;
  };

  const parseHoverTarget = (element: Element | null): DragHoverTarget | null => {
    const target = element?.closest("[data-drop-target]") as HTMLElement | null;
    if (target == null) {
      return null;
    }

    const kind = target.dataset.dropTarget;
    if (kind === "discard" || kind === "play-slot" || kind === "response-slot") {
      return { kind };
    }

    if (kind === "seat") {
      const seatNumber = Number(target.dataset.seatNumber);
      return Number.isFinite(seatNumber) ? { kind, seatNumber } : null;
    }

    if (kind === "object") {
      const seatNumber = Number(target.dataset.seatNumber);
      const objectInstanceId = target.dataset.objectInstanceId;
      return Number.isFinite(seatNumber) && objectInstanceId != null
        ? { kind, seatNumber, objectInstanceId }
        : null;
    }

    return null;
  };

  const executePlayRequest = async (
    request: Parameters<typeof playCard>[2],
    previousHandVisuals?: Map<string, HandCardVisualSnapshot>
  ): Promise<void> => {
    logClient("play", `Request play ${request.cardInstanceId} mode=${request.mode}${request.targetSeatNumber != null ? ` targetSeat=${request.targetSeatNumber}` : ""}${request.targetObjectInstanceId != null ? ` targetObject=${request.targetObjectInstanceId}` : ""}`);
    applyMatchState(await playCard(state.instanceId, state.playerSessionToken, request));
    state.errorMessage = "";
    clearDragState();
    blockHoverZoomUntilPointerLeaves(request.cardInstanceId);
    render();
    if (previousHandVisuals != null) {
      await animatePersistentHandReflow(previousHandVisuals);
    }
  };

  const submitPendingResponse = async (
    request: Parameters<typeof respondToPendingAction>[2],
    responseCardInstanceId?: string
  ): Promise<void> => {
    applyMatchState(await respondToPendingAction(state.instanceId, state.playerSessionToken, request));
    state.errorMessage = "";
    state.pendingAnnulationChoice = null;
    clearDragState();
    if (responseCardInstanceId != null && responseCardInstanceId !== "") {
      blockHoverZoomUntilPointerLeaves(responseCardInstanceId);
    }
  };

  const shouldOfferDiscardOnInvalidDrop = (draggedCard: CardView | undefined): boolean => {
    if (draggedCard == null || state.match?.status !== "in_progress") {
      return false;
    }

    const game = state.match.game;
    return game?.currentTurnSeatNumber === state.localSeatNumber
      && game.pendingAction == null
      && game.forcedFollowUp == null
      && game.pendingCurseRelease == null;
  };

  const handleDraggedCardDrop = async (): Promise<void> => {
    const draggedCard = getDraggedCard();
    const hoverTarget = state.dragHoverTarget;
    if (draggedCard == null || hoverTarget == null) {
      if (draggedCard != null && shouldOfferDiscardOnInvalidDrop(draggedCard)) {
        state.confirmingDiscardCardInstanceId = draggedCard.instanceId;
        clearDragState();
        render();
        return;
      }
      if (draggedCard != null) {
        await animateInvalidDragReturn(draggedCard, state.dragPointerX, state.dragPointerY);
      } else {
        clearDragState();
        render();
      }
      return;
    }

    if (hoverTarget.kind === "discard") {
      state.confirmingDiscardCardInstanceId = draggedCard.instanceId;
      clearDragState();
      render();
      return;
    }

    try {
      if (hoverTarget.kind === "play-slot") {
        const previousHandVisuals = captureHandCardVisuals();
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active",
          targetSeatNumber: draggedCard.targets === "self_or_single_opponent"
            ? state.localSeatNumber
            : undefined
        }, previousHandVisuals);
      } else if (hoverTarget.kind === "response-slot") {
        const choice =
          draggedCard.cardId === "annulation"
            ? "annulation"
            : draggedCard.cardId === "resistance-accrue"
              ? "resistance_accrue"
              : draggedCard.cardId === "miroir"
                ? "mirror"
                : null;
        if (choice == null) {
          if (shouldOfferDiscardOnInvalidDrop(draggedCard)) {
            state.confirmingDiscardCardInstanceId = draggedCard.instanceId;
            clearDragState();
            render();
            return;
          }
          await animateInvalidDragReturn(draggedCard, state.dragPointerX, state.dragPointerY);
          return;
        }

        const annulationPrompt = choice === "annulation"
          ? getCollectiveAnnulationPrompt(draggedCard)
          : null;
        if (annulationPrompt != null) {
          state.pendingAnnulationChoice = {
            cardInstanceId: draggedCard.instanceId,
            maxCount: annulationPrompt.maxCount,
            neededCount: annulationPrompt.neededCount
          };
          clearDragState();
          render();
          return;
        }

        await submitPendingResponse({ choice }, draggedCard.instanceId);
      } else if (hoverTarget.kind === "seat" && hoverTarget.seatNumber != null) {
        const previousHandVisuals = captureHandCardVisuals();
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active",
          targetSeatNumber: hoverTarget.seatNumber
        }, previousHandVisuals);
      } else if (hoverTarget.kind === "object" && hoverTarget.objectInstanceId != null) {
        const previousHandVisuals = captureHandCardVisuals();
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active",
          targetObjectInstanceId: hoverTarget.objectInstanceId
        }, previousHandVisuals);
      } else {
        await animateInvalidDragReturn(draggedCard, state.dragPointerX, state.dragPointerY);
      }
    } catch (error) {
      await animateInvalidDragReturn(draggedCard, state.dragPointerX, state.dragPointerY);
      state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.playCard");
    }

    render();
    if (deferredSyncRequested) {
      deferredSyncRequested = false;
      void syncMatch();
    }
  };

  const syncMatch = async (): Promise<void> => {
    if (state.leftMessage !== "") {
      return;
    }

    if (hasActiveLocalInteraction()) {
      deferredSyncRequested = true;
      return;
    }

    if (syncInFlight) {
      return;
    }

    syncInFlight = true;

    try {
      applyMatchState(await fetchMatch(state.instanceId, state.playerSessionToken));
      lastRealtimeActivityAt = Date.now();
    } catch (error) {
      logClient(
        "sync",
        `Sync failed: ${error instanceof Error ? error.message : "Unknown sync error"}`
      );
      syncInFlight = false;
      return;
    }

    syncInFlight = false;

    if (state.match == null) {
      render();
      return;
    }

    const localHand = state.match.seats.find((seat) => seat.seatNumber === state.localSeatNumber)?.hand ?? [];
    if (!localHand.some((card) => card.instanceId === state.draggingCardInstanceId)) {
      clearDragState();
    }
    if (!state.match.seats.some((seat) => seat.seatNumber === state.inspectedSeatNumber)) {
      state.inspectedSeatNumber = 0;
    }
    if (!state.match.seats.some((seat) => seat.seatNumber === state.confirmingKickSeatNumber)) {
      state.confirmingKickSeatNumber = 0;
    }
    render();
  };

  const requestSync = (): void => {
    if (hasActiveLocalInteraction()) {
      deferredSyncRequested = true;
      return;
    }

    void syncMatch();
  };

  const handleDocumentPointerDown = (_event: PointerEvent): void => {
  };

  let cursorSendAt = 0;
  const CURSOR_THROTTLE_MS = 50;

  const handleDocumentPointerMove = (event: PointerEvent): void => {
    if (eventLogResizeDrag != null) {
      const nextSize = clampEventLogPanelSize(
        eventLogResizeDrag.startWidth + (event.clientX - eventLogResizeDrag.startX),
        eventLogResizeDrag.startHeight - (event.clientY - eventLogResizeDrag.startY)
      );
      state.eventLogPanelWidth = nextSize.width;
      state.eventLogPanelHeight = nextSize.height;
      const panel = rootElement.querySelector<HTMLElement>("[data-chat-panel='true']");
      if (panel != null) {
        panel.style.setProperty("--event-log-panel-width", `${nextSize.width}px`);
        panel.style.setProperty("--event-log-panel-height", `${nextSize.height}px`);
      }
      return;
    }

    // Phase 3: arrow drag for targeting cards
    if (state.arrowDrag != null) {
      state.arrowDrag.pointerX = event.clientX;
      state.arrowDrag.pointerY = event.clientY;

      // Find nearest targetable seat
      const seatElements = Array.from(rootElement.querySelectorAll<HTMLElement>("[data-drop-target='seat']"));
      let nearestSeat: number | null = null;
      let nearestDist = Infinity;
      for (const el of seatElements) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestSeat = Number(el.dataset.seatNumber);
        }
      }
      // Confirm only when pointer is within 80px of the seat centre
      state.arrowDrag.nearestSeatNumber = nearestDist < 80 ? nearestSeat : null;
      updateArrowOverlay();

      // Broadcast cursor position to opponents (throttled to ~20 fps)
      const now = Date.now();
      if (now - cursorSendAt >= CURSOR_THROTTLE_MS) {
        cursorSendAt = now;
        void fetch(`/api/matches/${state.instanceId}/cursor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seatNumber: state.localSeatNumber,
            targetSeatNumber: state.arrowDrag?.nearestSeatNumber ?? null
          })
        });
      }
      return;
    }

    if (state.draggingCardInstanceId === "") {
      return;
    }

    state.dragPointerX = event.clientX;
    state.dragPointerY = event.clientY;

    // Phase 4: detect "lift above hand panel" for self/mass cards
    const draggedCard = getDraggedCard();
    let hoverTarget: DragHoverTarget | null;
    if (draggedCard != null && cardIsLiftPlayable(draggedCard)) {
      const handPanel = rootElement.querySelector<HTMLElement>(".local-hand-panel");
      const panelTop = handPanel?.getBoundingClientRect().top ?? Infinity;
      if (event.clientY < panelTop - 10) {
        hoverTarget = { kind: "play-slot" };
      } else {
        hoverTarget = parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
      }
    } else {
      hoverTarget = parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
    }

    const sameTarget =
      hoverTarget?.kind === state.dragHoverTarget?.kind &&
      hoverTarget?.seatNumber === state.dragHoverTarget?.seatNumber &&
      hoverTarget?.objectInstanceId === state.dragHoverTarget?.objectInstanceId;

    if (!sameTarget) {
      state.dragHoverTarget = hoverTarget;
      render();
      return;
    }

    const preview = rootElement.querySelector<HTMLElement>("[data-drag-card-preview]");
    if (preview != null) {
      preview.style.left = `${event.clientX}px`;
      preview.style.top = `${event.clientY}px`;
    }
  };

  const handleDocumentPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    if (eventLogResizeDrag != null) {
      const panel = rootElement.querySelector<HTMLElement>("[data-chat-panel='true']");
      panel?.classList.remove("chat-panel--resizing");
      eventLogResizeDrag = null;
      scheduleEventLogPanelPersist();
      return;
    }

    // Phase 3: arrow drag release
    if (state.arrowDrag != null) {
      const { cardInstanceId, nearestSeatNumber } = state.arrowDrag;
      const previousHandVisuals = captureHandCardVisuals();
      clearDragState();
      if (nearestSeatNumber != null) {
        void (async () => {
          try {
            await executePlayRequest({
              cardInstanceId,
              mode: "active",
              targetSeatNumber: nearestSeatNumber
            }, previousHandVisuals);
          } catch (error) {
            state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.playCard");
          }
          render();
          if (deferredSyncRequested) {
            deferredSyncRequested = false;
            void syncMatch();
          }
        })();
      } else {
        const releasedCard = state.match?.seats
          .find((seat) => seat.seatNumber === state.localSeatNumber)
          ?.hand?.find((card) => card.instanceId === cardInstanceId);
        if (shouldOfferDiscardOnInvalidDrop(releasedCard)) {
          state.confirmingDiscardCardInstanceId = cardInstanceId;
          clearDragState();
          render();
          if (deferredSyncRequested) {
            deferredSyncRequested = false;
            void syncMatch();
          }
          return;
        }
        void animatePersistentHandReflow(previousHandVisuals);
        if (deferredSyncRequested) {
          deferredSyncRequested = false;
          void syncMatch();
        }
      }
      return;
    }

    if (state.draggingCardInstanceId === "") {
      return;
    }

    state.dragPointerX = event.clientX;
    state.dragPointerY = event.clientY;
    // Phase 4: re-evaluate lift target at release moment
    const draggedCard = getDraggedCard();
    if (draggedCard != null && cardIsLiftPlayable(draggedCard)) {
      const handPanel = rootElement.querySelector<HTMLElement>(".local-hand-panel");
      const panelTop = handPanel?.getBoundingClientRect().top ?? Infinity;
      state.dragHoverTarget = event.clientY < panelTop - 10
        ? { kind: "play-slot" }
        : parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
    } else {
      state.dragHoverTarget = parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
    }
    void handleDraggedCardDrop();
  };

  let sseEventSource: EventSource | null = null;
  let sseFallbackPollInterval: number | null = null;

  const connectSSE = (instanceId: string): void => {
    sseEventSource?.close();
    sseEventSource = new EventSource(`/api/matches/${instanceId}/events`);

    sseEventSource.addEventListener("message", (event) => {
      lastRealtimeActivityAt = Date.now();
      try {
        const msg = JSON.parse(event.data as string) as { type: string; seatNumber?: number; targetSeatNumber?: number | null };
        if (msg.type === "cursor_move" && msg.seatNumber != null) {
          // Ignore our own seat (we already have arrowDrag state)
          if (msg.seatNumber !== state.localSeatNumber) {
            state.opponentCursors[msg.seatNumber] = { targetSeatNumber: msg.targetSeatNumber ?? null, ts: Date.now() };
            updateArrowOverlay();
          }
          return;
        }
      } catch {
        // Not JSON or unknown shape — fall through to state sync
      }
      requestSync();
    });

    sseEventSource.addEventListener("open", () => {
      lastRealtimeActivityAt = Date.now();
      logClient("sse", "SSE connected");
      if (sseFallbackPollInterval != null) {
        window.clearInterval(sseFallbackPollInterval);
        sseFallbackPollInterval = null;
      }
    });

    sseEventSource.addEventListener("error", () => {
      if (sseEventSource?.readyState === EventSource.CLOSED) {
        sseEventSource = null;
        if (sseFallbackPollInterval == null) {
          logClient("sse", "SSE closed, falling back to polling");
          sseFallbackPollInterval = window.setInterval(() => requestSync(), 4000);
        }
      }
    });
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
        applyMatchState(freshJoin.match);
        state.localSeatNumber = freshJoin.localSeatNumber;
        state.displayedHpBySeat = buildDisplayedHpBySeat(freshJoin.match);
        state.displayedAliveBySeat = buildDisplayedAliveBySeat(freshJoin.match);
        clearDragState();
        state.confirmingDiscardCardInstanceId = "";
        state.leftMessage = "";
        state.seenGameEventIds = freshJoin.match.game?.eventLog.map((event) => event.id) ?? [];
        state.seenEventMessageIds = buildEventLogEntries(freshJoin.match, state.language).map((entry) => entry.id);
        state.clientDebugLog = [];
        logClient("session", "Started fresh browser session after leaving match");
        connectSSE(state.instanceId);
      } else {
        applyMatchState(null);
        state.leftMessage = t(state.language, "left.replacedByBot");
      }
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.leaveMatch");
    }

    render();
  };

  const revealEventLogEntriesUpTo = (createdAt?: string): void => {
    const eventLogEntries = state.match == null ? [] : buildEventLogEntries(state.match, state.language);
    let changed = false;

    for (const entry of eventLogEntries) {
      if (state.seenEventMessageIds.includes(entry.id)) {
        continue;
      }
      if (createdAt != null && entry.createdAt > createdAt) {
        continue;
      }

      state.seenEventMessageIds.push(entry.id);
      changed = true;
    }

    if (changed) {
      render();
    }
  };

  const syncVisibleEventLog = (): void => {
    const hasPendingReplay =
      state.eventPlaybackActive
      || (state.match?.game?.eventLog ?? []).some((event) => !state.seenGameEventIds.includes(event.id));

    if (!hasPendingReplay) {
      revealEventLogEntriesUpTo();
    }
  };

  // Returns a point at parameter t on a cubic bezier curve.
  const bezierAt = (t: number, p0x: number, p0y: number, p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number): [number, number] => {
    const u = 1 - t;
    return [
      u*u*u*p0x + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*p3x,
      u*u*u*p0y + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*p3y,
    ];
  };

  // Returns the point at the base of the arrowhead — use this as the line endpoint
  // so the line ends where the arrowhead begins rather than at the tip.
  const arrowBase = (tipX: number, tipY: number, fromX: number, fromY: number, size: number): [number, number] => {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return [tipX, tipY];
    return [tipX - (dx / len) * size, tipY - (dy / len) * size];
  };

  const buildArrowhead = (tipX: number, tipY: number, fromX: number, fromY: number, size: number, cssClass: string): string => {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return "";
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const half = size * 0.5;
    const b1x = tipX - ux * size + px * half;
    const b1y = tipY - uy * size + py * half;
    const b2x = tipX - ux * size - px * half;
    const b2y = tipY - uy * size - py * half;
    return `<polygon class="${cssClass}" points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)}" />`;
  };

  const drawPendingActionTargetOverlay = (presentationLockActive: boolean): void => {
    const overlay = rootElement.querySelector<SVGSVGElement>("[data-action-target-overlay='true']");
    if (overlay == null || state.match?.status !== "in_progress" || (presentationLockActive && state.activeActionVisual == null)) {
      if (overlay != null) {
        overlay.innerHTML = "";
      }
      return;
    }

    const livePendingAction = state.match.game?.pendingAction;
    const pendingAction =
      livePendingAction?.responseMode === "collective"
      && state.activeActionVisual?.card.cardId === livePendingAction.card.cardId
        ? {
            actorSeatNumber: livePendingAction.actorSeatNumber,
            targetSeatNumbers: [...livePendingAction.targetSeatNumbers],
            targetObjectInstanceId: livePendingAction.targetObjectInstanceId,
            card: state.activeActionVisual.card,
            summary: state.activeActionVisual.summary
          }
        : (state.activeActionVisual ?? livePendingAction);
    const centerCard = rootElement.querySelector<HTMLElement>("[data-pending-card-center='true']");
    const tableSurface = rootElement.querySelector<HTMLElement>(".table-surface");
    if (pendingAction == null || centerCard == null || tableSurface == null) {
      overlay.innerHTML = "";
      return;
    }

    const tableRect = tableSurface.getBoundingClientRect();
    const centerRect = centerCard.getBoundingClientRect();
    const originX = centerRect.left - tableRect.left + (centerRect.width / 2);
    const originY = centerRect.top - tableRect.top + (centerRect.height / 2);
    const pathMarkup: string[] = [];

    const actorElement = rootElement.querySelector<HTMLElement>(
      `[data-seat-area='true'][data-seat-number='${pendingAction.actorSeatNumber}']`
    );
    if (actorElement != null) {
      const actorRect = actorElement.getBoundingClientRect();
      const actorX = actorRect.left - tableRect.left + (actorRect.width / 2);
      const actorY = actorRect.top - tableRect.top + (actorRect.height / 2);
      const controlOffset = Math.max(34, Math.abs(actorY - originY) * 0.24);
      const [aBaseX, aBaseY] = arrowBase(originX, originY, actorX, actorY, 60);
      const actorPath = `M ${actorX} ${actorY} C ${actorX} ${actorY - controlOffset}, ${aBaseX} ${aBaseY + controlOffset}, ${aBaseX} ${aBaseY}`;
      pathMarkup.push(`<path class="action-target-overlay__attacker" d="${actorPath}" />`);
      pathMarkup.push(buildArrowhead(originX, originY, actorX, actorY, 60, "action-target-overlay__attacker"));
    }

    const targetElements: HTMLElement[] = [];
    const seenTargetKeys = new Set<string>();

    for (const seatNumber of pendingAction.targetSeatNumbers) {
      const seatElement = rootElement.querySelector<HTMLElement>(`[data-seat-area='true'][data-seat-number='${seatNumber}']`);
      if (seatElement != null) {
        targetElements.push(seatElement);
        seenTargetKeys.add(`seat:${seatNumber}`);
      }
    }

    if (pendingAction.targetObjectInstanceId != null) {
      const objectElement = rootElement.querySelector<HTMLElement>(`[data-object-instance-id='${pendingAction.targetObjectInstanceId}']`);
      if (objectElement != null) {
        targetElements.push(objectElement);
        seenTargetKeys.add(`object:${pendingAction.targetObjectInstanceId}`);
      } else {
        const ownerSeat = state.match.seats.find((seat) =>
          [...(seat.objects ?? []), ...(seat.statuses ?? [])].some(
            (card) => card.instanceId === pendingAction.targetObjectInstanceId
          )
        );
        if (ownerSeat != null && !seenTargetKeys.has(`seat:${ownerSeat.seatNumber}`)) {
          const ownerSeatElement = rootElement.querySelector<HTMLElement>(`[data-seat-area='true'][data-seat-number='${ownerSeat.seatNumber}']`);
          if (ownerSeatElement != null) {
            targetElements.push(ownerSeatElement);
          }
        }
      }
    }

    // Returns the point where the line from (fromX,fromY) to the rect center
    // intersects the rect's boundary (table-relative coords).
    const rectEdgePoint = (fromX: number, fromY: number, cx: number, cy: number, rect: DOMRect): [number, number] => {
      const l = rect.left - tableRect.left;
      const t = rect.top  - tableRect.top;
      const r = l + rect.width;
      const b = t + rect.height;
      const dx = cx - fromX;
      const dy = cy - fromY;
      let bestT = 1;
      const test = (t2: number, x: number, y: number) => {
        if (t2 > 0 && t2 < bestT && x >= l - 1 && x <= r + 1 && y >= t - 1 && y <= b + 1) bestT = t2;
      };
      if (Math.abs(dx) > 0.1) { test((l - fromX) / dx, l, fromY + (l - fromX) / dx * dy); test((r - fromX) / dx, r, fromY + (r - fromX) / dx * dy); }
      if (Math.abs(dy) > 0.1) { test((t - fromY) / dy, fromX + (t - fromY) / dy * dx, t); test((b - fromY) / dy, fromX + (b - fromY) / dy * dx, b); }
      return [fromX + bestT * dx, fromY + bestT * dy];
    };

    overlay.setAttribute("viewBox", `0 0 ${Math.max(1, tableRect.width)} ${Math.max(1, tableRect.height)}`);
    pathMarkup.push(...targetElements.map((targetElement) => {
      const targetRect = targetElement.getBoundingClientRect();
      const targetCX = targetRect.left - tableRect.left + (targetRect.width / 2);
      const targetCY = targetRect.top  - tableRect.top  + (targetRect.height / 2);
      const [edgeX, edgeY] = rectEdgePoint(originX, originY, targetCX, targetCY, targetRect);
      const [tBaseX, tBaseY] = arrowBase(edgeX, edgeY, originX, originY, 60);
      const controlOffset = Math.max(34, Math.abs(tBaseY - originY) * 0.27);
      const path = `M ${originX} ${originY} C ${originX} ${originY + controlOffset}, ${tBaseX} ${tBaseY - controlOffset}, ${tBaseX} ${tBaseY}`;
      return [
        `<path class="action-target-overlay__target" d="${path}" />`,
        buildArrowhead(edgeX, edgeY, originX, originY, 60, "action-target-overlay__target"),
      ].join("");
    }));
    overlay.innerHTML = pathMarkup.join("");
  };

  /** Applies/removes the stable zoom class based on state.hoveredCardInstanceId. */
  const applyHoverClass = (): void => {
    rootElement.querySelectorAll<HTMLElement>(".hand-card--js-hovered").forEach((el) => {
      el.classList.remove("hand-card--js-hovered");
    });
    if (state.draggingCardInstanceId !== "" || state.arrowDrag != null) {
      return;
    }
    const hoveredCardInstanceId = getEffectiveHoveredCardInstanceId();
    if (hoveredCardInstanceId !== "") {
      rootElement.querySelector<HTMLElement>(
        `[data-card-instance-id='${hoveredCardInstanceId}']`
      )?.classList.add("hand-card--js-hovered");
    }
  };

  /**
   * Directly mutates --fan-x on each .hand-card so adjacent cards spread away
   * from the hovered card without a full DOM re-render (preserving CSS transitions).
   * SPREAD_PX: how many pixels each neighbouring card is pushed outward.
   */
  const applyHoverSpread = (): void => {
    const SPREAD_PX = 110;
    const EDGE_SPREAD_MULTIPLIER = 1.5;
    const cards = Array.from(rootElement.querySelectorAll<HTMLElement>(".hand-card"));
    if (state.draggingCardInstanceId !== "" || state.arrowDrag != null) {
      const spreadAnchorCardInstanceId = getHandSpreadAnchorCardInstanceId();
      const hoveredIndex = cards.findIndex(
        (el) => el.dataset.cardInstanceId === spreadAnchorCardInstanceId
      );
      cards.forEach((el, i) => {
        const base = parseFloat(el.dataset.baseFanX ?? "0");
        let offset = 0;
        if (hoveredIndex >= 0 && spreadAnchorCardInstanceId !== "") {
          const spreadMagnitude =
            hoveredIndex === 0 || hoveredIndex === cards.length - 1
              ? SPREAD_PX * EDGE_SPREAD_MULTIPLIER
              : SPREAD_PX;
          const dist = i - hoveredIndex;
          if (dist !== 0) {
            offset = Math.sign(dist) * spreadMagnitude;
          }
        }
        el.style.setProperty("--fan-x", `${(base + offset).toFixed(1)}px`);
      });
      return;
    }
    const hoveredCardInstanceId = getEffectiveHoveredCardInstanceId();
    const hoveredIndex = cards.findIndex(
      (el) => el.dataset.cardInstanceId === hoveredCardInstanceId
    );
    cards.forEach((el, i) => {
      const base = parseFloat(el.dataset.baseFanX ?? "0");
      let offset = 0;
      if (hoveredIndex >= 0 && hoveredCardInstanceId !== "") {
        const spreadMagnitude =
          hoveredIndex === 0 || hoveredIndex === cards.length - 1
            ? SPREAD_PX * EDGE_SPREAD_MULTIPLIER
            : SPREAD_PX;
        const dist = i - hoveredIndex;
        if (dist !== 0) {
          // All cards on each side shift by the same flat amount — preserves inter-card spacing
          offset = Math.sign(dist) * spreadMagnitude;
        }
      }
      el.style.setProperty("--fan-x", `${(base + offset).toFixed(1)}px`);
    });
  };

  const applyCenterHoverClass = (): void => {
    rootElement.querySelectorAll<HTMLElement>(".center-play-slot--js-hovered").forEach((el) => {
      el.classList.remove("center-play-slot--js-hovered");
    });
    if (state.hoveredCenterSlotKind === "") {
      return;
    }
    rootElement.querySelector<HTMLElement>(`[data-center-hover-slot='${state.hoveredCenterSlotKind}']`)?.classList.add("center-play-slot--js-hovered");
  };

  const render = (): void => {
    const chatSnapshot = captureChatDomSnapshot(rootElement);
    const activeElement = document.activeElement;
    const shouldRestoreReferenceSearchFocus =
      activeElement instanceof HTMLInputElement
      && activeElement.dataset.action === "edit-reference-search";
    const referenceSearchSelectionStart = shouldRestoreReferenceSearchFocus
      ? activeElement.selectionStart ?? activeElement.value.length
      : null;
    const referenceSearchSelectionEnd = shouldRestoreReferenceSearchFocus
      ? activeElement.selectionEnd ?? activeElement.value.length
      : null;
    state.telepathyPanelScrollTop =
      rootElement.querySelector<HTMLElement>("[data-modal-panel-scroll='true']")?.scrollTop
      ?? state.telepathyPanelScrollTop;
    state.telepathyListScrollTop =
      rootElement.querySelector<HTMLElement>("[data-modal-list-scroll='true']")?.scrollTop
      ?? state.telepathyListScrollTop;
    state.cardReferencePanelScrollTop =
      rootElement.querySelector<HTMLElement>("[data-card-reference-panel='true']")?.scrollTop
      ?? state.cardReferencePanelScrollTop;
    state.cardReferenceListScrollTop =
      rootElement.querySelector<HTMLElement>("[data-card-reference-list='true']")?.scrollTop
      ?? state.cardReferenceListScrollTop;

    if (state.leftMessage !== "") {
      diceController.hide();
      rootElement.innerHTML = `${renderLanguageToggle(state.language)}${renderLeftMatchScreen(state.leftMessage, state.language)}`;
      return;
    }

    if (state.match == null) {
      diceController.hide();
      rootElement.innerHTML = `${renderLanguageToggle(state.language)}${renderLoadingScreen(state.language)}`;
      return;
    }

    const localizedMatch = localizeMatchState(state.match, state.language);
    const visibleEventLogEntries = buildEventLogEntries(state.match, state.language).filter(
      (entry) => state.seenEventMessageIds.includes(entry.id)
    );

    const chatMarkup =
      state.match.status === "in_progress"
        ? renderChatView({
            entries: visibleEventLogEntries,
            language: state.language,
            panelWidth: state.eventLogPanelWidth,
            panelHeight: state.eventLogPanelHeight
          })
        : "";

    const eventLogMarkup = "";
    const presentationLockActive =
      state.eventPlaybackActive
      || hasUnseenGameEvents();

    const baseView =
      state.match.status === "lobby"
        ? renderLobbyView({
            match: localizedMatch,
            localSeatNumber: state.localSeatNumber,
            currentUser: session.currentUser,
            sessionMode: session.mode,
            errorMessage: state.errorMessage,
            language: state.language
          })
        : renderTableView({
            language: state.language,
            match: localizedMatch,
            localSeatNumber: state.localSeatNumber,
            displayedHpBySeat: state.displayedHpBySeat,
            displayedAliveBySeat: state.displayedAliveBySeat,
            presentationLockActive,
            activeActionVisual: localizeActiveActionVisual(state.activeActionVisual),
            centerResponseCards: localizeCardList(state.centerResponseCards),
            activeCardFlight: state.activeCardFlight == null
              ? null
              : { ...state.activeCardFlight, card: localizeCardView(state.activeCardFlight.card, state.language) },
            activeReturnCardFlight: state.activeReturnCardFlight == null
              ? null
              : { ...state.activeReturnCardFlight, card: localizeCardView(state.activeReturnCardFlight.card, state.language) },
            draggingCardInstanceId: state.draggingCardInstanceId,
            dragPointerX: state.dragPointerX,
            dragPointerY: state.dragPointerY,
            dragHoverTarget: state.dragHoverTarget,
            arrowDrag: state.arrowDrag,
            inspectedSeatNumber: state.inspectedSeatNumber,
            telepathyPreviewCardInstanceId: state.telepathyPreviewCardInstanceId,
            boardResetKeepPreviewCardInstanceId: state.boardResetKeepPreviewCardInstanceId,
            deathSearchPreviewCardInstanceId: state.deathSearchPreviewCardInstanceId,
            deathSearchSelectedCardInstanceIds: state.deathSearchSelectedCardInstanceIds,
            pickpocketPreviewCardInstanceId: state.pickpocketPreviewCardInstanceId,
            pickpocketSelectedCardInstanceIds: state.pickpocketSelectedCardInstanceIds,
            cardReferencePreviewCardId: state.cardReferencePreviewCardId,
            cardReferenceSearchQuery: state.cardReferenceSearchQuery,
            cardReferenceShowBase: state.cardReferenceShowBase,
            cardReferenceShowAbondance: state.cardReferenceShowAbondance,
            sacrificeAmountInput: state.sacrificeAmountInput,
            errorMessage: state.errorMessage,
            chatMarkup,
            eventLogMarkup,
            activeCombatFx: state.activeCombatFx,
            activeDamageBursts: state.activeDamageBursts,
            activeHealBursts: state.activeHealBursts,
            impactTargetSeatNumbers: state.impactTargetSeatNumbers,
            returningHandCardInstanceId: state.returningHandCardInstanceId,
            hiddenHandCardInstanceIds: state.hiddenHandCardInstanceIds,
            hoveredCardInstanceId: getEffectiveHoveredCardInstanceId(),
            hoveredCenterSlotKind: state.hoveredCenterSlotKind,
            cardReferenceOpen: state.cardReferenceOpen,
            showVictoryCelebration: victoryCelebrationVisible
          });
    const kickTarget = state.match.seats.find((seat) => seat.seatNumber === state.confirmingKickSeatNumber);
    rootElement.innerHTML = `${renderLanguageToggle(state.language)}${baseView}${renderLeaveConfirmationModal(state.confirmingLeave, state.language)}${kickTarget != null ? renderKickConfirmationModal(kickTarget.displayName, state.language) : ""}${renderDiscardConfirmationModal(state.confirmingDiscardCardInstanceId !== "", state.language)}${renderAnnulationChoiceModal(state.pendingAnnulationChoice, state.language)}`;
    drawPendingActionTargetOverlay(presentationLockActive);
    updateArrowOverlay();

    const telepathyPanel = rootElement.querySelector<HTMLElement>("[data-modal-panel-scroll='true']");
    if (telepathyPanel != null) {
      telepathyPanel.scrollTop = state.telepathyPanelScrollTop;
    }
    const telepathyList = rootElement.querySelector<HTMLElement>("[data-modal-list-scroll='true']");
    if (telepathyList != null) {
      telepathyList.scrollTop = state.telepathyListScrollTop;
    }
    const cardReferencePanel = rootElement.querySelector<HTMLElement>("[data-card-reference-panel='true']");
    if (cardReferencePanel != null) {
      cardReferencePanel.scrollTop = state.cardReferencePanelScrollTop;
    }
    const cardReferenceList = rootElement.querySelector<HTMLElement>("[data-card-reference-list='true']");
    if (cardReferenceList != null) {
      cardReferenceList.scrollTop = state.cardReferenceListScrollTop;
    }
    const eventLogResizeHandle = rootElement.querySelector<HTMLElement>("[data-action='resize-event-log']");
    eventLogResizeHandle?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const panel = rootElement.querySelector<HTMLElement>("[data-chat-panel='true']");
      if (panel == null) {
        return;
      }

      const clamped = clampEventLogPanelSize(state.eventLogPanelWidth, state.eventLogPanelHeight);
      state.eventLogPanelWidth = clamped.width;
      state.eventLogPanelHeight = clamped.height;
      eventLogResizeDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: clamped.width,
        startHeight: clamped.height
      };
      panel.classList.add("chat-panel--resizing");
    });

    // Restore the stable hover class and spread positions after every DOM rebuild.
    applyHoverClass();
    applyHoverSpread();
    applyCenterHoverClass();

    // Hand-card hover: mutate DOM directly without re-render so CSS transitions animate.
    rootElement.querySelectorAll<HTMLElement>(".hand-card").forEach((el) => {
      el.addEventListener("pointerenter", () => {
        if (state.draggingCardInstanceId !== "" || state.arrowDrag != null) {
          return;
        }
        const id = el.dataset.cardInstanceId ?? "";
        if (id === "") {
          return;
        }
        if (id !== state.hoverZoomBlockedCardInstanceId) {
          state.hoverZoomBlockedCardInstanceId = "";
        }
        if (id === state.hoveredCardInstanceId) {
          return;
        }
        state.hoveredCardInstanceId = id;
        applyHoverClass();
        applyHoverSpread();
      });
    });

    rootElement.querySelector<HTMLElement>(".hand-fan")?.addEventListener("pointerleave", () => {
      if (state.draggingCardInstanceId !== "" || state.arrowDrag != null) {
        return;
      }
      state.hoverZoomBlockedCardInstanceId = "";
      if (state.hoveredCardInstanceId === "") {
        return;
      }
      state.hoveredCardInstanceId = "";
      applyHoverClass();
      applyHoverSpread();
    });

    rootElement.querySelectorAll<HTMLElement>("[data-center-hover-slot]").forEach((el) => {
      el.addEventListener("pointerenter", () => {
        const slotKind = el.dataset.centerHoverSlot;
        if (slotKind !== "attack" && slotKind !== "response") {
          return;
        }
        if (state.hoveredCenterSlotKind === slotKind) {
          return;
        }
        state.hoveredCenterSlotKind = slotKind;
        applyCenterHoverClass();
      });

      el.addEventListener("pointerleave", () => {
        const slotKind = el.dataset.centerHoverSlot;
        if (slotKind !== state.hoveredCenterSlotKind) {
          return;
        }
        state.hoveredCenterSlotKind = "";
        applyCenterHoverClass();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='set-language']").forEach((button) => {
      button.addEventListener("click", () => {
        const nextLanguage = button.dataset.language;
        if (nextLanguage !== "fr" && nextLanguage !== "en") {
          return;
        }
        if (state.language === nextLanguage) {
          return;
        }
        state.language = nextLanguage;
        persistLanguage(nextLanguage);
        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='add-bot']")?.addEventListener("click", async () => {
      try {
        logClient("lobby", "Host requested add bot");
        applyMatchState(await requestAddBot(state.instanceId, state.playerSessionToken));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.addBot");
      }

      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-expansion']").forEach((button) => {
      button.addEventListener("click", async () => {
        const expansion = button.dataset.expansionKey as ExpansionKey | undefined;
        if (expansion == null || state.match == null) {
          return;
        }

        try {
          const nextEnabled = !state.match.enabledExpansions[expansion];
          logClient("lobby", `Host toggled expansion ${expansion} -> ${nextEnabled}`);
          applyMatchState(await requestUpdateExpansion(state.instanceId, state.playerSessionToken, {
            expansion,
            enabled: nextEnabled
          }));
          state.errorMessage = "";
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.updateExpansion");
        }

        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='drag-card']").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }

        const cardInstanceId = button.dataset.cardInstanceId ?? "";
        if (cardInstanceId === "") {
          return;
        }

        event.preventDefault();
        state.inspectedSeatNumber = 0;
        state.hoveredCardInstanceId = cardInstanceId;

        const card = getLocalHand().find((c) => c.instanceId === cardInstanceId);

        if (card != null && cardNeedsArrow(card)) {
          // Phase 3: targeting card → arrow drag mode
          // Set a placeholder origin first so render() can show the zoomed card
          state.arrowDrag = {
            cardInstanceId,
            originX: event.clientX,
            originY: event.clientY,
            pointerX: event.clientX,
            pointerY: event.clientY,
            nearestSeatNumber: null
          };
          state.draggingCardInstanceId = "";
          state.dragHoverTarget = null;
          render();
          // After render the card is in zoomed position — read its actual centre
          const zoomedEl = rootElement.querySelector<HTMLElement>(`[data-card-instance-id='${cardInstanceId}']`);
          if (zoomedEl != null) {
            const r = zoomedEl.getBoundingClientRect();
            state.arrowDrag.originX = r.left + r.width / 2;
            state.arrowDrag.originY = r.top + r.height / 2;
          }
          updateArrowOverlay();
        } else {
          // Normal drag
          state.draggingCardInstanceId = cardInstanceId;
          state.dragPointerX = event.clientX;
          state.dragPointerY = event.clientY;
          state.dragHoverTarget = null;
          state.arrowDrag = null;
          render();
        }
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='inspect-seat']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = button.dataset.seatNumber == null ? 0 : Number(button.dataset.seatNumber);
        state.inspectedSeatNumber = state.inspectedSeatNumber === seatNumber ? 0 : seatNumber;
        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='dismiss-telepathy']")?.addEventListener("click", async () => {
      try {
        applyMatchState(await acknowledgePendingHandInspection(state.instanceId, state.playerSessionToken, {}));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.closeInspection");
      }

      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-telepathy-card']").forEach((button) => {
      const previewCardInstanceId = button.dataset.cardInstanceId ?? "";
      const setPreview = (): void => {
        if (previewCardInstanceId === "" || state.telepathyPreviewCardInstanceId === previewCardInstanceId) {
          return;
        }

        state.telepathyPreviewCardInstanceId = previewCardInstanceId;
        render();
      };

      button.addEventListener("focus", setPreview);
      button.addEventListener("click", setPreview);
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='kick-seat']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = button.dataset.seatNumber == null ? 0 : Number(button.dataset.seatNumber);
        state.confirmingKickSeatNumber = seatNumber;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-board-reset-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const previewCardInstanceId = button.dataset.cardInstanceId ?? "";
        if (previewCardInstanceId === "" || state.boardResetKeepPreviewCardInstanceId === previewCardInstanceId) {
          return;
        }

        state.boardResetKeepPreviewCardInstanceId = previewCardInstanceId;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='choose-death-search-corpse']").forEach((button) => {
      button.addEventListener("click", async () => {
        const corpseSeatNumber = button.dataset.seatNumber == null ? 0 : Number(button.dataset.seatNumber);
        if (corpseSeatNumber <= 0) {
          return;
        }

        try {
          applyMatchState(await resolvePendingDeathSearch(state.instanceId, state.playerSessionToken, { corpseSeatNumber }));
          state.errorMessage = "";
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.resolveDeathSearch");
        }
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-death-search-card']").forEach((button) => {
      const previewCardInstanceId = button.dataset.cardInstanceId ?? "";
      const setPreview = (): void => {
        if (previewCardInstanceId === "" || state.deathSearchPreviewCardInstanceId === previewCardInstanceId) {
          return;
        }

        state.deathSearchPreviewCardInstanceId = previewCardInstanceId;
        render();
      };

      button.addEventListener("focus", setPreview);
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-death-search-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const cardInstanceId = button.dataset.cardInstanceId ?? "";
        if (cardInstanceId === "") {
          return;
        }

        const alreadySelected = state.deathSearchSelectedCardInstanceIds.includes(cardInstanceId);
        if (alreadySelected) {
          state.deathSearchSelectedCardInstanceIds = state.deathSearchSelectedCardInstanceIds.filter((instanceId) => instanceId !== cardInstanceId);
        } else {
          state.deathSearchSelectedCardInstanceIds = [...state.deathSearchSelectedCardInstanceIds, cardInstanceId];
        }
        state.deathSearchPreviewCardInstanceId = cardInstanceId;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-pickpocket-card']").forEach((button) => {
      const previewCardInstanceId = button.dataset.cardInstanceId ?? "";
      const setPreview = (): void => {
        if (previewCardInstanceId === "" || state.pickpocketPreviewCardInstanceId === previewCardInstanceId) {
          return;
        }

        state.pickpocketPreviewCardInstanceId = previewCardInstanceId;
        render();
      };

      button.addEventListener("focus", setPreview);
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-pickpocket-card']").forEach((button) => {
      button.addEventListener("click", () => {
        const cardInstanceId = button.dataset.cardInstanceId ?? "";
        if (cardInstanceId === "") {
          return;
        }

        const alreadySelected = state.pickpocketSelectedCardInstanceIds.includes(cardInstanceId);
        if (alreadySelected) {
          state.pickpocketSelectedCardInstanceIds = state.pickpocketSelectedCardInstanceIds.filter((instanceId) => instanceId !== cardInstanceId);
        } else {
          state.pickpocketSelectedCardInstanceIds = [...state.pickpocketSelectedCardInstanceIds, cardInstanceId];
        }
        state.pickpocketPreviewCardInstanceId = cardInstanceId;
        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='open-card-reference']")?.addEventListener("click", () => {
      state.cardReferenceOpen = true;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='close-card-reference']")?.addEventListener("click", () => {
      state.cardReferenceOpen = false;
      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='preview-reference-card']").forEach((button) => {
      const previewCardId = button.dataset.cardId ?? "";
      const setPreview = (): void => {
        if (previewCardId === "" || state.cardReferencePreviewCardId === previewCardId) {
          return;
        }

        state.cardReferencePreviewCardId = previewCardId;
        render();
      };

      button.addEventListener("focus", setPreview);
      button.addEventListener("click", setPreview);
    });

    rootElement.querySelector<HTMLInputElement>("[data-action='edit-reference-search']")?.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLInputElement;
      state.cardReferenceSearchQuery = target.value;
      state.cardReferencePanelScrollTop = 0;
      state.cardReferenceListScrollTop = 0;
      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='toggle-reference-deck']").forEach((button) => {
      button.addEventListener("click", () => {
        const deck = button.dataset.referenceDeck;
        if (deck === "base") {
          state.cardReferenceShowBase = !state.cardReferenceShowBase;
        } else if (deck === "abondance") {
          state.cardReferenceShowAbondance = !state.cardReferenceShowAbondance;
        } else {
          return;
        }

        state.cardReferencePanelScrollTop = 0;
        state.cardReferenceListScrollTop = 0;
        render();
      });
    });

    if (shouldRestoreReferenceSearchFocus) {
      const referenceSearchInput = rootElement.querySelector<HTMLInputElement>("[data-action='edit-reference-search']");
      if (referenceSearchInput != null) {
        referenceSearchInput.focus();
        if (referenceSearchSelectionStart != null && referenceSearchSelectionEnd != null) {
          referenceSearchInput.setSelectionRange(referenceSearchSelectionStart, referenceSearchSelectionEnd);
        }
      }
    }

    rootElement.querySelector<HTMLButtonElement>("[data-action='confirm-board-reset-keep']")?.addEventListener("click", async () => {
      const cardInstanceId = state.boardResetKeepPreviewCardInstanceId;
      if (cardInstanceId === "") {
        return;
      }

      try {
        applyMatchState(await resolvePendingBoardResetKeep(state.instanceId, state.playerSessionToken, { cardInstanceId }));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.keepCard");
      }
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='confirm-death-search-keep']")?.addEventListener("click", async () => {
      const pendingDeathSearch = state.match?.game?.pendingDeathSearch;
      if (pendingDeathSearch == null) {
        return;
      }

      try {
        applyMatchState(await resolvePendingDeathSearch(state.instanceId, state.playerSessionToken, {
          keepCardInstanceIds: state.deathSearchSelectedCardInstanceIds
        }));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.resolveDeathSearch");
      }
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='confirm-pickpocket-take']")?.addEventListener("click", async () => {
      const pendingPickpocket = state.match?.game?.pendingPickpocket;
      if (pendingPickpocket == null) {
        return;
      }

      try {
        applyMatchState(await resolvePendingPickpocket(state.instanceId, state.playerSessionToken, {
          takeCardInstanceIds: state.pickpocketSelectedCardInstanceIds
        }));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.resolvePickpocket");
      }
      render();
    });

    rootElement.querySelector<HTMLInputElement>("[data-action='edit-sacrifice-amount']")?.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLInputElement;
      state.sacrificeAmountInput = target.value;
      const pendingSacrificeChoice = state.match?.game?.pendingSacrificeChoice;
      const confirmButton = rootElement.querySelector<HTMLButtonElement>("[data-action='confirm-sacrifice-amount']");
      if (pendingSacrificeChoice != null && confirmButton != null) {
        const parsed = Number(state.sacrificeAmountInput);
        confirmButton.disabled = !(
          Number.isInteger(parsed)
          && parsed >= 0
          && parsed <= pendingSacrificeChoice.maxAmount
        );
      }
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='confirm-sacrifice-amount']")?.addEventListener("click", async () => {
      const pendingSacrificeChoice = state.match?.game?.pendingSacrificeChoice;
      const parsed = Number(state.sacrificeAmountInput);
      if (pendingSacrificeChoice == null || !Number.isInteger(parsed) || parsed < 0 || parsed > pendingSacrificeChoice.maxAmount) {
        state.errorMessage = t(state.language, "error.sacrificeRange", { maxAmount: pendingSacrificeChoice?.maxAmount ?? 0 });
        render();
        return;
      }

      try {
        applyMatchState(await resolvePendingSacrificeChoice(state.instanceId, state.playerSessionToken, { amount: parsed }));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.chooseSacrifice");
      }
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='kick-cancel']")?.addEventListener("click", () => {
      state.confirmingKickSeatNumber = 0;
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='kick-confirm']")?.addEventListener("click", async () => {
      if (state.confirmingKickSeatNumber === 0) {
        return;
      }

      try {
        logClient("host", `Host requested kick for seat ${state.confirmingKickSeatNumber}`);
        applyMatchState(await requestKickPlayer(state.instanceId, state.playerSessionToken, {
          seatNumber: state.confirmingKickSeatNumber
        }));
        state.errorMessage = "";
        state.inspectedSeatNumber = 0;
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.kickPlayer");
      } finally {
        state.confirmingKickSeatNumber = 0;
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='discard-cancel']")?.addEventListener("click", () => {
      state.confirmingDiscardCardInstanceId = "";
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='discard-confirm']")?.addEventListener("click", async () => {
      const cardInstanceId = state.confirmingDiscardCardInstanceId;
      if (cardInstanceId === "") {
        return;
      }

      try {
        await executePlayRequest({
          cardInstanceId,
          mode: "inactive"
        });
        state.confirmingDiscardCardInstanceId = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.discardCard");
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='start-match']")?.addEventListener("click", async () => {
      try {
        state.clientDebugLog = [];
        logClient("session", "Starting new match session");
        applyMatchState(await requestStartMatch(state.instanceId, state.playerSessionToken));
        state.errorMessage = "";
        state.displayedHpBySeat = buildDisplayedHpBySeat(state.match);
        state.displayedAliveBySeat = buildDisplayedAliveBySeat(state.match);
        state.seenGameEventIds = state.match?.game?.eventLog.map((event) => event.id) ?? [];
        state.seenEventMessageIds = state.match == null ? [] : buildEventLogEntries(state.match, state.language).map((entry) => entry.id);
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.startMatch");
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => {
      requestSync();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='pass-forced-follow-up']")?.addEventListener("click", async () => {
      try {
        logClient("forced-follow-up", "Pass forced follow-up");
        applyMatchState(await passForcedFollowUp(state.instanceId, state.playerSessionToken));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.passFollowUp");
      }

      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='resolve-curse-release']").forEach((button) => {
      button.addEventListener("click", async () => {
        const choice = button.dataset.choice === "accept" ? "accept" : "pass";
        try {
          applyMatchState(await resolvePendingCurseRelease(state.instanceId, state.playerSessionToken, { choice }));
          state.errorMessage = "";
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.resolveCurse");
        }

        render();
      });
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='download-server-log']")?.addEventListener("click", () => {
      const lines = (state.match?.game?.debugLog ?? []).map(
        (entry) => `${entry.createdAt} [${entry.source}:${entry.scope}] ${entry.message}`
      );
      if (session.mode === "discord") {
        state.errorMessage = `Server log auto-saved to runtime-logs/${state.instanceId}/server.log`;
        render();
        return;
      }

      downloadTextFile(`emerlaus-server-log-${state.instanceId}.log`, lines.join("\n"));
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='download-client-log']")?.addEventListener("click", async () => {
      if (session.mode === "discord") {
        await persistClientLogNow();
        state.errorMessage = `Client log auto-saved to runtime-logs/${state.instanceId}/`;
        render();
        return;
      }

      downloadTextFile(`emerlaus-client-log-${state.instanceId}.log`, state.clientDebugLog.join("\n"));
    });

    rootElement.querySelector<HTMLSelectElement>("[data-action='dev-draw-card']")?.addEventListener("change", async (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      const cardId = select.value;
      if (cardId === "") {
        return;
      }
      select.value = "";
      try {
        const nextMatch = await devDrawCard(state.instanceId, state.playerSessionToken, cardId);
        applyMatchState(nextMatch);
        render();
      } catch (err) {
        state.errorMessage = err instanceof Error ? err.message : t(state.language, "error.drawCard");
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

    rootElement.querySelector<HTMLButtonElement>("[data-action='respond-pending'][data-choice='pass']")?.addEventListener("click", async (event) => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        logClient("response", "Respond pass");
        await submitPendingResponse({ choice: "pass" });
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.passResponse");
      }
      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='annulation-choice-cancel']")?.addEventListener("click", () => {
      state.pendingAnnulationChoice = null;
      render();
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='annulation-choice-confirm']").forEach((button) => {
      button.addEventListener("click", async () => {
        const pendingChoice = state.pendingAnnulationChoice;
        if (pendingChoice == null) {
          return;
        }

        const annulationCount = Math.max(1, Math.min(
          Number(button.dataset.annulationCount ?? "1") || 1,
          pendingChoice.maxCount
        ));
        button.disabled = true;
        try {
          logClient("response", `Respond annulation x${annulationCount}`);
          await submitPendingResponse({ choice: "annulation", annulationCount }, pendingChoice.cardInstanceId);
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.playCard");
        }
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='select-pending-object']").forEach((button) => {
      button.addEventListener("click", async () => {
        const objectInstanceId = button.dataset.objectInstanceId;
        if (objectInstanceId == null) {
          return;
        }

        button.disabled = true;
        try {
          logClient("object", `Select object ${objectInstanceId}`);
          applyMatchState(await selectPendingObject(state.instanceId, state.playerSessionToken, { objectInstanceId }));
          state.errorMessage = "";
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : t(state.language, "error.selectObject");
        }
        render();
      });
    });

    restoreChatDomState(rootElement, chatSnapshot, state.chatExpanded);

    if (state.match.status !== "in_progress") {
      diceController.hide();
    } else {
      void diceController.init();
      void maybeReplayGameEvents();
    }

  };

  render();
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("pointermove", handleDocumentPointerMove);
  document.addEventListener("pointerup", handleDocumentPointerUp);

  connectSSE(state.instanceId);

  if (session.mode === "discord") {
    discordSafetyPollInterval = window.setInterval(() => {
      if (Date.now() - lastRealtimeActivityAt >= 8000) {
        requestSync();
      }
    }, 2000);
  }

  const unsubscribe = session.subscribeToParticipantUpdates(() => {
    requestSync();
  });

  window.addEventListener("beforeunload", () => {
    persistEventLogPanelSize();
    if (eventLogPanelPersistTimer != null) {
      window.clearTimeout(eventLogPanelPersistTimer);
    }
    sseEventSource?.close();
    if (sseFallbackPollInterval != null) {
      window.clearInterval(sseFallbackPollInterval);
    }
    if (discordSafetyPollInterval != null) {
      window.clearInterval(discordSafetyPollInterval);
    }
    unsubscribe();
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("pointermove", handleDocumentPointerMove);
    document.removeEventListener("pointerup", handleDocumentPointerUp);

    if (session.mode === "discord" && state.leftMessage === "") {
      void disconnectFromMatch(state.instanceId, state.playerSessionToken);
    }
  });
}
