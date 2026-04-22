import dotenv from "dotenv";

dotenv.config();

function requireString(name: string): string {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readStringList(name: string): string[] {
  const value = process.env[name];
  if (value == null) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordPublicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
  enableDevTools: process.env.ENABLE_DEV_TOOLS === "true",
  devCardPickerRoleIds: readStringList("DEV_CARD_PICKER_ROLE_IDS"),
  requireDiscordSecrets(): { clientId: string; clientSecret: string; redirectUri?: string } {
    const redirectUri = process.env.DISCORD_REDIRECT_URI?.trim();

    return {
      clientId: requireString("DISCORD_CLIENT_ID"),
      clientSecret: requireString("DISCORD_CLIENT_SECRET"),
      ...(redirectUri != null && redirectUri !== "" ? { redirectUri } : {})
    };
  }
};
