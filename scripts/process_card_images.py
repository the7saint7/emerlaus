from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[1]
CARDS_ROOT = REPO_ROOT / "client" / "public" / "assets" / "cards"
MANIFEST_PATH = CARDS_ROOT / "processed-manifest.json"
SOURCE_DIR_NAMES = ("base", "base-en")
SUPPORTED_SOURCE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
SCRIPT_VERSION = "1"

FULL_VARIANT = {
    "suffix": "-webp",
    "quality": 95,
    "method": 6,
}
THUMB_VARIANT = {
    "suffix": "-thumb",
    "quality": 90,
    "method": 6,
    "max_width": 420,
    "max_height": 600,
    "unsharp_radius": 1.1,
    "unsharp_percent": 130,
    "unsharp_threshold": 2,
}

SETTINGS_FINGERPRINT = hashlib.sha256(
    json.dumps(
        {
            "scriptVersion": SCRIPT_VERSION,
            "full": FULL_VARIANT,
            "thumb": THUMB_VARIANT,
        },
        sort_keys=True,
    ).encode("utf-8")
).hexdigest()


def canonical_card_stem(path: Path) -> str:
    stem = unicodedata.normalize("NFKD", path.stem).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "", stem)


def build_french_source_map() -> dict[str, Path]:
    french_dir = CARDS_ROOT / "base"
    if not french_dir.exists():
        return {}
    return {
        canonical_card_stem(path): path
        for path in french_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS
    }


FRENCH_SOURCE_BY_CANONICAL = build_french_source_map()


@dataclass(frozen=True)
class OutputVariant:
    path: str
    width: int
    height: int
    size_bytes: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate WebP card assets and thumbnails from the source card images.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild every card even if the manifest says it is already processed.",
    )
    parser.add_argument(
        "--check",
        metavar="SOURCE",
        help="Look up whether a card source such as 'base/Abondance.png' is already processed.",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Delete generated outputs whose source files are no longer present.",
    )
    return parser.parse_args()


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {
            "tool": "process_card_images.py",
            "scriptVersion": SCRIPT_VERSION,
            "settingsFingerprint": SETTINGS_FINGERPRINT,
            "generatedAt": "",
            "entries": {},
        }

    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def save_manifest(entries: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tool": "process_card_images.py",
        "scriptVersion": SCRIPT_VERSION,
        "settingsFingerprint": SETTINGS_FINGERPRINT,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "entries": dict(sorted(entries.items())),
    }
    MANIFEST_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def source_output_dirs(source_dir_name: str) -> tuple[Path, Path]:
    return (
        CARDS_ROOT / f"{source_dir_name}{FULL_VARIANT['suffix']}",
        CARDS_ROOT / f"{source_dir_name}{THUMB_VARIANT['suffix']}",
    )


def source_key(source_path: Path) -> str:
    return source_path.relative_to(CARDS_ROOT).as_posix()


def output_paths_for_source(source_path: Path) -> tuple[Path, Path]:
    full_dir, thumb_dir = source_output_dirs(source_path.parent.name)
    output_name = source_path.stem + ".webp"
    return full_dir / output_name, thumb_dir / output_name


def ensure_image_mode(image: Image.Image) -> Image.Image:
    bands = image.getbands()
    target_mode = "RGBA" if "A" in bands else "RGB"
    if image.mode == target_mode:
        return image.copy()
    return image.convert(target_mode)


def apply_french_transparency_mask(image: Image.Image, source_path: Path) -> Image.Image:
    if source_path.parent.name != "base-en":
        return image

    french_source = FRENCH_SOURCE_BY_CANONICAL.get(canonical_card_stem(source_path))
    if french_source is None:
        return image

    with Image.open(french_source) as french_opened:
        french_rgba = ensure_image_mode(ImageOps.exif_transpose(french_opened))
    french_alpha = french_rgba.getchannel("A")
    if french_alpha.size != image.size:
        french_alpha = french_alpha.resize(image.size, Image.Resampling.LANCZOS)

    masked = ensure_image_mode(image)
    masked.putalpha(french_alpha)
    return masked


def save_webp(image: Image.Image, output_path: Path, quality: int, method: int) -> OutputVariant:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_kwargs: dict[str, Any] = {
        "format": "WEBP",
        "quality": quality,
        "method": method,
    }
    if "icc_profile" in image.info:
        save_kwargs["icc_profile"] = image.info["icc_profile"]
    if "A" in image.getbands():
        save_kwargs["exact"] = True
    image.save(output_path, **save_kwargs)
    return OutputVariant(
        path=output_path.relative_to(CARDS_ROOT).as_posix(),
        width=image.width,
        height=image.height,
        size_bytes=output_path.stat().st_size,
    )


def build_thumb(image: Image.Image) -> Image.Image:
    thumb = image.copy()
    thumb.thumbnail(
        (THUMB_VARIANT["max_width"], THUMB_VARIANT["max_height"]),
        Image.Resampling.LANCZOS,
    )
    return thumb.filter(
        ImageFilter.UnsharpMask(
            radius=THUMB_VARIANT["unsharp_radius"],
            percent=THUMB_VARIANT["unsharp_percent"],
            threshold=THUMB_VARIANT["unsharp_threshold"],
        )
    )


def output_exists(entry: dict[str, Any], key: str) -> bool:
    output = entry.get(key)
    if output is None:
        return False
    return (CARDS_ROOT / output["path"]).exists()


def describe_existing_output(output_path: Path) -> OutputVariant:
    with Image.open(output_path) as output_image:
        return OutputVariant(
            path=output_path.relative_to(CARDS_ROOT).as_posix(),
            width=output_image.width,
            height=output_image.height,
            size_bytes=output_path.stat().st_size,
        )


