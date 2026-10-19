import json
from pathlib import Path

CATALOG_DIR = Path(__file__).resolve().parents[1] / "catalog"


def _expand(config: dict, terms: dict) -> dict:
    value = config.get("terms")
    if isinstance(value, str) and value.startswith("@"):
        return {**config, "terms": terms[value[1:]]}
    return config


def load() -> list[dict]:
    terms = json.loads((CATALOG_DIR / "terms.json").read_text(encoding="utf-8"))
    sources = {}
    for path in sorted(CATALOG_DIR.glob("*.json")):
        if path.name == "terms.json":
            continue
        for entry in json.loads(path.read_text(encoding="utf-8")):
            entry = {**entry, "config": _expand(entry.get("config") or {}, terms)}
            sources[entry["slug"]] = entry
    return list(sources.values())
