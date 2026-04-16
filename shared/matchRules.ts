import { defaultMatchExpansionSettings, type MatchState, type SeatState } from "./types.js";

function generateShortId(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createEmptyMatch(instanceId: string, maxSeats = 10): MatchState {
  return {
    instanceId,
    shortId: generateShortId(),
    status: "lobby",
    maxSeats,
    enabledExpansions: { ...defaultMatchExpansionSettings },
    seats: [],
    createdAt: new Date().toISOString()
  };
}

export function getSeatByUserId(match: MatchState, userId: string): SeatState | undefined {
  return match.seats.find((seat) => seat.userId === userId);
}

export function findNextOpenSeat(match: MatchState): number | undefined {
  for (let seatNumber = 1; seatNumber <= match.maxSeats; seatNumber += 1) {
    if (!match.seats.some((seat) => seat.seatNumber === seatNumber)) {
      return seatNumber;
    }
  }

  return undefined;
}

export function findNextHostSeat(match: MatchState, excludingUserId?: string): SeatState | undefined {
  return [...match.seats]
    .filter(
      (seat) =>
        seat.controllerType === "human" &&
        seat.connected &&
        seat.userId !== excludingUserId
    )
    .sort((left, right) => left.seatNumber - right.seatNumber)[0];
}

export function clearHostFlags(match: MatchState): void {
  for (const seat of match.seats) {
    seat.isHost = false;
  }
}

export function assignHost(match: MatchState, userId?: string): void {
  clearHostFlags(match);

  if (userId != null) {
    const explicitSeat = getSeatByUserId(match, userId);
    if (explicitSeat != null) {
      explicitSeat.isHost = true;
      return;
    }
  }

  const fallbackSeat = findNextHostSeat(match);
  if (fallbackSeat != null) {
    fallbackSeat.isHost = true;
  }
}

export function seedSkeletonStats(match: MatchState): void {
  for (const seat of match.seats) {
    seat.handCount = 4;
    seat.hp = 50;
  }
}
