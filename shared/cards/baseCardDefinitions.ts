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

export { baseCardDefinitions, defaultDefenseBandByCategory, abondanceCardDefinitions, abondanceDeckCardQuantities };

export const allCardDefinitions = [
  ...baseCardDefinitions,
  ...abondanceCardDefinitions
];

export const baseCardDefinitionById = {
  ...baseOnlyCardDefinitionById,
  ...abondanceCardDefinitionById
};
