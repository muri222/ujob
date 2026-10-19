import asyncio
import time

from scrapy import Spider
from scrapy.spidermiddlewares.httperror import HttpError

from ..panel import Panel
from ..places import NAMES
from ..text import fold
from ..sources import build

SEARCH_BUDGET = 40
PROGRESS_EVERY = 1.5
HEARTBEAT = 2.0


class VagasSpider(Spider):
    name = "vagas"

    def __init__(self, only: str = "", search: str = "", **kwargs):
        super().__init__(**kwargs)
        self.only = [slug for slug in only.split(",") if slug]
        self.search_mode = search == "1"
        self.search = None
        self.runs: dict[str, dict] = {}
        self.canceled = False
        self.finished = False
        self.filtered: set[str] = set()
        self.pushed_at = 0.0

    async def start(self):
        self.panel = Panel.from_settings(self.settings)
        self.budget = self.settings.getint("SCOUT_DETAIL_BUDGET")

        if self.search_mode:
            batch = await asyncio.to_thread(self.panel.next_search)
            self.search = batch["search"]
            records = [self.tailor(record) for record in batch["sources"]] if self.search else []
        else:
            batch = await asyncio.to_thread(self.panel.due_sources, self.only)
            records = batch["sources"]
        self.started_at = batch["now"]
        self.logger.info("Scout: %d fontes na rodada%s", len(records), " (busca)" if self.search else "")

        sources = [source for source in (build(self, record) for record in records) if source]
        for source in sources:
            budget = int(source.config.get("budget", self.budget))
            self.runs[source.id] = {"name": source.record["name"], "found": 0, "created": 0, "updated": 0, "errors": [], "complete": source.complete and not self.search, "budget": budget}
        await self.push_progress(force=True)
        if self.search:
            asyncio.get_running_loop().create_task(self.heartbeat())
        for source in sources:
            for request in source.start():
                yield request

    def tailor(self, record: dict) -> dict:
        config = dict(record.get("config") or {})
        if record.get("filtered"):
            self.filtered.add(record["id"])
            config["pages"] = 1
            return {**record, "config": config}
        config["terms"] = self.search["terms"]
        if self.search.get("city") and self.search.get("state"):
            config["place"] = {"city": self.search["city"], "state": self.search["state"]}
        config["budget"] = SEARCH_BUDGET
        config["pages"] = 3 if record["kind"] == "gupy_search" else 1
        if record["kind"] == "gupy_search" and self.search.get("state"):
            config["state"] = NAMES.get(self.search["state"], "")
        return {**record, "config": config}

    def failed(self, failure):
        run = self.runs.get(failure.request.meta.get("source"))
        if run is None:
            return
        if failure.check(HttpError):
            message = f"{failure.value.response.status} em {failure.request.url}"
        else:
            message = f"{failure.type.__name__}: {failure.getErrorMessage()}"[:200]
        run["errors"].append(message)
        run["complete"] = False

    async def known(self, hashes: list[str]) -> set[str]:
        return await asyncio.to_thread(self.panel.known, hashes, self.search_id)

    def wanted(self, job) -> bool:
        if not self.search or job.source_id not in self.filtered:
            return True
        text = fold(" ".join([job.title, job.company, " ".join(job.tags)]))
        term = fold(self.search.get("term", ""))
        if term:
            matches = all(word in text for word in term.split())
        else:
            matches = not self.search.get("category") or job.category == self.search["category"]
        if job.workplace == "remoto":
            return matches
        state, city = self.search.get("state"), fold(self.search.get("city", ""))
        if city:
            return matches and fold(job.city) == city
        return matches and (not state or job.state == state)

    @property
    def search_id(self) -> str:
        return (self.search or {}).get("id", "")

    def seen(self, source_id: str, total: int) -> None:
        self.runs[source_id]["found"] += total

    def spend(self, source_id: str, cost: int = 1) -> bool:
        run = self.runs[source_id]
        if run["budget"] < cost:
            return False
        run["budget"] -= cost
        return True

    def partial(self, source_id: str) -> None:
        self.runs[source_id]["complete"] = False

    async def heartbeat(self) -> None:
        while not self.canceled and not self.finished:
            await asyncio.sleep(HEARTBEAT)
            await self.push_progress(force=True)

    def cancel(self) -> None:
        if self.canceled:
            return
        self.canceled = True
        self.logger.info("Scout: busca trocada por outra, parando")
        self.crawler.engine.close_spider(self, "canceled")

    async def push_progress(self, force: bool = False, finished: bool = False) -> None:
        if not self.search or (not force and time.monotonic() - self.pushed_at < PROGRESS_EVERY):
            return
        self.pushed_at = time.monotonic()
        sources = {
            source_id: {"status": ("error" if run["errors"] and not run["found"] else "done") if finished else "running", "found": run["found"]}
            for source_id, run in self.runs.items()
        }
        created = sum(run["created"] for run in self.runs.values())
        failed = finished and bool(self.runs) and all(run["errors"] and not run["found"] for run in self.runs.values())
        try:
            result = await asyncio.to_thread(self.panel.search_progress, self.search["id"], sources, created, finished, failed)
            if result.get("canceled"):
                self.cancel()
        except Exception as error:
            self.logger.warning("progresso da busca não subiu: %s", error)