def build_manifest_entry(
    source_path: Path,
    source_hash: str,
    source_width: int,
    source_height: int,
    full_variant: OutputVariant,
    thumb_variant: OutputVariant,
) -> dict[str, Any]:
    return {
        "sourceHash": source_hash,
        "sourceBytes": source_path.stat().st_size,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "settingsFingerprint": SETTINGS_FINGERPRINT,
        "full": {
            "path": full_variant.path,
            "width": full_variant.width,
            "height": full_variant.height,
            "sizeBytes": full_variant.size_bytes,
        },
        "thumb": {
            "path": thumb_variant.path,
            "width": thumb_variant.width,
            "height": thumb_variant.height,
            "sizeBytes": thumb_variant.size_bytes,
        },
    }


def process_source(source_path: Path, manifest_entries: dict[str, Any], force: bool) -> str:
    entry_key = source_key(source_path)
    source_hash = sha256_file(source_path)
    existing = manifest_entries.get(entry_key)
    if (
        not force
        and existing is not None
        and existing.get("sourceHash") == source_hash
        and existing.get("settingsFingerprint") == SETTINGS_FINGERPRINT
        and output_exists(existing, "full")
        and output_exists(existing, "thumb")
    ):
        return "skipped"

    full_output_path, thumb_output_path = output_paths_for_source(source_path)
    if (
        not force
        and existing is None
        and full_output_path.exists()
        and thumb_output_path.exists()
    ):
        with Image.open(source_path) as opened:
            source_image = ImageOps.exif_transpose(opened)
            source_width = source_image.width
            source_height = source_image.height
        manifest_entries[entry_key] = build_manifest_entry(
            source_path=source_path,
            source_hash=source_hash,
            source_width=source_width,
            source_height=source_height,
            full_variant=describe_existing_output(full_output_path),
            thumb_variant=describe_existing_output(thumb_output_path),
        )
        return "recovered"

    with Image.open(source_path) as opened:
        base_image = ensure_image_mode(ImageOps.exif_transpose(opened))
        base_image = apply_french_transparency_mask(base_image, source_path)
        full_variant = save_webp(
            base_image,
            full_output_path,
            quality=FULL_VARIANT["quality"],
            method=FULL_VARIANT["method"],
        )
        thumb_variant = save_webp(
            build_thumb(base_image),
            thumb_output_path,
            quality=THUMB_VARIANT["quality"],
            method=THUMB_VARIANT["method"],
        )

    manifest_entries[entry_key] = build_manifest_entry(
        source_path=source_path,
        source_hash=source_hash,
        source_width=full_variant.width,
        source_height=full_variant.height,
        full_variant=full_variant,
        thumb_variant=thumb_variant,
    )
    return "built"


def prune_missing_sources(manifest_entries: dict[str, Any], live_source_keys: set[str]) -> int:
    removed = 0
    stale_keys = [key for key in manifest_entries if key not in live_source_keys]
    for entry_key in stale_keys:
        entry = manifest_entries.pop(entry_key)
        for variant_key in ("full", "thumb"):
            variant = entry.get(variant_key)
            if variant is None:
                continue
            output_path = CARDS_ROOT / variant["path"]
            if output_path.exists():
                output_path.unlink()
        removed += 1
    return removed


def iter_sources() -> list[Path]:
    sources: list[Path] = []
    for source_dir_name in SOURCE_DIR_NAMES:
        source_dir = CARDS_ROOT / source_dir_name
        if not source_dir.exists():
            continue
        for source_path in sorted(source_dir.iterdir()):
            if source_path.is_file() and source_path.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS:
                sources.append(source_path)
    return sources


def find_manifest_matches(entries: dict[str, Any], query: str) -> list[tuple[str, dict[str, Any]]]:
    normalized_query = query.replace("\\", "/").strip()
    if normalized_query in entries:
        return [(normalized_query, entries[normalized_query])]

    matches = []
    for entry_key, entry in entries.items():
        if entry_key.endswith(normalized_query) or Path(entry_key).name == normalized_query:
            matches.append((entry_key, entry))
    return matches


def run_check(query: str) -> int:
    manifest = load_manifest()
    entries = manifest.get("entries", {})
    matches = find_manifest_matches(entries, query)
    if not matches:
        print(f"No processed entry found for '{query}'.")
        return 1

    for entry_key, entry in matches:
        payload = {
            "source": entry_key,
            "processed": True,
            "fullExists": output_exists(entry, "full"),
            "thumbExists": output_exists(entry, "thumb"),
            "full": entry.get("full"),
            "thumb": entry.get("thumb"),
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    args = parse_args()
    if args.check is not None:
        return run_check(args.check)

    sources = iter_sources()
    manifest = load_manifest()
    entries = manifest.get("entries", {})
    live_source_keys = {source_key(source_path) for source_path in sources}

    built = 0
    recovered = 0
    skipped = 0
    save_interval = 10
    for index, source_path in enumerate(sources, start=1):
        result = process_source(source_path, entries, force=args.force)
        if result == "built":
            built += 1
        elif result == "recovered":
            recovered += 1
        else:
            skipped += 1

        if index % save_interval == 0:
            save_manifest(entries)

    pruned = prune_missing_sources(entries, live_source_keys) if args.prune else 0
    save_manifest(entries)
    print(
        f"Processed {len(sources)} card images: "
        f"built={built}, recovered={recovered}, skipped={skipped}, pruned={pruned}.",
    )
    print(f"Manifest: {MANIFEST_PATH.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
