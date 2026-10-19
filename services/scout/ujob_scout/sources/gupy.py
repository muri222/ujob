import json
from urllib.parse import quote, urlsplit, urlunsplit

from ..places import state_code
from .base import Source, register

NEXT_DATA = '//script[@id="__NEXT_DATA__"]/text()'
WORKPLACE = {"remote": "remoto", "hybrid": "hibrido", "on-site": "presencial"}
CONTRACT = {
    "vacancy_type_effective": "clt",
    "vacancy_type_internship": "estagio",
    "vacancy_type_summer": "estagio",
    "vacancy_type_apprentice": "aprendiz",
    "vacancy_type_trainee": "trainee",
    "vacancy_type_temporary": "temporario",
    "vacancy_type_talent_pool": "talentos",
    "vacancy_type_associate": "pj",
    "vacancy_type_legal_entity": "pj",
    "vacancy_type_autonomous": "freelancer",
    "vacancy_type_freelancer": "freelancer",
}


def page_props(response) -> dict:
    raw = response.xpath(NEXT_DATA).get()
    return json.loads(raw)["props"]["pageProps"] if raw else {}


@register("gupy")
class GupyCareers(Source):
    complete = True

    def start(self):
        yield self.request(f"https://{self.target}.gupy.io/", self.parse)

    def parse(self, response):
        props = page_props(response)
        page = props.get("careerPage") or {}
        logo = page.get("urlLogo") or (page.get("appearances") or {}).get("companyLogoUrl") or ""
        company = page.get("publicationName") or self.record.get("name") or page.get("name") or ""
        for item in props.get("jobs") or []:
            workplace = item.get("workplace") or {}
            address = workplace.get("address") or {}
            yield self.job(
                url=f"https://{self.target}.gupy.io/jobs/{item['id']}",
                title=item.get("title") or "",
                company=company,
                company_logo=logo,
                city=address.get("city") or "",
                state=address.get("stateShortName") or state_code(address.get("state")),
                country=address.get("country") or "",
                workplace=WORKPLACE.get(workplace.get("workplaceType"), ""),
                contract=CONTRACT.get(item.get("type"), ""),
                hints=item.get("department") or "",
            )


@register("gupy_search")
class GupySearch(Source):
    def start(self):
        state = self.config.get("state")
        for term in self.config.get("terms", []):
            for page in range(1, int(self.config.get("pages", 2)) + 1):
                url = f"https://portal.gupy.io/job-search/term={quote(term)}&page={page}"
                yield self.request(f"{url}&state={quote(state)}" if state else url, self.parse)

    def parse(self, response):
        listing = page_props(response).get("initialJobList") or {}
        for item in listing.get("data") or []:
            parts = urlsplit(item.get("jobUrl") or "")
            if not parts.netloc:
                continue
            yield self.job(
                url=urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")),
                title=item.get("name") or "",
                company=item.get("careerPageName") or "",
                company_logo=item.get("careerPageLogo") or "",
                city=item.get("city") or "",
                state=state_code(item.get("state")),
                workplace=WORKPLACE.get(item.get("workplaceType"), ""),
                contract=CONTRACT.get(item.get("type"), ""),
                summary=item.get("description") or "",
                published_at=item.get("publishedDate") or "",
                expires_at=item.get("applicationDeadline") or "",
            )
