import os
import sqlite3
import threading
from typing import Any, Dict, List, Optional

_DB_LOCK = threading.Lock()


def _db_path() -> str:
    # Default: backend/campus_twin.db
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    return os.getenv("SQLITE_PATH", os.path.join(backend_dir, "campus_twin.db"))


def init_db() -> None:
    path = _db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with _DB_LOCK:
        conn = sqlite3.connect(path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sensor_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roomId TEXT,
                    temperature REAL,
                    humidity REAL,
                    occupancy INTEGER,
                    lighting INTEGER,
                    energy REAL,
                    current REAL,
                    timestamp TEXT,
                    receivedAt INTEGER
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sensor_readings_room_ts ON sensor_readings(roomId, receivedAt)"
            )
            conn.commit()
        finally:
            conn.close()


def insert_reading(payload: Dict[str, Any], received_at_ms: Optional[int] = None) -> None:
    init_db()
    path = _db_path()

    # Only persist the live room (Room 101).
    # This keeps the database focused on real telemetry and avoids storing
    # simulated room data.
    if payload.get("roomId") != "room101":
        return

    if received_at_ms is None:
        try:
            received_at_ms = int(__import__("time").time() * 1000)
        except Exception:
            received_at_ms = None

    with _DB_LOCK:
        conn = sqlite3.connect(path)
        try:
            conn.execute(
                """
                INSERT INTO sensor_readings (
                    roomId, temperature, humidity, occupancy, lighting, energy, current, timestamp, receivedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.get("roomId"),
                    payload.get("temperature"),
                    payload.get("humidity"),
                    payload.get("occupancy"),
                    payload.get("lighting"),
                    payload.get("energy"),
                    payload.get("current"),
                    payload.get("timestamp"),
                    received_at_ms,
                ),
            )
            conn.commit()
        finally:
            conn.close()


def count_readings(room_id: Optional[str] = None) -> int:
    init_db()
    path = _db_path()

    where = []
    params: List[Any] = []
    if room_id:
        where.append("roomId = ?")
        params.append(room_id)

    sql = "SELECT COUNT(*) FROM sensor_readings"
    if where:
        sql += " WHERE " + " AND ".join(where)

    with _DB_LOCK:
        conn = sqlite3.connect(path)
        try:
            row = conn.execute(sql, params).fetchone()
            return int(row[0] if row else 0)
        finally:
            conn.close()


def get_readings(
    room_id: Optional[str] = None,
    limit: Optional[int] = None,
    since_ms: Optional[int] = None,
) -> List[Dict[str, Any]]:
    init_db()
    path = _db_path()

    where = []
    params: List[Any] = []
    if room_id:
        where.append("roomId = ?")
        params.append(room_id)
    if since_ms is not None:
        where.append("receivedAt > ?")
        params.append(int(since_ms))

    sql = (
        "SELECT id, roomId, temperature, humidity, occupancy, lighting, energy, current, timestamp, receivedAt "
        "FROM sensor_readings"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY receivedAt DESC"

    if limit is not None:
        try:
            limit_i = int(limit)
        except Exception:
            limit_i = None
        if limit_i is not None and limit_i > 0:
            sql += " LIMIT ?"
            params.append(limit_i)

    columns = [
        "id",
        "roomId",
        "temperature",
        "humidity",
        "occupancy",
        "lighting",
        "energy",
        "current",
        "timestamp",
        "receivedAt",
    ]

    with _DB_LOCK:
        conn = sqlite3.connect(path)
        try:
            rows = conn.execute(sql, params).fetchall()
            return [dict(zip(columns, row)) for row in rows]
        finally:
            conn.close()
