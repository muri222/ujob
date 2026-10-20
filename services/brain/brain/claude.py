"""Toda IA do uJob passa por aqui. Padrão: o Claude Code logado no PC do usuário (claude -p), na assinatura dele.
Se a pessoa escolheu outra IA em Config. da conta (ChatGPT/Codex, OpenRouter, DeepSeek...), providers.py atende."""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from . import providers

T = TypeVar("T", bound=BaseModel)

# top: dossiê, conselheiro, simulador, carta · best: julgar (nota de vaga) · cheap: extração em lote
TIERS = {
    "top": os.getenv("CLAUDE_MODEL_TOP", "opus"),
    "best": os.getenv("CLAUDE_MODEL_BEST", "sonnet"),
    "cheap": os.getenv("CLAUDE_MODEL_CHEAP", "haiku"),
}

SYSTEM = "Você é o motor de IA do uJob. Responda só com o JSON pedido, sem texto fora dele. Nunca invente fatos."


class TaskFailed(Exception):
    def __init__(self, message: str, log: list[dict]):
        super().__init__(message)
        self.log = log


def claude_bin() -> str | None:
    """Caminho completo do Claude Code. No Windows o do npm é claude.cmd, que só roda pelo caminho inteiro;
    e o app pode ter herdado um PATH de antes da instalação, então olha também onde os instaladores põem."""
    found = shutil.which("claude")
    if found:
        return found
    for path in (Path.home() / ".local/bin/claude.exe", Path(os.getenv("APPDATA", "")) / "npm/claude.cmd", Path(os.getenv("LOCALAPPDATA", "")) / "Programs/claude/claude.exe"):
        if path.is_file():
            return str(path)
    return None


def problem() -> str | None:
    """None se a IA escolhida está pronta, senão o motivo em PT-BR pra mostrar na tela."""
    if providers.name() != "claude":
        return providers.problem()
    binary = claude_bin()
    if not binary:
        return "Claude Code não encontrado. O app Claude de desktop não serve: instale o Claude Code (claude.ai/code) e rode claude auth login"
    try:
        done = subprocess.run([binary, "auth", "status"], capture_output=True, text=True, timeout=30, encoding="utf-8")
    except (OSError, subprocess.TimeoutExpired):
        return "Claude Code não respondeu"
    try:
        status = json.loads(done.stdout or "{}")
    except json.JSONDecodeError:
        # versão que responde em texto: vale o código de saída
        return None if done.returncode == 0 and "not logged" not in done.stdout.lower() else "Claude Code não está logado (rode claude auth login)"
    return None if status.get("loggedIn") else "Claude Code não está logado (rode claude auth login)"


def friendly(message: str) -> str:
    text = message.lower()
    if "limit" in text or "usage" in text or "429" in text:
        return "Limite da sua assinatura Claude atingido. Tenta de novo mais tarde."
    if "auth" in text or "login" in text or "401" in text:
        return "Claude Code deslogou. Rode claude auth login."
    return f"Claude falhou: {message}"[:500]


def ask(prompt: str, schema: dict, tier: str, tools: str = "") -> tuple[str, dict]:
    """Uma chamada crua. Sem MCP, skills nem CLAUDE.md: só o prompt (~1k tokens de base em vez de ~136k).
    tools="WebSearch,WebFetch" libera a web, e aí gasta bem mais da assinatura."""
    if providers.name() != "claude":
        try:
            return providers.ask(prompt, schema, tier, tools, SYSTEM)
        except providers.ProviderError as error:
            raise TaskFailed(providers.friendly(str(error)), [{"provider": providers.name(), "ok": False, "error": str(error)[:2000]}]) from error
    command = [
        claude_bin() or "claude", "-p", "--output-format", "json", "--model", TIERS[tier],
        "--tools", tools, *(["--allowedTools", tools] if tools else []), "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence",
        "--system-prompt", SYSTEM, "--json-schema", json.dumps(schema),
    ]
    started = time.monotonic()
    try:
        done = subprocess.run(command, input=prompt, capture_output=True, text=True, timeout=1200 if tools else 600, encoding="utf-8")
        data = json.loads(done.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        raise TaskFailed(friendly(str(error)),[{"provider": "claude", "ok": False, "error": str(error)[:2000]}]) from error
    usage = data.get("usage") or {}
    entry = {
        "provider": "claude",
        "model": next(iter(data.get("modelUsage") or {}), TIERS[tier]),
        "tokensIn": usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0) + usage.get("cache_creation_input_tokens", 0),
        "tokensOut": usage.get("output_tokens", 0),
        "cost": data.get("total_cost_usd", 0.0),  # preço de tabela; na assinatura vira consumo do limite, não cobrança
        "latencyMs": int((time.monotonic() - started) * 1000),
    }
    if data.get("is_error"):
        message = str(data.get("result") or data.get("api_error_status") or "erro")
        raise TaskFailed(friendly(message), [{**entry, "ok": False, "error": message[:2000]}])
    output = data.get("structured_output")
    return (json.dumps(output) if output is not None else data.get("result", "")), entry


def complete(task: str, prompt: str, schema: type[T], tier: str = "best", tools: str = "") -> tuple[T, list[dict]]:
    """Resposta validada pelo schema. Inválida: 1 nova tentativa com o erro, depois TaskFailed."""
    entries: list[dict] = []
    attempt = prompt
    for _ in range(2):
        text, entry = ask(attempt, schema.model_json_schema(), tier, tools)
        try:
            value = schema.model_validate_json(text)
            entries.append({**entry, "ok": True})
            return value, entries
        except ValidationError as error:
            entries.append({**entry, "ok": False, "error": str(error)[:2000]})
            attempt = f"{prompt}\n\nSua resposta anterior não passou na validação:\n{error}\nResponda de novo, só o JSON no formato pedido."
    raise TaskFailed("resposta fora do formato depois de 2 tentativas", entries)
