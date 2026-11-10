# Optional container build for DigitalOcean App Platform (Dockerfile-based
# deploys) or local parity testing. The default/recommended deploy path is
# the Python buildpack picking up requirements.txt + Procfile directly, so
# this file is not required for that flow, but is kept for anyone who wants
# an explicit, reproducible image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first so Docker can cache this layer across builds
# that only change application code.
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/
RUN chmod +x scripts/start_web.sh scripts/run_prediction_schedule.sh

EXPOSE 8080

CMD ["./scripts/start_web.sh"]
