from flask import Flask, jsonify, request
from flask_socketio import SocketIO
from flask_cors import CORS
from dotenv import load_dotenv
import os
import json
import time
from datetime import datetime, timezone

# Load environment variables
load_dotenv()

# Global SocketIO instance
# Explicitly allow common Vite dev ports.
_FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]
socketio = SocketIO(cors_allowed_origins=_FRONTEND_ORIGINS)

_STARTED_AT_MS = int(time.time() * 1000)

_MQTT_STATE = {
    "online": None,
    "broker": None,
    "port": None,
    "topics": None,
    "lastConnectAt": None,
    "lastError": None,
    "lastRc": None,
}

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-me')

    # Enable CORS so frontend (different port) can connect
    CORS(app, origins=_FRONTEND_ORIGINS)

    # Initialize SocketIO with the app
    socketio.init_app(app)

    # Ensure SQLite file + tables exist even before first reading arrives.
    try:
        from app.utils.sqlite_store import init_db

        init_db()
    except Exception as e:
        # Do not fail app startup due to DB init; health endpoint will surface it.
        print(f"SQLite init error: {e}")

    @socketio.on("connect")
    def _on_socket_connect():
        try:
            origin = request.headers.get("Origin")
        except Exception:
            origin = None
        print(
            f"SocketIO client connected sid={getattr(request, 'sid', None)} origin={origin} ip={getattr(request, 'remote_addr', None)}"
        )

    @socketio.on("disconnect")
    def _on_socket_disconnect():
        print(
            f"SocketIO client disconnected sid={getattr(request, 'sid', None)} ip={getattr(request, 'remote_addr', None)}"
        )

    # Simple test route
    @app.route('/')
    def index():
        return "Backend is running! Connect via SocketIO."

    @app.get('/api/alerts')
    def api_alerts():
        """Return recent alerts.

        Query params:
        - roomId: optional room filter (e.g. room101)
        - since: optional ms timestamp to fetch only newer alerts
        - limit: optional max items (default 200)
        """
        from app.services.alert_service import get_alerts

        room_id = request.args.get('roomId')
        since = request.args.get('since')
        limit = request.args.get('limit', 200)

        try:
            since_i = int(since) if since is not None else None
        except Exception:
            since_i = None

        try:
            limit_i = int(limit)
        except Exception:
            limit_i = 200

        return jsonify(get_alerts(room_id=room_id, since=since_i, limit=limit_i))

    @app.get("/api/history")
    def api_history():
        """Return stored sensor readings (Room 101 only).

        Query params:
        - room_id: room id filter (defaults to room101)
        - limit: max rows
        - since: optional ms timestamp, returns rows with receivedAt > since
        """

        from app.utils.sqlite_store import count_readings, get_readings

        room_id = request.args.get("room_id") or request.args.get("roomId") or "room101"
        limit = request.args.get("limit")
        since = request.args.get("since")

        # This project only persists the live room.
        if room_id != "room101":
            resp = jsonify({"items": [], "total": 0})
            resp.headers["X-Total-Count"] = "0"
            return resp

        try:
            limit_i = int(limit) if limit is not None else None
        except Exception:
            limit_i = None

        try:
            since_i = int(since) if since is not None else None
        except Exception:
            since_i = None

        total = count_readings(room_id=room_id)
        items = get_readings(room_id=room_id, limit=limit_i, since_ms=since_i)

        resp = jsonify({"items": items, "total": total})
        resp.headers["X-Total-Count"] = str(total)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/api/health")
    def api_health():
        """Basic health information for the System Status page."""

        now_ms = int(time.time() * 1000)

        # Database health
        db = {"online": False}
        try:
            from app.utils.sqlite_store import init_db
            from app.utils.sqlite_store import _db_path as _sqlite_db_path

            init_db()
            db = {"online": True, "path": _sqlite_db_path()}
        except Exception as e:
            db = {"online": False, "error": str(e)}

        started_at_iso = (
            datetime.fromtimestamp(_STARTED_AT_MS / 1000, tz=timezone.utc)
            .astimezone()
            .isoformat(timespec="seconds")
        )

        payload = {
            "ok": True,
            "startedAt": started_at_iso,
            "uptimeMs": max(0, now_ms - _STARTED_AT_MS),
            "mqtt": dict(_MQTT_STATE),
            "database": db,
        }

        return jsonify(payload)

    # ────────────────────────────────────────────────
    # MQTT Subscriber (only active if using real MQTT broker)
    # ────────────────────────────────────────────────
    try:
        import paho.mqtt.client as mqtt
        from app.simulation.data_generator import ROOMS

        rooms_by_id = {r["id"]: r.get("name", r["id"]) for r in ROOMS}

        def _map_room_id(raw_room: str | None) -> str | None:
            if not raw_room:
                return None
            room = str(raw_room).strip()
            if not room:
                return None

            # Common patterns: room101, Room 101, room1, room01
            lowered = room.lower().replace(" ", "")
            if lowered in {"room101", "room102", "room103", "library", "canteen"}:
                return lowered

            if lowered.startswith("room"):
                suffix = lowered.replace("room", "", 1)
                if suffix.isdigit():
                    num = int(suffix)
                    # Handle short forms: room1 -> room101, room2 -> room102, room3 -> room103
                    if num in (1, 2, 3):
                        return f"room10{num}"
                    # Handle full forms: room101 -> room101
                    if num in (101, 102, 103):
                        return f"room{num}"
            return lowered

        def _extract_room_id_from_topic(topic: str | None) -> str | None:
            if not topic:
                return None
            parts = str(topic).split("/")
            # Expected: campus/<roomId>/sensors
            if len(parts) >= 3 and parts[-1] == "sensors":
                return _map_room_id(parts[-2])
            return None

        def _to_float(v):
            try:
                return float(v)
            except Exception:
                return None

        def _to_int(v):
            try:
                return int(v)
            except Exception:
                return None

        def _is_frontend_expected_schema(raw: dict) -> bool:
            # If ESP32 already sends exactly the schema the frontend expects,
            # we must not transform or rename anything.
            if not isinstance(raw, dict):
                return False

            required = {
                "roomId",
                "temperature",
                "humidity",
                "occupancy",
                "lighting",
                "current",
                "power",
                "energy",
                "timestamp",
            }
            return required.issubset(set(raw.keys()))

        def _to_frontend_emit_payload(raw: dict, mqtt_topic: str | None = None) -> dict:
            """Return the exact payload shape the frontend expects for `sensor_update`."""
            # Prefer explicit roomId; fall back to other fields/topic.
            room_id = raw.get("roomId") or raw.get("room") or raw.get("room_id")
            room_id = _map_room_id(room_id) or _extract_room_id_from_topic(mqtt_topic)

            def _pick(key):
                return raw.get(key)

            # Accept common aliases but always emit the canonical field name.
            temperature = raw.get("temperature", raw.get("temp"))
            humidity = raw.get("humidity", raw.get("hum"))
            occupancy = raw.get("occupancy", raw.get("motion"))
            lighting = raw.get("lighting", raw.get("light"))
            current = _pick("current")
            energy = raw.get("energy", raw.get("power"))
            timestamp = _pick("timestamp")

            return {
                "roomId": room_id,
                "temperature": temperature,
                "humidity": humidity,
                "occupancy": occupancy,
                "lighting": lighting,
                "energy": energy,
                "current": current if current is not None else 0.0,
                "timestamp": timestamp if timestamp is not None else "2024-01-01 00:00:00",
            }

        def normalize_sensor_payload(raw: dict, mqtt_topic: str | None = None) -> dict:
            room_id = raw.get("roomId") or raw.get("room") or raw.get("room_id")
            room_id = _map_room_id(room_id) or _extract_room_id_from_topic(mqtt_topic)

            temperature = raw.get("temperature")
            if temperature is None:
                temperature = raw.get("temp")

            humidity = raw.get("humidity")
            if humidity is None:
                humidity = raw.get("hum")

            occupancy = raw.get("occupancy")
            if occupancy is None:
                occupancy = raw.get("motion")

            lighting = raw.get("lighting")
            if lighting is None:
                lighting = raw.get("light")

            energy = raw.get("energy")
            if energy is None:
                energy = raw.get("power")

            # Fall back to estimating watts from current (A) if only current is provided.
            # Assumes ~230V mains.
            if energy is None and raw.get("current") is not None:
                current = _to_float(raw.get("current"))
                if current is not None:
                    energy = current * 230

            temp_f = _to_float(temperature)
            hum_f = _to_float(humidity)
            occ_i = _to_int(occupancy)
            light_i = _to_int(lighting)
            energy_f = _to_float(energy)

            normalized = {
                "roomId": room_id,
                "roomName": rooms_by_id.get(room_id, room_id or "Unknown"),
                "temperature": temp_f,
                "humidity": hum_f,
                "occupancy": occ_i,
                "lighting": light_i,
                "energy": energy_f,
            }

            # Keep any extra fields (but don't let them override normalized keys).
            for k, v in raw.items():
                if k not in normalized:
                    normalized[k] = v

            return normalized

        broker = os.getenv('MQTT_BROKER', 'localhost')
        port = int(os.getenv('MQTT_PORT', 1883))

        topics_env = os.getenv("MQTT_TOPICS", "").strip()
        topics = (
            [t.strip() for t in topics_env.split(",") if t.strip()]
            if topics_env
            else ["campus/room1/sensors"]
        )

        def on_connect(client, userdata, flags, rc):
            print(f"MQTT Connected with result code {rc}")
            _MQTT_STATE["lastRc"] = rc
            _MQTT_STATE["online"] = True if rc == 0 else False
            _MQTT_STATE["lastConnectAt"] = int(time.time() * 1000)
            for t in topics:
                client.subscribe(t)
                print(f"MQTT subscribed: {t}")

        def on_message(client, userdata, msg):
            try:
                data = json.loads(msg.payload.decode())
                print(f"Received MQTT message: {data}")

                # Always emit the exact field set expected by the frontend.
                # This keeps canonical names while dropping extra MQTT-only fields.
                outgoing = _to_frontend_emit_payload(
                    data, mqtt_topic=getattr(msg, "topic", None)
                )

                print(f"Emitting sensor_update: {outgoing}")

                # Persist to SQLite for history/audit.
                try:
                    from app.utils.sqlite_store import insert_reading

                    insert_reading(outgoing)
                except Exception as db_err:
                    print(f"SQLite write error: {db_err}")

                # Generate alerts on real incoming data (does not modify outgoing payload).
                try:
                    from app.services.alert_service import check_anomalies

                    alert_input = dict(outgoing)
                    if (
                        "roomName" not in alert_input
                        and alert_input.get("roomId") in rooms_by_id
                    ):
                        alert_input["roomName"] = rooms_by_id[alert_input["roomId"]]

                    check_anomalies(alert_input)
                except Exception as alert_err:
                    print(f"Alert processing error: {alert_err}")

                socketio.emit('sensor_update', outgoing)  # Broadcast to all connected clients
            except Exception as e:
                print(f"Error processing MQTT message: {e}")

        # Create and configure MQTT client
        mqtt_client = mqtt.Client()
        mqtt_client.on_connect = on_connect
        mqtt_client.on_message = on_message

        # Connect and start loop in background
        _MQTT_STATE["broker"] = broker
        _MQTT_STATE["port"] = port
        _MQTT_STATE["topics"] = topics
        mqtt_client.connect(broker, port, 60)
        mqtt_client.loop_start()

        print(f"MQTT subscriber started for broker: {broker}:{port}")

    except ImportError:
        print("paho-mqtt not installed or disabled → skipping MQTT subscriber")
        _MQTT_STATE["online"] = False
        _MQTT_STATE["lastError"] = "paho-mqtt not installed"
    except Exception as e:
        print(f"Could not start MQTT subscriber: {e} (continuing without MQTT)")
        _MQTT_STATE["online"] = False
        _MQTT_STATE["lastError"] = str(e)

    return app