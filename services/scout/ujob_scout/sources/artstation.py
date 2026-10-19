import json
import re

from .base import Source, register

LEVEL = {"entry": "junior", "junior": "junior", "middle": "pleno", "senior": "senior", "lead": "lideranca", "internship": "estagio"}
CONTRACT = {"contract": "pj", "freelance": "freelancer", "internship": "estagio", "temporary": "temporario"}
PERIOD = {"hour": "hora", "month": "mes", "year": "ano"}


@register("artstation")
class ArtStation(Source):
    """ArtStation Jobs: o sitemap público lista as vagas e cada uma tem um JSON aberto (robots.txt libera)."""

    complete = True

    def start(self):
        yield self.request("https://www.artstation.com/api/v2/jobs/jobs-sitemap-1.xml", self.parse_sitemap)

    def parse_sitemap(self, response):
        limit = int(self.config.get("max", 200))
        for hash_id in re.findall(r"artstation\.com/jobs/([A-Za-z0-9]+)</loc>", response.text)[:limit]:
            yield self.request(f"https://www.artstation.com/api/v2/jobs/public/jobs/{hash_id}.json", self.parse_job)

    def parse_job(self, response):
        item = json.loads(response.text)
        if item.get("job_state") != "approved" or item.get("deleted_at"):
            return
        place = ((item.get("recruitment_localities") or [{}])[0] or {}).get("locality") or {}
        pay = item.get("salary_range") or {}
        company = item.get("recruitment_company") or {}
        brazil = place.get("country_code") == "BR"
        yield self.job(
            url=f"https://www.artstation.com/jobs/{item['hash_id']}",
            apply_url=item.get("apply_link") or "",
            title=item.get("title") or "",
            company=item.get("company_name") or company.get("name") or "",
            company_logo=company.get("logo_thumb_url") or item.get("image_thumb_url") or "",
            description=(item.get("description") or "") + (item.get("about") or ""),
            workplace="remoto" if item.get("work_remotely") else "presencial",
            seniority=LEVEL.get(item.get("level") or "", ""),
            contract=CONTRACT.get(item.get("job_type") or "", ""),
            city=place.get("city_name") or "",
            state=(place.get("subdivision_1_code") or "") if brazil else "",
            country="" if brazil else place.get("country_name") or "",
            salary_min=pay.get("min_salary") or 0,
            salary_max=pay.get("max_salary") or 0,
            salary_currency=pay.get("currency") or "",
            salary_period=PERIOD.get(pay.get("period") or "", ""),
            tags=[c["name"] for c in item.get("classifications") or [] if c.get("name")][:12],
            published_at=item.get("created_at") or "",
            hints="design 3d arte",
        )
