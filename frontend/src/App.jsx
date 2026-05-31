import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { io } from "socket.io-client";
import "./App.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  CircularProgress,
  Alert,
  Badge,
  Button,
  IconButton,
  Tooltip as MuiTooltip,
  CssBaseline,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import {
  Thermostat,
  WaterDrop,
  People,
  Lightbulb,
  Bolt,
  Warning,
  Brightness4,
  Brightness7,
  Notifications,
  MeetingRoom,
  Home,
  Info,
  ShowChart,
  Description,
} from "@mui/icons-material";
import { ThemeProvider, createTheme, alpha } from "@mui/material/styles";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";

import useSimulatedRooms from "./hooks/useSimulatedRooms";
import AlertsPage from "./pages/AlertsPage";
import AboutPage from "./pages/AboutPage";
import StatusPage from "./pages/StatusPage";
import ReportsPage from "./pages/ReportsPage";
import CalculatorPage from "./pages/CalculatorPage";

// Use default transports (polling + websocket upgrade) for maximum compatibility
// with Flask-SocketIO dev server setups.
const socket = io("http://localhost:5000", {
  forceNew: true,
});

// List of available rooms and their MQTT topics
const ROOMS = [
  { id: "room101", name: "Room 101", topic: "campus/room101/sensors" },
  { id: "room102", name: "Room 102", topic: "campus/room102/sensors" },
  { id: "room103", name: "Room 103", topic: "campus/room103/sensors" },
  { id: "library", name: "Library", topic: "campus/library/sensors" },
];

