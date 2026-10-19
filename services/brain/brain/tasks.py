"""Uma função por tipo de tarefa: recebe a tarefa, devolve (resultado, log)."""

from collections.abc import Callable

from pydantic import BaseModel

from . import providers
from .prompts import render


class Echo(BaseModel):
    echo: str


def echo(task: dict, ready: dict) -> tuple[dict, list[dict]]:
    value, log = providers.complete("echo", render("echo", msg=str(task["payload"].get("msg", ""))), Echo, "cheap", ready)
    return value.model_dump(), log


TASKS: dict[str, Callable[[dict, dict], tuple[dict, list[dict]]]] = {"echo": echo}
