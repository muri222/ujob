import pytest
from pydantic import BaseModel

from brain import claude
from brain.claude import TaskFailed


class Score(BaseModel):
    score: int
    ok: bool


def fake_ask(replies, prompts):
    def ask(prompt, schema, tier, tools=""):
        prompts.append(prompt)
        return replies.pop(0), {"provider": "claude", "model": tier}
    return ask


def test_retry_once_with_validation_error(monkeypatch):
    prompts = []
    monkeypatch.setattr(claude, "ask", fake_ask(['{"score": "muito"}', '{"score": 7, "ok": true}'], prompts))
    value, log = claude.complete("t", "prompt", Score)
    assert value.score == 7 and [e["ok"] for e in log] == [False, True]
    assert "não passou na validação" in prompts[1]


def test_fails_after_second_bad_answer(monkeypatch):
    monkeypatch.setattr(claude, "ask", fake_ask(["{}", "{}"], []))
    with pytest.raises(TaskFailed) as error:
        claude.complete("t", "prompt", Score)
    assert len(error.value.log) == 2


@pytest.mark.parametrize(
    "message, expected",
    [("Claude AI usage limit reached", "Limite da sua assinatura"), ("401 authentication_error", "deslogou"), ("boom", "Claude falhou: boom")],
)
def test_friendly_errors(message, expected):
    assert expected in claude.friendly(message)


def test_real_claude_returns_schema():
    if problem := claude.problem():
        pytest.skip(problem)
    value, log = claude.complete("teste", "Responda com score 42 e ok true.", Score, "cheap")
    assert value == Score(score=42, ok=True) and log[-1]["ok"] and log[-1]["model"].startswith("claude-")
