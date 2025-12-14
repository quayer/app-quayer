#!/bin/bash
set -e

# Configuration
APP_DIR="/opt/quayer"
REPO_URL="https://github.com/quayer/app-quayer.git"
BRANCH="main"

echo "🚀 Starting Quayer Deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

# Check if Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    apk add docker-compose || apt-get install -y docker-compose || echo "⚠️ Could not auto-install compose, checking plugin..."
fi

# Clone or Pull
if [ -d "$APP_DIR" ]; then
    echo "📥 Updating existing repository..."
    cd $APP_DIR
    git pull origin $BRANCH
else
    echo "📥 Cloning repository..."
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Environment Setup
if [ ! -f .env ]; then
    echo "⚠️ .env file missing! Creating from .env.example (You must edit this!)"
    cp .env.example .env
    echo "📝 Please edit $APP_DIR/.env with your secrets."
fi

# Build and Deploy
echo "🏗️ Building and Starting Containers..."
docker-compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo "🧹 Pruning unused images..."
docker image prune -f

echo "✅ Deployment Complete! Check logs with: docker-compose -f docker-compose.prod.yml logs -f"
