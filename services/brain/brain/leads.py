"""Descobrir empresas sem gastar token: OpenStreetMap (grátis) ou Google Maps via Apify (créditos da pessoa)."""

import math
import re

import requests

# servidor principal + espelho: o principal às vezes fica lento e estoura o tempo
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
APIFY_ACTOR = "compass~crawler-google-places"
UA = {"User-Agent": "uJob/0.1 (app local de prospeccao)"}
# só colchetes chave/valor: nada que feche a query e injete outra coisa no Overpass
OSM_FILTER = re.compile(r'^(\["[a-z_:]+"(=|~|!=|!~)"[^"\\]{1,80}"(,i)?\])+$')


def _quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def overpass_query(filters: list[str], state: str, city: str, limit: int, country: str = "BR", region: str = "") -> str:
    # Brasil: estado pela sigla; resto do mundo: país pelo ISO e, dentro dele, região e/ou cidade pelo nome
    if country == "BR" or state:
        area = f'area["ISO3166-2"="BR-{state}"]->.s;' if state else 'area["ISO3166-1"="BR"]->.s;'
    else:
        area = f'area["ISO3166-1"="{country}"]["admin_level"="2"]->.s;'
        if region:
            area += f' rel(area.s)["boundary"="administrative"]["name"="{_quote(region)}"]; map_to_area->.s;'
    if city:
        area += f' rel(area.s)["boundary"="administrative"]["name"="{_quote(city)}"]; map_to_area->.a;'
    else:
        area += " .s->.a;"
    body = " ".join(f"nwr{f}(area.a);" for f in filters)
    return f"[out:json][timeout:180]; {area} ({body}); out center tags {limit};"


def _tag(tags: dict, *keys: str) -> str:
    return next((tags[key] for key in keys if tags.get(key)), "")


def osm(payload: dict) -> list[dict]:
    filters = [f for f in payload["osm"] if OSM_FILTER.match(f)]
    if not filters:
        raise ValueError("esse segmento não tem filtro do OpenStreetMap; use Apify ou Claude")
    query = overpass_query(filters, payload.get("state", ""), payload.get("city", ""), payload["limit"] * 2, payload.get("country", "BR"), payload.get("region", ""))
    for index, url in enumerate(OVERPASS):
        try:
            response = requests.post(url, data={"data": query}, headers=UA, timeout=200)
            response.raise_for_status()
            break
        except (requests.Timeout, requests.ConnectionError, requests.HTTPError):
            if index == len(OVERPASS) - 1:
                raise
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
            "state": payload.get("state", ""),
            "address": street,
            "externalId": f"osm:{element['type']}/{element['id']}",
            "origin": "OpenStreetMap",
        })
    return places[: payload["limit"]]


