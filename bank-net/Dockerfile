# Traffic-generator image for the virtual bank network.
# One image, many roles: the ROLE env var (set per-container in
# docker-compose.yml) selects the profile at runtime.
FROM python:3.12-slim

# Unbuffered so `docker compose logs -f` shows behaviour lines immediately.
ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir requests

WORKDIR /app
COPY generator/ /app/generator/

# ROLE is overridden per-container in docker-compose.yml.
ENV ROLE=teller

CMD ["python", "/app/generator/traffic_gen.py"]
