import type { BaseCardDefinition, SaveBaseCardDefinitionRequest } from "../../../shared/cards/types";

const RETRY_DELAYS_MS = [250, 600, 1200, 2000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    let message = body.trim();
    try {
      const payload = JSON.parse(body) as { error?: string };
      message = payload.error ?? message;
    } catch {
      message = message.slice(0, 400);
    }

    throw new Error(message === "" ? `Request failed with status ${response.status}` : `Request failed with status ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

async function fetchWithTransientRetry<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok || response.status < 500 || attempt === RETRY_DELAYS_MS.length) {
        return parseResponse<T>(response);
      }

      lastError = new Error(`Request failed with status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) {
        break;
      }
    }

    await delay(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

export async function fetchBaseCardCatalog(): Promise<BaseCardDefinition[]> {
  return fetchWithTransientRetry<BaseCardDefinition[]>("/api/dev/base-cards");
}

export async function saveBaseCardDefinition(card: BaseCardDefinition): Promise<BaseCardDefinition[]> {
  const payload: SaveBaseCardDefinitionRequest = { card };
  return fetchWithTransientRetry<BaseCardDefinition[]>(`/api/dev/base-cards/${card.id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}
