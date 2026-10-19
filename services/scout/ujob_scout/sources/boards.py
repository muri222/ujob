import html
import json

from ..places import split_place
from ..text import money
from .base import Source, register

PERIOD = {"per-hour-wage": "hora", "per-month-salary": "mes", "per-year-salary": "ano", "1 HOUR": "hora", "1 MONTH": "mes", "1 YEAR": "ano"}


def place(text: str) -> dict:
    city, state = split_place(text)
    return {"city": city, "state": state, "country": "" if state else (text or "")[:60]}


@register("greenhouse")
class Greenhouse(Source):
    complete = True

    def start(self):
        yield self.request(f"https://boards-api.greenhouse.io/v1/boards/{self.target}/jobs?content=true", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            location = (item.get("location") or {}).get("name") or ""
            yield self.job(
                url=item["absolute_url"],
                apply_url=item["absolute_url"],
                title=item.get("title") or "",
                description=html.unescape(item.get("content") or ""),
                published_at=item.get("first_published") or item.get("updated_at") or "",
                hints=" ".join(dept.get("name", "") for dept in item.get("departments") or []) + " " + location,
                **place(location),
            )


@register("lever")
class Lever(Source):
    complete = True

    def start(self):
        yield self.request(f"https://api.lever.co/v0/postings/{self.target}?mode=json", self.parse)

    def parse(self, response):
        for item in json.loads(response.text):
            categories = item.get("categories") or {}
            salary = item.get("salaryRange") or {}
            sections = "".join(f"<h3>{block.get('text', '')}</h3><ul>{block.get('content', '')}</ul>" for block in item.get("lists") or [])
            yield self.job(
                url=item["hostedUrl"],
                apply_url=item.get("applyUrl") or item["hostedUrl"],
                title=item.get("text") or "",
                description=(item.get("description") or "") + sections + (item.get("additional") or ""),
                workplace={"remote": "remoto", "hybrid": "hibrido", "onsite": "presencial"}.get(item.get("workplaceType"), ""),
                salary_min=salary.get("min") or 0,
                salary_max=salary.get("max") or 0,
                salary_currency=salary.get("currency") or "",
                salary_period=PERIOD.get(salary.get("interval") or "", ""),
                published_at=item.get("createdAt") or "",
                hints=" ".join(filter(None, [categories.get("team"), categories.get("department"), categories.get("commitment")])),
                **place(categories.get("location") or ""),
            )


@register("ashby")
class Ashby(Source):
    complete = True

    def start(self):
        yield self.request(f"https://api.ashbyhq.com/posting-api/job-board/{self.target}?includeCompensation=true", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            pay = money((item.get("compensation") or {}).get("compensationTierSummary") or "")
            yield self.job(
                url=item["jobUrl"],
                apply_url=item.get("applyUrl") or item["jobUrl"],
                title=item.get("title") or "",
                description=item.get("descriptionHtml") or "",
                workplace={"Remote": "remoto", "Hybrid": "hibrido", "OnSite": "presencial"}.get(item.get("workplaceType"), "remoto" if item.get("isRemote") else ""),
                contract={"Intern": "estagio", "Contract": "pj", "Temporary": "temporario"}.get(item.get("employmentType"), ""),
                salary_min=pay[0] if pay else 0,
                salary_max=pay[1] if len(pay) > 1 else 0,
                published_at=item.get("publishedAt") or "",
                hints=" ".join(filter(None, [item.get("department"), item.get("team")])),
                **place(item.get("location") or ""),
            )
