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

export {
  baseCardDefinitions,
  defaultDefenseBandByCategory,
  abondanceCardDefinitions,
  abondanceDeckCardQuantities,
  puissanceCardDefinitions,
  puissanceDeckCardQuantities,
  communionCardDefinitions,
  communionDeckCardQuantities
};

export const allCardDefinitions = [
  ...baseCardDefinitions,
  ...abondanceCardDefinitions,
  ...puissanceCardDefinitions,
  ...communionCardDefinitions
];

export const baseCardDefinitionById = {
  ...baseOnlyCardDefinitionById,
  ...abondanceCardDefinitionById,
  ...puissanceCardDefinitionById,
  ...communionCardDefinitionById
};
