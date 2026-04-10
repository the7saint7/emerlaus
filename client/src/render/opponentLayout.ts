export interface OpponentAnchor {
  slotNumber: number;
  x: number;
  y: number;
}

export const OPPONENT_LAYOUT_SLOTS: OpponentAnchor[] = [
  { slotNumber: 1, x: 18, y: 58 },
  { slotNumber: 2, x: 12, y: 42 },
  { slotNumber: 3, x: 18, y: 26 },
  { slotNumber: 4, x: 32, y: 14 },
  { slotNumber: 5, x: 50, y: 10 },
  { slotNumber: 6, x: 68, y: 14 },
  { slotNumber: 7, x: 82, y: 26 },
  { slotNumber: 8, x: 88, y: 42 },
  { slotNumber: 9, x: 82, y: 58 }
];

// Maps total player count to the visual opponent slots used on the table.
// The array order is clockwise from the local player's left to right.
export const OPPONENT_SLOT_MAP_BY_PLAYER_COUNT: Record<number, number[]> = {
  2: [5],
  3: [3, 7],
  4: [3, 5, 7],
  5: [2, 4, 6, 8],
  6: [1, 3, 5, 7, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [2, 3, 4, 5, 6, 7, 8],
  9: [1, 2, 3, 4, 5, 6, 7, 8],
  10: [1, 2, 3, 4, 5, 6, 7, 8, 9]
};

export function getOpponentAnchorsForPlayerCount(playerCount: number): OpponentAnchor[] {
  const mappedSlots = OPPONENT_SLOT_MAP_BY_PLAYER_COUNT[playerCount] ?? [];

  return mappedSlots
    .map((slotNumber) => OPPONENT_LAYOUT_SLOTS.find((slot) => slot.slotNumber === slotNumber))
    .filter((slot): slot is OpponentAnchor => slot != null);
}
