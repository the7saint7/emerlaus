import fs from "node:fs";
import path from "node:path";
import {
  abondanceCardDefinitions,
  communionCardDefinitions,
  defaultDefenseBandByCategory,
  puissanceCardDefinitions,
  type BaseCardDefinition,
  type CardCategoryCode,
  type CardRules,
  type DefenseBandRules,
  type DevCardCatalogId
} from "../../shared/cards/index.js";

const CATALOG_CONFIG = {
  base: {
    path: path.resolve(process.cwd(), "shared/cards/catalog/base-cards.ts"),
    exportStart: "export const baseCardDefinitions = ",
    format: "json_array"
  },
  abondance: {
    path: path.resolve(process.cwd(), "shared/cards/catalog/abondance-cards.ts"),
    exportStart: "export const abondanceCardDefinitions = ",
    format: "makecard_array"
  },
  puissance: {
    path: path.resolve(process.cwd(), "shared/cards/catalog/puissance-cards.ts"),
    exportStart: "export const puissanceCardDefinitions = ",
    format: "makecard_array"
  },
  communion: {
    path: path.resolve(process.cwd(), "shared/cards/catalog/communion-cards.ts"),
    exportStart: "export const communionCardDefinitions = ",
    format: "makecard_array"
  }
} as const satisfies Record<DevCardCatalogId, {
  path: string;
  exportStart: string;
  format: "json_array" | "makecard_array";
}>;

const CATEGORY_LABEL_BY_CODE: Record<CardCategoryCode, string> = {
  AD: "Attaques directes",
  AM: "Attaques massives",
  A: "Attributs",
  O: "Objets",
  E: "Emmerlaüs",
  S: "Spéciales",
  CA: "Contre-attaques",
  CO: "Contre-objets",
  ST: "Stratégies",
  SO: "Sortilèges"
};

interface CatalogArrayBounds {
  arrayStart: number;
  arrayEnd: number;
}

interface SourceMakeCardInput {
  id: string;
  name: string;
  enName?: string;
  description: string;
  enDescription?: string;
  code: CardCategoryCode;
  file: string;
  rules: CardRules;
  defenseBand?: DefenseBandRules | null;
  implementation?: BaseCardDefinition["implementation"];
}

function getCatalogConfig(catalogId: DevCardCatalogId) {
  return CATALOG_CONFIG[catalogId];
}

function allCatalogIds(): DevCardCatalogId[] {
  return Object.keys(CATALOG_CONFIG) as DevCardCatalogId[];
}

function isQuoteCharacter(character: string): boolean {
  return character === "\"" || character === "'" || character === "`";
}

function findDelimitedRegionEnd(source: string, startIndex: number, openCharacter: string, closeCharacter: string): number {
  if (source[startIndex] !== openCharacter) {
    throw new Error(`Expected ${openCharacter} at index ${startIndex}`);
  }

  let depth = 0;
  let activeQuote: string | null = null;
  let isEscaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character == null) {
      break;
    }

    if (activeQuote != null) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (isQuoteCharacter(character)) {
      activeQuote = character;
      continue;
    }

    if (character === openCharacter) {
      depth += 1;
      continue;
    }

    if (character === closeCharacter) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Unable to find closing ${closeCharacter}`);
}

function findCatalogArrayBounds(source: string, exportPrefix: string): CatalogArrayBounds {
  const exportStart = source.indexOf(exportPrefix);
  if (exportStart === -1) {
    throw new Error("Unable to find card catalog export");
  }

  const arrayStart = source.indexOf("[", exportStart + exportPrefix.length);
  if (arrayStart === -1) {
    throw new Error("Unable to find card catalog array start");
  }

  return {
    arrayStart,
    arrayEnd: findDelimitedRegionEnd(source, arrayStart, "[", "]") + 1
  };
}

function readCatalogSource(catalogId: DevCardCatalogId): string {
  return fs.readFileSync(getCatalogConfig(catalogId).path, "utf-8");
}

function writeCatalogSource(catalogId: DevCardCatalogId, source: string): void {
  const config = getCatalogConfig(catalogId);
  const temporaryPath = `${config.path}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, source, "utf-8");

  try {
    fs.renameSync(temporaryPath, config.path);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") {
      throw error;
    }

    // Windows watchers can transiently lock watched TS files and block rename.
    // Fall back to an in-place overwrite for this dev-only editor workflow.
    fs.writeFileSync(config.path, source, "utf-8");
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function buildStubRules(
  targets: CardRules["targets"],
  options?: {
    staysInPlay?: boolean;
    selectionMode?: CardRules["selectionMode"];
    requiresDefenseWindow?: boolean;
    requiresResistanceCheck?: boolean;
  }
): CardRules {
  return {
    selectionMode: options?.selectionMode ?? (targets === "self" || targets === "none" ? "confirm" : "target"),
    targets,
    requiresDefenseWindow: options?.requiresDefenseWindow ?? false,
    requiresResistanceCheck: options?.requiresResistanceCheck ?? false,
    staysInPlay: options?.staysInPlay ?? false,
    effects: []
  };
}

