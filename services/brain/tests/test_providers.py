import pytest
from pydantic import BaseModel

from brain import providers
from brain.providers import AIProvider, ProviderError, Reply, TaskFailed


class Score(BaseModel):
    score: int
    ok: bool


class Fake(AIProvider):
    def __init__(self, name, replies):
        self.name, self.replies, self.prompts = name, list(replies), []

    def problem(self):
        return None

    def raw(self, task, prompt, schema, tier):
        self.prompts.append(prompt)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return Reply(reply, "fake")


def use(monkeypatch, *fakes):
    monkeypatch.setattr(providers, "chain", lambda: list(fakes))


def test_retry_once_with_validation_error(monkeypatch):
    fake = Fake("a", ['{"score": "muito"}', '{"score": 7, "ok": true}'])
    use(monkeypatch, fake)
    value, log = providers.complete("t", "prompt", Score, ready={"a": None})
    assert value.score == 7 and [e["ok"] for e in log] == [False, True]
    assert "não passou na validação" in fake.prompts[1]


def test_fails_after_second_bad_answer(monkeypatch):
    use(monkeypatch, Fake("a", ["{}", "{}"]), Fake("b", ['{"score": 1, "ok": true}']))
    with pytest.raises(TaskFailed) as error:
        providers.complete("t", "prompt", Score, ready={"a": None, "b": None})
    assert len(error.value.log) == 2  # inválido não cai pro próximo provedor


def test_falls_to_next_provider_when_one_is_down(monkeypatch):
    use(monkeypatch, Fake("a", [ProviderError("fora")]), Fake("b", ['{"score": 3, "ok": false}']))
    value, log = providers.complete("t", "prompt", Score, ready={"a": None, "b": None})
    assert value.score == 3 and log[0]["provider"] == "a" and log[-1]["provider"] == "b"


def test_skips_provider_not_ready(monkeypatch):
    skipped = Fake("a", [])
    use(monkeypatch, skipped, Fake("b", ['{"score": 3, "ok": true}']))
    providers.complete("t", "prompt", Score, ready={"a": "não logado", "b": None})
    assert skipped.prompts == []


@pytest.mark.parametrize("name", ["claude", "openrouter", "ollama"])
def test_real_provider_returns_schema(name):
    provider = providers.PROVIDERS[name]
    if problem := provider.problem():
        pytest.skip(problem)
    value, log = provider.complete("teste", "Responda com score 42 e ok true.", Score, "cheap")
    assert value == Score(score=42, ok=True) and log[-1]["ok"]
