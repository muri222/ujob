import argparse
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

from . import catalog
from .panel import Panel

PROJECT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_DIR.parents[1] / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s scout %(message)s")
log = logging.getLogger(__name__)

IDLE_SECONDS = 3
SEARCH_LANES = int(os.getenv("SCOUT_SEARCH_LANES", "3"))


def connect() -> Panel:
    while True:
        try:
            return Panel(os.getenv("PANEL_URL", "http://127.0.0.1:8090"), os.environ["SCOUT_EMAIL"], os.environ["SCOUT_PASSWORD"])
        except requests.ConnectionError as error:
            log.warning("esperando o painel: %s", error.__class__.__name__)
            time.sleep(10)


def sync(panel: Panel) -> None:
    sources = catalog.load()
    result = panel.sync_catalog(sources)
    log.info("catálogo: %d fontes (%d novas, %d atualizadas)", len(sources), result["created"], result["updated"])


def command(*arguments: str) -> list[str]:
    parts = [sys.executable, "-m", "scrapy", "crawl", "vagas"]
    for argument in arguments:
        parts += ["-a", argument]
    return parts


def crawl(*arguments: str) -> int:
    started = time.monotonic()
    code = subprocess.call(command(*arguments), cwd=PROJECT_DIR)
    log.info("rodada %s terminou em %.0fs (código %d)", " ".join(arguments) or "base", time.monotonic() - started, code)
    return code


class Lane:
    def __init__(self, name: str, *arguments: str):
        self.name = name
        self.arguments = arguments
        self.process: subprocess.Popen | None = None
        self.started = 0.0

    @property
    def busy(self) -> bool:
        if self.process and self.process.poll() is not None:
            log.info("rodada %s terminou em %.0fs (código %d)", self.name, time.monotonic() - self.started, self.process.returncode)
            self.process = None
        return self.process is not None

    def launch(self) -> None:
        self.started = time.monotonic()
        self.process = subprocess.Popen(command(*self.arguments), cwd=PROJECT_DIR)


def serve(panel: Panel) -> None:
    base_every = int(os.getenv("SCOUT_LOOP_MINUTES", "15")) * 60
    base = Lane("base")
    searches = [Lane(f"busca {index + 1}", "search=1") for index in range(SEARCH_LANES)]
    next_base = 0.0
    while True:
        try:
            free = [lane for lane in searches if not lane.busy]
            pending = panel.pending_searches() if free else 0
            for lane in free[:pending]:
                lane.launch()
            if not base.busy and time.monotonic() >= next_base:
                next_base = time.monotonic() + base_every
                base.launch()
        except Exception as error:
            log.warning("painel fora do ar: %s", error)
            time.sleep(30)
            panel = connect()
        time.sleep(IDLE_SECONDS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="uma rodada da base e tchau")
    parser.add_argument("--only", default="", help="slugs separados por vírgula, roda mesmo fora do horário")
    parser.add_argument("--sync", action="store_true", help="só sincroniza o catálogo")
    args = parser.parse_args()

    panel = connect()
    sync(panel)
    if args.sync:
        return
    if args.once or args.only:
        sys.exit(crawl(f"only={args.only}") if args.only else crawl())
    serve(panel)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("scout desligado")
