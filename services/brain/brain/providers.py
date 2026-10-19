"""Outras IAs além do Claude Code: ChatGPT logado (Codex CLI) ou API com chave (OpenRouter, DeepSeek, compatível com OpenAI).

A pessoa escolhe em Config. da conta; o painel guarda (chave cifrada) e o worker lê a cada 30 s.
Mesmo contrato do claude.ask: (texto_json, entrada_do_ai_log). Web só onde o provedor tem."""

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

import requests

from .read import pdf_text

CONFIG: dict = {"provider": "claude"}

API_BASE = {"openrouter": "https://openrouter.ai/api/v1", "deepseek": "https://api.deepseek.com"}
DEFAULT_MODELS = {
    "codex": {"top": "", "best": "", "cheap": ""},  # vazio = o modelo padrão da conta do ChatGPT
    "openrouter": {"top": "anthropic/claude-sonnet-4.5", "best": "openai/gpt-5-mini", "cheap": "google/gemini-2.5-flash"},
    "deepseek": {"top": "deepseek-reasoner", "best": "deepseek-chat", "cheap": "deepseek-chat"},
    "openai": {"top": "gpt-5", "best": "gpt-5-mini", "cheap": "gpt-5-nano"},
}
LABEL = {"claude": "Claude Code", "codex": "ChatGPT (Codex)", "openrouter": "OpenRouter", "deepseek": "DeepSeek", "openai": "API compatível com OpenAI"}


class ProviderError(Exception):
    pass


def _codex_bin() -> str:
    # no Windows o codex do npm é codex.cmd: o subprocess só acha com o caminho completo
    return shutil.which("codex") or "codex"


def configure(config: dict | None) -> None:
    CONFIG.clear()
    CONFIG.update({"provider": "claude", **(config or {})})


def name() -> str:
    return CONFIG.get("provider") or "claude"


def model(tier: str) -> str:
    chosen = (CONFIG.get("models") or {}).get(tier) or ""
    return chosen or DEFAULT_MODELS.get(name(), {}).get(tier, "")


def problem() -> str | None:
    provider = name()
    if provider == "codex":
        if not shutil.which("codex"):
            return "Codex (ChatGPT) não está instalado neste PC (npm i -g @openai/codex)"
        try:
            done = subprocess.run([_codex_bin(), "login", "status"], capture_output=True, text=True, timeout=30, encoding="utf-8")
        except (OSError, subprocess.TimeoutExpired):
            return "Codex não respondeu"
        return None if "logged in" in (done.stdout + done.stderr).lower() else "Codex não está logado (rode codex login)"
    if provider in API_BASE or provider == "openai":
        if not CONFIG.get("key"):
            return f"Coloque a chave da API do {LABEL[provider]} em Config. da conta"
        if provider == "openai" and not CONFIG.get("baseUrl"):
            return "Coloque o endereço da API em Config. da conta"
    return None


def friendly(message: str) -> str:
    text = message.lower()
    if "401" in text or "unauthorized" in text or "invalid api key" in text:
        return f"A chave do {LABEL.get(name(), name())} foi recusada. Confira em Config. da conta."
    if "402" in text or "insufficient" in text or "credit" in text or "balance" in text:
        return f"Sem créditos no {LABEL.get(name(), name())}."
    if "429" in text or "rate" in text or "limit" in text:
        return f"Limite do {LABEL.get(name(), name())} atingido. Tenta de novo mais tarde."
    return f"{LABEL.get(name(), name())} falhou: {message}"[:500]


def _json_only(text: str) -> str:
    """Tira cerca de código e texto em volta: fica só o objeto JSON."""
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start >= 0 and end > start else text


def _schema_prompt(system: str, schema: dict) -> str:
    return f"{system}\nResponda SOMENTE com um objeto JSON válido que siga exatamente este JSON Schema (sem texto fora do JSON, sem cerca de código):\n{json.dumps(schema, ensure_ascii=False)}"


