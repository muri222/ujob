"""Entrada: lê o IMAP do e-mail da pessoa e separa só o que é de candidatura. Sem IA (etiqueta por regra)."""

import email
import imaplib
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime

MAX_FETCH = 150
# o resultado da tarefa tem teto de 200 KB no painel: para antes e continua na próxima rodada
MAX_BYTES = 160_000

# ordem importa: proposta e rejeição ganham de "entrevista" citada no meio do texto
LABELS = [
    ("proposta", r"proposta de (emprego|trabalho|contratacao)|offer letter|job offer|oferta de emprego|we are (pleased|happy) to offer"),
    ("rejeicao", r"infelizmente|nao seguiremos|optamos por (seguir|prosseguir|avancar) com outr|unfortunately|not (to )?(move|moving) forward|decided to (move|go) forward with other|no longer (under consideration|being considered)|position has been filled|other candidates|nao foi selecionad|not been selected|lamentamos"),
    ("entrevista", r"entrevista|interview|agendar (uma )?(conversa|reuniao|call)|bate-papo|schedule (a|an)? ?(call|chat|time|meeting)|calendly\.com|next step.{0,40}(call|chat)|proxima etapa"),
    ("teste", r"teste tecnico|teste pratico|desafio tecnico|art test|take-home|coding challenge|assessment|case pratico"),
    ("confirmacao", r"recebemos (a )?sua candidatura|candidatura (foi )?(recebida|enviada|registrada)|obrigad[oa] por se candidatar|thank(s| you) for (applying|your application|your interest)|application (received|submitted|confirmation)|we('ve| have) received your application|recibimos tu postulacion"),
]
ATS_SENDERS = r"greenhouse|lever\.co|gupy|workable|ashbyhq|recruitee|smartrecruiters|myworkday|kenoby|solides|inhire|teamtailor|bamboohr|personio|jobvite|icims|taleo|successfactors|indeed|linkedin|vagas\.com|infojobs|catho|trampos|99jobs|breezy"


def fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def label_of(subject: str, body: str) -> str:
    text = fold(f"{subject}\n{body[:4000]}")
    for name, pattern in LABELS:
        if re.search(pattern, text):
            return name
    return "outro"


def relevant(sender: str, subject: str, body: str, hints: list[str], label: str) -> bool:
    if label != "outro" or re.search(ATS_SENDERS, sender, re.I):
        return True
    text = fold(f"{sender} {subject}")
    return any(len(hint) > 2 and fold(hint) in text for hint in hints)


def _decode(value) -> str:
    try:
        return str(make_header(decode_header(value or "")))
    except Exception:
        return value or ""


def _text(message: email.message.Message) -> str:
    plain, html = "", ""
    for part in message.walk() if message.is_multipart() else [message]:
        if part.get_content_maintype() != "text" or part.get("Content-Disposition", "").startswith("attachment"):
            continue
        payload = part.get_payload(decode=True) or b""
        text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        if part.get_content_subtype() == "plain" and not plain:
            plain = text
        elif part.get_content_subtype() == "html" and not html:
            html = text
    if not plain and html:
        plain = re.sub(r"(?is)<(script|style).*?</\1>", " ", html)
        plain = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", plain)
        plain = re.sub(r"<[^>]+>", " ", plain)
        plain = re.sub(r"&nbsp;", " ", plain)
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", plain)).strip()


def parse(uid: int, raw: bytes, hints: list[str]) -> dict | None:
    message = email.message_from_bytes(raw)
    subject = _decode(message.get("Subject"))
    name, address = parseaddr(_decode(message.get("From")))
    body = _text(message)
    label = label_of(subject, body)
    if not relevant(f"{name} {address}", subject, body, hints, label):
        return None
    try:
        date = parsedate_to_datetime(message.get("Date")).astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")
    except Exception:
        date = ""
    return {
        "uid": uid,
        "messageId": (message.get("Message-ID") or "").strip()[:300],
        "fromEmail": address[:160],
        "fromName": name[:160],
        "subject": subject[:300],
        "date": date,
        "snippet": re.sub(r"\s+", " ", body)[:240],
        "body": body[:6000],
        "label": label,
    }


def sync(mail: dict, since_uid: int, days: int, hints: list[str]) -> dict:
    box = imaplib.IMAP4_SSL(mail["imapHost"], mail.get("imapPort") or 993, timeout=40)
    try:
        box.login(mail["email"], mail["password"])
        box.select("INBOX", readonly=True)
        if since_uid:
            _, data = box.uid("search", None, f"UID {since_uid + 1}:*")
        else:
            since = (datetime.now() - timedelta(days=days)).strftime("%d-%b-%Y")
            _, data = box.uid("search", None, f"SINCE {since}")
        uids = [int(item) for item in (data[0] or b"").split() if int(item) > since_uid][-MAX_FETCH:]
        items, size, last = [], 0, since_uid
        for uid in uids:
            if size > MAX_BYTES:
                break
            last = uid
            _, parts = box.uid("fetch", str(uid), "(BODY.PEEK[])")
            raw = next((part[1] for part in parts if isinstance(part, tuple)), None)
            if raw:
                found = parse(uid, raw, hints)
                if found:
                    items.append(found)
                    size += len(found["body"]) + 800
        return {"items": items, "lastUid": last, "scanned": len(uids)}
    finally:
        try:
            box.logout()
        except Exception:
            pass
