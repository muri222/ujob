from pathlib import Path

DIR = Path(__file__).parent / "prompts"


def render(name: str, **values: str) -> str:
    """Prompt versionado em prompts/<name>.md com variáveis {assim}. Variável faltando quebra na hora."""
    return (DIR / f"{name}.md").read_text(encoding="utf-8").format(**values)
