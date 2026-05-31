from app import socketio

import threading
import time
import uuid
from typing import Optional, List, Dict

_ALERTS_LOCK = threading.Lock()
_ALERTS = []  # newest last
_MAX_ALERTS = 500


def _now_ms() -> int:
    return int(time.time() * 1000)


def record_alert(alert: Dict) -> Dict:
    """Record an alert and ensure it has `id` + `receivedAt` fields."""
    if "id" not in alert:
        alert["id"] = str(uuid.uuid4())
    if "receivedAt" not in alert:
        alert["receivedAt"] = _now_ms()

    with _ALERTS_LOCK:
        _ALERTS.append(alert)
        if len(_ALERTS) > _MAX_ALERTS:
            del _ALERTS[: len(_ALERTS) - _MAX_ALERTS]

    return alert


def get_alerts(room_id: Optional[str] = None, since: Optional[int] = None, limit: int = 200) -> List[Dict]:
    """Get alerts, optionally filtered by room and since-timestamp (ms)."""
    with _ALERTS_LOCK:
        items = list(_ALERTS)

    if room_id:
        items = [a for a in items if a.get("roomId") == room_id]
    if since is not None:
        try:
            since_i = int(since)
        except Exception:
            since_i = None
        if since_i is not None:
            items = [a for a in items if int(a.get("receivedAt", 0)) > since_i]

    return items[-max(1, min(int(limit), 500)) :]

def check_anomalies(data):
    alerts = []

    # Room 101 alerts must be based on real ESP32 payloads (avoid backend simulation noise).
    if data.get("roomId") == "room101":
        required = {"current", "timestamp"}
        if not required.issubset(set(data.keys())):
            return []

    room_name = data.get("roomName", "Unknown")
    temp = data.get("temperature", 0)
    hum = data.get("humidity", 0)
    occupancy = data.get("occupancy", 0)
    lighting = data.get("lighting", 0)
    energy = data.get("energy", 0)

    # Rule 1: High temperature in empty room
    if temp > 32 and occupancy == 0:
        alerts.append({
            "severity": "critical",
            "message": f"High temperature ({temp}°C) in empty {room_name} — possible AC failure or fire risk!",
            "roomId": data["roomId"]
        })

    # Rule 2: Lights on in empty room (energy waste)
    if lighting == 1 and occupancy == 0:
        alerts.append({
            "severity": "warning",
            "message": f"Lights left ON in empty {room_name} — energy waste detected",
            "roomId": data["roomId"]
        })

    # Rule 3: Very high energy usage
    if energy > 400:
        alerts.append({
            "severity": "warning",
            "message": f"High energy consumption ({energy}W) in {room_name} — check appliances",
            "roomId": data["roomId"]
        })

    # Rule 4: Extreme humidity
    if hum > 85 or hum < 30:
        alerts.append({
            "severity": "warning",
            "message": f"Extreme humidity ({hum}%) in {room_name} — comfort & mold risk",
            "roomId": data["roomId"]
        })

    # Send alerts if any
    for alert in alerts:
        record_alert(alert)
        print(f"ALERT: {alert['severity'].upper()} - {alert['message']}")
        socketio.emit('alert', alert)

    return alerts