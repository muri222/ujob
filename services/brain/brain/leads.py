"""Descobrir empresas sem gastar token: OpenStreetMap (grátis) ou Google Maps via Apify (créditos da pessoa)."""

import math
import re

import requests

OVERPASS = "https://overpass-api.de/api/interpreter"
APIFY_ACTOR = "compass~crawler-google-places"
UA = {"User-Agent": "Radar/0.1 (app local de prospeccao)"}
# só colchetes chave/valor: nada que feche a query e injete outra coisa no Overpass
OSM_FILTER = re.compile(r'^(\["[a-z_:]+"(=|~|!=|!~)"[^"\\]{1,80}"(,i)?\])+$')


def _quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def overpass_query(filters: list[str], state: str, city: str, limit: int) -> str:
    area = f'area["ISO3166-2"="BR-{state}"]->.s;'
    if city:
        area += f' rel(area.s)["boundary"="administrative"]["name"="{_quote(city)}"]; map_to_area->.a;'
    else:
        area += " .s->.a;"
    body = " ".join(f"nwr{f}(area.a);" for f in filters)
    return f"[out:json][timeout:90]; {area} ({body}); out center tags {limit};"


def _tag(tags: dict, *keys: str) -> str:
    return next((tags[key] for key in keys if tags.get(key)), "")


def osm(payload: dict) -> list[dict]:
    filters = [f for f in payload["osm"] if OSM_FILTER.match(f)]
    if not filters:
        raise ValueError("esse segmento não tem filtro do OpenStreetMap; use Apify ou Claude")
    query = overpass_query(filters, payload["state"], payload.get("city", ""), payload["limit"] * 2)
    response = requests.post(OVERPASS, data={"data": query}, headers=UA, timeout=120)
    response.raise_for_status()
    places = []
    for element in response.json().get("elements", []):
        tags = element.get("tags") or {}
        if not tags.get("name"):
            continue
        street = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")]))
        website = _tag(tags, "website", "contact:website", "url")
        places.append({
            "name": tags["name"],
            "website": website if website.startswith("http") else (f"https://{website}" if website else ""),
            "phone": _tag(tags, "phone", "contact:phone", "contact:mobile"),
            "email": _tag(tags, "email", "contact:email"),
            "instagram": _tag(tags, "contact:instagram", "instagram"),
            "city": tags.get("addr:city") or payload.get("city", ""),
            "state": payload["state"],
            "address": street,
            "externalId": f"osm:{element['type']}/{element['id']}",
            "origin": "OpenStreetMap",
        })
    return places[: payload["limit"]]


def apify(payload: dict, token: str) -> list[dict]:
    searches = payload["searches"] or [payload["pack"]]
    where = ", ".join(filter(None, [payload.get("city"), payload.get("state"), "Brasil"]))
    body = {
        "searchStringsArray": searches,
        "locationQuery": where,
        "maxCrawledPlacesPerSearch": math.ceil(payload["limit"] / len(searches)),
        "language": "pt-BR",
        "skipClosedPlaces": True,
    }
    url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
    response = requests.post(url, params={"token": token, "timeout": 290}, json=body, timeout=320)
    if response.status_code == 402:
        raise RuntimeError("Créditos da Apify acabaram neste mês.")
    response.raise_for_status()
    return [
        {
            "name": item.get("title") or "",
            "website": item.get("website") or "",
            "phone": item.get("phone") or item.get("phoneUnformatted") or "",
            "email": "",
            "instagram": "",
            "city": item.get("city") or payload.get("city", ""),
            "state": payload.get("state", ""),
            "address": item.get("address") or "",
            "externalId": f"gmaps:{item.get('placeId', '')}",
            "origin": "Google Maps (Apify)",
        }
        for item in response.json()
        if item.get("title")
    ][: payload["limit"]]
