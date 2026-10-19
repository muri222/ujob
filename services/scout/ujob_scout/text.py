import hashlib
import html
import re
import unicodedata
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

TAGS = re.compile(r"<[^>]+>")
SPACES = re.compile(r"\s+")
BLOCKS = re.compile(r"</?(p|div|br|li|ul|ol|h[1-6]|tr|section)\b[^>]*>", re.I)
FRACTION = re.compile(r"(\.\d{6})\d+")
MONEY = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?")


def clean(value, limit: int = 0) -> str:
    text = SPACES.sub(" ", html.unescape(str(value or ""))).strip()
    return truncate(text, limit) if limit else text


def plain(markup: str, limit: int = 0) -> str:
    return clean(TAGS.sub(" ", BLOCKS.sub(" \n", html.unescape(markup or ""))), limit)


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    return (cut.rsplit(" ", 1)[0] if " " in cut else cut).rstrip(" ,.;:-") + "…"


def fold(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text or "").lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def url_hash(url: str) -> str:
    return hashlib.sha1(url.strip().encode()).hexdigest()


def https(url) -> str:
    url = str(url or "").strip()
    if url.startswith("//"):
        url = f"https:{url}"
    return url if re.match(r"^https://[^\s\"<>]+$", url) else ""


def iso(value) -> str:
    if value in (None, "", 0):
        return ""
    try:
        if isinstance(value, (int, float)) or str(value).isdigit():
            stamp = float(value)
            return datetime.fromtimestamp(stamp / 1000 if stamp > 1e11 else stamp, timezone.utc).isoformat()
        text = str(value).strip()
        if re.match(r"^\d{2}/\d{2}/\d{4}", text):
            day, month, year = text[:10].split("/")
            text = f"{year}-{month}-{day}"
        try:
            parsed = datetime.fromisoformat(FRACTION.sub(lambda match: match.group(1), text.replace("Z", "+00:00")))
        except ValueError:
            parsed = parsedate_to_datetime(text)
        return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)).isoformat()
    except (ValueError, TypeError, OverflowError, OSError):
        return ""


def money(text) -> list[float]:
    values = []
    for whole, cents in MONEY.findall(str(text or "")):
        amount = float(whole.replace(".", "") + (f".{cents}" if cents else ""))
        if amount >= 100:
            values.append(amount)
    return values[:2]


def markdown(source: str, limit: int = 30000) -> str:
    lines, out, in_list = (source or "").replace("\r", "").split("\n"), [], False
    for raw in lines:
        line = html.escape(raw.strip())
        line = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
        line = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', line)
        bullet = re.match(r"^[-*+]\s+(.*)", line)
        if bullet:
            out.append(("" if in_list else "<ul>") + f"<li>{bullet.group(1)}</li>")
            in_list = True
            continue
        if in_list:
            out.append("</ul>")
            in_list = False
        heading = re.match(r"^#{1,6}\s+(.*)", line)
        if heading:
            out.append(f"<h3>{heading.group(1)}</h3>")
        elif line:
            out.append(f"<p>{line}</p>")
    if in_list:
        out.append("</ul>")
    return "".join(out)[:limit]
