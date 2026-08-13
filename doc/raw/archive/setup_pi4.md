# Raspberry Pi 4 Setup Guide

This guide details the setup process for a Raspberry Pi 4 acting as the central server for the Smart Hotel Self Check-in/Check-out system.

## Setup Script

A setup script is available at `scripts/setup_pi4.sh`. You can copy it to your Pi 4 and run it to install all necessary dependencies.

Alternatively, you can run the following commands directly on your Raspberry Pi 4 terminal after connecting via SSH:

### 1. Update the system to the latest
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install basic tools (Git, Python3, Build tools)
```bash
sudo apt install -y git curl wget build-essential python3 python3-pip python3-venv
```

### 3. Install Node.js 20 LTS (for Frontend and Backend)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4. Install PM2 (to run Backend and Frontend in the background)
```bash
sudo npm install -g pm2
pm2 startup
```

### 5. Check installation
```bash
echo -e "\n=== 🎯 Installation Summary ==="
echo -n "Node.js: " && node -v
echo -n "NPM: " && npm -v
echo -n "PM2: " && pm2 -v
echo -n "Python: " && python3 --version
echo -n "Git: " && git --version
echo -e "========================\n"
```

## Next Steps

Once the setup is complete and all tools are installed, you can clone the project repository:

```bash
# Clone the project (replace URL with your repository URL)
git clone <URL_of_Hotel_ECS_Checkin_project>

# Enter the project directory
cd <project_folder_name>
```
