"""Uma função por tipo de tarefa: recebe a tarefa, devolve (resultado, log)."""

import json
from collections.abc import Callable

from pydantic import BaseModel, Field

from . import claude, mind, read
from .prompts import render


class Echo(BaseModel):
    echo: str


def echo(task: dict) -> tuple[dict, list[dict]]:
    value, log = claude.complete("echo", render("echo", msg=str(task["payload"].get("msg", ""))), Echo, "cheap")
    return value.model_dump(), log


class JobFit(BaseModel):
    score: int = Field(ge=0, le=100)
    por_que: str
    atende: list[str]
    parcial: list[str]
    falta: list[str]
    vale_aplicar: bool
    motivo: str


def job_fit(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render(
        "job_fit",
        vaga=json.dumps(payload["vaga"], ensure_ascii=False),
        cv=json.dumps(payload["cv"], ensure_ascii=False),
        mente=mind.context(payload.get("mente") or []),
    )
    value, log = claude.complete("job_fit", prompt, JobFit, "best")
    return value.model_dump(), log


class Experience(BaseModel):
    role: str
    company: str
    start: str
    end: str
    text: str


class Education(BaseModel):
    course: str
    school: str
    end: str


class Resume(BaseModel):
    name: str
    headline: str
    email: str
    phone: str
    city: str
    state: str
    about: str
    skills: list[str]
    experiences: list[Experience]
    education: list[Education]
    languages: list[str]
    links: list[str]
    seniority: str


def cv_import(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    text = read.pdf_text(payload["pdf"]) if payload.get("pdf") else read.page_text(payload["url"])
    if len(text.strip()) < 40:
        raise claude.TaskFailed("Não achei texto legível (PDF escaneado como imagem ou página vazia).", [])
    value, log = claude.complete("cv_import", render("cv_import", texto=text), Resume, "best")
    return value.model_dump(), log


class Fact(BaseModel):
    text: str
    kind: str
    confidence: float = Field(ge=0, le=1)


class Facts(BaseModel):
    facts: list[Fact] = Field(max_length=3)


def mind_extract(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("mind_extract", vaga=str(payload.get("vaga", ""))[:300], motivo=str(payload.get("text", ""))[:1000])
    value, log = claude.complete("mind_extract", prompt, Facts, "cheap")
    return value.model_dump(), log


TASKS: dict[str, Callable[[dict], tuple[dict, list[dict]]]] = {"echo": echo, "job_fit": job_fit, "cv_import": cv_import, "mind_extract": mind_extract}
