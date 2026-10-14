FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src src
COPY migrations migrations
COPY alembic.ini app.py ./
RUN uv sync --frozen --no-dev && useradd --system --uid 10001 scopeprofit
USER scopeprofit
ENV PATH="/app/.venv/bin:$PATH" DATABASE_POOL=queue AGENT_MODE=worker
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:3001/api/health').status == 200 else 1)"
CMD ["uvicorn", "scopeprofit.api.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "3001", "--proxy-headers"]
