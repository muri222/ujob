from brain import tasks
from brain.prompts import render


def test_job_fit_prompt_keeps_braces_from_json():
    prompt = render("job_fit", vaga='{"title": "Artista 3D"}', cv='{"skills": ["Blender"]}')
    assert '{"title": "Artista 3D"}' in prompt and '"Blender"' in prompt


def test_job_fit_sends_payload_to_best_tier(monkeypatch):
    seen = {}

    def fake(task, prompt, schema, tier, ready):
        seen.update(task=task, tier=tier, prompt=prompt)
        return schema(score=70, por_que="ok", atende=["Blender"], parcial=[], falta=["Maya"], vale_aplicar=True, motivo="bom"), [{"ok": True}]

    monkeypatch.setattr(tasks.providers, "complete", fake)
    result, log = tasks.job_fit({"payload": {"vaga": {"title": "Artista 3D"}, "cv": {"skills": ["Blender"]}}}, {})
    assert result["score"] == 70 and seen["tier"] == "best" and "Artista 3D" in seen["prompt"]
