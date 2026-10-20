"""Leitura local, sem IA e sem token: PDF e página web viram texto puro."""

import re
from html.parser import HTMLParser

import requests
from pypdf import PdfReader

LIMIT = 15000


def pdf_text(path: str) -> str:
    text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    return re.sub(r"[ \t]+", " ", text).strip()[:LIMIT]


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head"}

    def __init__(self):
        super().__init__()
        self.parts: list[str] = []
        self.links: list[str] = []
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.depth += 1
        href = dict(attrs).get("href") or ""
        if tag == "a" and href.startswith(("http", "mailto:")):
            self.links.append(href)

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if not self.depth and data.strip():
            self.parts.append(data.strip())


def html_text(html: str) -> tuple[str, list[str]]:
    parser = _Text()
    parser.feed(html)
    return " ".join(parser.parts)[:LIMIT], list(dict.fromkeys(parser.links))[:60]


def page_text(url: str) -> str:
    response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0 (uJob)"})
    response.raise_for_status()
    text, links = html_text(response.text)
    return f"{text}\n\nLINKS: {' '.join(links)}"
