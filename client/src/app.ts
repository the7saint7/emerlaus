import {
  devDrawCard,
  disconnectFromMatch,
  fetchMatch,
  joinMatch,
  playCard,
  requestAddBot,
  requestKickPlayer,
  respondToPendingAction,
  requestStartMatch,
  sendChatMessage
} from "./api/gameApi";
import { captureChatDomSnapshot, restoreChatDomState } from "./app/chatDom";
import type { AppState, DragHoverTarget } from "./app/state";
import {
  renderDiscardConfirmationModal,
  renderKickConfirmationModal,
  renderLeaveConfirmationModal,
  renderLeftMatchScreen,
  renderLoadingScreen
} from "./app/screens";
import { createDiscordSession } from "./discord/session";
import { diceController, type DiceStagePlacement } from "./features/dice/diceController";
import { getSeatDiceColor } from "./features/dice/diceSeatColors";
import { renderChatView, renderHiddenChatButton } from "./render/chatView";
import { renderLobbyView } from "./render/lobbyView";
import { renderTableView } from "./render/tableView";
import { baseCardDefinitionById } from "../../shared/cards";
import type { CardView, GameEvent, MatchState } from "../../shared/types";

export async function createApp(rootElement: HTMLDivElement): Promise<void> {
  const CARD_FLIGHT_DURATION_MS = 420;
  const CARD_FLIGHT_WIDTH = 112;
  const CARD_FLIGHT_HEIGHT = 156;
  const session = await createDiscordSession();
  const joined = await joinMatch(session.instanceId, session.currentUser);

  const state: AppState = {
    instanceId: session.instanceId,
    playerSessionToken: joined.playerSessionToken,
    match: joined.match,
    localSeatNumber: joined.localSeatNumber,
    displayedHpBySeat: Object.fromEntries(joined.match.seats.map((seat) => [seat.seatNumber, seat.hp])),
    draggingCardInstanceId: "",
    dragPointerX: 0,
    dragPointerY: 0,
    dragHoverTarget: null,
    inspectedSeatNumber: 0,
    seenGameEventIds: joined.match.game?.eventLog.map((event) => event.id) ?? [],
    seenEventMessageIds: [],
    clientDebugLog: [],
    errorMessage: "",
    confirmingLeave: false,
    confirmingKickSeatNumber: 0,
    confirmingDiscardCardInstanceId: "",
    leftMessage: "",
    chatDraft: "",
    chatExpanded: false,
    chatHidden: true,
    eventPlaybackActive: false,
    activeActionVisual: null,
    centerResponseCards: [],
    activeCardFlight: null,
    activeCombatFx: null,
    activeDamageBurst: null,
    activeHealBurst: null,
    impactTargetSeatNumber: 0
  };
  let eventReplayChain = Promise.resolve();
  let activeReplayBatchCount = 0;

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => window.setTimeout(resolve, ms));

  const logClient = (scope: string, message: string): void => {
    const entry = `${new Date().toISOString()} [client:${scope}] ${message}`;
    state.clientDebugLog.push(entry);
    if (state.clientDebugLog.length > 300) {
      state.clientDebugLog = state.clientDebugLog.slice(-300);
    }
    console.info(entry);
  };

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

  const getSeatDisplayName = (seatNumber?: number): string => {
    if (seatNumber == null) {
      return "Unknown player";
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

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

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

  const applyMatchState = (nextMatch: MatchState | null): void => {
    state.match = nextMatch;
    if (nextMatch == null) {
      state.displayedHpBySeat = {};
      state.centerResponseCards = [];
      state.activeCardFlight = null;
      return;
    }

    const nextLocalSeat = nextMatch.seats.find((seat) => seat.userId === session.currentUser.userId)?.seatNumber;
    if (nextLocalSeat != null) {
      state.localSeatNumber = nextLocalSeat;
    }

    reconcileDisplayedHp();
    if (!state.eventPlaybackActive && nextMatch.game?.pendingAction == null) {
      state.centerResponseCards = [];
      state.activeCardFlight = null;
    }
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
      state.activeDamageBurst =
        options?.damageAmount != null && options?.seatNumber != null
          ? { seatNumber: options.seatNumber, amount: options.damageAmount }
          : null;
      state.activeHealBurst =
        options?.healAmount != null && options?.seatNumber != null
          ? { seatNumber: options.seatNumber, amount: options.healAmount }
          : null;
      state.impactTargetSeatNumber = options?.impactTargetSeatNumber ?? 0;
      render();
      await delay(durationMs);
      if (state.activeCombatFx?.message === message && state.activeCombatFx.seatNumber === options?.seatNumber) {
        state.activeCombatFx = null;
      }
      if (
        state.activeDamageBurst?.seatNumber === options?.seatNumber &&
        state.activeDamageBurst?.amount === options?.damageAmount
      ) {
        state.activeDamageBurst = null;
      }
      if (
        state.activeHealBurst?.seatNumber === options?.seatNumber &&
        state.activeHealBurst?.amount === options?.healAmount
      ) {
        state.activeHealBurst = null;
      }
      if (state.impactTargetSeatNumber === (options?.impactTargetSeatNumber ?? 0)) {
        state.impactTargetSeatNumber = 0;
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
      state.impactTargetSeatNumber = options?.impactTargetSeatNumber ?? 0;
      render();
    };

    const clearCombatFx = (options?: { seatNumber?: number; impactTargetSeatNumber?: number }): void => {
      if (options?.seatNumber == null || state.activeCombatFx?.seatNumber === options.seatNumber) {
        state.activeCombatFx = null;
      }
      if (state.impactTargetSeatNumber === (options?.impactTargetSeatNumber ?? 0)) {
        state.impactTargetSeatNumber = 0;
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
              `${getSeatDisplayName(event.seatNumber)} throws ${event.notation.toUpperCase()} for resistance${bonus} (threshold ${rollContext.threshold ?? 10})`,
              "info",
              { seatNumber: event.seatNumber }
            );
          } else if (rollContext?.kind === "damage") {
            setCombatFx(
              `${getSeatDisplayName(rollContext.actorSeatNumber)} throws ${event.notation.toUpperCase()} for damage on ${getSeatDisplayName(rollContext.targetSeatNumber)}`,
              "failure",
              { seatNumber: rollContext.targetSeatNumber, impactTargetSeatNumber: rollContext.targetSeatNumber }
            );
          } else if (context.currentAction?.actorSeatNumber === event.seatNumber) {
            setCombatFx(
              `${getSeatDisplayName(event.seatNumber)} throws ${event.notation.toUpperCase()} for ${context.currentAction.card.name}`,
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
        return;
      }

      if (event.type === "action_start") {
        state.centerResponseCards = [];
        render();
        await animateCardFlightToCenter(event.card, event.actorSeatNumber, "action");
        context.currentAction = event;
        state.activeActionVisual = {
          actorSeatNumber: event.actorSeatNumber,
          targetSeatNumbers: [...event.targetSeatNumbers],
          targetObjectInstanceId: event.targetObjectInstanceId,
          card: event.card,
          summary: event.summary
        };
        render();
        await showCombatFx(
          event,
          event.summary,
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
        let message = `${getSeatDisplayName(event.seatNumber)} responds`;
        switch (event.responseChoice) {
          case "pass":
            message = `${getSeatDisplayName(event.seatNumber)} passes`;
            break;
          case "resist":
            message = `${getSeatDisplayName(event.seatNumber)} chooses to resist ${event.cardName ?? "the spell"}`;
            break;
          case "resistance_accrue":
            message = `${getSeatDisplayName(event.seatNumber)} plays Resistance accrue`;
            break;
          case "annulation":
            message = `${getSeatDisplayName(event.seatNumber)} plays Annulation`;
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
          `${getSeatDisplayName(event.seatNumber)} prepares a resistance roll${bonus} (threshold ${event.threshold ?? 10})`,
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
        const resultText = failed
          ? `${getSeatDisplayName(event.seatNumber)} threw ${lastRoll?.total ?? "?"}, failed resistance${event.fatalFailure ? " critically (double damage!)" : ""}`
          : event.criticalSuccess
            ? `${getSeatDisplayName(event.seatNumber)} threw 1, critical resistance! No damage!`
            : `${getSeatDisplayName(event.seatNumber)} threw ${lastRoll?.total ?? "?"}, spell resisted`;
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
          `${event.cardName ?? "Attack"} is about to hit ${getSeatDisplayName(event.targetSeatNumber)}`,
          "failure",
          { seatNumber: event.targetSeatNumber, impactTargetSeatNumber: event.targetSeatNumber }
        );
        await delay(180);
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
        }
        await showCombatFx(
          event,
          `${getSeatDisplayName(event.seatNumber)} took ${amount} damage`,
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
          `${getSeatDisplayName(event.seatNumber)} gains ${event.amount} HP`,
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
                    })
                );
              }
              await Promise.all([...queues.values()]);
            };

            // Three-phase playback to preserve correct animation order:
            //   Phase 1: response choices + resistance rolls (up to last resistance_result)
            //   Phase 2: attacker's damage dice rolls (server emits these before attack_impact)
            //   Phase 3: attack impacts (shake/zoom) + hp changes
            const lastResistanceResultIndex = remainingEvents.reduce(
              (lastIndex, event, index) => event.type === "resistance_result" ? index : lastIndex,
              -1
            );
            const firstImpactIndex = remainingEvents.findIndex((event) => event.type === "attack_impact");

            const resistanceBoundary = lastResistanceResultIndex + 1; // 0 when no resistance
            const impactBoundary = firstImpactIndex === -1 ? remainingEvents.length : firstImpactIndex;

            const phase1Events = remainingEvents.slice(0, resistanceBoundary);
            const phase2Events = remainingEvents.slice(resistanceBoundary, impactBoundary);
            const phase3Events = remainingEvents.slice(impactBoundary);

            await runEventsInParallelQueues(phase1Events);
            await runEventsInParallelQueues(phase2Events);
            await runEventsInParallelQueues(phase3Events);
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
            }
            render();
          }
        });
    }
  };

  const getLocalHand = (): CardView[] =>
    state.match?.seats.find((seat) => seat.seatNumber === state.localSeatNumber)?.hand ?? [];

  const getDraggedCard = () => getLocalHand().find((card) => card.instanceId === state.draggingCardInstanceId);

  const clearDragState = (): void => {
    state.draggingCardInstanceId = "";
    state.dragHoverTarget = null;
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

  const executePlayRequest = async (request: Parameters<typeof playCard>[2]): Promise<void> => {
    logClient("play", `Request play ${request.cardInstanceId} mode=${request.mode}${request.targetSeatNumber != null ? ` targetSeat=${request.targetSeatNumber}` : ""}${request.targetObjectInstanceId != null ? ` targetObject=${request.targetObjectInstanceId}` : ""}`);
    applyMatchState(await playCard(state.instanceId, state.playerSessionToken, request));
    state.errorMessage = "";
    clearDragState();
  };

  const handleDraggedCardDrop = async (): Promise<void> => {
    const draggedCard = getDraggedCard();
    const hoverTarget = state.dragHoverTarget;
    if (draggedCard == null || hoverTarget == null) {
      clearDragState();
      render();
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
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active"
        });
      } else if (hoverTarget.kind === "response-slot") {
        const choice =
          draggedCard.cardId === "annulation"
            ? "annulation"
            : draggedCard.cardId === "resistance-accrue"
              ? "resistance_accrue"
              : null;
        if (choice == null) {
          clearDragState();
          render();
          return;
        }

        applyMatchState(await respondToPendingAction(state.instanceId, state.playerSessionToken, {
          choice
        }));
        state.errorMessage = "";
        clearDragState();
      } else if (hoverTarget.kind === "seat" && hoverTarget.seatNumber != null) {
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active",
          targetSeatNumber: hoverTarget.seatNumber
        });
      } else if (hoverTarget.kind === "object" && hoverTarget.objectInstanceId != null) {
        await executePlayRequest({
          cardInstanceId: draggedCard.instanceId,
          mode: "active",
          targetObjectInstanceId: hoverTarget.objectInstanceId
        });
      } else {
        clearDragState();
      }
    } catch (error) {
      clearDragState();
      state.errorMessage = error instanceof Error ? error.message : "Unable to play card";
    }

    render();
  };

  const syncMatch = async (): Promise<void> => {
    if (state.leftMessage !== "") {
      return;
    }

    logClient("sync", "Fetching latest match state");
    applyMatchState(await fetchMatch(state.instanceId, state.playerSessionToken));
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

  const handleDocumentPointerMove = (event: PointerEvent): void => {
    if (state.draggingCardInstanceId === "") {
      return;
    }

    state.dragPointerX = event.clientX;
    state.dragPointerY = event.clientY;
    const hoverTarget = parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
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
    if (event.button !== 0 || state.draggingCardInstanceId === "") {
      return;
    }

    state.dragPointerX = event.clientX;
    state.dragPointerY = event.clientY;
    state.dragHoverTarget = parseHoverTarget(document.elementFromPoint(event.clientX, event.clientY));
    void handleDraggedCardDrop();
  };

  let sseEventSource: EventSource | null = null;
  let sseFallbackPollInterval: number | null = null;

  const connectSSE = (instanceId: string): void => {
    sseEventSource?.close();
    sseEventSource = new EventSource(`/api/matches/${instanceId}/events`);

    sseEventSource.addEventListener("message", () => {
      void syncMatch();
    });

    sseEventSource.addEventListener("open", () => {
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
          sseFallbackPollInterval = window.setInterval(() => void syncMatch(), 4000);
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
        clearDragState();
        state.confirmingDiscardCardInstanceId = "";
        state.leftMessage = "";
        state.seenGameEventIds = freshJoin.match.game?.eventLog.map((event) => event.id) ?? [];
        state.clientDebugLog = [];
        logClient("session", "Started fresh browser session after leaving match");
        connectSSE(state.instanceId);
      } else {
        applyMatchState(null);
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
      applyMatchState(await sendChatMessage(state.instanceId, state.playerSessionToken, content));
      state.chatDraft = "";
      state.chatExpanded = true;
      state.errorMessage = "";
    } catch (error) {
      state.errorMessage = error instanceof Error ? error.message : "Unable to send message";
    }

    render();
  };

  const logNewDealerEvents = (): void => {
    const dealerMessages = state.match?.chatMessages.filter((message) => message.userId === "dealer") ?? [];
    for (const message of dealerMessages) {
      if (state.seenEventMessageIds.includes(message.id)) {
        continue;
      }

      console.info(`[Dealer] ${message.content}`);
      state.seenEventMessageIds.push(message.id);
    }
  };

  const drawPendingActionTargetOverlay = (presentationLockActive: boolean): void => {
    const overlay = rootElement.querySelector<SVGSVGElement>("[data-action-target-overlay='true']");
    if (overlay == null || state.match?.status !== "in_progress" || (presentationLockActive && state.activeActionVisual == null)) {
      if (overlay != null) {
        overlay.innerHTML = "";
      }
      return;
    }

    const pendingAction = state.activeActionVisual ?? state.match.game?.pendingAction;
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
      const controlOffset = Math.max(40, Math.abs(actorY - originY) * 0.28);
      const actorPath = `M ${actorX} ${actorY} C ${actorX} ${actorY - controlOffset}, ${originX} ${originY + controlOffset}, ${originX} ${originY}`;
      pathMarkup.push(`<path class="action-target-overlay__attacker" d="${actorPath}" />`);
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

    overlay.setAttribute("viewBox", `0 0 ${Math.max(1, tableRect.width)} ${Math.max(1, tableRect.height)}`);
    pathMarkup.push(...targetElements.map((targetElement) => {
      const targetRect = targetElement.getBoundingClientRect();
      const targetX = targetRect.left - tableRect.left + (targetRect.width / 2);
      const targetY = targetRect.top - tableRect.top + (targetRect.height / 2);
      const controlOffset = Math.max(40, Math.abs(targetY - originY) * 0.32);
      const path = `M ${originX} ${originY} C ${originX} ${originY + controlOffset}, ${targetX} ${targetY - controlOffset}, ${targetX} ${targetY}`;
      return `<path class="action-target-overlay__target" d="${path}" />`;
    }));
    overlay.innerHTML = pathMarkup.join("");
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

    logNewDealerEvents();

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

    const eventLogMarkup = "";
    const presentationLockActive =
      state.eventPlaybackActive
      || (state.match.game?.eventLog ?? []).some((event) => !state.seenGameEventIds.includes(event.id));

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
            displayedHpBySeat: state.displayedHpBySeat,
            presentationLockActive,
            activeActionVisual: state.activeActionVisual,
            centerResponseCards: state.centerResponseCards,
            activeCardFlight: state.activeCardFlight,
            draggingCardInstanceId: state.draggingCardInstanceId,
            dragPointerX: state.dragPointerX,
            dragPointerY: state.dragPointerY,
            dragHoverTarget: state.dragHoverTarget,
            inspectedSeatNumber: state.inspectedSeatNumber,
            errorMessage: state.errorMessage,
            chatMarkup,
            eventLogMarkup,
            activeCombatFx: state.activeCombatFx,
            activeDamageBurst: state.activeDamageBurst,
            activeHealBurst: state.activeHealBurst,
            impactTargetSeatNumber: state.impactTargetSeatNumber
          });
    const kickTarget = state.match.seats.find((seat) => seat.seatNumber === state.confirmingKickSeatNumber);
    rootElement.innerHTML = `${baseView}${renderLeaveConfirmationModal(state.confirmingLeave)}${kickTarget != null ? renderKickConfirmationModal(kickTarget.displayName) : ""}${renderDiscardConfirmationModal(state.confirmingDiscardCardInstanceId !== "")}`;
    drawPendingActionTargetOverlay(presentationLockActive);

    rootElement.querySelector<HTMLButtonElement>("[data-action='add-bot']")?.addEventListener("click", async () => {
      try {
        logClient("lobby", "Host requested add bot");
        applyMatchState(await requestAddBot(state.instanceId, state.playerSessionToken));
        state.errorMessage = "";
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : "Unable to add bot";
      }

      render();
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
        state.draggingCardInstanceId = cardInstanceId;
        state.dragPointerX = event.clientX;
        state.dragPointerY = event.clientY;
        state.dragHoverTarget = null;
        state.inspectedSeatNumber = 0;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='inspect-seat']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = button.dataset.seatNumber == null ? 0 : Number(button.dataset.seatNumber);
        state.inspectedSeatNumber = state.inspectedSeatNumber === seatNumber ? 0 : seatNumber;
        render();
      });
    });

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='kick-seat']").forEach((button) => {
      button.addEventListener("click", () => {
        const seatNumber = button.dataset.seatNumber == null ? 0 : Number(button.dataset.seatNumber);
        state.confirmingKickSeatNumber = seatNumber;
        render();
      });
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
        state.errorMessage = error instanceof Error ? error.message : "Unable to kick player";
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
        state.errorMessage = error instanceof Error ? error.message : "Unable to discard card";
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
        state.seenGameEventIds = state.match?.game?.eventLog.map((event) => event.id) ?? [];
      } catch (error) {
        state.errorMessage = error instanceof Error ? error.message : "Unable to start match";
      }

      render();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='refresh']")?.addEventListener("click", () => {
      void syncMatch();
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='download-server-log']")?.addEventListener("click", () => {
      const lines = (state.match?.game?.debugLog ?? []).map(
        (entry) => `${entry.createdAt} [${entry.source}:${entry.scope}] ${entry.message}`
      );
      downloadTextFile(`emerlaus-server-log-${state.instanceId}.log`, lines.join("\n"));
    });

    rootElement.querySelector<HTMLButtonElement>("[data-action='download-client-log']")?.addEventListener("click", () => {
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
        state.errorMessage = err instanceof Error ? err.message : "Failed to draw card";
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

    rootElement.querySelectorAll<HTMLButtonElement>("[data-action='respond-pending']").forEach((button) => {
      button.addEventListener("click", async () => {
        const choice = button.dataset.choice;
        if (choice !== "pass" && choice !== "resist" && choice !== "annulation" && choice !== "resistance_accrue") {
          return;
        }

        button.disabled = true;

        try {
          logClient("response", `Respond ${choice}`);
          applyMatchState(await respondToPendingAction(state.instanceId, state.playerSessionToken, {
            choice
          }));
          state.errorMessage = "";
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : "Unable to respond to the action";
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

  const unsubscribe = session.subscribeToParticipantUpdates(() => {
    void syncMatch();
  });

  window.addEventListener("beforeunload", () => {
    sseEventSource?.close();
    if (sseFallbackPollInterval != null) {
      window.clearInterval(sseFallbackPollInterval);
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
