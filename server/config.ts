import dotenv from "dotenv";

dotenv.config();

function requireString(name: string): string {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  discordClientId: process.env.DISCORD_CLIENT_ID ?? "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  discordRedirectUri: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:5173",
  discordPublicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
  requireDiscordSecrets(): { clientId: string; clientSecret: string; redirectUri: string } {
    return {
      clientId: requireString("DISCORD_CLIENT_ID"),
      clientSecret: requireString("DISCORD_CLIENT_SECRET"),
      redirectUri: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:5173"
    };
  }
};
