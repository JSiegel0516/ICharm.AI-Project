FROM python:3.13-slim

# Install ONLY the build tools needed for Rust/C compilation
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system build dependencies INCLUDING libpq-dev for PostgreSQL
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    cargo \
    pkg-config \
    libpq-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && echo "=== Verifying psycopg2 installation ===" \
    && pip list | grep psycopg \
    && python -c "import psycopg2; print(f'psycopg2 version: {psycopg2.__version__}')"

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application (explicit module path)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
# Use --reload for development; remove it for production