# Use current slim Python image
FROM python:3.12-slim

# Set the working directory to the project folder
WORKDIR /app

# Install system dependencies (important for sqlite and some python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 libsqlite3-dev \
    && rm -rf /lib/apt/lists/*

# Copy package requirements separately for better caching
COPY requirements.txt ./

# Install dependencies from requirements
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files from the project folder
COPY . .

# Expose the Python/FastAPI port
EXPOSE 8001

# Start command for the chatbot (uvicorn)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
