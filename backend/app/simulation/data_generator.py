import time
import random
import json
import threading
import requests
from datetime import datetime, timezone, timedelta

_simulation_stop_event = threading.Event()
_simulation_thread: threading.Thread | None = None

# Timezone for Pakistan (PKT = UTC+5)
PKT_OFFSET = timedelta(hours=5)

# Open-Meteo API coordinates for Hazro City (approx lat/long)
HAZRO_LAT = 33.909
HAZRO_LON = 72.466

# List of rooms – now with base_occupancy restored
ROOMS = [
    {"id": "room101", "name": "Room 101", "base_temp": 25, "temp_variation": 5, "base_occupancy": 0.75, "temp_offset": 0.5, "hum_offset": 2},
    {"id": "room102", "name": "Room 102", "base_temp": 24, "temp_variation": 4, "base_occupancy": 0.70, "temp_offset": -0.3, "hum_offset": -1},
    {"id": "library", "name": "Library", "base_temp": 22, "temp_variation": 3, "base_occupancy": 0.45, "temp_offset": -1.0, "hum_offset": 3},
    {"id": "canteen", "name": "Canteen", "base_temp": 28, "temp_variation": 6, "base_occupancy": 0.85, "temp_offset": 1.2, "hum_offset": -4},
]

# Global weather cache (fetch real data every ~15 minutes)
real_weather_cache = {"temperature": 25.0, "humidity": 60.0, "last_fetch": 0}

def fetch_real_weather():
    """Get current temperature and humidity from Open-Meteo API"""
    global real_weather_cache
    now = time.time()
    
    # Cache for 15 minutes (900 seconds) to avoid over-fetching
    if now - real_weather_cache["last_fetch"] < 900:
        return real_weather_cache["temperature"], real_weather_cache["humidity"]

    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={HAZRO_LAT}&longitude={HAZRO_LON}"
            f"&current=temperature_2m,relative_humidity_2m"
            f"&timezone=Asia/Karachi"
        )
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()

        temp = data["current"]["temperature_2m"]
        hum = data["current"]["relative_humidity_2m"]

        real_weather_cache["temperature"] = temp
        real_weather_cache["humidity"] = hum
        real_weather_cache["last_fetch"] = now

        print(f"Real weather fetched: {temp}°C, {hum}%")
        return temp, hum

    except Exception as e:
        print(f"Weather API error: {e} → using fallback values")
        return real_weather_cache["temperature"], real_weather_cache["humidity"]

def get_weather_type(temp, hum):
    """Simple weather classification based on temp & humidity"""
    if temp > 32:
        return "hot"
    if temp < 18:
        return "cool"
    if hum > 80:
        return "rainy"
    if hum < 40:
        return "sunny"
    return "cloudy"

def get_current_pkt_time():
    now_utc = datetime.now(timezone.utc)
    return now_utc + PKT_OFFSET

def get_day_multiplier(day_of_week):
    if day_of_week in [0, 1, 2, 3, 4]:  # Mon–Fri
        return random.uniform(0.9, 1.0)
    elif day_of_week == 5:             # Sat
        return random.uniform(0.5, 0.8)
    else:                              # Sun
        return random.uniform(0.1, 0.3)

def get_hour_multiplier(hour):
    if 8 <= hour < 12:
        return random.uniform(0.8, 1.0)
    elif 12 <= hour < 14:
        return random.uniform(0.6, 0.9)
    elif 14 <= hour < 18:
        return random.uniform(0.4, 0.7)
    else:
        return random.uniform(0.0, 0.2)

