import type { GameEvent, MatchState } from "../../../shared/types";
import { localizeCardNameForUi, localizeDealerMessageForUi, t, type AppLanguage } from "../i18n";

export interface EventLogEntry {
  id: string;
  content: string;
  createdAt: string;
}

interface SortableEventLogEntry extends EventLogEntry {
  sortOrder: number;
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
  const entries: SortableEventLogEntry[] = [];
  let sortOrder = 0;
  const lastDiceTotalBySeat = new Map<number, number>();

  for (const event of match.game?.eventLog ?? []) {
    if (event.type === "dice_roll") {
      if (event.seatNumber != null) {
        lastDiceTotalBySeat.set(event.seatNumber, event.total);
      }
      continue;
    }

    if (event.type === "dealer_message") {
      if (!shouldKeepDealerMessage(event.content)) {
        continue;
      }

      entries.push({
        id: `dealer:${event.id}`,
        content: localizeDealerMessageForUi(event.content, language),
        createdAt: event.createdAt,
        sortOrder: sortOrder++
      });
      continue;
    }

    if (event.type === "seat_snapshot") {
      continue;
    }

    if (event.type === "turn_start") {
      continue;
    }

    if (event.type === "action_start") {
      if (isMirrorReflectSummary(event.summary)) {
        continue;
      }

      entries.push({
        id: `action:${event.id}`,
        content: localizeDealerMessageForUi(event.summary, language),
        createdAt: event.createdAt,
        sortOrder: sortOrder++
      });
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
                ? (event.responseCardCount ?? 0) > 1
                  ? "combat.response.annulation_multi"
                  : "combat.response.annulation"
                : event.responseChoice === "ordre-demmerlaus"
                  ? "combat.response.ordre_demmerlaus"
                  : "combat.response.mirror";
      entries.push({
        id: `response:${event.id}`,
        content: t(language, key, {
          playerName,
          cardName: event.cardName ?? "",
          count: event.responseCardCount ?? 1
        }),
        createdAt: event.createdAt,
        sortOrder: sortOrder++
      });
      continue;
    }

    if (event.type === "ordre_interrupt") {
      entries.push({
        id: `ordre:${event.id}`,
        content: t(language, "combat.response.ordre_demmerlaus", {
          playerName: getSeatDisplayName(match, event.seatNumber),
          cardName: localizeCombatCardName(event.cardName ?? event.interruptedCard?.name, language),
          count: 1
        }),
        createdAt: event.createdAt,
        sortOrder: sortOrder++
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
        createdAt: event.createdAt,
        sortOrder: sortOrder++
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
        createdAt: event.createdAt,
        sortOrder: sortOrder++
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
        createdAt: event.createdAt,
        sortOrder: sortOrder++
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
        createdAt: event.createdAt,
        sortOrder: sortOrder++
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
        createdAt: event.createdAt,
        sortOrder: sortOrder++
      });
    }
  }

  return entries
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.sortOrder - right.sortOrder
        : left.createdAt.localeCompare(right.createdAt)
    )
    .map(({ sortOrder: _sortOrder, ...entry }) => entry);
}
