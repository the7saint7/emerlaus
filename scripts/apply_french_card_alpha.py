from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[1]
CARDS_ROOT = REPO_ROOT / "client" / "public" / "assets" / "cards"
FRENCH_DIR = CARDS_ROOT / "base"
ENGLISH_DIR = CARDS_ROOT / "base-en"


def canonical_card_stem(path: Path) -> str:
    stem = unicodedata.normalize("NFKD", path.stem).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "", stem)


def ensure_rgba(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        return image.copy()
    return image.convert("RGBA")


def main() -> int:
    french_by_key = {
        canonical_card_stem(path): path
        for path in FRENCH_DIR.iterdir()
        if path.is_file() and path.suffix.lower() == ".png"
    }

    updated = 0
    skipped = 0
    missing = 0
    for english_path in sorted(ENGLISH_DIR.iterdir()):
        if not english_path.is_file() or english_path.suffix.lower() != ".png":
            continue

        french_path = french_by_key.get(canonical_card_stem(english_path))
        if french_path is None:
            missing += 1
            continue

        with Image.open(english_path) as english_opened, Image.open(french_path) as french_opened:
            english_rgba = ensure_rgba(ImageOps.exif_transpose(english_opened))
            french_rgba = ensure_rgba(ImageOps.exif_transpose(french_opened))

        english_alpha = english_rgba.getchannel("A")
        french_alpha = french_rgba.getchannel("A")
        if french_alpha.size != english_rgba.size:
            french_alpha = french_alpha.resize(english_rgba.size, Image.Resampling.LANCZOS)

        if english_alpha.tobytes() == french_alpha.tobytes():
            skipped += 1
            continue

        english_rgba.putalpha(french_alpha)
        english_rgba.save(english_path, format="PNG")
        updated += 1

    print(
        f"Applied French alpha masks to English source cards: "
        f"updated={updated}, skipped={skipped}, missing={missing}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
