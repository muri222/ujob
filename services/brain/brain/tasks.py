"""Uma função por tipo de tarefa: recebe a tarefa, devolve (resultado, log)."""

import json
from collections.abc import Callable

from pydantic import BaseModel, Field

from . import providers
from .prompts import render


class Echo(BaseModel):
    echo: str


def echo(task: dict, ready: dict) -> tuple[dict, list[dict]]:
    value, log = providers.complete("echo", render("echo", msg=str(task["payload"].get("msg", ""))), Echo, "cheap", ready)
    return value.model_dump(), log


class JobFit(BaseModel):
    score: int = Field(ge=0, le=100)
    por_que: str
    atende: list[str]
    parcial: list[str]
    falta: list[str]
    vale_aplicar: bool
    motivo: str


def job_fit(task: dict, ready: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("job_fit", vaga=json.dumps(payload["vaga"], ensure_ascii=False), cv=json.dumps(payload["cv"], ensure_ascii=False))
    value, log = providers.complete("job_fit", prompt, JobFit, "best", ready)
    return value.model_dump(), log


TASKS: dict[str, Callable[[dict, dict], tuple[dict, list[dict]]]] = {"echo": echo, "job_fit": job_fit}
