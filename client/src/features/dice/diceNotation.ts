import { SUPPORTED_DICE_SIDES } from "./diceTypes";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function buildRandomTestDiceNotation(): string {
  const sides = SUPPORTED_DICE_SIDES[randomInt(0, SUPPORTED_DICE_SIDES.length - 1)];
  const quantity = randomInt(1, 3);
  return `${quantity}d${sides}`;
}
