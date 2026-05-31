import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

const DEFAULT_API_BASE_URL = "http://localhost:5000";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDuration(ms) {
  const total = Number(ms);
  if (!Number.isFinite(total) || total < 0) return "—";

  const seconds = Math.floor(total / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function extractUptimeMs(health, nowMs) {
  if (!health || typeof health !== "object") return null;

  const candidatesMs = [
    health.uptimeMs,
    health.uptime_ms,
    health.uptimeMillis,
    health.uptime_millis,
  ];
  for (const v of candidatesMs) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }

  const candidatesSeconds = [
    health.uptimeSeconds,
    health.uptime_seconds,
    health.uptime_s,
    health.uptime,
  ];
  for (const v of candidatesSeconds) {
    if (typeof v === "number" && Number.isFinite(v)) return v * 1000;
  }

  const startedAt =
    health.startedAt ??
    health.started_at ??
    health.startTime ??
    health.start_time ??
    health.bootTime;

  if (typeof startedAt === "number" && Number.isFinite(startedAt)) {
    // Heuristic: seconds vs ms
    const startedMs = startedAt < 10_000_000_000 ? startedAt * 1000 : startedAt;
    const now = Number(nowMs);
    if (!Number.isFinite(now) || now <= 0) return null;
    return Math.max(0, now - startedMs);
  }

  if (typeof startedAt === "string" && startedAt.trim()) {
    const parsed = Date.parse(startedAt);
    if (!Number.isNaN(parsed)) {
      const now = Number(nowMs);
      if (!Number.isFinite(now) || now <= 0) return null;
      return Math.max(0, now - parsed);
    }
  }

  return null;
}

function extractBoolean(health, keys) {
  if (!health || typeof health !== "object") return null;

  for (const key of keys) {
    const value = health[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "online" || lowered === "ok" || lowered === "true") return true;
      if (lowered === "offline" || lowered === "down" || lowered === "false")
        return false;
    }
    if (value && typeof value === "object") {
      const nested =
        value.online ?? value.ok ?? value.healthy ?? value.connected ?? value.up;
      if (typeof nested === "boolean") return nested;
    }
  }

  return null;
}

function StatusPill({ ok, okText, badText, pendingText }) {
  return (
    <Box
      sx={(theme) => {
        const resolvedOk = ok === true;
        const resolvedBad = ok === false;
        const color = resolvedOk
          ? theme.palette.success.main
          : resolvedBad
            ? theme.palette.error.main
            : theme.palette.text.secondary;

        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          px: 1.1,
          py: 0.45,
          borderRadius: 999,
          border: "1px solid var(--cardBorder)",
          bgcolor: "var(--overlay)",
          color,
          fontWeight: 900,
          fontSize: 12,
          letterSpacing: 0.3,
        };
      }}
    >
      <Box
        sx={(theme) => {
          const resolvedOk = ok === true;
          const resolvedBad = ok === false;
          const dotColor = resolvedOk
            ? theme.palette.success.main
            : resolvedBad
              ? theme.palette.error.main
              : theme.palette.text.secondary;

          return {
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: dotColor,
            boxShadow: `0 0 0 4px ${alpha(dotColor, 0.12)}`,
          };
        }}
      />
      {ok === true ? okText : ok === false ? badText : pendingText}
    </Box>
  );
}

