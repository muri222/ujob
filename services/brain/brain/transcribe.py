"""Áudio vira texto no PC, com Whisper local (faster-whisper). Sem IA paga, sem token."""

import os

_model = None


def _load(device: str):
    from faster_whisper import WhisperModel

    return WhisperModel(os.getenv("WHISPER_MODEL", "small"), device=device, compute_type="float16" if device == "cuda" else "int8")


def _run(model, path: str) -> str:
    # vocabulário do app ajuda o Whisper com termos em inglês misturados no português
    hint = "uJob, leads, vagas, currículo, portfólio, prospecção, freela, job, remoto, CGI, 3D, Claude."
    segments, _ = model.transcribe(path, vad_filter=True, beam_size=5, initial_prompt=hint)
    return " ".join(segment.text.strip() for segment in segments).strip()


def transcribe(path: str) -> str:
    global _model
    if _model is None:
        try:
            _model = _load("cuda")
        except Exception:
            _model = _load("cpu")
    try:
        return _run(_model, path)
    except RuntimeError as error:
        # GPU sem cuBLAS/cuDNN só falha na hora de rodar: cai pra CPU e lembra disso
        if "dll" not in str(error).lower() and "cuda" not in str(error).lower():
            raise
        _model = _load("cpu")
        return _run(_model, path)
