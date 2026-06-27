# Hotel ECS Integration Project

## 🏨 Context & Objectives
This project is a **Smart Hotel Self Check-in/Check-out System**. 
It replaces the legacy PC-based "Room Manager" software with a modern Web Application. The system runs on a **Raspberry Pi Zero 2 W** and interfaces with the existing hotel PBX (Phonik ECS-103R V.5) to control the power relays in each guest room.

## 🔄 Core Workflow
1. **Check-in**: A guest scans a QR code via the Frontend Web App to check into their room.
2. **Relay Activation (ON)**: The Backend receives the check-in request and uses the PBX Connector to send an "ON" command to the PBX. The PBX then signals the ECS-103R board in the room to enable the power relay circuit. (The lights will turn on once the guest inserts their keycard).
3. **Check-out**: The guest initiates a check-out via the Web App.
4. **Relay Deactivation (OFF)**: The Backend sends an "OFF" command to the PBX. The room's power is completely cut off immediately, regardless of the keycard status.

## 🖥️ System Architecture
- **Central Server**: Raspberry Pi Zero 2 W.
- **Room Hardware**: Phonik ECS-103R V.5 board (controls 220V relays).
- **Communication Hub**: Phonik PBX (ตู้สาขา). The Pi Z2W connects to this PBX via Serial RS-232 or LAN.

## 📁 Directory Structure
- `/frontend`: The Web Dashboard for hotel staff and the Self Check-in interface for guests (React/Vite). Must be highly aesthetic and premium.
- `/backend`: The API Server (Node.js/Python) handling business logic, database, and REST endpoints.
- `/pbx-connector`: Low-level scripts handling the actual protocol decoding and serial/TCP communication with the Phonik PBX.

## 🤖 AI Agent Guidelines (For Jules & other Coding Agents)
- **Language**: Always communicate with the user in Thai (ภาษาไทย).
- **Tone**: Professional, senior software engineer.
- **Frontend Design Rules**: Prioritize visual excellence. Use rich aesthetics, modern typography, sleek dark modes, and micro-animations. The UI must feel premium. Do not settle for basic MVPs.
- **Execution**: When assigned a task, focus on your specific directory (`frontend`, `backend`, or `pbx-connector`). Keep code modular and thoroughly document the PBX protocol logic as it is discovered.
