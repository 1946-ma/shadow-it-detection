# Backend (Flask API + ML pipeline)
# Build context: repo root. See docker-compose.yml for the full stack.
FROM python:3.14-slim

LABEL org.opencontainers.image.title="Shadow IT Detection — Backend" \
      org.opencontainers.image.description="AI-driven Shadow IT detection: hybrid IsolationForest + RandomForest, Flask REST API. BSc Cybersecurity final year project, UMaT." \
      org.opencontainers.image.authors="Jeffrey Sampson Ennin <jeffreysampsonennin@gmail.com>" \
      org.opencontainers.image.source="https://github.com/1946-ma/shadow-it-detection"

WORKDIR /app
ENV PYTHONUNBUFFERED=1

# libpcap so scapy imports cleanly (live capture itself is host-only; the
# container cannot see the host's Wi-Fi adapter on Docker Desktop/Windows)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpcap0.8 \
    && rm -rf /var/lib/apt/lists/*

# ML library versions pinned to the ones the .pkl artifacts were trained
# with on the dev machine — mismatched sklearn/numpy can break unpickling.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
        scikit-learn==1.8.0 numpy==2.4.2 pandas==3.0.0 joblib==1.5.3 \
        gunicorn==23.0.0

COPY backend/ backend/
COPY ml/ ml/
COPY db/ db/

# data/ and ml/artifacts/ are gitignored and large — mounted at runtime
# (see docker-compose.yml volumes)

EXPOSE 5000
# exec: gunicorn becomes PID 1 and receives SIGTERM -> graceful shutdown
CMD ["sh", "-c", "python db/seed.py && exec gunicorn --workers 2 --bind 0.0.0.0:5000 'backend.app:create_app()'"]
