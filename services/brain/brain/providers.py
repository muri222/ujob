"""Adapter único de IA. Toda chamada passa por complete(task, prompt, schema, tier)."""

import json
import logging
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import TypeVar

import requests
import truststore
from pydantic import BaseModel, ValidationError

truststore.inject_into_ssl()  # certificados do Windows (antivírus que intercepta TLS)
log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


class ProviderError(Exception):
    """Provedor fora do ar ou mal configurado: tenta o próximo."""


class TaskFailed(Exception):
    """Resposta inválida mesmo depois da segunda tentativa."""

    def __init__(self, message: str, log: list[dict]):
        super().__init__(message)
        self.log = log


@dataclass
class Reply:
    text: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    cost: float = 0.0


class AIProvider:
    name = ""

    def problem(self) -> str | None:
        """None se pronto pra usar, senão o motivo em PT-BR."""
        raise NotImplementedError

    def raw(self, task: str, prompt: str, schema: dict, tier: str) -> Reply:
        raise NotImplementedError

    def complete(self, task: str, prompt: str, schema: type[T], tier: str = "best") -> tuple[T, list[dict]]:
        entries: list[dict] = []
        attempt_prompt = prompt
        for attempt in range(2):
            started = time.monotonic()
            reply = self.raw(task, attempt_prompt, schema.model_json_schema(), tier)
            entry = {"provider": self.name, "model": reply.model, "tokensIn": reply.tokens_in, "tokensOut": reply.tokens_out, "cost": reply.cost, "latencyMs": int((time.monotonic() - started) * 1000)}
            try:
                value = schema.model_validate_json(reply.text)
                entries.append({**entry, "ok": True})
                return value, entries
            except ValidationError as error:
                entries.append({**entry, "ok": False, "error": str(error)[:2000]})
                attempt_prompt = f"{prompt}\n\nSua resposta anterior não passou na validação:\n{error}\nResponda de novo, só o JSON no formato pedido."
        raise TaskFailed("resposta fora do formato depois de 2 tentativas", entries)


class ClaudeCode(AIProvider):
    """Claude Code logado na máquina (claude -p). Sem ferramentas, sem MCP, sem CLAUDE.md: só o prompt."""

    name = "claude"
    models = {"best": os.getenv("CLAUDE_MODEL_BEST", "sonnet"), "cheap": os.getenv("CLAUDE_MODEL_CHEAP", "haiku")}

    def problem(self) -> str | None:
        if not shutil.which("claude"):
            return "Claude Code não está instalado"
        try:
            status = json.loads(subprocess.run(["claude", "auth", "status"], capture_output=True, text=True, timeout=30, encoding="utf-8").stdout or "{}")
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
            return "Claude Code não respondeu"
        return None if status.get("loggedIn") else "Claude Code não está logado (rode claude auth login)"

    def raw(self, task: str, prompt: str, schema: dict, tier: str) -> Reply:
        command = [
            "claude", "-p", "--output-format", "json", "--model", self.models[tier],
            "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence",
            "--system-prompt", "Você é o motor de IA do Radar. Responda só com o JSON pedido, sem texto fora dele.",
            "--json-schema", json.dumps(schema),
        ]
        try:
            done = subprocess.run(command, input=prompt, capture_output=True, text=True, timeout=600, encoding="utf-8")
            data = json.loads(done.stdout)
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
            raise ProviderError(f"claude falhou: {error}") from error
        if data.get("is_error"):
            raise ProviderError(f"claude: {data.get('result') or data.get('api_error_status')}")
        output = data.get("structured_output")
        usage = data.get("usage") or {}
        return Reply(
            text=json.dumps(output) if output is not None else data.get("result", ""),
            model=next(iter(data.get("modelUsage") or {}), self.models[tier]),
            tokens_in=usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0) + usage.get("cache_creation_input_tokens", 0),
            tokens_out=usage.get("output_tokens", 0),
            cost=data.get("total_cost_usd", 0.0),
        )


class OpenRouter(AIProvider):
    """API compatível com OpenAI. Modelos por OPENROUTER_MODEL_BEST / OPENROUTER_MODEL_CHEAP."""

    name = "openrouter"
    url = "https://openrouter.ai/api/v1/chat/completions"

    def problem(self) -> str | None:
        return None if os.getenv("OPENROUTER_API_KEY") else "OPENROUTER_API_KEY vazio"

    def raw(self, task: str, prompt: str, schema: dict, tier: str) -> Reply:
        model = os.getenv(f"OPENROUTER_MODEL_{tier.upper()}") or os.getenv("OPENROUTER_MODEL_BEST", "openrouter/auto")
        body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_schema", "json_schema": {"name": task, "schema": schema}},
            "usage": {"include": True},
        }
        try:
            response = requests.post(self.url, json=body, headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"}, timeout=300)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as error:
            raise ProviderError(f"openrouter falhou: {error}") from error
        usage = data.get("usage") or {}
        return Reply(data["choices"][0]["message"]["content"], data.get("model", model), usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), usage.get("cost", 0.0))


class Ollama(AIProvider):
    """Modelo local. OLLAMA_URL e OLLAMA_MODEL."""

    name = "ollama"

    @property
    def base(self) -> str:
        return os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")

    def problem(self) -> str | None:
        try:
            requests.get(f"{self.base}/api/tags", timeout=3).raise_for_status()
            return None
        except requests.RequestException:
            return "Ollama não está rodando"

    def raw(self, task: str, prompt: str, schema: dict, tier: str) -> Reply:
        model = os.getenv("OLLAMA_MODEL", "llama3.1")
        try:
            response = requests.post(f"{self.base}/api/chat", json={"model": model, "messages": [{"role": "user", "content": prompt}], "format": schema, "stream": False}, timeout=600)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as error:
            raise ProviderError(f"ollama falhou: {error}") from error
        return Reply(data["message"]["content"], model, data.get("prompt_eval_count", 0), data.get("eval_count", 0))


PROVIDERS = {provider.name: provider for provider in (ClaudeCode(), OpenRouter(), Ollama())}


def chain() -> list[AIProvider]:
    order = os.getenv("BRAIN_PROVIDERS", "claude,openrouter,ollama")
    return [PROVIDERS[name.strip()] for name in order.split(",") if name.strip() in PROVIDERS]


def status() -> dict[str, str | None]:
    return {provider.name: provider.problem() for provider in chain()}


def complete(task: str, prompt: str, schema: type[T], tier: str = "best", ready: dict[str, str | None] | None = None) -> tuple[T, list[dict]]:
    """Primeiro provedor pronto da cadeia. Provedor caiu: tenta o próximo. Resposta inválida 2x: TaskFailed."""
    ready = ready if ready is not None else status()
    entries: list[dict] = []
    for provider in chain():
        if ready.get(provider.name):
            continue
        try:
            value, used = provider.complete(task, prompt, schema, tier)
            return value, entries + used
        except ProviderError as error:
            log.warning("%s caiu: %s", provider.name, error)
            entries.append({"provider": provider.name, "ok": False, "error": str(error)[:2000]})
        except TaskFailed as error:
            raise TaskFailed(str(error), entries + error.log) from error
    raise TaskFailed("nenhum provedor de IA disponível", entries)