function KeyValueRow({ label, children }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 2,
        padding: "10px 0",
      }}
    >
      <Typography
        component="div"
        sx={{
          color: "var(--muted)",
          fontWeight: 900,
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Typography>
      <Box sx={{ textAlign: "right", minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

function isFiniteNumber(value) {
  const v = Number(value);
  return Number.isFinite(v);
}

export default function StatusPage({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  isSocketConnected,
  lastUpdate,
  room101Latest,
}) {
  const [nowMs, setNowMs] = useState(0);
  const [healthState, setHealthState] = useState({ ok: null, data: null });
  const [historyState, setHistoryState] = useState({
    ok: null,
    total: null,
  });
  const [alertsState, setAlertsState] = useState({ ok: null, total: null });

  const espOnline = useMemo(() => {
    if (!lastUpdate) return false;
    if (!nowMs) return false;
    try {
      const last = lastUpdate instanceof Date ? lastUpdate.getTime() : Number(lastUpdate);
      if (!Number.isFinite(last)) return false;
      return nowMs - last < 30000;
    } catch {
      return false;
    }
  }, [lastUpdate, nowMs]);

  const sensorStatus = useMemo(() => {
    const base = {
      temperature: false,
      motion: false,
      light: false,
      current: false,
    };

    if (!espOnline) return base;

    return {
      temperature: isFiniteNumber(room101Latest?.temperature),
      motion: room101Latest?.occupancy !== undefined,
      light: room101Latest?.lighting !== undefined,
      current: isFiniteNumber(room101Latest?.current),
    };
  }, [espOnline, room101Latest]);

  const mqttOnline = useMemo(() => {
    if (healthState.ok === null) return null;
    if (!healthState.ok) return false;

    const explicit = extractBoolean(healthState.data, [
      "mqtt",
      "mqttBroker",
      "mqtt_broker",
      "broker",
    ]);
    return explicit ?? true;
  }, [healthState]);

  const dbOnline = useMemo(() => {
    const explicit = extractBoolean(healthState.data, [
      "database",
      "db",
      "sqlite",
      "storage",
    ]);

    if (explicit !== null) return explicit;
    if (historyState.ok === null) return null;
    return Boolean(historyState.ok);
  }, [healthState.data, historyState.ok]);

  const uptimeMs = useMemo(
    () => extractUptimeMs(healthState.data, nowMs),
    [healthState.data, nowMs]
  );

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const poll = async () => {
      setNowMs(Date.now());
      const healthUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/health`;
      const historyUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/history?room_id=room101&limit=1`;
      const alertsUrl = `${apiBaseUrl.replace(/\/$/, "")}/api/alerts?limit=500`;

      const [healthRes, historyRes, alertsRes] = await Promise.allSettled([
        fetch(healthUrl, { signal: controller.signal }),
        fetch(historyUrl, { signal: controller.signal }),
        fetch(alertsUrl, { signal: controller.signal }),
      ]);

      const nextHealth = { ok: false, data: null };
      const nextHistory = { ok: false, total: null };
      const nextAlerts = { ok: false, total: null };

      try {
        if (healthRes.status === "fulfilled" && healthRes.value.ok) {
          nextHealth.ok = true;
          try {
            nextHealth.data = await healthRes.value.json();
          } catch {
            nextHealth.data = null;
          }
        } else {
          nextHealth.ok = false;
        }
      } catch {
        nextHealth.ok = false;
      }

      try {
        if (historyRes.status === "fulfilled" && historyRes.value.ok) {
          nextHistory.ok = true;
          const xTotal = historyRes.value.headers.get("X-Total-Count");
          if (xTotal && Number.isFinite(Number(xTotal))) {
            nextHistory.total = Number(xTotal);
          }

          let data = null;
          try {
            data = await historyRes.value.json();
          } catch {
            data = null;
          }

          if (data && typeof data === "object" && !Array.isArray(data)) {
            const total =
              data.total ??
              data.count ??
              data.totalReadings ??
              data.total_readings ??
              data.total_reading_count;
            if (typeof total === "number" && Number.isFinite(total)) {
              nextHistory.total = total;
            }
          }
        }
      } catch {
        nextHistory.ok = false;
      }

      try {
        if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
          nextAlerts.ok = true;
          let data = null;
          try {
            data = await alertsRes.value.json();
          } catch {
            data = null;
          }

          if (Array.isArray(data)) nextAlerts.total = data.length;
          else if (data && typeof data === "object") {
            const total = data.total ?? data.count;
            if (typeof total === "number" && Number.isFinite(total)) {
              nextAlerts.total = total;
            }
          }
        }
      } catch {
        nextAlerts.ok = false;
      }

      if (!isMounted) return;
      setHealthState(nextHealth.ok ? { ok: true, data: nextHealth.data } : { ok: false, data: null });
      setHistoryState(nextHistory.ok ? nextHistory : { ok: false, total: null });
      setAlertsState(nextAlerts.ok ? nextAlerts : { ok: false, total: null });
    };

    poll();
    const intervalId = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(intervalId);
    };
  }, [apiBaseUrl]);

  return (
    <Box className="statusPage">
      <Box className="pageHeader">
        <Typography variant="h6" className="pageTitle">
          System Status
        </Typography>
        <Typography variant="body2" className="pageSubtitle">
          Live status of campus digital twin components
        </Typography>
      </Box>

      <Box className="pageGridThreeCol">
        <Card className="pageCard">
          <CardContent>
            <Typography variant="h6" className="sectionTitle">
              Connections
            </Typography>

            <KeyValueRow label="ESP32 Connection">
              <StatusPill
                ok={espOnline}
                okText="Online"
                badText="Offline"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="MQTT Broker">
              <StatusPill
                ok={mqttOnline}
                okText="Online"
                badText="Offline"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Database">
              <StatusPill
                ok={dbOnline}
                okText="Online"
                badText="Offline"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="WebSocket">
              <StatusPill
                ok={Boolean(isSocketConnected)}
                okText="Connected"
                badText="Disconnected"
                pendingText="Checking"
              />
            </KeyValueRow>
          </CardContent>
        </Card>

        <Card className="pageCard">
          <CardContent>
            <Typography variant="h6" className="sectionTitle">
              Sensors
            </Typography>

            <KeyValueRow label="Temperature sensor">
              <StatusPill
                ok={sensorStatus.temperature}
                okText="Working"
                badText="Failed"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Motion sensor">
              <StatusPill
                ok={sensorStatus.motion}
                okText="Working"
                badText="Failed"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Light sensor">
              <StatusPill
                ok={sensorStatus.light}
                okText="Working"
                badText="Failed"
                pendingText="Checking"
              />
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Current sensor">
              <StatusPill
                ok={sensorStatus.current}
                okText="Working"
                badText="Failed"
                pendingText="Checking"
              />
            </KeyValueRow>
          </CardContent>
        </Card>

        <Card className="pageCard">
          <CardContent>
            <Typography variant="h6" className="sectionTitle">
              Metrics
            </Typography>

            <KeyValueRow label="Last data received">
              <Typography component="div" sx={{ fontWeight: 900 }}>
                {formatDateTime(lastUpdate)}
              </Typography>
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Total readings stored">
              <Typography component="div" sx={{ fontWeight: 900 }}>
                {historyState.ok === null ? (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={14} />
                    <span>Checking</span>
                  </Box>
                ) : historyState.ok && historyState.total != null ? (
                  historyState.total
                ) : (
                  "—"
                )}
              </Typography>
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="Total alerts generated">
              <Typography component="div" sx={{ fontWeight: 900 }}>
                {alertsState.ok === null ? (
                  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={14} />
                    <span>Checking</span>
                  </Box>
                ) : alertsState.ok && alertsState.total != null ? (
                  alertsState.total
                ) : (
                  "—"
                )}
              </Typography>
            </KeyValueRow>
            <Divider sx={{ borderColor: "var(--cardBorder)" }} />

            <KeyValueRow label="System uptime">
              <Typography component="div" sx={{ fontWeight: 900 }}>
                {uptimeMs != null ? formatDuration(uptimeMs) : "—"}
              </Typography>
            </KeyValueRow>

            {healthState.ok === false && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Note: `/api/health` is not reachable (MQTT status may show Offline).
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
