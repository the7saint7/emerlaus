import type { MatchState, SeatState } from "./types";

export function sortSeatsAscending(seats: SeatState[]): SeatState[] {
  return [...seats].sort((left, right) => left.seatNumber - right.seatNumber);
}

export function getRelativeSeatNumber(
  seatNumber: number,
  localSeatNumber: number,
  maxSeats: number
): number {
  return ((seatNumber - localSeatNumber + maxSeats) % maxSeats) + 1;
}

export function getLocalSeat(match: MatchState, localSeatNumber: number): SeatState | undefined {
  return match.seats.find((seat) => seat.seatNumber === localSeatNumber);
}

export function getOpponentSeats(match: MatchState, localSeatNumber: number): SeatState[] {
  return sortSeatsAscending(match.seats)
    .filter((seat) => seat.seatNumber !== localSeatNumber)
    .sort((left, right) => {
      const leftRelative = getRelativeSeatNumber(left.seatNumber, localSeatNumber, match.maxSeats);
      const rightRelative = getRelativeSeatNumber(right.seatNumber, localSeatNumber, match.maxSeats);
      return leftRelative - rightRelative;
    });
}
