export type CardImageVariant = "full" | "thumb";

export function getCardImageVariantUrl(imageUrl: string, variant: CardImageVariant): string {
  const normalized = imageUrl.replace(/\\/g, "/");
  const match = normalized.match(/^\/assets\/cards\/(base|base-en)(?:-webp|-thumb)?\/([^/?#]+?)(?:\.[^./?]+)$/);
  if (match == null) {
    return imageUrl;
  }

  const [, languageDir, basename] = match;
  const suffix = variant === "thumb" ? "-thumb" : "-webp";
  return `/assets/cards/${languageDir}${suffix}/${basename}.webp`;
}

export function getImportedCardImageUrl(
  importedAssetPath?: string | null,
  variant: CardImageVariant = "full"
): string {
  if (importedAssetPath == null || importedAssetPath === "") {
    return "";
  }

  const publicUrl = `/${importedAssetPath
    .replace(/^client[\\/]+public[\\/]+/, "")
    .replace(/\\/g, "/")}`;

  return getCardImageVariantUrl(publicUrl, variant);
}