# ── ChatGPT logado: codex exec (sem arquivos de config, sem sessão salva, só leitura)
def _codex(prompt: str, tier: str, web: bool, images: list[str] | None = None, cwd: str | None = None) -> tuple[str, dict]:
    with tempfile.TemporaryDirectory() as work:
        out = Path(work) / "last.txt"
        command = [_codex_bin(), "exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "--sandbox", "read-only", "--json", "-o", str(out)]
        if model(tier):
            command += ["-m", model(tier)]
        if web:
            command += ["-c", "tools.web_search=true"]
        for image in images or []:
            command += ["-i", image]
        command.append("-")
        started = time.monotonic()
        try:
            done = subprocess.run(command, input=prompt, capture_output=True, text=True, encoding="utf-8", cwd=cwd or work, timeout=1200 if web else 600)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise ProviderError(str(error)) from error
        usage = {}
        for line in done.stdout.splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "turn.completed":
                usage = event.get("usage") or {}
            if event.get("type") in ("error", "turn.failed"):
                raise ProviderError(json.dumps(event, ensure_ascii=False)[:500])
        text = out.read_text(encoding="utf-8") if out.exists() else ""
        if done.returncode != 0 and not text:
            raise ProviderError((done.stderr or done.stdout or "sem resposta")[-500:])
    entry = {"provider": "codex", "model": model(tier) or "padrão do ChatGPT", "tokensIn": usage.get("input_tokens", 0), "tokensOut": usage.get("output_tokens", 0), "cost": 0.0, "latencyMs": int((time.monotonic() - started) * 1000)}
    return text, entry


# ── API com chave (OpenAI-compatível): OpenRouter, DeepSeek, OpenAI, Groq...
def _endpoint() -> str:
    return (CONFIG.get("baseUrl") or API_BASE.get(name(), "")).rstrip("/") + "/chat/completions"


def _api_model(tier: str, web: bool) -> str:
    chosen = model(tier)
    # OpenRouter pesquisa na web com o sufixo :online (cobra a mais); os outros respondem sem web
    return f"{chosen}:online" if web and name() == "openrouter" and not chosen.endswith(":online") else chosen


def _api(messages: list[dict], tier: str, web: bool, json_mode: bool, stream_to: Callable[[str], bool] | None = None) -> tuple[str, dict, bool]:
    headers = {"Authorization": f"Bearer {CONFIG.get('key', '')}", "Content-Type": "application/json", "HTTP-Referer": "https://radar.local", "X-Title": "Radar"}
    body = {"model": _api_model(tier, web), "messages": messages}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if stream_to:
        body["stream"] = True
    started = time.monotonic()
    try:
        response = requests.post(_endpoint(), headers=headers, json=body, timeout=600, stream=bool(stream_to))
    except requests.RequestException as error:
        raise ProviderError(str(error)) from error
    if response.status_code >= 400:
        raise ProviderError(f"{response.status_code} {response.text[:300]}")
    text, usage, stopped = "", {}, False
    if stream_to:
        last = 0.0
        for raw in response.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith("data:"):
                continue
            data = raw[5:].strip()
            if data == "[DONE]":
                break
            try:
                event = json.loads(data)
            except ValueError:
                continue
            usage = event.get("usage") or usage
            delta = ((event.get("choices") or [{}])[0].get("delta") or {}).get("content") or ""
            text += delta
            if text and time.monotonic() - last > 0.4:
                last = time.monotonic()
                if stream_to(text):
                    stopped = True
                    response.close()
                    break
    else:
        data = response.json()
        usage = data.get("usage") or {}
        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    entry = {"provider": name(), "model": body["model"], "tokensIn": usage.get("prompt_tokens", 0), "tokensOut": usage.get("completion_tokens", 0), "cost": float(usage.get("cost") or 0.0), "latencyMs": int((time.monotonic() - started) * 1000)}
    return text, entry, stopped


def ask(prompt: str, schema: dict, tier: str, tools: str, system: str) -> tuple[str, dict]:
    """Igual ao claude.ask, pra codex e APIs. Devolve o JSON (texto) e a entrada do ai_log."""
    web = bool(tools)
    note = "" if web and name() in ("codex", "openrouter") else ("\n(Você está sem acesso à web nesta tarefa: use só o que sabe e diga quando não puder confirmar.)" if web else "")
    if name() == "codex":
        text, entry = _codex(f"{_schema_prompt(system, schema)}{note}\n\n{prompt}", tier, web)
    else:
        text, entry, _ = _api([{"role": "system", "content": _schema_prompt(system, schema) + note}, {"role": "user", "content": prompt}], tier, web, json_mode=True)
    return _json_only(text), entry


IMAGE = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def attachments_text(files_dir: Path, names: list[str]) -> tuple[str, list[str]]:
    """Anexos pra quem não tem a ferramenta Read: PDF e texto viram texto aqui no PC; imagem vai à parte (só Codex usa)."""
    parts, images = [], []
    for item in names:
        path = files_dir / item
        if not path.exists():
            continue
        suffix = path.suffix.lower()
        if suffix in IMAGE:
            images.append(str(path))
        elif suffix == ".pdf":
            parts.append(f"[anexo {item}]\n{pdf_text(str(path))[:20000]}")
        elif suffix in (".txt", ".md", ".csv", ".json", ".html", ".xml"):
            parts.append(f"[anexo {item}]\n{path.read_text(encoding='utf-8', errors='replace')[:20000]}")
    return "\n\n".join(parts), images


def chat(system: str, prompt: str, tier: str, images: list[str], on_text: Callable[[str], bool], cwd: str) -> tuple[str, dict, bool]:
    if name() == "codex":
        text, entry = _codex(f"{system}\n\n{prompt}", tier, web=True, images=images, cwd=cwd)
        return text, entry, False
    # ponytail: chat por API sem web (o :online do OpenRouter cobra por mensagem); o Codex pesquisa de graça na assinatura
    return _api([{"role": "system", "content": system}, {"role": "user", "content": prompt}], tier, web=False, json_mode=False, stream_to=on_text)
