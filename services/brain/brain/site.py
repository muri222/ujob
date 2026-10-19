"""Enriquecer lead visitando o site da empresa, no PC, sem IA: contatos, redes, carreiras e um resumo do texto."""

import json
import re
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests

from .read import html_text

UA = "Mozilla/5.0 (compatible; Radar/0.1; app local de prospeccao)"
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+?55\s?)?\(?\b[1-9]{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b")
SOCIAL = {
    "instagram": re.compile(r"instagram\.com/([A-Za-z0-9_.]{2,30})"),
    "linkedin": re.compile(r"linkedin\.com/(company/[A-Za-z0-9_-]+|in/[A-Za-z0-9_-]+)"),
    "facebook": re.compile(r"facebook\.com/([A-Za-z0-9_.-]{2,60})"),
    "tiktok": re.compile(r"tiktok\.com/@([A-Za-z0-9_.]{2,30})"),
    "youtube": re.compile(r"youtube\.com/(@[A-Za-z0-9_.-]+|c/[A-Za-z0-9_-]+|channel/[A-Za-z0-9_-]+)"),
    "behance": re.compile(r"behance\.net/([A-Za-z0-9_-]+)"),
    "artstation": re.compile(r"artstation\.com/([A-Za-z0-9_-]+)"),
    "whatsapp": re.compile(r"(?:wa\.me|api\.whatsapp\.com/send\?phone=)/?(\d{10,13})"),
}
CRAWL = re.compile(r"contat|contact|sobre|about|quem-somos|empresa|carreira|career|trabalhe|vagas|jobs", re.I)
CAREERS = re.compile(r"carreira|career|trabalhe|vagas|jobs|gupy\.io|greenhouse|lever\.co", re.I)
JUNK = ("sentry", "wixpress", "example.", "@2x", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", "domain.com", "email.com", "seuemail", "example@", "exemplo@", "email@", "seu@", "nome@", "user@")
BAD_HANDLES = {"p", "reel", "explore", "sharer", "share", "tr", "plugins", "intent", "home", "watch"}
TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
DESCRIPTION = re.compile(r"<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']*)", re.I)
HREF = re.compile(r"href=[\"']([^\"'#\s]+)", re.I)
JSONLD = re.compile(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)


def _allowed(url: str) -> bool:
    parts = urlparse(url)
    robots = urllib.robotparser.RobotFileParser()
    try:
        response = requests.get(f"{parts.scheme}://{parts.netloc}/robots.txt", headers={"User-Agent": UA}, timeout=10)
        if response.status_code >= 400:
            return True
        robots.parse(response.text.splitlines())
        return robots.can_fetch(UA, url)
    except requests.RequestException:
        return True


def _jsonld(html: str) -> dict:
    for block in JSONLD.findall(html):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
        for item in items:
            if isinstance(item, dict) and str(item.get("@type", "")).lower() in ("organization", "corporation", "localbusiness", "store"):
                return {key: item[key] for key in ("name", "description", "telephone", "email", "foundingDate", "numberOfEmployees") if item.get(key)}
    return {}


def extract(html: str, base: str) -> dict:
    text, _ = html_text(html)
    links = list(dict.fromkeys(HREF.findall(html)))  # inclui link relativo (/contato), que é o mais comum
    raw = html
    emails = [email.lower() for email in EMAIL.findall(raw) if not any(junk in email.lower() for junk in JUNK)]
    socials = {}
    for name, pattern in SOCIAL.items():
        for handle in pattern.findall(raw):
            if handle.lower().rstrip("/") not in BAD_HANDLES:
                socials[name] = handle.rstrip("/")
                break
    title = TITLE.search(html)
    description = DESCRIPTION.search(html)
    absolute = [urljoin(base, link) for link in links if not link.startswith(("mailto:", "tel:", "javascript:"))]
    return {
        "title": title.group(1).strip()[:200] if title else "",
        "description": description.group(1).strip()[:400] if description else "",
        "emails": list(dict.fromkeys(emails))[:5],
        "phones": list(dict.fromkeys(re.sub(r"\D", "", phone) for phone in PHONE.findall(text)))[:3],
        "socials": socials,
        "careers": next((link for link in absolute if CAREERS.search(link)), ""),
        "organization": _jsonld(html),
        "text": text[:1500],
        "next": [link for link in absolute if urlparse(link).netloc == urlparse(base).netloc and CRAWL.search(link)][:3],
    }


def enrich(website: str) -> dict:
    if not _allowed(website):
        return {"blocked": "robots.txt não permite"}
    response = requests.get(website, headers={"User-Agent": UA}, timeout=20)
    response.raise_for_status()
    found = extract(response.text, response.url)
    pages = [response.url]
    for link in found.pop("next"):
        if link in pages or not _allowed(link):
            continue
        try:
            page = requests.get(link, headers={"User-Agent": UA}, timeout=15)
            page.raise_for_status()
        except requests.RequestException:
            continue
        pages.append(link)
        more = extract(page.text, page.url)
        more.pop("next")
        found["emails"] = list(dict.fromkeys(found["emails"] + more["emails"]))[:5]
        found["phones"] = list(dict.fromkeys(found["phones"] + more["phones"]))[:3]
        found["socials"] = {**more["socials"], **found["socials"]}
        found["careers"] = found["careers"] or more["careers"]
        found["organization"] = found["organization"] or more["organization"]
    found["pages"] = pages
    return found
