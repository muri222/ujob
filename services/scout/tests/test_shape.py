from ujob_scout.items import Job
from ujob_scout.places import real_city, split_place, state_code
from ujob_scout.shape import contacts, finalize
from ujob_scout.text import iso, markdown, money, url_hash


def test_split_place():
    assert split_place("Porto Velho / RO") == ("Porto Velho", "RO")
    assert split_place("Natal - RN") == ("Natal", "RN")
    assert split_place("Curitiba, Paraná") == ("Curitiba", "PR")
    assert state_code("Rondônia") == "RO"


def test_real_city_names():
    assert real_city("sao paulo", "SP") == ("São Paulo", "SP")
    assert real_city("Ji-Parana") == ("Ji-Paraná", "RO")
    assert real_city("Remoto", "") == ("Remoto", "")


def test_money_and_dates():
    assert money("R$ 2.500,00 a R$ 3.000") == [2500.0, 3000.0]
    assert iso("17/10/2026").startswith("2026-10-17")
    assert iso("Fri, 17 Oct 2026 10:00:00 +0000").startswith("2026-10-17")
    assert iso("2026-09-14T14:33:00.0000000").startswith("2026-09-14")
    assert iso(1792184472).startswith("2026-")
    assert iso("") == ""


def test_contacts_from_description():
    found = contacts("<p>Envie o currículo para <b>rh@empresa.com.br</b> ou chame no WhatsApp (69) 99999-1234.</p>")
    assert found["contact_email"] == "rh@empresa.com.br"
    assert found["contact_whatsapp"] == "5569999991234"


def test_finalize_builds_a_clean_job():
    job = finalize(Job(source_id="x", url="https://vagas.example/1", title="  Vendedor  Externo ", city="Ji-Paraná/RO", description="<p>Vaga presencial</p>"))
    assert job.title == "Vendedor Externo"
    assert job.hash == url_hash("https://vagas.example/1")
    assert (job.city, job.state) == ("Ji-Paraná", "RO")
    assert job.category == "vendas"
    assert job.workplace == "presencial"


def test_finalize_rejects_jobs_without_title():
    assert finalize(Job(source_id="x", url="https://vagas.example/2", title="  ")) is None


def test_markdown_is_escaped():
    html = markdown("## Requisitos\n- Python\n- <script>alert(1)</script>")
    assert "<h3>Requisitos</h3>" in html
    assert "<script>" not in html
