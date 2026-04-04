const SEAT_DICE_COLORS = [
  "#b44646",
  "#3f78bf",
  "#2d9b63",
  "#9a5bd7",
  "#d38b2c",
  "#ca4f92",
  "#2aa7a0",
  "#7b8c2c",
  "#c15b3b",
  "#5c6fdb"
] as const;

export function getSeatDiceColor(seatNumber?: number): string {
  if (seatNumber == null || seatNumber < 1) {
    return "#4b2a6f";
  }

  return SEAT_DICE_COLORS[(seatNumber - 1) % SEAT_DICE_COLORS.length];
}
