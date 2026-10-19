import re
from dataclasses import replace

from . import classify
from .items import Job
from .places import real_city, split_place, state_code
from .text import clean, https, iso, plain, truncate, url_hash

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?:\+?55[\s-]?)?\(?([1-9]\d)\)?[\s-]?(9?\d{4})[\s.-]?(\d{4})\b")
IGNORED_EMAIL = re.compile(r"(noreply|no-reply|example\.|sentry|wixpress|\.png$|\.jpg$)", re.I)
WHATSAPP_LINK = re.compile(r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\d{12,13})")


def contacts(description: str) -> dict:
    text = plain(description)
    email = next((match for match in EMAIL.findall(text) if not IGNORED_EMAIL.search(match)), "")
    phones = [(f"{ddd}{first}{last}", len(first) == 5) for ddd, first, last in PHONE.findall(text)]
    link = WHATSAPP_LINK.search(description or "")
    whatsapp = link.group(1) if link else next((f"55{digits}" for digits, mobile in phones if mobile and re.search(r"whats|zap", text, re.I)), "")
    return {"contact_email": email.lower(), "contact_phone": phones[0][0] if phones else "", "contact_whatsapp": whatsapp}


def finalize(job: Job) -> Job:
    title = clean(job.title, 300)
    city, state = job.city, state_code(job.state)
    if city and not state:
        city, state = split_place(city)
    city, state = real_city(clean(city, 80), state)
    description = (job.description or "")[:40000]
    hints = " ".join([job.hints, " ".join(job.tags)])
    everything = " ".join([title, hints, city, plain(description, 3000)])
    found = contacts(description)

    return replace(
        job,
        title=title,
        url=job.url.strip(),
        hash=url_hash(job.url),
        company=clean(job.company, 160),
        company_logo=https(job.company_logo),
        apply_url=job.apply_url if job.apply_url.startswith("http") else "",
        city=clean(city, 80),
        state=state,
        country=clean(job.country, 60),
        category=job.category or classify.category(title, hints),
        seniority=job.seniority or classify.seniority(title, hints),
        contract=job.contract or classify.contract(title, hints),
        workplace=job.workplace or classify.workplace(title, city, hints) or ("presencial" if city else ""),
        summary=truncate(clean(job.summary) or plain(description), 600),
        description=description,
        tags=[clean(tag, 40) for tag in job.tags if clean(tag)][:12],
        contact_email=job.contact_email or found["contact_email"],
        contact_phone=job.contact_phone or found["contact_phone"],
        contact_whatsapp=job.contact_whatsapp or found["contact_whatsapp"],
        published_at=iso(job.published_at),
        expires_at=iso(job.expires_at),
    ) if title and job.url.startswith("http") else None
