import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote, urlsplit

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ujob_scout.text import fold  # noqa: E402

NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
AGENCY = re.compile(r"\b(rh|recursos humanos|talentos?|consultoria|recrutamento|staff|selecao|gestao de pessoas|terceiriza|temporari|executive search|headhunt|outsourcing|people)\b")
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; UjobBot/1.0; +https://ujob.com.br/bot)"}
PAGES = 3


def props(url: str) -> dict:
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    match = NEXT_DATA.search(response.text)
    return json.loads(match.group(1))["props"]["pageProps"] if match else {}


def harvest(term: str) -> set[str]:
    found = set()
    for page in range(1, PAGES + 1):
        try:
            jobs = props(f"https://portal.gupy.io/job-search/term={quote(term)}&page={page}").get("initialJobList", {}).get("data", [])
        except requests.RequestException:
            break
        found.update(urlsplit(job["jobUrl"]).hostname.split(".")[0] for job in jobs if job.get("jobUrl"))
        time.sleep(0.3)
    return found


def describe(slug: str) -> dict | None:
    try:
        data = props(f"https://{slug}.gupy.io/")
    except (requests.RequestException, ValueError, KeyError):
        return None
    page = data.get("careerPage") or {}
    jobs = data.get("jobs") or []
    if not jobs:
        return None
    name = (page.get("publicationName") or page.get("name") or slug).strip()
    return {
        "slug": f"gupy-{slug}",
        "name": name[:120],
        "kind": "gupy",
        "group": "agencia" if AGENCY.search(fold(name)) else "empresa",
        "target": slug,
        "site": f"https://{slug}.gupy.io/",
        "logoUrl": page.get("urlLogo") or "",
        "intervalMinutes": 360 if len(jobs) > 50 else 720,
        "openJobs": len(jobs),
    }


def main() -> None:
    catalog = ROOT / "catalog"
    terms = json.loads((catalog / "terms.json").read_text(encoding="utf-8"))["geral"]
    output = catalog / "gupy.json"
    previous = {entry["target"] for entry in json.loads(output.read_text(encoding="utf-8"))} if output.exists() else set()

    with ThreadPoolExecutor(6) as pool:
        slugs = set().union(*pool.map(harvest, terms)) | previous
    print(f"{len(slugs)} portais de carreira encontrados")

    with ThreadPoolExecutor(12) as pool:
        entries = [entry for entry in pool.map(describe, sorted(slugs)) if entry]
    entries.sort(key=lambda entry: (-entry.pop("openJobs"), entry["name"]))
    output.write_text(json.dumps(entries, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(entries)} empresas com vagas abertas salvas em {output.name}")


if __name__ == "__main__":
    main()
