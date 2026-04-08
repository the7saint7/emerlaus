import fs from "node:fs";
import path from "node:path";
import type { BaseCardDefinition } from "../../shared/cards/types";

const CATALOG_PATH = path.resolve(process.cwd(), "shared/cards/catalog/base-cards.ts");
const CATALOG_START = "export const baseCardDefinitions = ";
const CATALOG_END = " satisfies BaseCardDefinition[];";

function extractCatalogJson(source: string): string {
  const startIndex = source.indexOf(CATALOG_START);
  if (startIndex === -1) {
    throw new Error("Unable to find baseCardDefinitions export");
  }

  const jsonStart = startIndex + CATALOG_START.length;
  const endIndex = source.indexOf(CATALOG_END, jsonStart);
  if (endIndex === -1) {
    throw new Error("Unable to find baseCardDefinitions terminator");
  }

  return source.slice(jsonStart, endIndex).trim();
}

function readCatalogSource(): string {
  return fs.readFileSync(CATALOG_PATH, "utf-8");
}

function writeCatalog(cards: BaseCardDefinition[]): void {
  const source = readCatalogSource();
  const catalogStart = source.indexOf(CATALOG_START);
  if (catalogStart === -1) {
    throw new Error("Unable to preserve catalog header");
  }

  const header = source.slice(0, catalogStart);
  const footer = `${CATALOG_END}

export const baseCardDefinitionById: Record<string, BaseCardDefinition> = Object.fromEntries(
  baseCardDefinitions.map((card) => [card.id, card])
);
`;

  const nextSource = `${header}${CATALOG_START}${JSON.stringify(cards, null, 2)}${footer}`;
  const temporaryPath = `${CATALOG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, nextSource, "utf-8");
  fs.renameSync(temporaryPath, CATALOG_PATH);
}

export function readBaseCardCatalog(): BaseCardDefinition[] {
  return JSON.parse(extractCatalogJson(readCatalogSource())) as BaseCardDefinition[];
}

export function writeBaseCardDefinition(cardId: string, card: BaseCardDefinition): BaseCardDefinition[] {
  const cards = readBaseCardCatalog();
  const index = cards.findIndex((candidate) => candidate.id === cardId);
  if (index === -1) {
    throw new Error(`Unknown card: ${cardId}`);
  }

  if (card.id !== cardId) {
    throw new Error("Card id cannot be changed from the editor");
  }

  cards[index] = card;
  writeCatalog(cards);
  return cards;
}
