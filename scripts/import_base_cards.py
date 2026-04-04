from __future__ import annotations

import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path(r"C:\Users\Work\Desktop\Emerlaus_scraper\V2")
SOURCE_JSON = SOURCE_ROOT / "emmerlaus_v2.json"

CARD_ASSET_DIR = REPO_ROOT / "client" / "public" / "assets" / "cards" / "base"
BAND_CROP_DIR = REPO_ROOT / "docs" / "artifacts" / "card-bands" / "base"
OUTPUT_DIR = REPO_ROOT / "shared" / "cards" / "generated"
OUTPUT_FILE = OUTPUT_DIR / "base-card-dataset.json"
OVERRIDES_FILE = REPO_ROOT / "shared" / "cards" / "manual" / "base-card-overrides.json"


@dataclass(frozen=True)
class CategoryInfo:
    label: str
    code: str


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return ascii_text


def normalize_for_matching(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return normalized.encode("ascii", "ignore").decode("ascii").lower()


def repair_mojibake(value: str) -> str:
    try:
        repaired = value.encode("latin-1").decode("utf-8")
        if repaired.count("�") <= value.count("�"):
            return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    return value


def extract_category(category_label: str) -> CategoryInfo:
    category_label = repair_mojibake(category_label)
    match = re.match(r"^(?P<label>.+?)\s*\((?P<code>[^)]+)\)$", category_label)
    if match is None:
        return CategoryInfo(label=category_label, code="")

    return CategoryInfo(
        label=match.group("label").strip(),
        code=match.group("code").strip(),
    )


def load_catalog() -> dict[str, Any]:
    return json.loads(SOURCE_JSON.read_text(encoding="utf-8"))


def load_overrides() -> dict[str, Any]:
    if not OVERRIDES_FILE.exists():
        return {}

    return json.loads(OVERRIDES_FILE.read_text(encoding="utf-8"))


def band_crop(image_path: Path, output_path: Path) -> None:
    with Image.open(image_path) as image:
        width, height = image.size
        crop = image.crop(
            (
                int(width * 0.02),
                int(height * 0.89),
                int(width * 0.98),
                int(height * 0.995),
            )
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        crop.save(output_path)


def parse_effect_hints(description: str, category_code: str) -> dict[str, Any]:
    normalized = normalize_for_matching(description)
    dice = re.findall(r"\dD\d+|\dD\d+\+\d+|\dD\d+\s*\+\s*\d+", description, flags=re.IGNORECASE)

    return {
        "targets_all_opponents": "tous les adversaires" in normalized,
        "targets_left_player": "joueur a sa gauche" in normalized,
        "targets_self": "devant soi" in normalized or "devant lui" in normalized,
        "requires_resistance": "jet de resistance" in normalized,
        "half_on_successful_resistance": "moitie des degats" in normalized,
        "grants_healing": "points de vie" in normalized
        and ("rajoute" in normalized or "recoit" in normalized or "ressuscite" in normalized),
        "uses_opponent_power": "niveau de puissance de l adversaire" in normalized
        or "niveau de puissance de l'adversaire" in normalized,
        "moves_or_steals_object": "objet" in normalized
        and ("ecarte" in normalized or "prendre" in normalized or "perd" in normalized),
        "stays_in_play": category_code in {"O", "SO"} or "depose cette carte devant" in normalized,
        "extra_turn_flow": "2e pierre" in normalized or "deux autres cartes" in normalized,
        "dice_mentions": dice,
    }


def canonical_lookup(cards: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for card in cards:
        lookup[card["name"]] = card
    return lookup


def build_dataset() -> list[dict[str, Any]]:
    catalog = load_catalog()
    overrides = load_overrides()
    all_cards = catalog["cards"]
    base_deck = next(deck for deck in catalog["decks"] if deck["name"] == "Jeu de base")
    lookup = canonical_lookup(all_cards)

    records: list[dict[str, Any]] = []
    for deck_card in base_deck["cards"]:
        source_card = lookup[deck_card["name"]]
        card_override = overrides.get(source_card["name"], {})
        repaired_name = repair_mojibake(source_card["name"])
        primary_category = extract_category(source_card["categories"][0])
        slug = slugify(repaired_name)
        description = repair_mojibake(card_override.get("description", source_card["description"]))

        image_asset_path = None
        band_asset_path = None
        source_image_path = source_card.get("image_path")
        if source_image_path:
            source_image = SOURCE_ROOT / source_image_path
            if source_image.exists():
                extension = source_image.suffix.lower() or ".png"
                asset_path = CARD_ASSET_DIR / f"{slug}{extension}"
                asset_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_image, asset_path)
                image_asset_path = asset_path.relative_to(REPO_ROOT).as_posix()

                band_path = BAND_CROP_DIR / f"{slug}-band{extension}"
                band_crop(source_image, band_path)
                band_asset_path = band_path.relative_to(REPO_ROOT).as_posix()

        records.append(
            {
                "id": slug,
                "name": repaired_name,
                "category": {
                    "label": primary_category.label,
                    "code": primary_category.code,
                    "raw": repair_mojibake(source_card["categories"][0]),
                },
                "description": description,
                "sourceUrl": source_card.get("source_url"),
                "baseDeckQuantity": deck_card["quantity"],
                "includedDecks": [repair_mojibake(deck_name) for deck_name in source_card["jeux"]],
                "image": {
                    "localSourcePath": source_image_path,
                    "importedAssetPath": image_asset_path,
                    "remoteUrl": source_card.get("image_url"),
                },
                "defenseBand": {
                    "cropPath": band_asset_path,
                    "status": "pending_manual_mapping",
                    "notes": "Use the rule-book legend to map resistance and CA permissions from the cropped band image.",
                },
                "effectHints": parse_effect_hints(description, primary_category.code),
                "normalization": {
                    "textSource": "manual_override" if "description" in card_override else "json_primary",
                    "needsImageReview": repaired_name in {"Vitesse double", "Anneau de puissance +2"},
                },
            }
        )

    return records


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dataset = build_dataset()
    payload = {
        "sourceVersion": "V2",
        "deck": "Jeu de base",
        "cardCount": len(dataset),
        "notes": [
            "Descriptions currently come from the scraper JSON with targeted manual overrides.",
            "Card-face text can override JSON later via additional review.",
            "Defense band crops were generated for manual mapping and future automation.",
        ],
        "cards": dataset,
    }
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(dataset)} cards to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
