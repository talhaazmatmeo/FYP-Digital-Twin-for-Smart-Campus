# FYP-Digital-Twin-for-Smart-Campus

Team Members: Talha Azmat & Muhammad Taha

Smart Campus dashboard + backend services for real-time sensor monitoring.

This repo contains:

- **Backend**: Flask + Socket.IO + MQTT subscriber + SQLite storage (Room 101 only)
- **Frontend**: React + Vite + MUI dashboard UI
- **Unity project**: `unity-digital-twin/` (optional)

## Features

- **Live Room 101**: Receives real telemetry via MQTT → broadcasts via Socket.IO → shown in UI.
- **Simulated rooms**: Non-live rooms are simulated (used for dashboards/alerts).
- **Alerts**: Anomaly rules generate alerts (temperature/motion/light/power/humidity).
- **System Status**: Health view for MQTT, database, WebSocket, uptime.
- **Reports (Room 101 only)**: Shows the last N stored readings and supports CSV export.
- **Energy Calculator (Room 101 only)**: Tracks live `sensor_update` readings and estimates cost/waste.

## Tech Stack

- Frontend: React, React Router, MUI, Recharts, Socket.IO client, Vite
- Backend: Flask, Flask-SocketIO, Flask-CORS, paho-mqtt, python-dotenv, SQLite

## Project Structure

```
backend/   # Flask + Socket.IO backend
frontend/  # React + Vite frontend
docs/      # documentation assets
scripts/   # helper scripts
unity-digital-twin/ # optional Unity scene/assets
```

## Prerequisites

- **Python** 3.10+ (tested with 3.13)
- **Node.js** 18+ recommended
- Optional: **MQTT broker** (default `localhost:1883`) and a device publishing Room 101 data

## Quick Start (Windows / PowerShell)

From the repo root:

### 1) Backend

Create/activate a venv (once):

```powershell
python -m venv .venv
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& .\.venv\Scripts\Activate.ps1)
```

Install backend deps:

```powershell
python -m pip install -r .\backend\requirements.txt
```

Run the backend (recommended entrypoint):

```powershell
python .\backend\run.py
```

Backend will listen on:

- `http://127.0.0.1:5000`

Notes:

- `backend/run.py` also starts the background simulation loop (non-Room-101 rooms).
- To run *only* the server (no simulation), you can use `python .\backend\app.py`.

### 2) Frontend

In a second terminal from the repo root:

```powershell
npm --prefix .\frontend install
npm --prefix .\frontend run dev
```

Then open:

- `http://localhost:5173` (Vite may use `5174` if `5173` is busy)

## Pages

- `/` Dashboard
- `/alerts` Alerts
- `/about` About
- `/status` System Status
- `/reports` Reports (Room 101 only)
- `/calculator` Energy Calculator (Room 101 only)

## Database (SQLite) — Room 101 Only

The backend uses SQLite to persist **only live Room 101 readings**.

- Default DB file: `backend/campus_twin.db`
- Override with env var: `SQLITE_PATH`

Room 101-only behavior:

- Incoming MQTT messages are normalized and emitted as `sensor_update`.
- Only payloads with `roomId == "room101"` are persisted.
- Reports/History endpoints always return Room 101 data.

To reset the DB (dev): stop the backend and delete `backend/campus_twin.db`.

## Backend API

Base URL: `http://127.0.0.1:5000`

### Health

`GET /api/health`

Returns basic service health used by the System Status page.

### History / Reports (Room 101)

`GET /api/history?room_id=room101&limit=50`

Response shape:

```json
{
	"items": [
		{
			"id": 123,
			"roomId": "room101",
			"temperature": 28.2,
			"humidity": 44,
			"occupancy": 1,
			"lighting": 1,
			"energy": 1600.5,
			"current": 7.3,
			"timestamp": "2026-06-01 00:00:00",
			"receivedAt": 1780255000000
		}
	],
	"total": 1234
}
```

### Alerts

`GET /api/alerts`

Query params:

- `roomId` (optional)
- `since` (optional, ms timestamp)
- `limit` (optional)

## WebSocket Events (Socket.IO)

The backend broadcasts:

- `sensor_update` — sensor payloads (frontend uses **Room 101** for live telemetry)
- `alert` — anomaly alerts (frontend ignores Room 101 alerts on the socket and fetches those via REST)

## MQTT Input (Room 101)

Backend MQTT settings (see `backend/.env`):

- `MQTT_BROKER` (default: `localhost`)
- `MQTT_PORT` (default: `1883`)
- `MQTT_TOPICS` (comma-separated, default: `campus/room1/sensors`)

Payload notes:

- The backend accepts common aliases (`temp`, `hum`, `motion`, `light`, `power`) and emits a canonical schema.
- The frontend treats Room 101 as “real/live” only when the canonical fields are present.

## Troubleshooting

- **Reports page shows “Request failed (404)”**
	- Ensure you are running the updated backend (`python .\backend\run.py`).
	- Verify `GET http://127.0.0.1:5000/api/history?room_id=room101&limit=1` returns JSON.

- **Database shows Offline in System Status**
	- Ensure `GET /api/health` is reachable.
	- Ensure the backend process has permission to create/write `backend/campus_twin.db`.

- **Room 101 shows “No Signal” / Reports are empty**
	- The DB only stores Room 101 readings. If no Room 101 MQTT messages arrive, history will be empty.
	- Confirm the MQTT broker is running and that Room 101 messages are publishing to the subscribed topic.

## Development

Frontend:

```powershell
npm --prefix .\frontend run lint
npm --prefix .\frontend run build
```

Backend:

```powershell
python -m pip install -r .\backend\requirements.txt
```
