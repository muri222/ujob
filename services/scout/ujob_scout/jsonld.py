import html
import json
import re

from .places import state_code
from .text import money

CONTRACT = {"FULL_TIME": "clt", "PART_TIME": "clt", "CONTRACTOR": "pj", "TEMPORARY": "temporario", "INTERN": "estagio", "PER_DIEM": "freelancer"}
PERIOD = {"HOUR": "hora", "MONTH": "mes", "YEAR": "ano"}


def _nodes(data):
    if isinstance(data, list):
        for item in data:
            yield from _nodes(item)
    elif isinstance(data, dict):
        yield data
        yield from _nodes(data.get("@graph", []))


def find_posting(response) -> dict | None:
    for block in response.xpath('//script[@type="application/ld+json"]/text()').getall():
        for candidate in (block, html.unescape(block)):
            try:
                data = json.loads(candidate, strict=False)
            except ValueError:
                continue
            for node in _nodes(data):
                kind = node.get("@type")
                if kind == "JobPosting" or (isinstance(kind, list) and "JobPosting" in kind):
                    return node
    return None


def _first(value):
    return value[0] if isinstance(value, list) and value else value


def fields(posting: dict) -> dict:
    organization = _first(posting.get("hiringOrganization")) or {}
    if isinstance(organization, str):
        organization = {"name": organization}
    logo = organization.get("logo")
    address = (_first(posting.get("jobLocation")) or {}).get("address") or {}
    if isinstance(address, str):
        address = {"addressLocality": address}
    country = address.get("addressCountry")
    salary = posting.get("baseSalary") or {}
    value = salary.get("value") if isinstance(salary, dict) else None
    value = value if isinstance(value, dict) else {"value": value}
    types = [str(kind).upper() for kind in (posting.get("employmentType") or [])] if isinstance(posting.get("employmentType"), list) else [str(posting.get("employmentType") or "").upper()]
    contact = posting.get("applicationContact") or {}
    minimum = value.get("minValue") or value.get("value")
    if isinstance(minimum, str):
        minimum = (money(minimum) or [0])[0]

    return {
        "title": posting.get("title") or "",
        "description": posting.get("description") or "",
        "company": organization.get("name") or "",
        "company_logo": (logo.get("url") if isinstance(logo, dict) else logo) or "",
        "city": address.get("addressLocality") or "",
        "state": state_code(address.get("addressRegion")),
        "country": (country.get("name") if isinstance(country, dict) else country) or "",
        "salary_min": float(minimum or 0),
        "salary_max": float(value.get("maxValue") or 0),
        "salary_currency": (salary.get("currency") if isinstance(salary, dict) else "") or "",
        "salary_period": PERIOD.get(str(value.get("unitText") or "").upper(), ""),
        "contract": next((CONTRACT[kind] for kind in types if kind in CONTRACT), ""),
        "workplace": "remoto" if posting.get("jobLocationType") == "TELECOMMUTE" else "",
        "published_at": posting.get("datePosted") or "",
        "expires_at": posting.get("validThrough") or "",
        "contact_email": (contact.get("email") or "") if isinstance(contact, dict) else "",
        "contact_phone": re.sub(r"\D", "", contact.get("telephone") or "")[-11:] if isinstance(contact, dict) else "",
        "hints": " ".join(filter(None, [posting.get("industry") if isinstance(posting.get("industry"), str) else "", posting.get("occupationalCategory") if isinstance(posting.get("occupationalCategory"), str) else ""])),
    }
