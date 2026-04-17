import { DiscordSDK, Events } from "@discord/embedded-app-sdk";
import { buildAvatarDataUrl, isLegacyExternalAvatarUrl } from "../../../shared/avatar.js";
import type { LocalUserProfile } from "../../../shared/types";
import { fetchConfig } from "../api/gameApi";

interface ActivitySession {
  instanceId: string;
  currentUser: LocalUserProfile;
  mode: "browser" | "discord";
  enableDevTools: boolean;
  subscribeToParticipantUpdates(onChange: () => void): () => void;
}

function isEmbeddedInDiscord(): boolean {
  return window.self !== window.top || window.location.search.includes("frame_id");
}

function buildMockBrowserUser(): LocalUserProfile {
  const stored = window.localStorage.getItem("emerlaus.browser-user");
  if (stored != null) {
    const parsed = JSON.parse(stored) as LocalUserProfile;
    if (isLegacyExternalAvatarUrl(parsed.avatarUrl)) {
      parsed.avatarUrl = buildAvatarDataUrl(parsed.displayName);
      window.localStorage.setItem("emerlaus.browser-user", JSON.stringify(parsed));
    }
    return parsed;
  }

  const suffix = Math.floor(Math.random() * 900 + 100);
  const user: LocalUserProfile = {
    userId: `browser-user-${crypto.randomUUID()}`,
    displayName: `Browser Player ${suffix}`,
    avatarUrl: buildAvatarDataUrl(`Browser Player ${suffix}`)
  };

  window.localStorage.setItem("emerlaus.browser-user", JSON.stringify(user));
  return user;
}

async function authenticateWithDiscord(
  sdk: DiscordSDK,
  discordClientId: string
): Promise<LocalUserProfile> {
  const authorization = await sdk.commands.authorize({
    client_id: discordClientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "guilds"]
  });

  const tokenResponse = await fetch("/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: authorization.code
    })
  });

  if (!tokenResponse.ok) {
    throw new Error("Discord token exchange failed");
  }

  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };
  const auth = await sdk.commands.authenticate({
    access_token: accessToken
  });

  return {
    userId: auth.user.id,
    displayName: auth.user.global_name ?? auth.user.username,
    avatarUrl: auth.user.avatar
      ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128`
      : buildAvatarDataUrl(auth.user.username)
  };
}

export async function createDiscordSession(): Promise<ActivitySession> {
  const config = await fetchConfig();
  const browserUser = buildMockBrowserUser();
  const instanceId = "local-dev-instance";

  if (!isEmbeddedInDiscord() || config.discordClientId.trim() === "") {
    return {
      instanceId,
      currentUser: browserUser,
      mode: "browser",
      enableDevTools: config.enableDevTools,
      subscribeToParticipantUpdates: () => () => undefined
    };
  }

  const sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  const currentUser = await authenticateWithDiscord(sdk, config.discordClientId);

  return {
    instanceId: sdk.instanceId || instanceId,
    currentUser,
    mode: "discord",
    enableDevTools: config.enableDevTools,
    subscribeToParticipantUpdates(onChange: () => void) {
      const handler = () => onChange();
      void sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler);

      return () => {
        void sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler);
      };
    }
  };
}
