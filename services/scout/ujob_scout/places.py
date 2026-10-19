import json
import re
from functools import cache
from pathlib import Path

from .text import fold

STATES = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA", "ceara": "CE",
    "distrito federal": "DF", "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "mato grosso": "MT",
    "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "paraiba": "PB", "parana": "PR",
    "pernambuco": "PE", "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
    "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
    "sergipe": "SE", "tocantins": "TO",
}
CODES = set(STATES.values())
NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal",
    "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}
TRAILING_UF = re.compile(r"^(.*?)[\s,/\-–(]+([A-Z]{2})\)?$")


def state_code(value) -> str:
    text = str(value or "").strip()
    if text.upper() in CODES:
        return text.upper()
    return STATES.get(fold(text), "")


def split_place(value) -> tuple[str, str]:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" -/,")
    if not text:
        return "", ""
    match = TRAILING_UF.match(text)
    if match and match.group(2) in CODES:
        return match.group(1).strip(" -/,"), match.group(2)
    for name, code in sorted(STATES.items(), key=lambda item: -len(item[0])):
        if fold(text).endswith(name):
            city = text[: len(text) - len(name)].strip(" -/,")
            return city, code
    return text, ""


def is_brazil(value) -> bool:
    folded = fold(value)
    return not folded or "brasil" in folded or "brazil" in folded or bool(state_code(value)) or bool(split_place(value)[1])


@cache
def _cities() -> dict[str, dict[str, str]]:
    by_state = json.loads((Path(__file__).parent / "data" / "cities.json").read_text(encoding="utf-8"))
    index: dict[str, dict[str, str]] = {}
    for code, names in by_state.items():
        for name in names:
            index.setdefault(fold(name), {})[code] = name
    return index


def real_city(city: str, state: str = "") -> tuple[str, str]:
    found = _cities().get(fold(city).strip())
    if not found:
        return city, state
    if state in found:
        return found[state], state
    if not state and len(found) == 1:
        return next(iter(found.items()))[::-1]
    return city, state
