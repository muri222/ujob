import pytest

from ujob_scout import classify


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Vendedor(a) Externo", "vendas"),
        ("Técnico de Enfermagem - UTI", "saude"),
        ("Operador de Caixa", "varejo"),
        ("Motorista Entregador", "logistica"),
        ("Auxiliar de Limpeza", "servicos"),
        ("Desenvolvedor Back-end Pleno", "tecnologia"),
        ("Senior Platform Engineer", "tecnologia"),
        ("Analista de Dados Jr", "dados"),
        ("Professor de Matemática", "educacao"),
        ("Pedreiro", "construcao"),
        ("Cozinheiro", "alimentacao"),
        ("Commercial Account Manager", "vendas"),
        ("Debitorenbuchhalter (m/w/d)", "financeiro"),
        ("Mechanical Engineer", "engenharia"),
        ("Vigilante Patrimonial", "seguranca"),
        ("Assistente Administrativo", "administrativo"),
        ("Lead VFX Artist", "design"),
        ("Artista 3D Pleno", "design"),
        ("Senior Character Animator", "design"),
        ("Environment Artist (Unreal)", "design"),
    ],
)
def test_category(title, expected):
    assert classify.category(title) == expected


def test_category_falls_back_to_outros():
    assert classify.category("Banco de Talentos") == "outros"


@pytest.mark.parametrize(
    ("title", "seniority"),
    [("Estágio em Marketing", "estagio"), ("Analista Sr", "senior"), ("Coordenador de Loja", "lideranca"), ("Dev Pleno", "pleno")],
)
def test_seniority(title, seniority):
    assert classify.seniority(title) == seniority


def test_contract_and_workplace():
    assert classify.contract("Jovem Aprendiz") == "aprendiz"
    assert classify.contract("Desenvolvedor PJ") == "pj"
    assert classify.workplace("Analista 100% Home Office") == "remoto"
    assert classify.workplace("Modelo híbrido em SP") == "hibrido"
