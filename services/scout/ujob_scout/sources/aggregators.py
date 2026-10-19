import json
import re
from datetime import datetime, timezone
from urllib.parse import quote
from xml.etree import ElementTree

from .base import Source, register

GETONBRD_SENIORITY = {1: "estagio", 2: "junior", 3: "pleno", 4: "senior", 5: "lideranca"}


@register("getonbrd")
class GetOnBoard(Source):
    """Get on Board: vagas de tecnologia, design e marketing na América Latina (muitas remotas). Busca por termo."""

    def start(self):
        for term in (self.config.get("terms") or ["designer"])[:8]:
            yield self.request(f"https://www.getonbrd.com/api/v0/search/jobs?query={quote(term)}&per_page=50", self.parse, meta={"term": term})

    def parse(self, response):
        for item in json.loads(response.text).get("data", []):
            data = item.get("attributes") or {}
            countries = [str(country) for country in data.get("countries") or []]
            remote = bool(data.get("remote"))
            published = data.get("published_at")
            yield self.job(
                url=(item.get("links") or {}).get("public_url") or "",
                title=data.get("title") or "",
                description="".join(str(data.get(key) or "") for key in ("functions", "description", "desirable", "benefits", "projects")),
                workplace="remoto" if remote else "",
                country="" if remote and countries in ([], ["Remote"]) else ", ".join(countries)[:60],
                seniority=GETONBRD_SENIORITY.get(((data.get("seniority") or {}).get("data") or {}).get("id"), ""),
                salary_min=data.get("min_salary") or 0,
                salary_max=data.get("max_salary") or 0,
                salary_currency="USD" if data.get("min_salary") else "",
                salary_period="mes" if data.get("min_salary") else "",
                published_at=datetime.fromtimestamp(published, timezone.utc).isoformat() if isinstance(published, (int, float)) else "",
                hints=" ".join(filter(None, [data.get("category_name"), response.meta.get("term")])),
            )


@register("workingnomads")
class WorkingNomads(Source):
    """Working Nomads: vagas remotas do mundo todo (feed único)."""

    complete = True

    def start(self):
        yield self.request("https://www.workingnomads.com/api/exposed_jobs/", self.parse)

    def parse(self, response):
        for item in json.loads(response.text):
            yield self.job(
                url=item.get("url") or "",
                title=item.get("title") or "",
                company=item.get("company_name") or "",
                description=item.get("description") or "",
                workplace="remoto",
                country=(item.get("location") or "")[:60],
                tags=[tag for tag in (item.get("tags") or "").split(",") if tag][:8],
                published_at=item.get("pub_date") or "",
                hints=item.get("category_name") or "",
            )


# ponytail: Landing.jobs bloqueia coleta no robots.txt (2026-10); fica registrado mas fora do catálogo
@register("landingjobs")
class LandingJobs(Source):
    """Landing.jobs: tecnologia em Portugal e Europa, com salário."""

    def start(self):
        for page in range(int(self.config.get("pages", 3))):
            yield self.request(f"https://landing.jobs/api/v1/jobs?limit=50&offset={page * 50}", self.parse)

    def parse(self, response):
        for item in json.loads(response.text):
            places = item.get("locations") or []
            first = places[0] if places else {}
            country = {"PT": "Portugal", "ES": "Spain", "DE": "Germany", "NL": "Netherlands", "GB": "United Kingdom", "FR": "France"}.get(first.get("country_code"), first.get("country_code") or "")
            yield self.job(
                url=item.get("url") or "",
                title=item.get("title") or "",
                description="".join(str(item.get(key) or "") for key in ("role_description", "main_requirements", "nice_to_have", "perks")),
                workplace="remoto" if item.get("remote") else "",
                city=first.get("city") or "",
                country=country,
                salary_min=item.get("gross_salary_low") or 0,
                salary_max=item.get("gross_salary_high") or 0,
                salary_currency=item.get("currency_code") or "",
                salary_period="ano" if item.get("gross_salary_low") else "",
                tags=[str(tag) for tag in item.get("tags") or []][:8],
                published_at=item.get("published_at") or "",
                expires_at=item.get("expires_at") or "",
                hints=item.get("type") or "",
            )


@register("rss_dribbble")
class DribbbleJobs(Source):
    """Vagas de design do Dribbble (RSS): "Empresa is hiring for a position of Cargo in Lugar"."""

    complete = True
    PATTERN = re.compile(r"^(?P<company>.+?) is hiring for a position of (?P<title>.+?)(?: in (?P<place>.+))?$")

    def start(self):
        yield self.request("https://dribbble.com/jobs.rss", self.parse)

    def parse(self, response):
        for item in ElementTree.fromstring(response.body).iter("item"):
            text = (item.findtext("title") or "").strip()
            found = self.PATTERN.match(text)
            if not found:
                continue
            place = (found.group("place") or "").strip()
            remote = place.lower().startswith("remote")
            yield self.job(
                url=(item.findtext("link") or "").split("?")[0],
                title=found.group("title").strip(),
                company=found.group("company").strip(),
                workplace="remoto" if remote else "",
                country="" if remote else place[:60],
                published_at=item.findtext("pubDate") or "",
                category="design",
                hints="design dribbble",
            )
