#!/bin/bash

# 1. Update the system to the latest
echo "Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install basic tools (Git, Python3, Build tools)
echo "Installing basic tools..."
sudo apt install -y git curl wget build-essential python3 python3-pip python3-venv

# 3. Install Node.js 20 LTS (for Frontend and Backend)
echo "Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Install PM2 (to run Backend and Frontend in the background)
echo "Installing PM2..."
sudo npm install -g pm2
pm2 startup

# 5. Check installation
echo -e "\n=== 🎯 Installation Summary ==="
echo -n "Node.js: " && node -v
echo -n "NPM: " && npm -v
echo -n "PM2: " && pm2 -v
echo -n "Python: " && python3 --version
echo -n "Git: " && git --version
echo -e "========================\n"

echo "Setup complete! Next step: clone the project repository."
echo "git clone <URL_of_Hotel_ECS_Checkin_project>"
