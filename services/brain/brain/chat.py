"""Chat do uJob: Claude Code do usuário em streaming, com o contexto atual do uJob e os anexos da conversa."""

import json
import os
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from . import claude, providers
from .prompts import render

TOOLS = "Read,WebSearch,WebFetch"
PARTIAL_EVERY = 0.4


def build_prompt(payload: dict) -> str:
    lines = []
    for message in payload["history"]:
        who = "Usuário" if message["role"] == "user" else "Claude"
        files = f"\n[anexos, leia com a ferramenta Read: {', '.join(message['files'])}]" if message.get("files") else ""
        lines.append(f"### {who}\n{message['text'] or '(sem texto)'}{files}")
    context = json.dumps(payload["context"], ensure_ascii=False, indent=1)
    return f"<contexto_radar atualizado_agora>\n{context}\n</contexto_radar>\n\n<conversa>\n" + "\n\n".join(lines) + "\n</conversa>\n\nResponda à última mensagem do usuário."


def system_prompt(payload: dict, name: str) -> str:
    if payload.get("mode") == "entrevista":
        return render("chat_interview", nome=name, setup=json.dumps(payload.get("setup") or {}, ensure_ascii=False))
    return render("chat_system", nome=name)


def reply(task: dict, on_text: Callable[[str], bool]) -> tuple[dict, list[dict]]:
    """on_text(texto_parcial) devolve True se o usuário pediu pra parar."""
    payload = task["payload"]
    tier = payload.get("model", "best")
    name = (payload["context"].get("perfil") or {}).get("nome") or "o usuário"
    files_dir = Path(payload["files_dir"])
    files_dir.mkdir(parents=True, exist_ok=True)
    if providers.name() != "claude":
        return reply_other(payload, tier, name, files_dir, on_text)
    command = [
        claude.claude_bin() or "claude", "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--model", claude.TIERS[tier], "--tools", TOOLS, "--allowedTools", "WebSearch,WebFetch",
        "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence",
        "--system-prompt", system_prompt(payload, name),
    ]
    started = time.monotonic()
    # cwd = pasta dos anexos: o Read só lê dentro dela sem pedir permissão (fora dela é negado no modo -p)
    proc = subprocess.Popen(command, cwd=files_dir, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", env={**os.environ})
    proc.stdin.write(build_prompt(payload))
    proc.stdin.close()
    text, final, last_sent, stopped = "", None, 0.0, False
    for line in proc.stdout:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "stream_event":
            inner = event.get("event") or {}
            delta = inner.get("delta") or {}
            if inner.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
                text += delta.get("text", "")
            elif inner.get("type") == "content_block_start" and (inner.get("content_block") or {}).get("type") == "tool_use":
                tool = inner["content_block"].get("name", "")
                text += {"WebSearch": "\n\n*Pesquisando na web…*\n\n", "WebFetch": "\n\n*Abrindo uma página…*\n\n", "Read": "\n\n*Lendo o anexo…*\n\n"}.get(tool, "")
            if time.monotonic() - last_sent > PARTIAL_EVERY and text:
                last_sent = time.monotonic()
                if on_text(text):
                    stopped = True
                    proc.kill()
                    break
        elif event.get("type") == "result":
            final = event
    proc.wait(timeout=30)
    usage = (final or {}).get("usage") or {}
    entry = {
        "provider": "claude",
        "model": next(iter((final or {}).get("modelUsage") or {}), claude.TIERS[tier]),
        "tokensIn": usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0) + usage.get("cache_creation_input_tokens", 0),
        "tokensOut": usage.get("output_tokens", 0),
        "cost": (final or {}).get("total_cost_usd", 0.0),
        "latencyMs": int((time.monotonic() - started) * 1000),
        "ok": bool(final) and not final.get("is_error"),
    }
    if stopped:
        return {"text": text.rstrip() + "\n\n*(resposta interrompida)*", "model": entry["model"], "tokens": entry["tokensOut"]}, [entry]
    if not final or final.get("is_error"):
        error = (final or {}).get("result") or proc.stderr.read()[:500] or "sem resposta"
        raise claude.TaskFailed(claude.friendly(str(error)), [{**entry, "error": str(error)[:2000]}])
    answer = final.get("result") or text
    return {"text": answer, "model": entry["model"], "tokens": entry["tokensOut"]}, [entry]


def reply_other(payload: dict, tier: str, name: str, files_dir: Path, on_text: Callable[[str], bool]) -> tuple[dict, list[dict]]:
    """Chat com ChatGPT (Codex) ou API: sem a ferramenta Read, os anexos viram texto aqui no PC."""
    names = [item for message in payload["history"] for item in message.get("files") or []]
    attached, images = providers.attachments_text(files_dir, names)
    history = {**payload, "history": [{**message, "files": []} for message in payload["history"]]}
    prompt = build_prompt(history) + (f"\n\n<anexos>\n{attached}\n</anexos>" if attached else "")
    try:
        text, entry, stopped = providers.chat(system_prompt(payload, name), prompt, tier, images, on_text, str(files_dir))
    except providers.ProviderError as error:
        raise claude.TaskFailed(providers.friendly(str(error)), [{"provider": providers.name(), "ok": False, "error": str(error)[:2000]}]) from error
    entry["ok"] = True
    suffix = "\n\n*(resposta interrompida)*" if stopped else ""
    return {"text": text.rstrip() + suffix, "model": entry["model"], "tokens": entry["tokensOut"]}, [entry]
