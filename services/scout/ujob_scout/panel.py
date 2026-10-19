import requests


class Panel:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.http = requests.Session()
        self.http.headers["User-Agent"] = "UjobScout/1.0"
        token = self._call("POST", "collections/bots/auth-with-password", json={"identity": email, "password": password})["token"]
        self.http.headers["Authorization"] = token

    @classmethod
    def from_settings(cls, settings) -> "Panel":
        return cls(settings["PANEL_URL"], settings["SCOUT_EMAIL"], settings["SCOUT_PASSWORD"])

    def sync_catalog(self, sources: list[dict]) -> dict:
        return self._call("POST", "scout/sources/sync", json={"sources": sources}, timeout=120)

    def due_sources(self, only: list[str] | None = None) -> dict:
        return self._call("GET", "scout/sources/due", params={"slugs": ",".join(only)} if only else None)

    def pending_searches(self) -> int:
        return self._call("GET", "scout/searches/pending")["pending"]

    def next_search(self) -> dict:
        return self._call("GET", "scout/searches/next")

    def search_progress(self, search_id: str, sources: dict, created: int = 0, finished: bool = False, failed: bool = False) -> dict:
        body = {"sources": sources, "created": created, "finished": finished, "failed": failed}
        return self._call("POST", f"scout/searches/{search_id}/progress", json=body)

    def known(self, hashes: list[str], search: str = "") -> set[str]:
        if not hashes:
            return set()
        return set(self._call("POST", "scout/known", json={"hashes": hashes, "search": search})["known"])

    def ingest(self, source_id: str, jobs: list[dict], search: str = "") -> dict:
        return self._call("POST", "scout/ingest", json={"source": source_id, "jobs": jobs, "search": search}, timeout=120)

    def report(self, run: dict) -> dict:
        return self._call("POST", "scout/runs", json=run)

    def _call(self, method: str, path: str, timeout: int = 30, **kwargs) -> dict:
        response = self.http.request(method, f"{self.base_url}/api/{path}", timeout=timeout, **kwargs)
        response.raise_for_status()
        return response.json()