def apify(payload: dict, token: str) -> list[dict]:
    searches = payload["searches"] or [payload["pack"]]
    where = ", ".join(filter(None, [payload.get("city"), payload.get("state") or payload.get("region"), payload.get("countryName") or "Brazil"]))
    body = {
        "searchStringsArray": searches,
        "locationQuery": where,
        "maxCrawledPlacesPerSearch": math.ceil(payload["limit"] / len(searches)),
        "language": "pt-BR" if payload.get("country", "BR") == "BR" else "en",
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


# Instagram e TikTok: busca de perfis por termo (Apify). Muitos clientes de criativos estão lá, não no mapa.
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE = re.compile(r"(?:\+?\d[\d\s().-]{8,}\d)")


# a busca de perfis casa palavras do nome: cidade na busca traz "Paulo Dybala" pra "games São Paulo".
# Por isso busca só o termo e depois filtra por relevância; a cidade só ordena.
STOP = {"de", "da", "do", "das", "dos", "e", "em", "para", "pra", "com", "the", "and", "of", "for", "in"}


def _fold(text: str) -> str:
    import unicodedata

    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def _queries(payload: dict) -> list[str]:
    return [term.strip() for term in (payload.get("searches") or [payload["pack"]])[:3] if term.strip()]


def _keywords(payload: dict) -> set[str]:
    words = " ".join([*(payload.get("searches") or []), payload.get("pack", ""), payload.get("description", "")])
    return {word for word in re.findall(r"[a-z0-9]+", _fold(words)) if len(word) >= 4 and word not in STOP}


def _relevant(places: list[dict], payload: dict) -> list[dict]:
    keys = _keywords(payload)
    where = _fold(payload.get("city") or payload.get("region") or "")
    keep = [place for place in places if not keys or any(key in _fold(f"{place['name']} {place['bio']} {place['address']}") for key in keys)]
    # quem cita a cidade vem primeiro
    return sorted(keep, key=lambda place: bool(where) and where not in _fold(place["bio"]))


def _run(actor: str, body: dict, token: str) -> list[dict]:
    url = f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"
    for attempt in range(2):
        response = requests.post(url, params={"timeout": 290}, headers={"Authorization": f"Bearer {token}"}, json=body, timeout=320)
        # 502/503/504 da Apify costuma ser passageiro: tenta mais uma vez
        if response.status_code not in (502, 503, 504):
            break
    if response.status_code == 402:
        raise RuntimeError("Créditos da Apify acabaram neste mês.")
    response.raise_for_status()
    return [item for item in response.json() if isinstance(item, dict)]


def _contact(bio: str) -> tuple[str, str]:
    email = EMAIL.search(bio or "")
    phone = PHONE.search(bio or "")
    return (email.group(0) if email else ""), (re.sub(r"\D", "", phone.group(0)) if phone else "")


def _ig_place(item: dict, payload: dict) -> dict:
    handle = item.get("username") or ""
    bio = item.get("biography") or ""
    email, phone = _contact(bio)
    address = item.get("businessAddress") if isinstance(item.get("businessAddress"), dict) else {}
    return {
        "name": item.get("fullName") or handle,
        "website": item.get("externalUrl") or "",
        "phone": item.get("businessPhoneNumber") or phone,
        "email": item.get("businessEmail") or item.get("publicEmail") or email,
        "instagram": handle,
        "city": address.get("city_name") or payload.get("city", ""),
        "state": payload.get("state", ""),
        "address": item.get("businessCategoryName") or "",
        "externalId": f"ig:{item.get('id') or handle}",
        "origin": "Instagram (Apify)",
        "bio": bio,
        "followers": item.get("followersCount") or 0,
    }


def _hashtags(payload: dict) -> list[str]:
    # "estúdio de games" vira #estudiodegames; a busca de perfis do Instagram acha pouco, hashtag acha quem posta
    tags = [re.sub(r"[^a-z0-9]", "", _fold(term)) for term in (payload.get("hashtags") or []) + _queries(payload)]
    return list(dict.fromkeys(tag for tag in tags if 3 <= len(tag) <= 40))[:3]


def instagram(payload: dict, token: str) -> list[dict]:
    """Perfis do Instagram: busca de perfis por termo + autores dos posts nas hashtags do segmento."""
    limit = payload["limit"]
    queries = _queries(payload)
    places, seen = [], set()
    for query in queries:
        for item in _run("apify~instagram-search-scraper", {"search": query, "searchType": "user", "searchLimit": min(10, max(2, limit // len(queries))), "enhanceUserSearchWithFacebookPage": False}, token):
            handle = item.get("username") or ""
            if handle and handle not in seen and not item.get("private"):
                seen.add(handle)
                places.append(_ig_place(item, payload))
    tags = _hashtags(payload)
    if tags and len(places) < limit:
        # posts das hashtags -> donos dos posts -> perfil completo (bio, link, e-mail comercial)
        posts = _run("apify~instagram-hashtag-scraper", {"hashtags": tags, "resultsLimit": min(60, max(10, limit * 2 // len(tags)))}, token)
        owners = [post.get("ownerUsername") for post in posts if post.get("ownerUsername")]
        fresh = [owner for owner in dict.fromkeys(owners) if owner not in seen][: limit * 2]
        if fresh:
            for item in _run("apify~instagram-profile-scraper", {"usernames": fresh}, token):
                handle = item.get("username") or ""
                if handle and handle not in seen and not item.get("private"):
                    seen.add(handle)
                    places.append(_ig_place(item, payload))
    return _relevant(places, payload)[:limit]


def tiktok(payload: dict, token: str) -> list[dict]:
    queries = _queries(payload)
    per = min(50, max(2, math.ceil(payload["limit"] * 1.5 / len(queries))))
    places, seen = [], set()
    for item in _run("clockworks~tiktok-user-search-scraper", {"searchQueries": queries, "maxProfilesPerQuery": per}, token):
        handle = item.get("name") or ""
        if not handle or handle in seen or item.get("privateAccount"):
            continue
        seen.add(handle)
        bio = item.get("signature") or ""
        email, phone = _contact(bio)
        link = item.get("bioLink") if isinstance(item.get("bioLink"), str) else ""
        places.append({
            "name": item.get("nickName") or handle,
            "website": link if link.startswith("http") else (f"https://{link}" if link else ""),
            "phone": phone,
            "email": email,
            "instagram": "",
            "city": payload.get("city", ""),
            "state": payload.get("state", ""),
            "address": "",
            "externalId": f"tt:{item.get('id') or handle}",
            "origin": "TikTok (Apify)",
            "bio": bio,
            "followers": item.get("fans") or 0,
            "tiktok": handle,
        })
    return _relevant(places, payload)[: payload["limit"]]
