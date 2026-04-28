import { DiscordSDK, Events, RPCCloseCodes } from "@discord/embedded-app-sdk";
import { buildAvatarDataUrl, isLegacyExternalAvatarUrl } from "../../../shared/avatar.js";
import type { LocalUserProfile } from "../../../shared/types";
import { fetchConfig } from "../api/gameApi";

interface ActivitySession {
  instanceId: string;
  channelId: string | null;
  guildId: string | null;
  discordAccessToken: string | null;
  currentUser: LocalUserProfile;
  mode: "browser" | "discord";
  enableDevTools: boolean;
  subscribeToParticipantUpdates(onChange: () => void): () => void;
  closeActivity(): void;
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
  discordClientId: string,
  includeGuildMemberScope: boolean
): Promise<{ currentUser: LocalUserProfile; accessToken: string }> {
  const scopes = includeGuildMemberScope
    ? ["identify", "guilds", "guilds.members.read"] as const
    : ["identify", "guilds"] as const;
  const authorization = await sdk.commands.authorize({
    client_id: discordClientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: [...scopes]
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
    currentUser: {
      userId: auth.user.id,
      displayName: auth.user.global_name ?? auth.user.username,
      avatarUrl: auth.user.avatar
        ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=128`
        : buildAvatarDataUrl(auth.user.username)
    },
    accessToken
  };
}

export async function createDiscordSession(): Promise<ActivitySession> {
  const config = await fetchConfig();
  const browserUser = buildMockBrowserUser();
  const instanceId = "local-dev-instance";

  if (!isEmbeddedInDiscord() || config.discordClientId.trim() === "") {
    return {
      instanceId,
      channelId: null,
      guildId: null,
      discordAccessToken: null,
      currentUser: browserUser,
      mode: "browser",
      enableDevTools: config.enableDevTools,
      subscribeToParticipantUpdates: () => () => undefined,
      closeActivity: () => undefined
    };
  }

  const sdk = new DiscordSDK(config.discordClientId);
  await sdk.ready();
  const discordInstanceId = sdk.instanceId.trim();
  if (discordInstanceId === "") {
    throw new Error("Discord did not provide an Activity instance ID. Refusing to join a shared fallback session.");
  }
  const wantsGuildMemberScope = config.devCardPickerRoleOverrideEnabled;
  let authenticated: { currentUser: LocalUserProfile; accessToken: string };
  try {
    authenticated = await authenticateWithDiscord(sdk, config.discordClientId, wantsGuildMemberScope);
  } catch (error) {
    if (!wantsGuildMemberScope) {
      throw error;
    }
    console.warn("Discord guild-member scope unavailable, continuing without role-based dev card picker override", error);
    authenticated = await authenticateWithDiscord(sdk, config.discordClientId, false);
  }

  return {
    instanceId: discordInstanceId,
    channelId: sdk.channelId,
    guildId: sdk.guildId,
    discordAccessToken: authenticated.accessToken,
    currentUser: authenticated.currentUser,
    mode: "discord",
    enableDevTools: config.enableDevTools,
    closeActivity: () => {
      sdk.close(RPCCloseCodes.CLOSE_NORMAL, "Emerlaus match finished");
    },
    subscribeToParticipantUpdates(onChange: () => void) {
      const handler = () => onChange();
      void sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler);

      return () => {
        void sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, handler);
      };
    }
  };
}