const ROOM_KIND = {
  room101: "live",
  room102: "simulated",
  room103: "simulated",
  library: "simulated",
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Selected room
  const [selectedRoomId, setSelectedRoomId] = useState(ROOMS[0].id);

  // Data & history per room
  const [roomData, setRoomData] = useState({}); // { roomId: { latest: {}, history: [] } }
  const [lastUpdate, setLastUpdate] = useState(null);

  // Connection indicator state
  const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
  const isSocketConnectedRef = useRef(socket.connected);
  const lastSensorUpdateAtRef = useRef(null);
  const [isLiveData, setIsLiveData] = useState(false);

  // Alerts state
  const [alerts, setAlerts] = useState([]);
  const [acknowledgedById, setAcknowledgedById] = useState({});

  const roomsById = useMemo(() => {
    const map = {};
    for (const r of ROOMS) map[r.id] = r.name;
    return map;
  }, []);

  const normalizeAlerts = useCallback((incoming) => {
    const list = Array.isArray(incoming) ? incoming : [incoming];

    const makeId = () => {
      try {
        return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      } catch {
        return `${Date.now()}-${Math.random()}`;
      }
    };

    return list.map((a) => ({
      id: a.id ?? makeId(),
      receivedAt: a.receivedAt ?? Date.now(),
      severity: a.severity,
      roomId: a.roomId,
      message: a.message,
    }));
  }, []);

  const addAlerts = useCallback(
    (incoming) => {
      const normalized = normalizeAlerts(incoming);
      setAlerts((prev) => [...prev, ...normalized]);
    },
    [normalizeAlerts]
  );

  const { simulatedRoomData } = useSimulatedRooms({
    onAlerts: (newAlerts) => {
      // Simulated rooms only (never generate frontend alerts for room101).
      const list = Array.isArray(newAlerts) ? newAlerts : [newAlerts];
      addAlerts(list.filter((a) => a?.roomId && a.roomId !== "room101"));
    },
  });

  const ROOM101_REQUIRED_FIELDS = useMemo(
    () => [
      "roomId",
      "temperature",
      "humidity",
      "occupancy",
      "lighting",
      "energy",
      "current",
      "timestamp",
    ],
    []
  );

  const isRoom101RealPayload = useCallback(
    (payload) => {
      if (!payload || typeof payload !== "object") return false;
      if (payload.roomId !== "room101") return false;
      return (
        payload.temperature !== undefined &&
        payload.humidity !== undefined &&
        payload.occupancy !== undefined &&
        payload.lighting !== undefined &&
        payload.energy !== undefined &&
        payload.current !== undefined &&
        payload.timestamp !== undefined
      );
    },
    []
  );

  // Dark mode state
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("themeMode");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const toggleColorMode = () => {
    setMode((prevMode) => {
      const newMode = prevMode === "light" ? "dark" : "light";
      localStorage.setItem("themeMode", newMode);
      return newMode;
    });
  };

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#4F8EF7" },
          background:
            mode === "dark"
              ? { default: "#0F1117", paper: "#1E2130" }
              : { default: "#ECF0F1", paper: "#FFFFFF" },
          divider: mode === "dark" ? "#2A2D3E" : "#E5E7EB",
          text:
            mode === "dark"
              ? { primary: "#FFFFFF", secondary: "#8B8FA8" }
              : { primary: "#111827", secondary: "#4B5563" },
          success: { main: "#00C48C" },
          warning: { main: "#FFB800" },
          error: { main: "#FF4757" },
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                boxShadow: "none",
              },
            },
          },
        },
      }),
    [mode]
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      const last = lastSensorUpdateAtRef.current;
      const hasRecentUpdate = last != null && Date.now() - last < 30000;
      setIsLiveData(isSocketConnectedRef.current && hasRecentUpdate);
    }, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const connectionStatusText = isLiveData ? "Live Data ●" : "No Signal ●";

  const unacknowledgedCount = useMemo(
    () => alerts.filter((a) => !acknowledgedById[a.id]).length,
    [alerts, acknowledgedById]
  );

  const lastRoom101AlertAtRef = useRef(0);

  useEffect(() => {
    // Room 101 alerts must be sourced from backend REST endpoint.
    let isCancelled = false;
    const controller = new AbortController();

    const fetchRoom101Alerts = async () => {
      try {
        const since = lastRoom101AlertAtRef.current || 0;
        const url = `http://localhost:5000/api/alerts?roomId=room101&since=${encodeURIComponent(
          since
        )}&limit=200`;

        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;

        const data = await res.json();
        if (isCancelled) return;

        if (Array.isArray(data) && data.length > 0) {
          addAlerts(data);
          const maxReceivedAt = data.reduce(
            (max, a) => Math.max(max, Number(a?.receivedAt ?? 0) || 0),
            since
          );
          lastRoom101AlertAtRef.current = maxReceivedAt;
        }
      } catch {
        // ignore network errors (backend may be down)
      }
    };

    fetchRoom101Alerts();
    const intervalId = setInterval(fetchRoom101Alerts, 5000);

    return () => {
      isCancelled = true;
      controller.abort();
      clearInterval(intervalId);
    };
  }, [addAlerts]);

  useEffect(() => {
    const handleConnect = () => {
      isSocketConnectedRef.current = true;
      setIsSocketConnected(true);
    };
    const handleDisconnect = () => {
      isSocketConnectedRef.current = false;
      setIsSocketConnected(false);
      setIsLiveData(false);
    };
    const handleConnectError = (err) => {
      isSocketConnectedRef.current = false;
      setIsSocketConnected(false);
      setIsLiveData(false);
      console.log("Socket connect_error:", err?.message ?? err);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    // Sensor data listener
    socket.on("sensor_update", (payload) => {
      console.log("Received:", payload);
      // Room 101 must ONLY accept real ESP32 schema (prevents mixing with backend simulation).
      if (!isRoom101RealPayload(payload)) return;
      if (!ROOMS.some((r) => r.id === payload.roomId)) return;

      console.log(`Received for ${payload.roomId}:`, payload);

      lastSensorUpdateAtRef.current = Date.now();
      setIsLiveData(true);

      setRoomData((prev) => {
        const roomState = prev[payload.roomId] || { latest: {}, history: [] };

        // If we previously had any non-real/mixed data, reset history so room101 is purely real.
        const hadRealLatest = isRoom101RealPayload(roomState.latest);
        const baseHistory = hadRealLatest ? roomState.history : [];

        const newEntry = {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          temperature: payload.temperature,
          humidity: payload.humidity,
          energy: payload.energy,
        };

        return {
          ...prev,
          [payload.roomId]: {
            latest: payload,
            history: [...baseHistory.slice(-19), newEntry],
          },
        };
      });

      setLastUpdate(new Date());
    });

    // Alert listener
    socket.on("alert", (alert) => {
      console.log("ALERT RECEIVED:", alert);
      // Room 101 alerts must come from backend REST (/api/alerts), not generated/streamed.
      if (alert?.roomId === "room101") return;
      addAlerts(alert);
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("sensor_update");
      socket.off("alert");
    };
  }, [addAlerts, isRoom101RealPayload]);

  // Get current room data
  const mergedRoomData = useMemo(
    () => ({ ...simulatedRoomData, ...roomData }),
    [simulatedRoomData, roomData]
  );

  const currentRoom = mergedRoomData[selectedRoomId] || {
    latest: {},
    history: [],
  };
  const latestData = currentRoom.latest;
  const history = currentRoom.history;

  const selectedRoomKind = ROOM_KIND[selectedRoomId] || "simulated";
  const selectedRoomBadgeText =
    selectedRoomKind === "live" ? "Live" : "Simulated";

  const resolveTokenColor = (theme, token) => {
    if (!token || typeof token !== "string") return theme.palette.text.primary;
    if (token === "primary.main") return theme.palette.primary.main;
    if (token === "success.main") return theme.palette.success.main;
    if (token === "warning.main") return theme.palette.warning.main;
    if (token === "error.main") return theme.palette.error.main;
    if (token === "grey.600") return theme.palette.grey[600];
    if (token === "text.secondary") return theme.palette.text.secondary;
    if (token === "text.primary") return theme.palette.text.primary;
    return theme.palette.text.primary;
  };

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const toPercent = (value, min, max) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return 0;
    if (max === min) return 0;
    return Math.round(clamp01((v - min) / (max - min)) * 100);
  };

  const gaugeTrackSx = (theme) => ({
    color: alpha(
      theme.palette.text.primary,
      theme.palette.mode === "dark" ? 0.14 : 0.10
    ),
  });

  const getStatus = (value, type) => {
    if (type === "temperature") {
      if (value > 32) return { color: "error.main", text: "Critical (Hot)" };
      if (value > 28) return { color: "warning.main", text: "Warning" };
      if (value < 18) return { color: "error.main", text: "Critical (Cold)" };
      return { color: "success.main", text: "Normal" };
    }
    if (type === "humidity") {
      if (value > 80 || value < 30)
        return { color: "warning.main", text: "Outside comfort" };
      return { color: "success.main", text: "Comfortable" };
    }
    if (type === "occupancy") {
      return value
        ? { color: "primary.main", text: "Occupied" }
        : { color: "grey.600", text: "Empty" };
    }
    if (type === "lighting") {
      return value
        ? { color: "warning.main", text: "On" }
        : { color: "success.main", text: "Off" };
    }
    return { color: "text.primary", text: "—" };
  };

  const tempStatus = getStatus(latestData.temperature || 0, "temperature");
  const humStatus = getStatus(latestData.humidity || 0, "humidity");

  // Energy gauge logic
  const MAX_ENERGY = 500;
  const energyPercent = latestData.energy
    ? Math.min(Math.max((latestData.energy / MAX_ENERGY) * 100, 0), 100)
    : 0;

  const getEnergyColor = () => {
    if (energyPercent > 80) return "error.main";
    if (energyPercent > 50) return "warning.main";
    return "success.main";
  };

  const hasSelectedRoomData =
    latestData && Object.prototype.hasOwnProperty.call(latestData, "temperature");

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="appShell">
        <Box component="aside" className="sidebar">
          <Box className="sidebarBrand">
            <Box className="sidebarBrandTitle">Digital Twin</Box>
            <Box className="sidebarBrandSub">Smart Campus</Box>
          </Box>

          <Box className="sidebarSectionTitle">Rooms</Box>

          <FormControl size="small" className="sidebarRoomSelect">
            <InputLabel id="room-select-label">Room</InputLabel>
            <Select
              labelId="room-select-label"
              value={selectedRoomId}
              label="Room"
              renderValue={(value) => ROOMS.find((r) => r.id === value)?.name ?? ""}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              {ROOMS.map((room) => (
                <MenuItem key={room.id} value={room.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                    <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>{room.name}</Box>
                    <Box
                      sx={(theme) => ({
                        flex: "0 0 auto",
                        px: 1,
                        py: 0.25,
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1.2,
                        color: "#fff",
                        bgcolor:
                          ROOM_KIND[room.id] === "live"
                            ? theme.palette.success.main
                            : theme.palette.grey[600],
                      })}
                    >
                      {ROOM_KIND[room.id] === "live" ? "Live" : "Simulated"}
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box className="sidebarNav" role="navigation" aria-label="Rooms">
            {ROOMS.map((room) => (
              <button
                key={room.id}
                type="button"
                className={
                  room.id === selectedRoomId
                    ? "sidebarNavItem isActive"
                    : "sidebarNavItem"
                }
                onClick={() => setSelectedRoomId(room.id)}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    width: "100%",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <MeetingRoom
                      fontSize="small"
                      style={{ opacity: 0.9 }}
                    />
                    <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {room.name}
                    </Box>
                  </Box>
                  <Box
                    sx={(theme) => ({
                      px: 1,
                      py: 0.25,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1.2,
                      color: "#fff",
                      bgcolor:
                        ROOM_KIND[room.id] === "live"
                          ? theme.palette.success.main
                          : theme.palette.grey[600],
                    })}
                  >
                    {ROOM_KIND[room.id] === "live" ? "Live" : "Simulated"}
                  </Box>
                </Box>
              </button>
            ))}
          </Box>

          <Box className="sidebarSectionTitle">Pages</Box>
          <Box className="sidebarNav" role="navigation" aria-label="Pages">
            <button
              type="button"
              className={
                location.pathname === "/about"
                  ? "sidebarNavItem isActive"
                  : "sidebarNavItem"
              }
              onClick={() => navigate("/about")}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Info fontSize="small" style={{ opacity: 0.9 }} />
                <Box>About</Box>
              </Box>
            </button>

            <button
              type="button"
              className={
                location.pathname === "/status"
                  ? "sidebarNavItem isActive"
                  : "sidebarNavItem"
              }
              onClick={() => navigate("/status")}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ShowChart fontSize="small" style={{ opacity: 0.9 }} />
                <Box>System Status</Box>
              </Box>
            </button>

            <button
              type="button"
              className={
                location.pathname === "/reports"
                  ? "sidebarNavItem isActive"
                  : "sidebarNavItem"
              }
              onClick={() => navigate("/reports")}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Description fontSize="small" style={{ opacity: 0.9 }} />
                <Box>Reports</Box>
              </Box>
            </button>

            <button
              type="button"
              className={
                location.pathname === "/calculator"
                  ? "sidebarNavItem isActive"
                  : "sidebarNavItem"
              }
              onClick={() => navigate("/calculator")}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box>⚡ Calculator</Box>
              </Box>
            </button>
          </Box>
        </Box>

        <Box component="main" className="main">
          <Box component="header" className="topbar">
            <Box className="topbarTitles">
              <Typography variant="h5" component="h1" className="topbarTitle">
                Digital Twin - Smart Campus
              </Typography>
              <Typography variant="body2" component="div" className="topbarSubtitle">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ROOMS.find((r) => r.id === selectedRoomId)?.name}
                  </Box>
                  <Box
                    sx={(theme) => ({
                      px: 1,
                      py: 0.25,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: 1.2,
                      color: "#fff",
                      bgcolor:
                        selectedRoomKind === "live"
                          ? theme.palette.success.main
                          : theme.palette.grey[600],
                    })}
                  >
                    {selectedRoomBadgeText}
                  </Box>
                </Box>
              </Typography>
            </Box>

            <Box className="topbarActions">
              <MuiTooltip title="Go to dashboard">
                <Button
                  type="button"
                  variant={location.pathname === "/" ? "contained" : "outlined"}
                  className="homeNavBtn"
                  onClick={() => navigate("/")}
                  startIcon={<Home />}
                >
                  Home
                </Button>
              </MuiTooltip>

              <MuiTooltip title="View alerts">
                <Button
                  type="button"
                  variant={location.pathname === "/alerts" ? "contained" : "outlined"}
                  className="alertsNavBtn"
                  onClick={() => navigate("/alerts")}
                  startIcon={
                    <Badge
                      color="error"
                      overlap="circular"
                      badgeContent={unacknowledgedCount}
                      invisible={unacknowledgedCount === 0}
                      sx={{ "& .MuiBadge-badge": { fontWeight: 800 } }}
                    >
                      <Notifications />
                    </Badge>
                  }
                >
                  Alerts
                </Button>
              </MuiTooltip>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  justifyContent: "flex-end",
                }}
                aria-label="Connection status"
              >
                <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 700 }}>
                  {connectionStatusText}
                </Typography>
                <Box
                  sx={(theme) => {
                      const dotColor = isLiveData
                        ? theme.palette.success.main
                        : "#AAAAAA";

                      const shouldPulse = isLiveData;

                    return {
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      bgcolor: dotColor,
                      flex: "0 0 auto",
                      boxShadow: shouldPulse
                        ? `0 0 0 0 ${alpha(dotColor, 0.55)}`
                        : "none",
                      animation: shouldPulse ? "pulseGlow 1.4s ease-in-out infinite" : "none",
                      "@keyframes pulseGlow": {
                        "0%": {
                          boxShadow: `0 0 0 0 ${alpha(dotColor, 0.55)}`,
                          opacity: 1,
                        },
                        "70%": {
                          boxShadow: `0 0 0 8px ${alpha(dotColor, 0)}`,
                          opacity: 0.92,
                        },
                        "100%": {
                          boxShadow: `0 0 0 0 ${alpha(dotColor, 0)}`,
                          opacity: 1,
                        },
                      },
                    };
                  }}
                />
              </Box>
              <MuiTooltip
                title={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
              >
                <IconButton
                  onClick={toggleColorMode}
                  className="modeToggle"
                  color="inherit"
                >
                  {mode === "dark" ? <Brightness7 /> : <Brightness4 />}
                </IconButton>
              </MuiTooltip>
            </Box>
          </Box>

          <Box className="content">
            <Routes>
              <Route
                path="/"
                element={
                  <Box className="contentGrid">
                    <Box className="contentMain">
                      {!hasSelectedRoomData ? (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            mb: 2,
                            px: 2,
                            py: 1.5,
                            borderRadius: 2,
                            border: "1px solid var(--cardBorder)",
                            background: "var(--card)",
                            color: "var(--text)",
                          }}
                        >
                          <CircularProgress size={18} />
                          <Typography variant="body2">
                            Waiting for sensor data...
                          </Typography>
                        </Box>
                      ) : null}
                      <Grid container spacing={2} className="sensorGrid">
                  <Grid item xs={12} sm={6} md={4}>
                    <Card
                      className="sensorCard"
                      sx={(theme) => {
                        const accent = resolveTokenColor(theme, tempStatus.color);
                        return {
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          color: "var(--text)",
                          position: "relative",
                          overflow: "hidden",
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            width: 4,
                            background: `linear-gradient(180deg, ${alpha(
                              accent,
                              0.95
                            )}, ${alpha(accent, 0.35)})`,
                          },
                          "& .sensorGauge": { color: accent },
                        };
                      }}
                    >
                      <CardContent className="sensorCardContent">
                        <Box className="sensorGauge" aria-hidden>
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={100}
                            size={40}
                            thickness={4}
                            sx={gaugeTrackSx}
                          />
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={toPercent(latestData.temperature, 0, 50)}
                            size={40}
                            thickness={4}
                            sx={{ opacity: 0.95 }}
                          />
                          <Box className="sensorGaugeInner">
                            <Thermostat fontSize="small" />
                          </Box>
                        </Box>
                        <Typography className="sensorLabel">Temperature</Typography>
                        <Typography className="sensorValue">
                          {latestData.temperature ?? "—"} °C
                        </Typography>
                        <Typography
                          className="sensorStatus"
                          sx={(theme) => ({
                            color: resolveTokenColor(theme, tempStatus.color),
                          })}
                        >
                          {tempStatus.text}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <Card
                      className="sensorCard"
                      sx={(theme) => {
                        const accent = resolveTokenColor(theme, humStatus.color);
                        return {
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          color: "var(--text)",
                          position: "relative",
                          overflow: "hidden",
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            width: 4,
                            background: `linear-gradient(180deg, ${alpha(
                              accent,
                              0.95
                            )}, ${alpha(accent, 0.35)})`,
                          },
                          "& .sensorGauge": { color: accent },
                        };
                      }}
                    >
                      <CardContent className="sensorCardContent">
                        <Box className="sensorGauge" aria-hidden>
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={100}
                            size={40}
                            thickness={4}
                            sx={gaugeTrackSx}
                          />
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={toPercent(latestData.humidity, 0, 100)}
                            size={40}
                            thickness={4}
                            sx={{ opacity: 0.95 }}
                          />
                          <Box className="sensorGaugeInner">
                            <WaterDrop fontSize="small" />
                          </Box>
                        </Box>
                        <Typography className="sensorLabel">Humidity</Typography>
                        <Typography className="sensorValue">
                          {latestData.humidity ?? "—"} %
                        </Typography>
                        <Typography
                          className="sensorStatus"
                          sx={(theme) => ({
                            color: resolveTokenColor(theme, humStatus.color),
                          })}
                        >
                          {humStatus.text}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <Card
                      className="sensorCard"
                      sx={(theme) => {
                        const accent = latestData.occupancy
                          ? theme.palette.primary.main
                          : theme.palette.text.secondary;
                        return {
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          color: "var(--text)",
                          position: "relative",
                          overflow: "hidden",
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            width: 4,
                            background: `linear-gradient(180deg, ${alpha(
                              accent,
                              0.95
                            )}, ${alpha(accent, 0.25)})`,
                          },
                          "& .sensorGauge": { color: accent },
                        };
                      }}
                    >
                      <CardContent className="sensorCardContent">
                        <Box className="sensorGauge" aria-hidden>
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={100}
                            size={40}
                            thickness={4}
                            sx={gaugeTrackSx}
                          />
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={latestData.occupancy ? 100 : 0}
                            size={40}
                            thickness={4}
                            sx={{ opacity: 0.95 }}
                          />
                          <Box className="sensorGaugeInner">
                            <People fontSize="small" />
                          </Box>
                        </Box>
                        <Typography className="sensorLabel">Occupancy</Typography>
                        <Typography className="sensorValue">
                          {latestData.occupancy ? "Occupied" : "Empty"}
                        </Typography>
                        <Typography
                          className="sensorStatus"
                          sx={(theme) => ({
                            color: latestData.occupancy
                              ? theme.palette.primary.main
                              : theme.palette.text.secondary,
                          })}
                        >
                          {latestData.occupancy ? "Presence detected" : "No presence"}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <Card
                      className="sensorCard"
                      sx={(theme) => {
                        const accent = latestData.lighting
                          ? theme.palette.warning.main
                          : theme.palette.success.main;
                        return {
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          color: "var(--text)",
                          position: "relative",
                          overflow: "hidden",
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            width: 4,
                            background: `linear-gradient(180deg, ${alpha(
                              accent,
                              0.95
                            )}, ${alpha(accent, 0.25)})`,
                          },
                          "& .sensorGauge": { color: accent },
                        };
                      }}
                    >
                      <CardContent className="sensorCardContent">
                        <Box className="sensorGauge" aria-hidden>
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={100}
                            size={40}
                            thickness={4}
                            sx={gaugeTrackSx}
                          />
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={latestData.lighting ? 100 : 0}
                            size={40}
                            thickness={4}
                            sx={{ opacity: 0.95 }}
                          />
                          <Box className="sensorGaugeInner">
                            <Lightbulb fontSize="small" />
                          </Box>
                        </Box>
                        <Typography className="sensorLabel">Lighting</Typography>
                        <Typography className="sensorValue">
                          {latestData.lighting ? "On" : "Off"}
                        </Typography>
                        <Typography
                          className="sensorStatus"
                          sx={(theme) => ({
                            color: latestData.lighting
                              ? theme.palette.warning.main
                              : theme.palette.success.main,
                          })}
                        >
                          {latestData.lighting ? "Active" : "Inactive"}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={4}>
                    <Card
                      className="sensorCard energyCard"
                      sx={(theme) => {
                        const accent = resolveTokenColor(
                          theme,
                          typeof getEnergyColor === "function"
                            ? getEnergyColor()
                            : "primary.main"
                        );
                        return {
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          color: "var(--text)",
                          position: "relative",
                          overflow: "hidden",
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            width: 4,
                            background: `linear-gradient(180deg, ${alpha(
                              accent,
                              0.95
                            )}, ${alpha(accent, 0.25)})`,
                          },
                          "& .sensorGauge": { color: accent },
                        };
                      }}
                    >
                      <CardContent className="sensorCardContent">
                        <Box className="sensorGauge" aria-hidden>
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={100}
                            size={40}
                            thickness={4}
                            sx={gaugeTrackSx}
                          />
                          <CircularProgress
                            color="inherit"
                            variant="determinate"
                            value={energyPercent}
                            size={40}
                            thickness={4}
                            sx={{ opacity: 0.95 }}
                          />
                          <Box className="sensorGaugeInner">
                            <Bolt fontSize="small" />
                          </Box>
                        </Box>
                        <Typography className="sensorLabel">Energy</Typography>
                        <Typography className="sensorValue">
                          {latestData.energy ?? "—"} W
                        </Typography>
                        <Typography
                          className="sensorStatus"
                          sx={(theme) => ({
                            color: resolveTokenColor(theme, getEnergyColor()),
                          })}
                        >
                          {Math.round(energyPercent)}% of {MAX_ENERGY}W max
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Box className="chartSection">
                  <Typography variant="h6" className="sectionTitle">
                    Trends (Last 20 readings)
                  </Typography>

                  <Card className="chartCard">
                    <CardContent>
                      <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={history}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={mode === "dark" ? "#2A2D3E" : "#E5E7EB"}
                          />
                          <XAxis
                            dataKey="time"
                            stroke={mode === "dark" ? "#8B8FA8" : "#4B5563"}
                            tick={{ fill: mode === "dark" ? "#8B8FA8" : "#4B5563" }}
                          />
                          <YAxis
                            yAxisId="left"
                            orientation="left"
                            stroke={mode === "dark" ? "#8B8FA8" : "#4B5563"}
                            tick={{ fill: mode === "dark" ? "#8B8FA8" : "#4B5563" }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke={mode === "dark" ? "#8B8FA8" : "#4B5563"}
                            tick={{ fill: mode === "dark" ? "#8B8FA8" : "#4B5563" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor:
                                mode === "dark" ? "#1A1D27" : "#FFFFFF",
                              border:
                                mode === "dark"
                                  ? "1px solid #2A2D3E"
                                  : "1px solid #E5E7EB",
                              borderRadius: 10,
                              color: mode === "dark" ? "#FFFFFF" : "#111827",
                            }}
                          />
                          <Legend
                            wrapperStyle={{
                              color: mode === "dark" ? "#8B8FA8" : "#4B5563",
                            }}
                          />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="temperature"
                            stroke="#ff7300"
                            name="Temperature (°C)"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="humidity"
                            stroke="#0088fe"
                            name="Humidity (%)"
                          />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="energy"
                            stroke="#4caf50"
                            name="Energy (W)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Box>
                    </Box>
                  </Box>
                }
              />
              <Route
                path="/alerts"
                element={
                  <AlertsPage
                    alerts={alerts}
                    roomsById={roomsById}
                    acknowledgedById={acknowledgedById}
                    onAcknowledge={(id) =>
                      setAcknowledgedById((prev) => ({
                        ...prev,
                        [id]: !prev[id],
                      }))
                    }
                    onClearAll={() => {
                      setAlerts([]);
                      setAcknowledgedById({});
                    }}
                  />
                }
              />

              <Route path="/about" element={<AboutPage />} />
              <Route
                path="/status"
                element={
                  <StatusPage
                    apiBaseUrl="http://localhost:5000"
                    isSocketConnected={isSocketConnected}
                    lastUpdate={lastUpdate}
                    room101Latest={roomData?.room101?.latest}
                  />
                }
              />
              <Route path="/reports" element={<ReportsPage />} />
              <Route
                path="/calculator"
                element={
                  <CalculatorPage socket={socket} />
                }
              />
            </Routes>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;