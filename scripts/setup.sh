#!/bin/bash
# First-time server setup script for Oracle Cloud Ubuntu instance
# Run this after SSH'ing into your instance

set -e

echo "=== ADHD Bot Server Setup ==="

# Install Node.js 20
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
echo "Installing PM2..."
sudo npm install -g pm2

# Install dependencies
echo "Installing project dependencies..."
npm install

# Build TypeScript
echo "Building project..."
npm run build

# Prompt for environment variables
echo ""
echo "=== Environment Setup ==="
echo "Create your .env file with the following variables:"
echo "  DISCORD_BOT_TOKEN=your_token"
echo "  DISCORD_CLIENT_ID=your_client_id"
echo "  GAME_API_URL=https://www.ahousedividedgame.com/"
echo "  GAME_API_KEY=your_api_key"
echo ""
read -p "Press Enter once you've created .env, then we'll start the bot..."

# Register slash commands
echo "Registering Discord commands..."
npm run register

# Start with PM2
echo "Starting bot with PM2..."
pm2 start ecosystem.config.cjs

# Setup PM2 to start on boot
echo "Configuring PM2 startup..."
pm2 startup
pm2 save

echo ""
echo "=== Setup Complete ==="
echo "Your bot should now be running! Use 'pm2 status' to check."
echo "Use 'pm2 logs adhd-bot' to view logs."
