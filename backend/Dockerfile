# Use a slim Python base image for smaller size
FROM python:3.10-slim-buster

# Set environment variables
ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1

# Set the working directory inside the container
WORKDIR /app/backend

# Install system dependencies required for ffmpeg and other Python libraries
# moviepy and pydub rely on ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt and install Python dependencies
# We copy it separately to leverage Docker's build cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire backend project into the container
COPY . .

# Expose the port that Daphne will run on
EXPOSE 8000

# Command to run the Daphne server
# This will start your Django application with Channels
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "video_transcriber.asgi:application"]