function cloneDefaultDefenseBand(code: CardCategoryCode): DefenseBandRules | null {
  const band = defaultDefenseBandByCategory[code];
  return band == null
    ? null
    : {
        resistance: { ...band.resistance },
        resistanceAccrueAllowed: band.resistanceAccrueAllowed,
        annulationAllowed: band.annulationAllowed,
        annulationCardsRequired: band.annulationCardsRequired,
        mirrorAllowed: band.mirrorAllowed
      };
}

function buildAbondanceDefinition(card: {
  id: string;
  name: string;
  enName: string;
  description: string;
  enDescription: string;
  code: CardCategoryCode;
  file: string;
  rules: CardRules;
  defenseBand?: DefenseBandRules | null;
  implementation?: BaseCardDefinition["implementation"];
}): BaseCardDefinition {
  const categoryLabel = CATEGORY_LABEL_BY_CODE[card.code];
  return {
    id: card.id,
    name: card.name,
    localization: {
      fr: {
        name: card.name,
        description: card.description
      },
      en: {
        name: card.enName,
        description: card.enDescription
      }
    },
    category: {
      label: categoryLabel,
      code: card.code,
      raw: `${categoryLabel} (${card.code})`
    },
    description: card.description,
    baseDeckQuantity: 0,
    includedDecks: ["Abondance"],
    image: {
      localSourcePath: `images/${card.file}`,
      importedAssetPath: `client/public/assets/cards/base/${card.file}`
    },
    defenseBand: card.defenseBand === undefined ? cloneDefaultDefenseBand(card.code) : card.defenseBand,
    rules: card.rules,
    implementation: card.implementation ?? {
      status: "needs_handler",
      notes: "Imported for Abondance deck testing; effect not implemented yet."
    },
    normalization: {
      textSource: "json_primary",
      needsImageReview: false
    }
  };
}

function readJsonArrayCatalog(source: string, exportPrefix: string): BaseCardDefinition[] {
  const { arrayStart, arrayEnd } = findCatalogArrayBounds(source, exportPrefix);
  return JSON.parse(source.slice(arrayStart, arrayEnd)) as BaseCardDefinition[];
}

function cloneCards(cards: BaseCardDefinition[]): BaseCardDefinition[] {
  return JSON.parse(JSON.stringify(cards)) as BaseCardDefinition[];
}

function parseSourceMakeCardInput(source: string): SourceMakeCardInput {
  return Function(`"use strict"; return (${source});`)() as SourceMakeCardInput;
}

