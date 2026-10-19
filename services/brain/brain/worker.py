import logging
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

from . import providers
from .panel import Panel
from .tasks import TASKS

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s brain %(message)s")
log = logging.getLogger(__name__)

IDLE_SECONDS = 3
CHECK_EVERY = 300  # checar provedores roda claude auth status, então sem pressa
REPORT_EVERY = 60  # o painel guarda o status só em memória: reenviar sempre


def connect() -> Panel:
    while True:
        try:
            return Panel(os.getenv("PANEL_URL", "http://127.0.0.1:8096"), os.environ["BRAIN_EMAIL"], os.environ["BRAIN_PASSWORD"])
        except requests.ConnectionError as error:
            log.warning("esperando o painel: %s", error.__class__.__name__)
            time.sleep(10)


def run(panel: Panel, task: dict, ready: dict) -> None:
    handler = TASKS.get(task["type"])
    if not handler:
        panel.result(task["id"], error=f"tipo de tarefa desconhecido: {task['type']}")
        return
    try:
        result, entries = handler(task, ready)
        panel.result(task["id"], result=result, log=entries)
        log.info("%s %s pronta", task["type"], task["id"])
    except providers.TaskFailed as error:
        panel.result(task["id"], error=str(error), log=error.log)
        log.warning("%s %s falhou: %s", task["type"], task["id"], error)
    except Exception as error:  # tarefa quebrada não derruba o worker
        log.exception("%s %s quebrou", task["type"], task["id"])
        panel.result(task["id"], error=f"erro interno: {error}"[:2000])


def main() -> None:
    panel = connect()
    ready, checked, reported = {}, 0.0, 0.0
    while True:
        try:
            if time.monotonic() - checked > CHECK_EVERY:
                ready, checked, reported = providers.status(), time.monotonic(), 0.0
                log.info("provedores: %s", {name: problem or "ok" for name, problem in ready.items()})
            if time.monotonic() - reported > REPORT_EVERY:
                panel.status(ready)
                reported = time.monotonic()
            task = panel.next_task()
            if task:
                run(panel, task, ready)
                continue
        except requests.RequestException as error:
            log.warning("painel fora do ar: %s", error)
            time.sleep(10)
            panel = connect()
        time.sleep(IDLE_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("brain desligado")
