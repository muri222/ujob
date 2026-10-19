import asyncio
from collections import defaultdict

from scrapy.exceptions import DropItem

from .items import Job
from .shape import finalize


class PanelPipeline:
    def __init__(self, crawler):
        self.crawler = crawler
        self.batch_size = crawler.settings.getint("SCOUT_BATCH_SIZE")
        self.buffers: dict[str, dict[str, dict]] = defaultdict(dict)

    @classmethod
    def from_crawler(cls, crawler) -> "PanelPipeline":
        return cls(crawler)

    @property
    def spider(self):
        return self.crawler.spider

    async def process_item(self, item: Job) -> Job:
        job = finalize(item)
        if job is None:
            raise DropItem("vaga sem título ou link")
        if not self.spider.wanted(job):
            raise DropItem("fora da busca")
        buffer = self.buffers[job.source_id]
        if job.hash not in buffer:
            self.spider.runs[job.source_id]["found"] += 1
        buffer[job.hash] = job.payload()
        if len(buffer) >= (25 if self.spider.search else self.batch_size):
            await self.flush(job.source_id)
        await self.spider.push_progress()
        return job

    async def flush(self, source_id: str) -> None:
        jobs = list(self.buffers.pop(source_id, {}).values())
        if not jobs:
            return
        run = self.spider.runs[source_id]
        try:
            result = await asyncio.to_thread(self.spider.panel.ingest, source_id, jobs, self.spider.search_id)
            run["created"] += result["created"]
            run["updated"] += result["updated"]
        except Exception as error:
            run["errors"].append(f"painel recusou o lote: {error}"[:200])
            run["complete"] = False

    async def close_spider(self) -> None:
        self.spider.finished = True
        for source_id in list(self.buffers):
            await self.flush(source_id)

        created = 0
        for source_id, run in self.spider.runs.items():
            status = "ok" if run["found"] else "error" if run["errors"] else "empty"
            created += run["created"]
            await asyncio.to_thread(self.spider.panel.report, {
                "source": source_id,
                "search": self.spider.search_id,
                "startedAt": self.spider.started_at,
                "status": status,
                "found": run["found"],
                "created": run["created"],
                "updated": run["updated"],
                "complete": run["complete"] and not run["errors"],
                "error": "; ".join(run["errors"][:3]),
            })
        await self.spider.push_progress(force=True, finished=True)
        self.spider.logger.info("Scout: %d vagas novas em %d fontes", created, len(self.spider.runs))
