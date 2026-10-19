FROM ghcr.io/astral-sh/uv:python3.13-alpine
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /scout
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY scrapy.cfg ./
COPY catalog ./catalog
COPY ujob_scout ./ujob_scout
RUN adduser -D -H -u 10002 scout
USER scout
CMD [".venv/bin/python", "-m", "ujob_scout.scheduler"]