function buildLiveMakeCardDefinition(
  catalogId: DevCardCatalogId,
  baseCard: BaseCardDefinition,
  sourceCard: SourceMakeCardInput
): BaseCardDefinition {
  const categoryLabel = CATEGORY_LABEL_BY_CODE[sourceCard.code];
  const defaultIncludedDeck = catalogId === "abondance"
    ? "Abondance"
    : catalogId === "puissance"
      ? "Puissance"
      : "Communion";

  return {
    ...baseCard,
    id: sourceCard.id,
    name: sourceCard.name,
    localization: {
      fr: {
        name: sourceCard.name,
        description: sourceCard.description
      },
      en: {
        name: sourceCard.enName ?? baseCard.localization?.en.name ?? sourceCard.name,
        description: sourceCard.enDescription ?? baseCard.localization?.en.description ?? sourceCard.description
      }
    },
    category: {
      label: categoryLabel,
      code: sourceCard.code,
      raw: `${categoryLabel} (${sourceCard.code})`
    },
    description: sourceCard.description,
    includedDecks: baseCard.includedDecks.length === 0 ? [defaultIncludedDeck] : baseCard.includedDecks,
    image: {
      localSourcePath: `images/${sourceCard.file}`,
      importedAssetPath: `client/public/assets/cards/base/${sourceCard.file}`
    },
    defenseBand: sourceCard.defenseBand === undefined ? baseCard.defenseBand : sourceCard.defenseBand,
    rules: sourceCard.rules,
    implementation: sourceCard.implementation ?? baseCard.implementation
  };
}

function readLiveMakeCardCatalog(
  catalogId: DevCardCatalogId,
  compiledCards: BaseCardDefinition[]
): BaseCardDefinition[] {
  const cards = cloneCards(compiledCards);
  const source = readCatalogSource(catalogId);
  const { arrayStart, arrayEnd } = findCatalogArrayBounds(source, getCatalogConfig(catalogId).exportStart);
  const arraySource = source.slice(arrayStart, arrayEnd);
  let searchStart = 0;

  while (true) {
    const blockStart = arraySource.indexOf("makeCard(", searchStart);
    if (blockStart === -1) {
      break;
    }

    const parenStart = arraySource.indexOf("(", blockStart);
    const blockEnd = findDelimitedRegionEnd(arraySource, parenStart, "(", ")");
    const objectSource = arraySource.slice(parenStart + 1, blockEnd).trim();
    try {
      const sourceCard = parseSourceMakeCardInput(objectSource);
      const index = cards.findIndex((candidate) => candidate.id === sourceCard.id);
      if (index !== -1) {
        cards[index] = buildLiveMakeCardDefinition(catalogId, cards[index], sourceCard);
      }
    } catch {
      // Ignore source-only helper usage such as local constants/functions.
      // The compiled catalog already covers those entries; only direct,
      // self-contained makeCard(...) blocks need to override live reads.
    }

    searchStart = blockEnd + 1;
  }

  return cards;
}

function serializeAbondanceCard(card: BaseCardDefinition): string {
  const serializedCard = {
    id: card.id,
    name: card.localization?.fr.name ?? card.name,
    enName: card.localization?.en.name ?? card.name,
    description: card.localization?.fr.description ?? card.description,
    enDescription: card.localization?.en.description ?? card.description,
    code: card.category.code,
    file: path.basename(card.image.importedAssetPath ?? card.image.localSourcePath ?? ""),
    rules: card.rules,
    defenseBand: card.defenseBand,
    implementation: card.implementation
  };

  const json = JSON.stringify(serializedCard, null, 2)
    .replaceAll(/"([A-Za-z0-9_]+)":/g, "$1:")
    .replaceAll(/\n/g, "\n    ");

  return `makeCard(${json}\n  ),`;
}

