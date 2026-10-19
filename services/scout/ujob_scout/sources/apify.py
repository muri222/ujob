import json
import re

from scrapy import Request

from ..places import split_place
from ..text import money
from .base import Source, register

# LinkedIn, Indeed e Google Vagas não têm API aberta: vão pela Apify com o token e os créditos da própria pessoa.
# O painel só manda essas fontes em busca (nunca na rodada de fundo), com token e limite já calculados.
ACTORS = {
    "apify_linkedin": "valig~linkedin-jobs-scraper",
    "apify_indeed": "valig~indeed-jobs-scraper",
    "apify_google": "johnvc~Google-Jobs-Scraper",
}
CONTRACT = {"Full-time": "", "Part-time": "", "Contract": "pj", "Internship": "estagio", "Temporary": "temporario", "Freelance": "freelancer", "Tempo integral": "", "Estágio": "estagio", "Temporário": "temporario"}
SENIORITY = {"Internship": "estagio", "Entry level": "junior", "Associate": "pleno", "Mid-Senior level": "senior", "Director": "lideranca", "Executive": "lideranca"}


def place(text: str) -> dict:
    text = re.sub(r",?\s*(Brazil|Brasil)$", "", text or "").strip(" ,")
    city, state = split_place(text)
    if not state and "," in text:
        city, state = split_place(text.split(",")[0] + ", " + text.split(",")[-1])
    return {"city": city[:80] if state else "", "state": state, "country": "" if state else text[:60] or "Brasil"}


class ApifySource(Source):
    def body(self, term: str) -> dict:
        raise NotImplementedError

    def start(self):
        token = self.config.get("token")
        if not token:
            return
        countries = [country for country in (self.config.get("countries") or [{"code": "BR", "name": "Brazil"}]) if self.supports(country["code"])][:4]
        self.per_country = max(5, self.limit // max(1, len(countries)))
        for term in (self.config.get("terms") or [])[: int(self.config.get("max_terms", 3))]:
          for country in countries:
            yield Request(
                f"https://api.apify.com/v2/acts/{ACTORS[self.record['kind']]}/run-sync-get-dataset-items?timeout=240",
                method="POST",
                body=json.dumps(self.body(term, country)),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                callback=self.parse,
                errback=self.spider.failed,
                meta={"source": self.id, "term": term, "download_timeout": 280},
                dont_filter=True,
            )

    def supports(self, code: str) -> bool:
        return True

    def where(self, country: dict) -> str:
        if country["code"] != "BR":
            return "Worldwide" if country["code"] == "WW" else country["name"]
        place_config = self.config.get("place") or {}
        return ", ".join(filter(None, [place_config.get("city"), place_config.get("state")])) or "Brazil"

    @property
    def limit(self) -> int:
        return max(1, min(100, int(self.config.get("limit", 25))))


@register("apify_linkedin")
class LinkedIn(ApifySource):
    def body(self, term, country):
        return {"keywords": term, "location": self.where(country), "limit": self.per_country, "datePosted": "r604800"}

    def parse(self, response):
        for item in json.loads(response.text):
            if not isinstance(item, dict) or not item.get("url"):
                continue
            yield self.job(
                url=item["url"].split("?")[0],
                apply_url=item.get("applyUrl") or "",
                title=item.get("title") or "",
                company=item.get("companyName") or "",
                description=item.get("descriptionHtml") or item.get("description") or "",
                contract=CONTRACT.get(item.get("contractType") or "", ""),
                seniority=SENIORITY.get(item.get("experienceLevel") or "", ""),
                published_at=item.get("postedDate") or "",
                hints=" ".join(filter(None, [item.get("workType"), item.get("sector"), response.meta.get("term")])),
                **place(item.get("location") or ""),
            )


@register("apify_indeed")
class Indeed(ApifySource):
    COUNTRIES = {"ar", "au", "at", "be", "br", "ca", "cl", "co", "cr", "cz", "dk", "fi", "fr", "de", "ie", "il", "in", "it", "jp", "kr", "lu", "mx", "nl", "nz", "no", "pe", "pl", "pt", "ro", "sg", "za", "es", "se", "ch", "ae", "gb", "us", "uy"}

    def supports(self, code):
        return code.lower() in self.COUNTRIES

    def body(self, term, country):
        place_config = self.config.get("place") or {} if country["code"] == "BR" else {}
        return {"country": country["code"].lower(), "title": term, "location": place_config.get("city", ""), "limit": self.per_country, "datePosted": "14"}

    def parse(self, response):
        for item in json.loads(response.text):
            if not isinstance(item, dict) or not item.get("url"):
                continue
            where = item.get("location") or {}
            employer = item.get("employer") or {}
            salary = item.get("baseSalary") or {}
            description = item.get("description") or {}
            kinds = " ".join((item.get("jobTypes") or {}).values())
            yield self.job(
                url=item["url"],
                title=item.get("title") or "",
                company=employer.get("name") or "",
                description=description.get("html") or description.get("text") or "" if isinstance(description, dict) else str(description),
                city=where.get("city") or "",
                state=where.get("admin1Code") or "",
                country="" if where.get("countryCode") == "BR" else where.get("countryName") or "",
                contract="clt" if "CLT" in kinds else "pj" if "PJ" in kinds else "estagio" if "Estágio" in kinds else "",
                salary_min=salary.get("min") or 0,
                salary_max=salary.get("max") or 0,
                salary_currency=salary.get("currencyCode") or "" if salary.get("min") else "",
                salary_period={"MONTH": "mes", "YEAR": "ano", "HOUR": "hora"}.get(salary.get("unitOfWork") or "", ""),
                published_at=item.get("datePublished") or "",
                tags=list((item.get("attributes") or {}).values())[:8],
                hints=" ".join([*(item.get("occupations") or {}).values(), response.meta.get("term", "")]),
            )


@register("apify_google")
class GoogleJobs(ApifySource):
    def supports(self, code):
        return code != "WW"

    def body(self, term, country):
        code = country["code"].lower()
        portuguese = code in ("br", "pt")
        return {"query": term, "location": self.where(country), "country": code, "language": "pt" if portuguese else "en", "google_domain": "google.com.br" if code == "br" else "google.com", "num_results": self.per_country, "max_pagination": 1, "posted_within": "7d"}

    def parse(self, response):
        for item in json.loads(response.text):
            if not isinstance(item, dict) or not item.get("title"):
                continue
            options = item.get("apply_options") or []
            # o link original (site da empresa ou sistema de vagas) vale mais que o do Google
            link = item.get("source_link") or (options[0].get("link") if options else "") or item.get("share_link") or ""
            if not link:
                continue
            extras = " ".join(str(value) for value in item.get("extensions") or [])
            anywhere = re.search(r"qualquer lugar|anywhere|remoto", item.get("location") or "", re.I)
            pay = money(extras)
            yield self.job(
                url=link,
                apply_url=link,
                title=item.get("job_title") or item.get("title") or "",
                company=item.get("company_name") or "",
                description=item.get("description") or "",
                workplace="remoto" if anywhere or re.search(r"remot|home office|trabalho em casa", extras, re.I) else "",
                contract="estagio" if re.search(r"est[aá]gio", extras, re.I) else "pj" if re.search(r"prestador|contrat", extras, re.I) else "",
                salary_min=pay[0] if pay else 0,
                salary_max=pay[1] if len(pay) > 1 else 0,
                hints=" ".join(filter(None, [extras, item.get("via"), response.meta.get("term")])),
                **({"country": ""} if anywhere else place(item.get("location") or "")),
            )
