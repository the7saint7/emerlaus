import type { GameEvent, MatchState } from "../../../shared/types";
import { localizeCardNameForUi, localizeDealerMessageForUi, type AppLanguage } from "../i18n";

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

function joinNames(names: string[], language: AppLanguage): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return language === "fr"
      ? `${names[0]} et ${names[1]}`
      : `${names[0]} and ${names[1]}`;
  }

  const head = names.slice(0, -1).join(", ");
  const tail = names[names.length - 1];
  return language === "fr"
    ? `${head} et ${tail}`
    : `${head}, and ${tail}`;
}

function formatAmountWithDice(amount: number, diceEvents: Extract<GameEvent, { type: "dice_roll" }>[]): string {
  if (diceEvents.length === 0) {
    return String(amount);
  }

  const total = diceEvents.reduce((sum, event) => sum + event.total, 0);
  if (total !== amount) {
    return String(amount);
  }

  if (diceEvents.length === 1) {
    return String(amount);
  }

  return `${diceEvents.map((event) => event.total).join(" + ")} (${amount})`;
}

function isMirrorReflectSummary(summary: string): boolean {
  return /^.+ reflects .+ back at .+!?$/.test(summary);
}

function buildBoxEntries(match: MatchState, language: AppLanguage, boxId: string, events: GameEvent[]): EventLogEntry[] {
  const entries: EventLogEntry[] = [];
  const actionStart = events.find((event): event is Extract<GameEvent, { type: "action_start" }> => event.type === "action_start");
  if (actionStart != null && !isMirrorReflectSummary(actionStart.summary)) {
    entries.push({
      id: `action:${actionStart.id}`,
      content: localizeDealerMessageForUi(actionStart.summary, language),
      createdAt: actionStart.createdAt
    });
  }

  const namedEvent = events.find(
    (event): event is Extract<GameEvent, { cardName?: string }> => "cardName" in event && typeof event.cardName === "string"
  );
  const cardName = actionStart?.card.name ?? namedEvent?.cardName ?? "";
  const localizedCardName = cardName === "" ? "" : localizeCardNameForUi(cardName, language);
  const successfulResistanceSeatNumbers = new Set<number>();
  for (const event of events) {
    if (event.type === "resistance_result" && event.success === true && event.seatNumber != null) {
      successfulResistanceSeatNumbers.add(event.seatNumber);
    }
  }
  const partialResistanceSeatNumbers = new Set<number>();
  for (const event of events) {
    if (event.type === "hp_loss" && event.seatNumber != null && (event.amount ?? 0) > 0 && successfulResistanceSeatNumbers.has(event.seatNumber)) {
      partialResistanceSeatNumbers.add(event.seatNumber);
    }
  }

  for (const event of events) {
    if (event.type !== "response_choice") {
      continue;
    }

    const playerName = getSeatDisplayName(match, event.seatNumber);
    if (event.responseChoice === "mirror") {
      entries.push({
        id: `response:${event.id}`,
        content: language === "fr"
          ? `${playerName} utilise Miroir.`
          : `${playerName} used Mirror.`,
        createdAt: event.createdAt
      });
    }

    if (event.responseChoice === "annulation") {
      entries.push({
        id: `response:${event.id}`,
        content: language === "fr"
          ? `${playerName} joue Annulation.`
          : `${playerName} plays Annulation.`,
        createdAt: event.createdAt
      });
    }
  }

  for (const event of events) {
    if (event.type !== "resistance_result") {
      continue;
    }

    const playerName = getSeatDisplayName(match, event.seatNumber);
    if (event.criticalSuccess) {
      entries.push({
        id: `resistance:${event.id}`,
        content: language === "fr"
          ? `${playerName} resiste de facon critique a ${localizedCardName} !`
          : `${playerName} critically resisted ${localizedCardName}!`,
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.success) {
      entries.push({
        id: `resistance:${event.id}`,
        content: language === "fr"
          ? partialResistanceSeatNumbers.has(event.seatNumber ?? 0)
            ? `${playerName} resiste partiellement a ${localizedCardName}.`
            : `${playerName} resiste a ${localizedCardName}.`
          : partialResistanceSeatNumbers.has(event.seatNumber ?? 0)
            ? `${playerName} partially resisted ${localizedCardName}.`
            : `${playerName} resisted ${localizedCardName}.`,
        createdAt: event.createdAt
      });
      continue;
    }

    if (event.fatalFailure) {
      entries.push({
        id: `resistance:${event.id}`,
        content: language === "fr"
          ? `${playerName} echoue de facon critique a son jet de resistance.`
          : `${playerName} critically failed the resistance roll.`,
        createdAt: event.createdAt
      });
    }
  }

  const diceEvents = events.filter((event): event is Extract<GameEvent, { type: "dice_roll" }> => event.type === "dice_roll");
  const hpGainBySeat = new Map<number, { amount: number; createdAt: string }>();
  const hpLossBySeat = new Map<number, { amount: number; createdAt: string }>();

  for (const event of events) {
    if (event.type === "hp_gain" && event.seatNumber != null && (event.amount ?? 0) > 0) {
      const current = hpGainBySeat.get(event.seatNumber);
      hpGainBySeat.set(event.seatNumber, {
        amount: (current?.amount ?? 0) + (event.amount ?? 0),
        createdAt: current == null || current.createdAt < event.createdAt ? event.createdAt : current.createdAt
      });
    }

    if (event.type === "hp_loss" && event.seatNumber != null && (event.amount ?? 0) > 0) {
      const current = hpLossBySeat.get(event.seatNumber);
      hpLossBySeat.set(event.seatNumber, {
        amount: (current?.amount ?? 0) + (event.amount ?? 0),
        createdAt: current == null || current.createdAt < event.createdAt ? event.createdAt : current.createdAt
      });
    }
  }

  for (const [seatNumber, outcome] of [...hpGainBySeat.entries()].sort((a, b) => a[0] - b[0])) {
    const playerName = getSeatDisplayName(match, seatNumber);
    const amountText = formatAmountWithDice(outcome.amount, diceEvents);
    entries.push({
      id: `heal:${boxId}:${seatNumber}`,
      content: language === "fr"
        ? `${playerName} recupere ${amountText} PV.`
        : `${playerName} heals ${amountText} HP.`,
      createdAt: outcome.createdAt
    });
  }

  const groupedLosses = new Map<string, { amount: number; seatNumbers: number[]; createdAt: string; afterResistance: boolean }>();
  for (const [seatNumber, outcome] of hpLossBySeat.entries()) {
    const afterResistance = partialResistanceSeatNumbers.has(seatNumber);
    const groupKey = `${outcome.amount}:${afterResistance ? "after-resistance" : "normal"}`;
    const current = groupedLosses.get(groupKey);
    if (current == null) {
      groupedLosses.set(groupKey, {
        amount: outcome.amount,
        seatNumbers: [seatNumber],
        createdAt: outcome.createdAt,
        afterResistance
      });
      continue;
    }

    current.seatNumbers.push(seatNumber);
    if (current.createdAt < outcome.createdAt) {
      current.createdAt = outcome.createdAt;
    }
  }

  for (const [, outcome] of [...groupedLosses.entries()].sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt))) {
    const names = outcome.seatNumbers
      .sort((a, b) => a - b)
      .map((seatNumber) => getSeatDisplayName(match, seatNumber));
    const amountText = formatAmountWithDice(outcome.amount, diceEvents);
    const subject = joinNames(names, language);
    entries.push({
      id: `damage:${boxId}:${outcome.amount}:${outcome.afterResistance ? "after-resistance" : "normal"}:${outcome.seatNumbers.sort((a, b) => a - b).join(",")}`,
      content: names.length === 1
        ? language === "fr"
          ? outcome.afterResistance
            ? `${subject} ne subit plus que ${amountText} degats apres resistance.`
            : `${subject} subit ${amountText} degats.`
          : outcome.afterResistance
            ? `${subject} only takes ${amountText} damage after resisting.`
            : `${subject} takes ${amountText} damage.`
        : language === "fr"
          ? outcome.afterResistance
            ? `${subject} ne subissent plus que ${amountText} degats apres resistance.`
            : `${subject} subissent ${amountText} degats.`
          : outcome.afterResistance
            ? `${subject} only take ${amountText} damage after resisting.`
            : `${subject} take ${amountText} damage.`,
      createdAt: outcome.createdAt
    });
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
