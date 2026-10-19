"""Uma função por tipo de tarefa: recebe a tarefa, devolve (resultado, log)."""

import json
from collections.abc import Callable

from pydantic import BaseModel, Field

import re
import unicodedata

from . import claude, cvpdf, mail, mind, read
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


class Highlight(BaseModel):
    indice: int = Field(ge=0)
    destaque: str


class TailoredCv(BaseModel):
    headline: str
    about: str
    skills: list[str]
    experiencias: list[Highlight]


class ApplyKit(BaseModel):
    idioma: str
    assunto: str
    carta: str
    cv: TailoredCv


def _fold(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()).strip()


def tailor(original: dict, kit: TailoredCv) -> dict:
    """Monta o CV adaptado a partir do original. Trava contra invenção: skill e experiência só se existirem no CV."""
    experiences = original.get("experiences") or []
    own_skills = {_fold(skill): skill for skill in original.get("skills") or []}
    picked, seen = [], set()
    for item in kit.experiencias:
        if item.indice < len(experiences) and item.indice not in seen:
            seen.add(item.indice)
            picked.append({**experiences[item.indice], "text": item.destaque.strip() or experiences[item.indice].get("text", "")})
    cv = {key: original.get(key) for key in ("name", "email", "phone", "city", "state", "links", "education", "languages")}
    cv.update(
        headline=kit.headline.strip() or original.get("headline") or "",
        about=kit.about.strip() or original.get("about") or "",
        skills=[own_skills[_fold(skill)] for skill in kit.skills if _fold(skill) in own_skills][:15] or list(own_skills.values())[:15],
        experiences=picked or experiences,
    )
    return cv


def apply_kit(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render(
        "apply_kit",
        vaga=json.dumps(payload["vaga"], ensure_ascii=False),
        cv=json.dumps(payload["cv"], ensure_ascii=False),
        mente=mind.context(payload.get("mente") or []),
    )
    value, log = claude.complete("apply_kit", prompt, ApplyKit, "top")
    lang = value.idioma.lower()[:2] if value.idioma.lower()[:2] in ("pt", "en", "es") else "pt"
    return {"idioma": lang, "assunto": value.assunto.strip(), "carta": value.carta.strip(), "cv": tailor(payload["cv"], value.cv)}, log


def mail_test(task: dict) -> tuple[dict, list[dict]]:
    try:
        return mail.test(task["mail"]), []
    except Exception as error:  # qualquer falha de rede/login vira mensagem clara na tela
        raise claude.TaskFailed(mail.friendly(error), []) from error


def mail_send(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    cv = payload.get("cv") or {}
    attachment = cvpdf.build(cv, payload.get("lang") or "pt") if cv else None
    name = re.sub(r"[^A-Za-z0-9]+", "-", _fold(cv.get("name") or "curriculo")).strip("-") or "curriculo"
    try:
        message_id = mail.send(task["mail"], payload["to"], payload["subject"], payload["body"], attachment, f"{name}.pdf")
    except Exception as error:
        raise claude.TaskFailed(mail.friendly(error), []) from error
    return {"messageId": message_id, "pdfBytes": len(attachment or b"")}, []


# tarefas sem IA rodam mesmo com o Claude fora
LOCAL = {"mail_test", "mail_send"}

TASKS: dict[str, Callable[[dict], tuple[dict, list[dict]]]] = {
    "echo": echo,
    "job_fit": job_fit,
    "cv_import": cv_import,
    "mind_extract": mind_extract,
    "apply_kit": apply_kit,
    "mail_test": mail_test,
    "mail_send": mail_send,
}
