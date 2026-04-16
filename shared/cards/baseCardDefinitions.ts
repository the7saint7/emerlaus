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

export {
  baseCardDefinitions,
  defaultDefenseBandByCategory,
  abondanceCardDefinitions,
  abondanceDeckCardQuantities,
  puissanceCardDefinitions,
  puissanceDeckCardQuantities
};

export const allCardDefinitions = [
  ...baseCardDefinitions,
  ...abondanceCardDefinitions,
  ...puissanceCardDefinitions
];

export const baseCardDefinitionById = {
  ...baseOnlyCardDefinitionById,
  ...abondanceCardDefinitionById,
  ...puissanceCardDefinitionById
};
