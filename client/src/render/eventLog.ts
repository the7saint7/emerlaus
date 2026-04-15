import type { GameEvent, MatchState } from "../../../shared/types";
import { localizeCardNameForUi, localizeDealerMessageForUi, t, type AppLanguage } from "../i18n";

export interface EventLogEntry {
  id: string;
  content: string;
  createdAt: string;
}

function getSeatDisplayName(match: MatchState, seatNumber?: number): string {
  if (seatNumber == null) {
    return "";
  }

  return match.seats.find((seat) => seat.seatNumber === seatNumber)?.displayName ?? `Seat ${seatNumber}`;
}

function isMirrorReflectSummary(summary: string): boolean {
  return /^.+ reflects .+ back at .+!?$/.test(summary);
}

function localizeCombatCardName(cardName: string | undefined, language: AppLanguage): string {
  if (cardName == null || cardName === "") {
    return language === "fr" ? "Attaque" : "Attack";
  }

  return localizeCardNameForUi(cardName, language);
}

function buildBoxEntries(match: MatchState, language: AppLanguage, _boxId: string, events: GameEvent[]): EventLogEntry[] {
  const entries: EventLogEntry[] = [];
  const actionStart = events.find((event): event is Extract<GameEvent, { type: "action_start" }> => event.type === "action_start");
  if (actionStart != null && !isMirrorReflectSummary(actionStart.summary)) {
    entries.push({
      id: `action:${actionStart.id}`,
      content: localizeDealerMessageForUi(actionStart.summary, language),
      createdAt: actionStart.createdAt
    });
  }

  const lastDiceTotalBySeat = new Map<number, number>();

  for (const event of events) {
    if (event.type === "dice_roll") {
      if (event.seatNumber != null) {
        lastDiceTotalBySeat.set(event.seatNumber, event.total);
      }
      continue;
    }

    if (event.type === "response_choice") {
      const playerName = getSeatDisplayName(match, event.seatNumber);
      const key =
        event.responseChoice === "pass"
          ? "combat.response.pass"
          : event.responseChoice === "resist"
            ? "combat.response.resist"
            : event.responseChoice === "resistance_accrue"
              ? "combat.response.resistance_accrue"
              : event.responseChoice === "annulation"
                ? "combat.response.annulation"
                : "combat.response.mirror";
      entries.push({
        id: `response:${event.id}`,
        content: t(language, key, { playerName }),
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.type === "resistance_start") {
      const bonus = event.bonus == null || event.bonus === 0 ? "" : ` ${event.bonus > 0 ? `+${event.bonus}` : `${event.bonus}`}`;
      entries.push({
        id: `resistance-start:${event.id}`,
        content: t(language, "combat.resistance.prepare", {
          playerName: getSeatDisplayName(match, event.seatNumber),
          bonus,
          threshold: event.threshold ?? 10
        }),
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.type === "resistance_result") {
      const diceTotal = event.seatNumber != null ? lastDiceTotalBySeat.get(event.seatNumber) : undefined;
      const total = diceTotal != null ? String(diceTotal) : "?";
      const playerName = getSeatDisplayName(match, event.seatNumber);
      const key = event.success === false
        ? event.fatalFailure
          ? "combat.resistance.failedCritical"
          : "combat.resistance.failed"
        : event.criticalSuccess
          ? "combat.resistance.critical"
          : "combat.resistance.success";
      entries.push({
        id: `resistance:${event.id}`,
        content: t(language, key, { playerName, total }),
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.type === "attack_impact") {
      entries.push({
        id: `impact:${event.id}`,
        content: t(language, "combat.attackIncoming", {
          cardName: localizeCombatCardName(event.cardName, language),
          targetName: getSeatDisplayName(match, event.targetSeatNumber)
        }),
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.type === "hp_loss" && event.seatNumber != null && (event.amount ?? 0) > 0) {
      entries.push({
        id: `damage:${event.id}`,
        content: t(language, "combat.tookDamage", {
          playerName: getSeatDisplayName(match, event.seatNumber),
          amount: event.amount ?? 0
        }),
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.type === "hp_gain" && event.seatNumber != null && (event.amount ?? 0) > 0) {
      entries.push({
        id: `heal:${event.id}`,
        content: t(language, "combat.gainsHp", {
          playerName: getSeatDisplayName(match, event.seatNumber),
          amount: event.amount ?? 0
        }),
        createdAt: event.createdAt
      });
    }
  }

  return entries;
}

function shouldKeepDealerMessage(content: string): boolean {
  return ![
    /^Dealer rolled /,
    /^The dealer rolled /,
    /^.+ played .+\.$/,
    /^.+ critically resisted .+!$/,
    /^.+ resisted .+\.$/,
    /^.+ critically failed the resistance roll\.$/,
    /^.+ canceled .+\.$/,
    /^.+ reflects .+ back at .+!?$/,
    /^.+ had no CA card and resisted automatically\.$/,
    /^.+ had no CA card and relied on normal resistance\.$/,
    /^.+ had no defense .* passed automatically\.$/,
    /^.+ was canceled before resolving\.$/
  ].some((pattern) => pattern.test(content));
}

export function buildEventLogEntries(match: MatchState, language: AppLanguage): EventLogEntry[] {
  const entries: EventLogEntry[] = [];
  const orderedBoxIds: string[] = [];
  const eventsByBoxId = new Map<string, GameEvent[]>();

  for (const event of match.game?.eventLog ?? []) {
    const boxId = "boxId" in event ? event.boxId : undefined;
    if (boxId == null || boxId === "") {
      continue;
    }

    if (!eventsByBoxId.has(boxId)) {
      eventsByBoxId.set(boxId, []);
      orderedBoxIds.push(boxId);
    }
    eventsByBoxId.get(boxId)?.push(event);
  }

  for (const boxId of orderedBoxIds) {
    const boxEvents = eventsByBoxId.get(boxId);
    if (boxEvents == null) {
      continue;
    }

    entries.push(...buildBoxEntries(match, language, boxId, boxEvents));
  }

  for (const message of match.chatMessages) {
    if (message.userId !== "dealer" || !shouldKeepDealerMessage(message.content)) {
      continue;
    }

    entries.push({
      id: `dealer:${message.id}`,
      content: localizeDealerMessageForUi(message.content, language),
      createdAt: message.createdAt
    });
  }

  return entries.sort((left, right) =>
    left.createdAt === right.createdAt
      ? left.id.localeCompare(right.id)
      : left.createdAt.localeCompare(right.createdAt)
  );
}
