from brain import providers


def test_json_only_strips_fences_and_text():
    assert providers._json_only('Claro! ```json\n{"a": 1}\n``` pronto') == '{"a": 1}'


def test_model_defaults_and_overrides():
    providers.configure({"provider": "deepseek", "models": {"best": ""}})
    assert providers.model("top") == "deepseek-reasoner" and providers.model("best") == "deepseek-chat"
    providers.configure({"provider": "openrouter", "models": {"best": "x/y"}, "key": "k"})
    assert providers._api_model("best", web=True) == "x/y:online" and providers.problem() is None
    providers.configure(None)
    assert providers.name() == "claude"


def test_worker_imports():
    # pega erro de sintaxe em qualquer módulo do worker (o chat não tinha teste e caiu assim)
    import brain.worker  # noqa: F401
