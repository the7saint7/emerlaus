import fs from "node:fs";
import path from "node:path";
import type { BaseDefenseBandMappings, DefenseBandRules } from "../../shared/cards/types.js";

const MAPPINGS_PATH = path.resolve(process.cwd(), "shared/cards/manual/base-defense-band-mappings.json");

function ensureMappingsFile(): void {
  const directory = path.dirname(MAPPINGS_PATH);
  fs.mkdirSync(directory, { recursive: true });

  if (!fs.existsSync(MAPPINGS_PATH)) {
    fs.writeFileSync(MAPPINGS_PATH, "{}\n", "utf-8");
  }
}

export function readBaseDefenseBandMappings(): BaseDefenseBandMappings {
  ensureMappingsFile();
  const raw = fs.readFileSync(MAPPINGS_PATH, "utf-8");
  return JSON.parse(raw) as BaseDefenseBandMappings;
}

export function writeBaseDefenseBandMapping(cardId: string, mapping: DefenseBandRules): BaseDefenseBandMappings {
  const mappings = readBaseDefenseBandMappings();
  mappings[cardId] = mapping;
  fs.writeFileSync(MAPPINGS_PATH, `${JSON.stringify(mappings, null, 2)}\n`, "utf-8");
  return mappings;
}
