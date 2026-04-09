function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickHue(seed: string, offset: number): number {
  return (hashSeed(`${seed}:${offset}`) % 360 + 360) % 360;
}

function buildInitials(displayName: string): string {
  const tokens = displayName
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "?";
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

export function isLegacyExternalAvatarUrl(avatarUrl: string): boolean {
  return avatarUrl.includes("api.dicebear.com");
}

export function buildAvatarDataUrl(displayName: string): string {
  const initials = buildInitials(displayName);
  const hueA = pickHue(displayName, 1);
  const hueB = pickHue(displayName, 2);
  const hueC = pickHue(displayName, 3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${displayName}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hueA} 72% 68%)" />
          <stop offset="100%" stop-color="hsl(${hueB} 66% 52%)" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="32" fill="url(#bg)" />
      <circle cx="64" cy="70" r="34" fill="hsla(${hueC} 70% 96% / 0.95)" />
      <circle cx="50" cy="62" r="4.5" fill="#2a1832" />
      <circle cx="78" cy="62" r="4.5" fill="#2a1832" />
      <circle cx="39" cy="75" r="6" fill="hsla(350 90% 72% / 0.35)" />
      <circle cx="89" cy="75" r="6" fill="hsla(350 90% 72% / 0.35)" />
      <path d="M50 84c5 6 23 6 28 0" fill="none" stroke="#2a1832" stroke-linecap="round" stroke-width="4" />
      <text x="64" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="rgba(255,255,255,0.95)">${initials}</text>
    </svg>
  `.replace(/\s+/g, " ").trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
