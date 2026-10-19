from collections.abc import Iterable

from scrapy import Request

from ..items import Job

REGISTRY: dict[str, type["Source"]] = {}


def register(*kinds: str):
    def wrap(cls):
        for kind in kinds:
            REGISTRY[kind] = cls
        return cls
    return wrap


class Source:
    complete = False

    def __init__(self, spider, record: dict):
        self.spider = spider
        self.record = record
        self.config = record.get("config") or {}

    @property
    def id(self) -> str:
        return self.record["id"]

    @property
    def target(self) -> str:
        return self.record.get("target") or ""

    def start(self) -> Iterable[Request]:
        raise NotImplementedError

    def request(self, url: str, callback, **kwargs) -> Request:
        meta = {"source": self.id, **kwargs.pop("meta", {})}
        return Request(url, callback=callback, errback=self.spider.failed, meta=meta, dont_filter=True, **kwargs)

    def job(self, **fields) -> Job:
        fields.setdefault("company", self.record.get("name", "") if self.record.get("group") in ("empresa", "agencia") else "")
        fields.setdefault("company_logo", self.record.get("logoUrl") or "")
        return Job(source_id=self.id, **fields)


def build(spider, record: dict) -> Source | None:
    cls = REGISTRY.get(record.get("kind"))
    return cls(spider, record) if cls else None
