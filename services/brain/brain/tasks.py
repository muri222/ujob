"""Uma função por tipo de tarefa: recebe a tarefa, devolve (resultado, log)."""

import base64
import json
import re
import unicodedata
from collections.abc import Callable

from pydantic import BaseModel, Field

from . import claude, cvpdf, inbox, leads, mail, mind, read, site, transcribe as whisper
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
    followup: str = ""
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
    return {"idioma": lang, "assunto": value.assunto.strip(), "carta": value.carta.strip(), "followup": value.followup.strip(), "cv": tailor(payload["cv"], value.cv)}, log


def mail_sync(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    try:
        return inbox.sync(task["mail"], int(payload.get("lastUid") or 0), int(payload.get("days") or 30), payload.get("hints") or []), []
    except Exception as error:  # login/rede viram mensagem clara
        raise claude.TaskFailed(mail.friendly(error), []) from error


class InboxReply(BaseModel):
    resumo: str
    etapa: str
    proxima_acao: str
    resposta: str


def inbox_reply(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("inbox_reply", email=json.dumps(payload.get("email") or {}, ensure_ascii=False)[:12000], candidatura=json.dumps(payload.get("candidatura") or {}, ensure_ascii=False), cv=json.dumps(payload.get("cv") or {}, ensure_ascii=False)[:6000])
    value, log = claude.complete("inbox_reply", prompt, InboxReply, "best")
    etapa = value.etapa if value.etapa in ("aplicada", "entrevista", "teste", "proposta", "contratado", "recusada", "") else ""
    return {**value.model_dump(), "etapa": etapa}, log


def cv_pdf(task: dict) -> tuple[dict, list[dict]]:
    """PDF do CV (adaptado ou mestre) gerado no PC, sem IA."""
    payload = task["payload"]
    return {"pdf": base64.b64encode(cvpdf.build(payload["cv"], payload.get("lang") or "pt")).decode()}, []


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


class Place(BaseModel):
    name: str
    website: str
    phone: str
    email: str
    instagram: str
    city: str
    state: str
    address: str
    externalId: str
    origin: str


class Places(BaseModel):
    places: list[Place]


def leads_discover(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    try:
        places = leads.apify(payload, task["apifyToken"]) if payload["source"] == "apify" else leads.osm(payload)
    except Exception as error:  # rede, cota, região não achada: mensagem clara na campanha
        raise claude.TaskFailed(f"Busca falhou: {error}"[:400], []) from error
    return {"places": places}, []


def leads_discover_claude(task: dict) -> tuple[dict, list[dict]]:
    """Claude navegando na web: acha o que o mapa não tem, mas gasta bem mais da assinatura."""
    payload = task["payload"]
    regiao = ", ".join(filter(None, [payload.get("city"), payload.get("state")])) or "Brasil"
    prompt = render("leads_discover_claude", limit=str(payload["limit"]), pack=payload["pack"], description=payload.get("description", ""), regiao=regiao, buscas=", ".join(payload.get("searches") or []))
    value, log = claude.complete("leads_discover_claude", prompt, Places, "best", tools="WebSearch,WebFetch")
    return {"places": [place.model_dump() for place in value.places[: payload["limit"]]]}, log


def lead_enrich(task: dict) -> tuple[dict, list[dict]]:
    try:
        return site.enrich(task["payload"]["website"]), []
    except Exception as error:
        raise claude.TaskFailed(f"Site não abriu: {error.__class__.__name__}", []) from error


class Dossier(BaseModel):
    diagnostico: str
    dor_provavel: str
    servico_recomendado: str
    ideia_preview: str
    merece_projeto_gratuito: bool
    motivo: str
    fit: int = Field(ge=0, le=100)


def lead_dossier(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("lead_dossier", lead=json.dumps(payload["lead"], ensure_ascii=False), perfil=json.dumps(payload["perfil"], ensure_ascii=False), mente=mind.context(payload.get("mente") or []))
    value, log = claude.complete("lead_dossier", prompt, Dossier, "top")
    return value.model_dump(), log


class ColdEmail(BaseModel):
    assunto: str
    corpo: str


class Outreach(BaseModel):
    idioma: str
    dms: list[str] = Field(min_length=1, max_length=2)
    emails: list[ColdEmail] = Field(min_length=1, max_length=2)


def outreach(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("outreach", dossie=json.dumps(payload["dossie"], ensure_ascii=False), lead=json.dumps(payload["lead"], ensure_ascii=False), perfil=json.dumps(payload["perfil"], ensure_ascii=False))
    value, log = claude.complete("outreach", prompt, Outreach, "best")
    result = value.model_dump()
    result["idioma"] = "en" if value.idioma.lower().startswith("en") else "pt"
    return result, log


CATEGORIES = ["tecnologia", "dados", "design", "produto", "marketing", "vendas", "atendimento", "administrativo", "financeiro", "rh", "juridico", "saude", "educacao", "engenharia", "industria", "logistica", "varejo", "alimentacao", "construcao", "agro", "seguranca", "servicos", "outros"]


class JobQuery(BaseModel):
    terms: list[str] = Field(min_length=1, max_length=8)
    category: str
    state: str
    city: str
    workplace: str
    contract: str
    explicacao: str


def job_query(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("job_query", texto=str(payload.get("text", ""))[:500], perfil=json.dumps(payload.get("perfil") or {}, ensure_ascii=False), categorias=", ".join(CATEGORIES))
    value, log = claude.complete("job_query", prompt, JobQuery, "cheap")
    allowed = lambda value, options: value if value in options else ""
    return {
        "terms": [term.strip()[:60] for term in value.terms if term.strip()][:8],
        "category": allowed(value.category, CATEGORIES),
        "state": value.state.upper() if re.fullmatch(r"[A-Za-z]{2}", value.state or "") else "",
        "city": value.city.strip()[:80],
        "workplace": allowed(value.workplace, ["remoto", "hibrido", "presencial"]),
        "contract": allowed(value.contract, ["clt", "pj", "estagio", "aprendiz", "trainee", "temporario", "freelancer"]),
        "explicacao": value.explicacao.strip(),
    }, log


OSM_FILTER = leads.OSM_FILTER


class LeadPack(BaseModel):
    name: str
    description: str
    searches: list[str] = Field(min_length=1, max_length=6)
    osm: list[str] = Field(max_length=5)


def lead_pack(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("lead_pack", texto=str(payload.get("text", ""))[:500], perfil=json.dumps(payload.get("perfil") or {}, ensure_ascii=False))
    value, log = claude.complete("lead_pack", prompt, LeadPack, "cheap")
    return {
        "name": value.name.strip()[:80],
        "description": value.description.strip()[:300],
        "searches": [search.strip()[:80] for search in value.searches if search.strip()][:6],
        "osm": [f.strip() for f in value.osm if OSM_FILTER.match(f.strip())][:5],  # filtro fora do formato nunca chega no Overpass
    }, log


class Title(BaseModel):
    title: str


def chat_title(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    value, log = claude.complete("chat_title", render("chat_title", user=payload.get("user", ""), reply=payload.get("reply", "")), Title, "cheap")
    return {"title": value.title.strip().strip('"').rstrip(".")[:120]}, log


def transcribe(task: dict) -> tuple[dict, list[dict]]:
    try:
        return {"text": whisper.transcribe(task["payload"]["path"])}, []
    except Exception as error:
        raise claude.TaskFailed(f"Não consegui transcrever o áudio: {error}"[:300], []) from error


class Issue(BaseModel):
    problema: str
    correcao: str


class CvScan(BaseModel):
    nota: int = Field(ge=0, le=100)
    resumo: str
    fortes: list[str] = Field(max_length=5)
    problemas: list[Issue] = Field(max_length=8)
    palavras_chave: list[str]
    secoes_faltando: list[str]


def cv_scan(task: dict) -> tuple[dict, list[dict]]:
    payload = task["payload"]
    prompt = render("cv_scan", cv=json.dumps(payload["cv"], ensure_ascii=False), vaga=str(payload.get("vaga") or "(sem vaga, avaliação geral)")[:6000])
    value, log = claude.complete("cv_scan", prompt, CvScan, "best")
    return value.model_dump(), log


LANGUAGES = {"en": "inglês", "es": "espanhol", "pt": "português do Brasil"}


def cv_translate(task: dict) -> tuple[dict, list[dict]]:
    """Traduz e já devolve o PDF (base64) gerado no PC, pronto pra baixar."""
    payload = task["payload"]
    lang = payload.get("lang") if payload.get("lang") in LANGUAGES else "en"
    value, log = claude.complete("cv_translate", render("cv_translate", idioma=LANGUAGES[lang], cv=json.dumps(payload["cv"], ensure_ascii=False)), Resume, "best")
    cv = value.model_dump()
    return {"lang": lang, "cv": cv, "pdf": base64.b64encode(cvpdf.build(cv, lang)).decode()}, log


# tarefas sem IA rodam mesmo com o Claude fora
LOCAL = {"mail_test", "mail_send", "mail_sync", "leads_discover", "lead_enrich", "transcribe", "cv_pdf"}
# pista própria pro chat: não espera atrás de campanha grande
CHAT = {"chat_reply", "chat_title", "transcribe"}

TASKS: dict[str, Callable[[dict], tuple[dict, list[dict]]]] = {
    "echo": echo,
    "job_fit": job_fit,
    "cv_pdf": cv_pdf,
    "mail_sync": mail_sync,
    "inbox_reply": inbox_reply,
    "cv_import": cv_import,
    "mind_extract": mind_extract,
    "apply_kit": apply_kit,
    "mail_test": mail_test,
    "mail_send": mail_send,
    "leads_discover": leads_discover,
    "leads_discover_claude": leads_discover_claude,
    "lead_enrich": lead_enrich,
    "lead_dossier": lead_dossier,
    "outreach": outreach,
    "job_query": job_query,
    "lead_pack": lead_pack,
    "chat_title": chat_title,
    "transcribe": transcribe,
    "cv_scan": cv_scan,
    "cv_translate": cv_translate,
    "chat_reply": None,  # tratado no worker (precisa mandar texto parcial)
}
