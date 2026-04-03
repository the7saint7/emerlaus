import type { DiscordAuthTokenResponse } from "../../shared/types";
import { config } from "../config";

export async function exchangeDiscordCode(code: string): Promise<DiscordAuthTokenResponse> {
  const secrets = config.requireDiscordSecrets();

  const body = new URLSearchParams({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: secrets.redirectUri
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as DiscordAuthTokenResponse;
}
