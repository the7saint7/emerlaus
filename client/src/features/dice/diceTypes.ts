export const SUPPORTED_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;

export interface DiceRollResult {
  notation: string;
  total: number;
  values: number[];
}
