import {
  baseCardDefinitionById as baseOnlyCardDefinitionById,
  baseCardDefinitions,
  defaultDefenseBandByCategory
} from "./catalog/base-cards.js";
import {
  abondanceCardDefinitionById,
  abondanceCardDefinitions,
  abondanceDeckCardQuantities
} from "./catalog/abondance-cards.js";
import {
  puissanceCardDefinitionById,
  puissanceCardDefinitions,
  puissanceDeckCardQuantities
} from "./catalog/puissance-cards.js";
import {
  communionCardDefinitionById,
  communionCardDefinitions,
  communionDeckCardQuantities
} from "./catalog/communion-cards.js";
import {
  sorcellerieCardDefinitionById,
  sorcellerieCardDefinitions,
  sorcellerieDeckCardQuantities
} from "./catalog/sorcellerie-cards.js";

export {
  baseCardDefinitions,
  defaultDefenseBandByCategory,
  abondanceCardDefinitions,
  abondanceDeckCardQuantities,
  puissanceCardDefinitions,
  puissanceDeckCardQuantities,
  communionCardDefinitions,
  communionDeckCardQuantities,
  sorcellerieCardDefinitions,
  sorcellerieDeckCardQuantities
};

export const allCardDefinitions = [
  ...baseCardDefinitions,
  ...sorcellerieCardDefinitions,
  ...abondanceCardDefinitions,
  ...puissanceCardDefinitions,
  ...communionCardDefinitions
];

export const baseCardDefinitionById = {
  ...baseOnlyCardDefinitionById,
  ...sorcellerieCardDefinitionById,
  ...abondanceCardDefinitionById,
  ...puissanceCardDefinitionById,
  ...communionCardDefinitionById
};
