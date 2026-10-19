import json
from urllib.parse import quote
from xml.etree import ElementTree

from ..places import split_place
from .base import Source, register

WORKPLACE = {"remote": "remoto", "hybrid": "hibrido", "on_site": "presencial", "onsite": "presencial"}
CONTRACT = {"Contract": "pj", "Internship": "estagio", "Temporary": "temporario", "Freelance": "freelancer", "intern": "estagio", "freelance": "freelancer"}


def place(city: str, region: str = "", country: str = "") -> dict:
    brazil = (country or "").lower() in ("br", "brazil", "brasil")
    found_city, state = split_place(", ".join(filter(None, [city, region]))) if brazil or not country else (city, "")
    return {"city": (found_city or city or "")[:80], "state": state, "country": "" if state else "Brasil" if brazil else (country or "")[:60]}


@register("workable")
class Workable(Source):
    """Página de vagas de uma empresa no Workable (apply.workable.com/{conta})."""

    complete = True

    def start(self):
        yield self.request(f"https://apply.workable.com/api/v1/widget/accounts/{self.target}?details=true", self.parse)

    def parse(self, response):
        data = json.loads(response.text)
        for item in data.get("jobs", []):
            yield self.job(
                url=item.get("shortlink") or item["url"],
                apply_url=item.get("application_url") or "",
                title=item.get("title") or "",
                company=data.get("name") or self.record.get("name", ""),
                description=item.get("description") or "",
                workplace="remoto" if str(item.get("telecommuting")).lower() == "true" else "",
                contract=CONTRACT.get(item.get("employment_type") or "", ""),
                published_at=item.get("published_on") or item.get("created_at") or "",
                hints=" ".join(filter(None, [item.get("department"), item.get("function"), item.get("industry")])),
                **place(item.get("city") or "", item.get("state") or "", item.get("country") or ""),
            )


@register("workable_search")
class WorkableSearch(Source):
    """Busca global do Workable (todas as empresas que usam Workable), por termo."""

    def start(self):
        countries = (self.config.get("countries") or [{"code": "BR", "name": "Brazil"}])[:4]
        for term in (self.config.get("terms") or [])[:6]:
            for country in countries:
                where = "" if country["code"] == "WW" else f"&location={quote(country['name'])}"
                remote = "&workplace=remote" if country["code"] == "WW" else ""
                yield self.request(f"https://jobs.workable.com/api/v1/jobs?query={quote(term)}{where}{remote}", self.parse, meta={"term": term})

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            company = item.get("company") or {}
            where = item.get("location") or {}
            yield self.job(
                url=item["url"],
                title=item.get("title") or "",
                company=company.get("title") or "",
                company_logo=company.get("image") or "",
                description=(item.get("description") or "") + (item.get("requirementsSection") or "") + (item.get("benefitsSection") or ""),
                workplace=WORKPLACE.get(item.get("workplace") or "", ""),
                contract=CONTRACT.get(item.get("employmentType") or "", ""),
                published_at=item.get("updated") or item.get("created") or "",
                hints=" ".join(filter(None, [item.get("department"), response.meta.get("term")])),
                **place(where.get("city") or "", where.get("subregion") or "", where.get("countryName") or ""),
            )


@register("smartrecruiters")
class SmartRecruiters(Source):
    complete = True

    def start(self):
        yield self.request(f"https://api.smartrecruiters.com/v1/companies/{self.target}/postings?limit=100", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("content", []):
            where = item.get("location") or {}
            company = item.get("company") or {}
            yield self.job(
                url=f"https://jobs.smartrecruiters.com/{company.get('identifier') or self.target}/{item['id']}",
                title=item.get("name") or "",
                company=company.get("name") or self.record.get("name", ""),
                workplace="remoto" if where.get("remote") else "hibrido" if where.get("hybrid") else "",
                published_at=item.get("releasedDate") or "",
                hints=" ".join(filter(None, [(item.get("function") or {}).get("label"), (item.get("experienceLevel") or {}).get("label"), (item.get("typeOfEmployment") or {}).get("label")])),
                **place(where.get("city") or "", where.get("region") or "", where.get("country") or ""),
            )


@register("recruitee")
class Recruitee(Source):
    complete = True

    def start(self):
        yield self.request(f"https://{self.target}.recruitee.com/api/offers/", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("offers", []):
            salary = item.get("salary") or {}
            yield self.job(
                url=item.get("careers_url") or "",
                apply_url=item.get("careers_apply_url") or "",
                title=item.get("title") or "",
                company=item.get("company_name") or self.record.get("name", ""),
                description=(item.get("description") or "") + (item.get("requirements") or ""),
                workplace="remoto" if item.get("remote") else "hibrido" if item.get("hybrid") else "presencial" if item.get("on_site") else "",
                contract="estagio" if "intern" in (item.get("employment_type_code") or "") else "",
                salary_min=salary.get("min") or 0,
                salary_max=salary.get("max") or 0,
                salary_currency=salary.get("currency") or "",
                published_at=item.get("published_at") or "",
                hints=item.get("department") or "",
                **place(item.get("city") or "", item.get("state_name") or "", item.get("country") or ""),
            )


@register("personio")
class Personio(Source):
    complete = True

    def start(self):
        yield self.request(f"https://{self.target}.jobs.personio.de/xml", self.parse)

    def parse(self, response):
        root = ElementTree.fromstring(response.body)
        for position in root.iter("position"):
            get = lambda tag: (position.findtext(tag) or "").strip()
            description = "".join(f"<h3>{(block.findtext('name') or '').strip()}</h3>{(block.findtext('value') or '').strip()}" for block in position.iter("jobDescription"))
            yield self.job(
                url=f"https://{self.target}.jobs.personio.de/job/{get('id')}",
                title=get("name"),
                company=get("subcompany") or self.record.get("name", ""),
                description=description,
                contract={"intern": "estagio", "freelance": "freelancer", "trainee": "trainee"}.get(get("employmentType"), ""),
                published_at=get("createdAt"),
                hints=" ".join(filter(None, [get("department"), get("seniority"), get("schedule")])),
                **place(get("office")),
            )
