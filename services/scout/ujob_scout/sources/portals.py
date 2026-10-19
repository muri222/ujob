import json
import re
from urllib.parse import urljoin

from scrapy import Request

from .. import jsonld
from ..text import fold, money, url_hash
from .base import Source, register

# países que a API da Adzuna cobre
ADZUNA = {"br", "gb", "us", "at", "au", "be", "ca", "ch", "de", "es", "fr", "in", "it", "mx", "nl", "nz", "pl", "sg", "za"}
TRAMPOS_CONTRACT = {"estagio": "estagio", "freela": "freelancer", "trainee": "trainee", "emprego": "clt"}


def slug(term: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", fold(term)).strip("-")


@register("trampos")
class Trampos(Source):
    def start(self):
        for page in range(1, int(self.config.get("pages", 5)) + 1):
            yield self.request(f"https://trampos.co/api/v2/opportunities?page={page}", self.parse)

    def parse(self, response):
        for item in json.loads(response.text).get("opportunities", []):
            company = item.get("company") or {}
            pay = money(item.get("salary"))
            yield self.job(
                url=f"https://trampos.co/oportunidades/{item['id']}",
                apply_url=item.get("apply_url") or "",
                title=item.get("name") or "",
                company=item.get("custom_company_name") or (company.get("name") if isinstance(company, dict) else "") or "",
                company_logo=(company.get("logo") if isinstance(company, dict) else "") or "",
                city=item.get("city") or "",
                state=item.get("state") or "",
                workplace="remoto" if item.get("home_office") else "hibrido" if item.get("hybrid") else "",
                contract=TRAMPOS_CONTRACT.get(item.get("type_slug"), ""),
                salary_min=pay[0] if pay else 0,
                salary_max=pay[1] if len(pay) > 1 else 0,
                published_at=item.get("published_at") or "",
                hints=item.get("category_name") or "",
            )


@register("programathor")
class Programathor(Source):
    def start(self):
        for page in range(1, int(self.config.get("pages", 4)) + 1):
            yield self.request(f"https://programathor.com.br/jobs/page/{page}" if page > 1 else "https://programathor.com.br/jobs", self.parse)

    def parse(self, response):
        for card in response.css(".cell-list a[href^='/jobs/']"):
            facts = [text.strip() for text in card.css(".cell-list-content-icon span::text").getall() if text.strip()]
            title = " ".join(text.strip() for text in card.css("h3 ::text").getall() if text.strip())
            place = re.sub(r"\s*\((presencial|remoto|h[ií]brido)\)", "", facts[1] if len(facts) > 1 else "", flags=re.I).strip()
            mode = re.search(r"\((presencial|remoto|h[ií]brido)\)", facts[1] if len(facts) > 1 else "", re.I)
            logo = card.css(".logo-list img::attr(src)").get("")
            yield self.job(
                url=response.urljoin(card.attrib["href"]),
                title=title,
                company=facts[0] if facts else "",
                company_logo="" if "X-Amz-" in logo else logo,
                city="" if fold(place) == "remoto" else place,
                workplace="remoto" if fold(place) == "remoto" else fold(mode.group(1)) if mode else "",
                tags=card.css(".tag-list::text").getall(),
                category="tecnologia",
                hints=" ".join(facts[2:]),
            )


@register("jsonld")
class StructuredListing(Source):
    def start(self):
        template = self.config["list"]
        terms = self.config.get("terms") or [""]
        for term in terms:
            for page in range(1, int(self.config.get("pages", 1)) + 1):
                url = template.format(term=slug(term), page=page)
                yield self.request(url, self.parse_list, meta={"term": term})

    async def parse_list(self, response):
        pattern = re.compile(self.config["link"])
        links = list(dict.fromkeys(urljoin(response.url, href.split("#")[0]) for href in response.css("a::attr(href)").getall() if pattern.search(href)))
        known = await self.spider.known([url_hash(link) for link in links])
        self.spider.seen(self.id, len(known))
        for link in links:
            if url_hash(link) not in known and self.spider.spend(self.id):
                yield self.request(link, self.parse_detail, meta={"term": response.meta["term"]})

    def parse_detail(self, response):
        posting = jsonld.find_posting(response)
        if not posting:
            return
        fields = jsonld.fields(posting)
        fields["hints"] = " ".join(filter(None, [fields.get("hints"), response.meta.get("term")]))
        yield self.job(url=response.url, apply_url=response.url, **fields)


@register("card_listing")
class CardListing(Source):
    def start(self):
        place = self.config.get("place") or {}
        template = self.config["list_city"] if place and self.config.get("list_city") else self.config["list"]
        for term in self.config.get("terms") or [""]:
            url = template.format(term=slug(term), city=slug(place.get("city", "")), uf=place.get("state", "").lower())
            yield self.request(url, self.parse, meta={"term": term})

    def pick(self, card, key) -> str:
        selector = self.config["fields"].get(key)
        return " ".join(" ".join(card.css(selector).getall()).split()) if selector else ""

    def parse(self, response):
        strip = re.compile(self.config.get("strip_title", "^$"), re.I)
        for card in response.css(self.config["card"]):
            href = self.pick(card, "link")
            title = strip.sub("", self.pick(card, "title")).strip()
            if not href or not title:
                continue
            yield self.job(
                url=response.urljoin(href.split("?")[0]),
                title=title,
                company=self.pick(card, "company"),
                company_logo=self.pick(card, "logo"),
                city=self.pick(card, "place"),
                summary=self.pick(card, "summary").removeprefix("Descrição:").strip(),
                published_at=self.pick(card, "date"),
                hints=" ".join(filter(None, [self.pick(card, "hints"), response.meta["term"]])),
            )


@register("adzuna")
class Adzuna(Source):
    def start(self):
        # chave vem do app (Config. da conta) ou do .env
        app_id = self.config.get("app_id") or self.spider.settings.get("ADZUNA_APP_ID")
        app_key = self.config.get("app_key") or self.spider.settings.get("ADZUNA_APP_KEY")
        if not app_id:
            return
        countries = [country["code"].lower() for country in self.config.get("countries") or [{"code": "BR"}] if country["code"].lower() in ADZUNA][:4] or ["br"]
        for term in self.config.get("terms", []):
          for code in countries:
            yield self.request(
                f"https://api.adzuna.com/v1/api/jobs/{code}/search/1?app_id={app_id}&app_key={app_key}"
                f"&results_per_page=50&what={term}&sort_by=date&content-type=application/json",
                self.parse,
            )

    def parse(self, response):
        for item in json.loads(response.text).get("results", []):
            area = (item.get("location") or {}).get("area") or []
            yield self.job(
                url=item["redirect_url"],
                title=item.get("title") or "",
                company=(item.get("company") or {}).get("display_name") or "",
                description=item.get("description") or "",
                city=area[-1] if len(area) > 2 else "",
                state=area[1] if len(area) > 1 else "",
                salary_min=item.get("salary_min") or 0,
                salary_max=item.get("salary_max") or 0,
                salary_currency="BRL" if item.get("salary_min") else "",
                published_at=item.get("created") or "",
                hints=(item.get("category") or {}).get("label") or "",
            )


@register("jooble")
class Jooble(Source):
    def start(self):
        key = self.config.get("key") or self.spider.settings.get("JOOBLE_KEY")
        if not key:
            return
        for term in self.config.get("terms", []):
            body = json.dumps({"keywords": term, "location": self.config.get("location", "Brasil")})
            yield Request(
                f"https://br.jooble.org/api/{key}",
                method="POST",
                body=body,
                headers={"Content-Type": "application/json"},
                callback=self.parse,
                errback=self.spider.failed,
                meta={"source": self.id},
                dont_filter=True,
            )

    def parse(self, response):
        for item in json.loads(response.text).get("jobs", []):
            pay = money(item.get("salary"))
            yield self.job(
                url=item["link"],
                title=item.get("title") or "",
                company=item.get("company") or "",
                summary=item.get("snippet") or "",
                city=item.get("location") or "",
                salary_min=pay[0] if pay else 0,
                published_at=item.get("updated") or "",
                hints=item.get("type") or "",
            )
