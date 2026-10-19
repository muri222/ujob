import json

from ..text import money
from .base import Source, register


def listing(value) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else [str(value)] if value else []


@register("remotive")
class Remotive(Source):
    complete = True

    def start(self):
        yield self.request("https://remotive.com/api/remote-jobs", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            pay = money(item.get("salary"))
            yield self.job(
                url=item["url"],
                title=item.get("title") or "",
                company=item.get("company_name") or "",
                company_logo=item.get("company_logo") or "",
                description=item.get("description") or "",
                workplace="remoto",
                country=item.get("candidate_required_location") or "",
                contract={"contract": "pj", "freelance": "freelancer", "internship": "estagio"}.get(item.get("job_type"), ""),
                salary_min=pay[0] if pay else 0,
                tags=listing(item.get("tags"))[:8],
                published_at=item.get("publication_date") or "",
                hints=item.get("category") or "",
            )


@register("arbeitnow")
class Arbeitnow(Source):
    def start(self):
        for page in range(1, int(self.config.get("pages", 3)) + 1):
            yield self.request(f"https://www.arbeitnow.com/api/job-board-api?page={page}", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("data", []):
            yield self.job(
                url=item["url"],
                title=item.get("title") or "",
                company=item.get("company_name") or "",
                description=item.get("description") or "",
                workplace="remoto" if item.get("remote") else "",
                country=item.get("location") or "",
                tags=listing(item.get("tags"))[:8],
                published_at=item.get("created_at") or "",
                hints=" ".join(listing(item.get("job_types"))),
            )


@register("remoteok")
class RemoteOk(Source):
    complete = True

    def start(self):
        yield self.request("https://remoteok.com/api", self.parse)

    def parse(self, response):
        for item in json.loads(response.text)[1:]:
            if not item.get("url"):
                continue
            yield self.job(
                url=item["url"],
                apply_url=item.get("apply_url") or item["url"],
                title=item.get("position") or "",
                company=item.get("company") or "",
                company_logo=item.get("company_logo") or item.get("logo") or "",
                description=item.get("description") or "",
                workplace="remoto",
                country=item.get("location") or "",
                salary_min=item.get("salary_min") or 0,
                salary_max=item.get("salary_max") or 0,
                salary_currency="USD" if item.get("salary_min") else "",
                salary_period="ano" if item.get("salary_min") else "",
                tags=listing(item.get("tags"))[:8],
                published_at=item.get("date") or "",
            )


@register("himalayas")
class Himalayas(Source):
    def start(self):
        for page in range(int(self.config.get("pages", 5))):
            yield self.request(f"https://himalayas.app/jobs/api?limit=20&offset={page * 20}", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            period = {"annual": "ano", "monthly": "mes", "hourly": "hora"}.get(item.get("salaryPeriod"), "")
            yield self.job(
                url=item.get("guid") or item.get("applicationLink"),
                apply_url=item.get("applicationLink") or "",
                title=item.get("title") or "",
                company=item.get("companyName") or "",
                company_logo=item.get("companyLogo") or "",
                summary=item.get("excerpt") or "",
                description=item.get("description") or "",
                workplace="remoto",
                country=", ".join(listing(item.get("locationRestrictions"))[:3]),
                salary_min=item.get("minSalary") or 0,
                salary_max=item.get("maxSalary") or 0,
                salary_currency=item.get("currency") or "",
                salary_period=period,
                published_at=item.get("pubDate") or "",
                expires_at=item.get("expiryDate") or "",
                hints=" ".join(listing(item.get("categories")) + listing(item.get("seniority")) + [item.get("employmentType") or ""]),
            )


@register("jobicy")
class Jobicy(Source):
    def start(self):
        geo = self.config.get("geo")
        yield self.request(f"https://jobicy.com/api/v2/remote-jobs?count=100{f'&geo={geo}' if geo else ''}", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            yield self.job(
                url=item["url"],
                title=item.get("jobTitle") or "",
                company=item.get("companyName") or "",
                company_logo=item.get("companyLogo") or "",
                summary=item.get("jobExcerpt") or "",
                description=item.get("jobDescription") or "",
                workplace="remoto",
                country=item.get("jobGeo") or "",
                salary_min=item.get("salaryMin") or item.get("annualSalaryMin") or 0,
                salary_max=item.get("salaryMax") or item.get("annualSalaryMax") or 0,
                salary_currency=item.get("salaryCurrency") or "",
                salary_period={"yearly": "ano", "monthly": "mes", "hourly": "hora"}.get(item.get("salaryPeriod"), ""),
                published_at=item.get("pubDate") or "",
                hints=" ".join(listing(item.get("jobIndustry")) + listing(item.get("jobType")) + [item.get("jobLevel") or ""]),
            )


@register("wwr")
class WeWorkRemotely(Source):
    def start(self):
        for feed in self.config.get("feeds", ["https://weworkremotely.com/remote-jobs.rss"]):
            yield self.request(feed, self.parse)

    def parse(self, response):
        response.selector.remove_namespaces()
        for item in response.xpath("//item"):
            heading = item.xpath("title/text()").get("")
            company, _, title = heading.partition(": ")
            yield self.job(
                url=item.xpath("link/text()").get("").strip(),
                title=title or heading,
                company=company if title else "",
                company_logo=item.xpath("content/@url").get(""),
                description=item.xpath("description/text()").get(""),
                workplace="remoto",
                country=item.xpath("region/text()").get(""),
                published_at=item.xpath("pubDate/text()").get(""),
                hints=" ".join(item.xpath("category/text() | type/text()").getall()),
            )
