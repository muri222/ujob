import json
import re
from datetime import datetime, timedelta, timezone

from ..text import markdown
from .base import Source, register

MAX_AGE = timedelta(days=60)
PAGES = 3
COMPANY = re.compile(r"(?:\s@\s*|\sna\s|\sno\s|\s-\s)([^\[\]\-|@]{2,60})$", re.I)
BRACKETS = re.compile(r"\[([^\]]+)\]")


@register("github")
class GithubIssues(Source):
    complete = True

    def start(self):
        yield self.page(1)

    def page(self, number: int):
        headers = {"Accept": "application/vnd.github+json"}
        if self.spider.settings.get("GITHUB_TOKEN"):
            headers["Authorization"] = f"Bearer {self.spider.settings['GITHUB_TOKEN']}"
        url = f"https://api.github.com/repos/{self.target}/issues?state=open&per_page=100&sort=created&direction=desc&page={number}"
        return self.request(url, self.parse, headers=headers, meta={"page": number})

    def parse(self, response):
        items = json.loads(response.text)
        cutoff = datetime.now(timezone.utc) - MAX_AGE
        fresh = 0
        for item in items:
            if "pull_request" in item or datetime.fromisoformat(item["created_at"].replace("Z", "+00:00")) < cutoff:
                continue
            fresh += 1
            labels = [label.get("name", "") for label in item.get("labels") or []]
            title = item.get("title") or ""
            company = COMPANY.search(BRACKETS.sub("", title).strip())
            yield self.job(
                url=item["html_url"],
                title=BRACKETS.sub("", title).strip(" -") or title,
                company=company.group(1).strip() if company else "",
                company_logo="",
                description=markdown(item.get("body") or ""),
                tags=labels,
                published_at=item["created_at"],
                hints=" ".join(BRACKETS.findall(title) + labels),
            )
        page = response.meta["page"]
        if len(items) == 100 and fresh and page < PAGES:
            yield self.page(page + 1)
        elif len(items) == 100 and fresh:
            self.spider.partial(self.id)
