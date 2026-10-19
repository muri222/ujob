import requests


class Panel:
    """Cliente da API /api/radar/* com a conta de serviço do brain."""

    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.http = requests.Session()
        self.http.headers["User-Agent"] = "RadarBrain/0.1"
        token = self._call("POST", "collections/bots/auth-with-password", json={"identity": email, "password": password})["token"]
        self.http.headers["Authorization"] = token

    def next_task(self) -> dict | None:
        return self._call("GET", "radar/tasks/next")["task"]

    def result(self, task_id: str, result: dict | None = None, error: str = "", log: list[dict] | None = None) -> dict:
        return self._call("POST", f"radar/tasks/{task_id}/result", json={"result": result, "error": error, "log": log or []})

    def status(self, providers: dict[str, str | None]) -> dict:
        return self._call("POST", "radar/brain/status", json={"providers": providers})

    def _call(self, method: str, path: str, **kwargs) -> dict:
        response = self.http.request(method, f"{self.base_url}/api/{path}", timeout=kwargs.pop("timeout", 30), **kwargs)
        response.raise_for_status()
        return response.json()
