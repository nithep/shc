# Backend - Hotel API Server

This directory will contain the API Server that acts as the bridge between the Frontend Web App and the PBX Connector.

## Responsibilities
- Serve RESTful APIs for Check-in / Check-out flows.
- Maintain the state of all rooms (Database / In-memory).
- Communicate with the `/pbx-connector` to issue physical hardware commands.

## Tech Stack Recommendation
- Node.js (Express/Fastify) or Python (FastAPI/Flask)
- SQLite or PostgreSQL for booking and room state management