def simulate_room_data(room):
    update_weather_if_needed()  # Check if weather should change

    pkt_time = get_current_pkt_time()
    day_of_week = pkt_time.weekday()
    hour = pkt_time.hour

    day_mult = get_day_multiplier(day_of_week)
    hour_mult = get_hour_multiplier(hour)

    # Occupancy
    occupancy_prob = room["base_occupancy"] * day_mult * hour_mult
    occupancy_prob = min(max(occupancy_prob + random.uniform(-0.1, 0.1), 0.0), 1.0)
    occupancy = 1 if random.random() < occupancy_prob else 0

    # Fetch real weather
    real_temp, real_hum = fetch_real_weather()

    # Temperature: real base + room offset + small random
    temp = round(real_temp + room["temp_offset"] + random.uniform(-2, 2), 1)

    # Humidity: real base + room offset + occupancy effect
    hum = round(real_hum + room["hum_offset"] + (8 if occupancy else 0), 1)

    # Lighting
    lighting_prob = 0.6 if occupancy else 0.2
    lighting_prob += 0.3 if 8 <= hour < 18 else 0
    lighting = 1 if random.random() < lighting_prob else 0

    # Energy
    energy = round(
        200 +
        random.uniform(-60, 80) +
        (80 if occupancy else 0) +
        (40 if lighting else 0) +
        (20 if 8 <= hour < 18 else 0) +
        (30 if real_temp > 32 else 0),  # extra for hot weather
        1
    )

    weather_type = get_weather_type(real_temp, real_hum)

    return {
        "roomId": room["id"],
        "roomName": room["name"],
        "temperature": temp,
        "humidity": hum,
        "occupancy": occupancy,
        "lighting": lighting,
        "energy": energy,
        "weather": weather_type,
        "pktHour": hour,
        "pktDayOfWeek": day_of_week,
    }

def update_weather_if_needed():
    global current_weather, weather_change_time
    now = time.time()
    if now > weather_change_time:
        # Pick new weather based on weighted probability
        total_prob = sum(w["prob"] for w in WEATHER_TYPES)
        rand = random.uniform(0, total_prob)
        cumulative = 0
        for w in WEATHER_TYPES:
            cumulative += w["prob"]
            if rand <= cumulative:
                current_weather = w
                break
        weather_change_time = now + random.randint(1800, 3600)
        print(f"Weather changed to: {current_weather['type']}")

# Weather types for classification fallback (used only if needed)
WEATHER_TYPES = [
    {"type": "sunny", "temp_mod": 5, "hum_mod": -10, "prob": 0.35},
    {"type": "cloudy", "temp_mod": 0, "hum_mod": 5, "prob": 0.25},
    {"type": "rainy", "temp_mod": -4, "hum_mod": 20, "prob": 0.20},
    {"type": "hot", "temp_mod": 8, "hum_mod": -15, "prob": 0.10},
    {"type": "cool", "temp_mod": -6, "hum_mod": 5, "prob": 0.10},
]

# Global weather state
current_weather = {"type": "sunny", "temp_mod": 5, "hum_mod": -10}
weather_change_time = time.time() + random.randint(1800, 3600)

def simulate_and_broadcast():
    from app import socketio
    from app.services.alert_service import check_anomalies

    for room in ROOMS:
        if room.get("id") == "room101":
            continue
        data = simulate_room_data(room)
        
        # Check for anomalies and emit alert if any
        check_anomalies(data)
        
        # Emit sensor update for this room
        socketio.emit('sensor_update', data)
        
        # Log what was sent
        print(f"Simulated for {room['name']} ({room['id']}): {json.dumps(data)}")

def start_simulation():
    """Start the background simulation loop once.

    The simulation is stoppable via `stop_simulation()` to avoid daemon-thread
    shutdown crashes (e.g. stdout lock errors at interpreter finalization).
    """

    global _simulation_thread

    if _simulation_thread is not None and _simulation_thread.is_alive():
        return

    _simulation_stop_event.clear()

    def loop():
        print("Multi-room time+day+real-weather API simulation thread started")
        while not _simulation_stop_event.is_set():
            try:
                simulate_and_broadcast()
            except Exception as e:
                # Keep the simulation alive even if a single cycle fails.
                print(f"Simulation loop error: {e}")

            # Wait up to 5s, but exit quickly when asked to stop.
            _simulation_stop_event.wait(5)

        print("Multi-room simulation thread stopping")

    _simulation_thread = threading.Thread(target=loop, daemon=False)
    _simulation_thread.start()
    print("Multi-room time+day+real-weather API simulation launched (runs in background)")


def stop_simulation(timeout_seconds: float = 5.0) -> None:
    """Request the simulation to stop and wait briefly for it to exit."""

    global _simulation_thread

    _simulation_stop_event.set()
    thread = _simulation_thread
    if thread is None:
        return

    if thread.is_alive():
        thread.join(timeout=timeout_seconds)

    if not thread.is_alive():
        _simulation_thread = None