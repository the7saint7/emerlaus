import type { DiscordAuthTokenResponse } from "../../shared/types.js";
import { config } from "../config.js";

export async function exchangeDiscordCode(code: string): Promise<DiscordAuthTokenResponse> {
  const secrets = config.requireDiscordSecrets();

  const body = new URLSearchParams({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    grant_type: "authorization_code",
    code
  });
  if (secrets.redirectUri != null) {
    body.set("redirect_uri", secrets.redirectUri);
  }

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

interface DiscordGuildMemberResponse {
  roles?: string[];
}

export async function canUseDevCardPickerFromDiscordRole(
  accessToken: string,
  guildId: string
): Promise<boolean> {
  if (config.devCardPickerRoleIds.length === 0) {
    return false;
  }

  const trimmedToken = accessToken.trim();
  const trimmedGuildId = guildId.trim();
  if (trimmedToken === "" || trimmedGuildId === "") {
    return false;
  }

  const response = await fetch(`https://discord.com/api/users/@me/guilds/${trimmedGuildId}/member`, {
    headers: {
      Authorization: `Bearer ${trimmedToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord guild member lookup failed: ${response.status} ${errorText}`);
  }

  const member = (await response.json()) as DiscordGuildMemberResponse;
  const roleIds = new Set(member.roles ?? []);
  return config.devCardPickerRoleIds.some((roleId) => roleIds.has(roleId));
}
