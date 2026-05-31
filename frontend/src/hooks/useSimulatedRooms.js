import { useEffect, useRef, useState } from "react";

const SIMULATED_ROOMS = [
  { id: "room102", name: "Room 102" },
  { id: "room103", name: "Room 103" },
  { id: "library", name: "Library" },
];

function randomFloat(min, max, decimals = 1) {
  const value = min + Math.random() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function isDaytime(date) {
  const hour = date.getHours();
  return hour >= 8 && hour < 18;
}

function buildAlertRules(data) {
  const alerts = [];
  const motion = data.occupancy ? 1 : 0;
  const light = data.lighting ? 1 : 0;
  const power = Number(data.energy ?? 0);
  const temp = Number(data.temperature ?? 0);

  if (temp > 32 && motion === 0) {
    alerts.push({
      severity: "critical",
      roomId: data.roomId,
      message: `High temperature (${temp}°C) with no motion — possible AC failure`,
    });
  }

  if (light === 1 && motion === 0) {
    alerts.push({
      severity: "warning",
      roomId: data.roomId,
      message: `Lights are ON with no motion — energy waste detected`,
    });
  }

  if (power > 500 && motion === 0) {
    alerts.push({
      severity: "warning",
      roomId: data.roomId,
      message: `High power usage (${power}W) with no motion — check appliances`,
    });
  }

  return alerts;
}

function generateSimulatedReading(roomId, roomName, now = new Date()) {
  if (roomId === "room102") {
    const motionChance = isDaytime(now) ? 0.7 : 0.1;
    const occupied = Math.random() < motionChance;

    return {
      roomId,
      roomName,
      temperature: randomFloat(24, 29),
      humidity: randomFloat(40, 55),
      occupancy: occupied ? 1 : 0,
      lighting: occupied ? 1 : 0,
      energy: occupied ? randomInt(800, 1200) : randomInt(50, 100),
    };
  }

  if (roomId === "room103") {
    const occupied = Math.random() < 0.5;

    return {
      roomId,
      roomName,
      temperature: randomFloat(22, 27),
      humidity: randomFloat(35, 50),
      occupancy: occupied ? 1 : 0,
      lighting: occupied ? 1 : 0,
      energy: occupied ? randomInt(1500, 2500) : randomInt(100, 200),
    };
  }

  // Library
  const occupied = Math.random() < 0.6;
  const lighting = isDaytime(now) ? 1 : 0;

  return {
    roomId,
    roomName,
    temperature: randomFloat(20, 25),
    humidity: randomFloat(45, 60),
    occupancy: occupied ? 1 : 0,
    lighting,
    energy: occupied ? randomInt(500, 800) : 200,
  };
}

export default function useSimulatedRooms({ onAlerts } = {}) {
  const onAlertsRef = useRef(onAlerts);

  useEffect(() => {
    onAlertsRef.current = onAlerts;
  }, [onAlerts]);

  const [simulatedRoomData, setSimulatedRoomData] = useState(() => {
    const initial = {};
    for (const room of SIMULATED_ROOMS) {
      initial[room.id] = { latest: {}, history: [] };
    }
    return initial;
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextAlerts = [];

      setSimulatedRoomData((prev) => {
        const next = { ...prev };

        for (const room of SIMULATED_ROOMS) {
          const reading = generateSimulatedReading(room.id, room.name, now);
          const prevRoom = prev[room.id] || { latest: {}, history: [] };

          const { roomId: _roomId, ...latest } = reading;

          const historyEntry = {
            time: now.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            temperature: reading.temperature,
            humidity: reading.humidity,
            energy: reading.energy,
          };

          next[room.id] = {
            latest,
            history: [...prevRoom.history.slice(-19), historyEntry],
          };

          nextAlerts.push(...buildAlertRules(reading));
        }

        return next;
      });

      if (typeof onAlertsRef.current === "function" && nextAlerts.length > 0) {
        onAlertsRef.current(nextAlerts);
      }
    };

    tick();
    const intervalId = setInterval(tick, 15000);
    return () => clearInterval(intervalId);
  }, []);

  return { simulatedRoomData };
}