function findCatalogFactoryBlockById(source: string, cardId: string): { start: number; end: number } {
  const cardIdPattern = new RegExp(`\\bid\\s*:\\s*"${cardId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
  const callStartPattern = /^\s*[A-Za-z0-9_]+\(\{\s*$/gm;

  for (const match of source.matchAll(cardIdPattern)) {
    const matchIndex = match.index;
    if (matchIndex == null) {
      continue;
    }

    const sourceBeforeMatch = source.slice(0, matchIndex);
    let candidateCallStart: RegExpMatchArray | undefined;
    for (const candidate of sourceBeforeMatch.matchAll(callStartPattern)) {
      candidateCallStart = candidate;
    }

    if (candidateCallStart?.index == null) {
      continue;
    }

    const blockStart = candidateCallStart.index + candidateCallStart[0].search(/\S/);
    const parenStart = source.indexOf("(", blockStart);
    if (parenStart === -1 || parenStart > matchIndex) {
      continue;
    }

    const blockEnd = findDelimitedRegionEnd(source, parenStart, "(", ")");
    if (blockEnd < matchIndex) {
      continue;
    }

    let replaceEnd = blockEnd + 1;
    while (source[replaceEnd] === " " || source[replaceEnd] === "\t") {
      replaceEnd += 1;
    }
    if (source[replaceEnd] === ",") {
      replaceEnd += 1;
    }

    return { start: blockStart, end: replaceEnd };
  }

  throw new Error(`Unknown card: ${cardId}`);
}

function writeJsonArrayCatalog(catalogId: DevCardCatalogId, cards: BaseCardDefinition[]): void {
  const config = getCatalogConfig(catalogId);
  const source = readCatalogSource(catalogId);
  const { arrayStart, arrayEnd } = findCatalogArrayBounds(source, config.exportStart);
  const nextSource = `${source.slice(0, arrayStart)}${JSON.stringify(cards, null, 2)}${source.slice(arrayEnd)}`;
  writeCatalogSource(catalogId, nextSource);
}

function writeMakeCardCatalog(catalogId: DevCardCatalogId, cardId: string, card: BaseCardDefinition): void {
  const source = readCatalogSource(catalogId);
  const { start, end } = findCatalogFactoryBlockById(source, cardId);
  const replacement = serializeAbondanceCard(card);
  const nextSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  writeCatalogSource(catalogId, nextSource);
}

export function readBaseCardCatalog(catalogId: DevCardCatalogId = "base"): BaseCardDefinition[] {
  const config = getCatalogConfig(catalogId);
  return config.format === "json_array"
    ? readJsonArrayCatalog(readCatalogSource(catalogId), config.exportStart)
    : readLiveMakeCardCatalog(
        catalogId,
        catalogId === "communion"
          ? communionCardDefinitions
          : catalogId === "puissance"
            ? puissanceCardDefinitions
            : abondanceCardDefinitions
      );
}

export function writeBaseCardDefinition(catalogId: DevCardCatalogId, cardId: string, card: BaseCardDefinition): BaseCardDefinition[] {
  const cards = readBaseCardCatalog(catalogId);
  const index = cards.findIndex((candidate) => candidate.id === cardId);
  if (index === -1) {
    const matchingCatalogs = allCatalogIds().filter((candidateCatalogId) =>
      readBaseCardCatalog(candidateCatalogId).some((candidate) => candidate.id === cardId)
    );

    if (matchingCatalogs.length === 1) {
      throw new Error(`Card ${cardId} does not belong to ${catalogId}; it exists in ${matchingCatalogs[0]}.`);
    }

    if (matchingCatalogs.length > 1) {
      throw new Error(`Card ${cardId} was found in multiple catalogs: ${matchingCatalogs.join(", ")}.`);
    }

    throw new Error(`Unknown card: ${cardId}`);
  }

  if (card.id !== cardId) {
    throw new Error("Card id cannot be changed from the editor");
  }

  cards[index] = card;
  if (getCatalogConfig(catalogId).format === "json_array") {
    writeJsonArrayCatalog(catalogId, cards);
  } else {
    writeMakeCardCatalog(catalogId, cardId, card);
  }
  return cards;
}
