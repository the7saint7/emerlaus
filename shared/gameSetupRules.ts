import {
  abondanceDeckCardQuantities,
  baseCardDefinitions,
  communionDeckCardQuantities,
  puissanceDeckCardQuantities,
  sorcellerieDeckCardQuantities
} from "./cards/index.js";
import type { MatchExpansionSettings } from "./types.js";

function sumQuantities(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((total, quantity) => total + quantity, 0);
}

export function determineDeckSize(enabledExpansions: MatchExpansionSettings): number {
  let deckSize = baseCardDefinitions.reduce((total, card) => total + card.baseDeckQuantity, 0);

  if (enabledExpansions.sorcellerie) {
    deckSize += sumQuantities(sorcellerieDeckCardQuantities);
  }

  if (enabledExpansions.abondance) {
    deckSize += sumQuantities(abondanceDeckCardQuantities);
  }

  if (enabledExpansions.puissance) {
    deckSize += sumQuantities(puissanceDeckCardQuantities);
  }

  if (enabledExpansions.communion) {
    deckSize += sumQuantities(communionDeckCardQuantities);
  }

  return deckSize;
}

export function determineMinimumHandSize(deckSize: number): number {
  if (deckSize >= 300) {
    return 7;
  }

  if (deckSize >= 200) {
    return 6;
  }

  return 5;
}

export function determineSetupHandSize(enabledExpansions: MatchExpansionSettings): number {
  return determineMinimumHandSize(determineDeckSize(enabledExpansions));
}
