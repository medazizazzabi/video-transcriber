# Use a slim Python base image for smaller size
FROM python:3.8.10

# Install necessary build tools and Python development headers
RUN apt-get update && apt-get install -y python3-dev build-essential

# Set the working directory inside the container
WORKDIR /app/backend

# Install system dependencies required for ffmpeg AND build tools
# 'build-essential' provides gcc, g++, make, etc.
# 'python3-dev' provides headers needed for compiling Python extensions
# moviepy and pydub rely on ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        build-essential \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt and install Python dependencies
COPY requirements.txt .

RUN pip install -r requirements.txt

# Copy the entire backend project into the container
COPY . .

# Expose the port that Daphne will run on
EXPOSE 8000

# Command to run the Daphne server
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "video_transcriber.asgi:application"]