from dataclasses import asdict, dataclass, field


@dataclass
class Job:
    source_id: str
    url: str
    title: str
    company: str = ""
    company_logo: str = ""
    apply_url: str = ""
    category: str = ""
    seniority: str = ""
    contract: str = ""
    workplace: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    salary_min: float = 0
    salary_max: float = 0
    salary_currency: str = ""
    salary_period: str = ""
    summary: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    contact_email: str = ""
    contact_phone: str = ""
    contact_whatsapp: str = ""
    published_at: str = ""
    expires_at: str = ""
    hints: str = ""
    hash: str = ""

    def payload(self) -> dict:
        data = asdict(self)
        data.pop("source_id")
        data.pop("hints")
        return {_camel(key): value for key, value in data.items()}


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)
