#!/bin/bash
# Deployment script - run this to update the bot after pulling changes
set -e

echo "=== Deploying ADHD Bot ==="

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Install any new dependencies
echo "Installing dependencies..."
npm install

# Build TypeScript
echo "Building project..."
npm run build

# Restart the bot
echo "Restarting bot..."
pm2 restart adhd-bot

echo ""
echo "=== Deployment Complete ==="
pm2 status
