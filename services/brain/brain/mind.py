"""Contexto da Mente para os prompts, com teto de tamanho (≈ 4 caracteres por token)."""

LABELS = {"preferencia": "Prefere", "restricao": "Não aceita", "objetivo": "Quer", "fato": "Fato"}


def context(facts: list[dict], max_chars: int = 2400) -> str:
    lines, used = [], 0
    for fact in facts:
        line = f"- {LABELS.get(fact.get('kind'), 'Fato')}: {fact.get('text', '').strip()}"
        if used + len(line) > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    return "\n".join(lines) or "(a Mente ainda não aprendeu nada sobre este perfil)"
