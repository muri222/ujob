from brain import tasks
from brain.prompts import render


def test_job_fit_prompt_keeps_braces_from_json():
    prompt = render("job_fit", vaga='{"title": "Artista 3D"}', cv='{"skills": ["Blender"]}', mente="- Não aceita: presencial")
    assert '{"title": "Artista 3D"}' in prompt and '"Blender"' in prompt


def test_job_fit_sends_payload_to_best_tier(monkeypatch):
    seen = {}

    def fake(task, prompt, schema, tier):
        seen.update(task=task, tier=tier, prompt=prompt)
        return schema(score=70, por_que="ok", atende=["Blender"], parcial=[], falta=["Maya"], vale_aplicar=True, motivo="bom"), [{"ok": True}]

    monkeypatch.setattr(tasks.claude, "complete", fake)
    result, log = tasks.job_fit({"payload": {"vaga": {"title": "Artista 3D"}, "cv": {"skills": ["Blender"]}}})
    assert result["score"] == 70 and seen["tier"] == "best" and "Artista 3D" in seen["prompt"]


def test_mind_context_respects_limit():
    from brain import mind

    facts = [{"kind": "restricao", "text": "x" * 100}] * 50
    text = mind.context(facts, max_chars=500)
    assert len(text) <= 500 and text.startswith("- Não aceita:")
    assert "ainda não aprendeu" in mind.context([])


def test_html_text_drops_scripts_and_keeps_links():
    from brain import read

    text, links = read.html_text('<html><head><title>t</title></head><body><script>var a=1</script><p>Artista 3D</p><a href="https://artstation.com/x">port</a></body></html>')
    assert "Artista 3D" in text and "var a" not in text and links == ["https://artstation.com/x"]


def test_answers_fill_keeps_only_asked_questions_with_answers(monkeypatch):
    seen = {}

    def fake(task, prompt, schema, tier):
        seen.update(prompt=prompt, tier=tier)
        return schema(respostas=[{"q": "Link do portfólio ", "a": "https://artstation.com/x"}, {"q": "Como ficou sabendo da vaga?", "a": ""}, {"q": "Pergunta inventada", "a": "x"}]), [{"ok": True}]

    monkeypatch.setattr(tasks.claude, "complete", fake)
    result, _ = tasks.answers_fill({"payload": {"perguntas": ["Link do portfólio", "Como ficou sabendo da vaga?"], "cv": {"links": ["https://artstation.com/x"]}, "funcao": "Artista 3D"}})
    assert result == {"respostas": [{"q": "Link do portfólio", "a": "https://artstation.com/x"}]}
    assert seen["tier"] == "best" and "Artista 3D" in seen["prompt"] and "artstation" in seen["prompt"]
