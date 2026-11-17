# One image for the whole app: the React dashboard (built with Node) served by the Python API (FastAPI),
# which also runs the OSeMOSYS solves in background processes. Built by Hugging Face Spaces (sdk: docker)
# from the context that scripts/deploy_hf_space.py uploads; works the same with a plain `docker build .`.

# ── 1. the dashboard ──────────────────────────────────────────────────────────
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json postcss.config.cjs ./
COPY public ./public
COPY src ./src
# the type check reads the JSON Schema export that the schema test compares against
COPY backend/tests/zod-schema.json ./backend/tests/zod-schema.json
RUN npm run build

# ── 2. the API ────────────────────────────────────────────────────────────────
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/home/user/app/backend \
    STATE_DIR=/tmp/state \
    MAX_ACTIVE_RUNS=1
# Hugging Face runs Docker Spaces as uid 1000
RUN useradd -m -u 1000 user
WORKDIR /home/user/app
# dependencies first (cached while only the code changes)
COPY backend/pyproject.toml backend/pyproject.toml
RUN python -c "import tomllib; d = tomllib.load(open('backend/pyproject.toml', 'rb')); print('\n'.join(d['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt
COPY backend/energy_model backend/energy_model
COPY backend/api backend/api
COPY src/data src/data
COPY --from=web /app/dist dist
USER user
EXPOSE 7860
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/api/health')"
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860", "--app-dir", "backend"]
