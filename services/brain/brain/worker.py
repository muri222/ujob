import logging
import os
import threading
import time
from pathlib import Path

import requests
import truststore
from dotenv import load_dotenv

from . import chat, claude
from .panel import Panel
from .tasks import CHAT, LOCAL, TASKS

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
truststore.inject_into_ssl()  # certificados do Windows: antivírus que intercepta TLS (ex.: Kaspersky) não quebra os sites
logging.basicConfig(level=logging.INFO, format="%(asctime)s brain %(message)s")
log = logging.getLogger(__name__)

IDLE_SECONDS = 3
CHECK_EVERY = 300  # roda claude auth status, então sem pressa
RECHECK_EVERY = 30  # Claude fora: checa mais vezes pra voltar logo que o usuário logar
REPORT_EVERY = 60  # o painel guarda o status só em memória: reenviar sempre


def connect() -> Panel:
    while True:
        try:
            return Panel(os.getenv("PANEL_URL", "http://127.0.0.1:8096"), os.environ["BRAIN_EMAIL"], os.environ["BRAIN_PASSWORD"])
        except requests.ConnectionError as error:
            log.warning("esperando o painel: %s", error.__class__.__name__)
            time.sleep(10)


def run(panel: Panel, task: dict) -> None:
    handler = TASKS.get(task["type"])
    if task["type"] == "chat_reply":
        handler = lambda task: chat.reply(task, lambda text: panel.partial(task["id"], text))  # noqa: E731
    if not handler:
        panel.result(task["id"], error=f"tipo de tarefa desconhecido: {task['type']}")
        return
    try:
        result, entries = handler(task)
        panel.result(task["id"], result=result, log=entries)
        log.info("%s %s pronta", task["type"], task["id"])
    except claude.TaskFailed as error:
        panel.result(task["id"], error=str(error), log=error.log)
        log.warning("%s %s falhou: %s", task["type"], task["id"], error)
    except Exception as error:  # tarefa quebrada não derruba o worker
        log.exception("%s %s quebrou", task["type"], task["id"])
        panel.result(task["id"], error=f"erro interno: {error}"[:2000])


state = {"problem": None}


def lane(name: str, kinds: set[str], reports: bool) -> None:
    """Uma pista: pega tarefas só dos tipos dela. A geral também checa e reporta o Claude."""
    panel = connect()
    checked, reported = 0.0, 0.0
    while True:
        try:
            if reports and time.monotonic() - checked > (RECHECK_EVERY if state["problem"] else CHECK_EVERY):
                state["problem"], checked, reported = claude.problem(), time.monotonic(), 0.0
                log.info("claude: %s", state["problem"] or "pronto")
            if reports and time.monotonic() - reported > REPORT_EVERY:
                panel.status(state["problem"])
                reported = time.monotonic()
            # sem Claude, as tarefas de IA esperam na fila (a tela mostra o motivo); e-mail e áudio seguem
            allowed = sorted(kinds & LOCAL if state["problem"] else kinds)
            task = panel.next_task(allowed) if allowed else None
            if task:
                run(panel, task)
                continue
        except requests.RequestException as error:
            log.warning("%s: painel fora do ar: %s", name, error)
            time.sleep(10)
            panel = connect()
        time.sleep(1 if name == "chat" else IDLE_SECONDS)


def main() -> None:
    threading.Thread(target=lane, args=("chat", set(CHAT), False), daemon=True).start()
    lane("geral", set(TASKS) - CHAT, True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("brain desligado")
