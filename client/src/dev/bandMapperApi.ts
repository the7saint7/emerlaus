import type {
  BaseDefenseBandMappings,
  DefenseBandRules,
  SaveBaseDefenseBandMappingRequest
} from "../../../shared/cards/types";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchBaseDefenseBandMappings(): Promise<BaseDefenseBandMappings> {
  const response = await fetch("/api/dev/base-defense-band-mappings");
  return parseResponse<BaseDefenseBandMappings>(response);
}

export async function saveBaseDefenseBandMapping(
  cardId: string,
  mapping: DefenseBandRules
): Promise<BaseDefenseBandMappings> {
  const payload: SaveBaseDefenseBandMappingRequest = { mapping };
  const response = await fetch(`/api/dev/base-defense-band-mappings/${cardId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse<BaseDefenseBandMappings>(response);
}
