import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

const API_BASE_URL = "http://localhost:5000";

function toCsvValue(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadText(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function formatTime(value) {
  if (!value) return "—";
  if (typeof value === "string") return value;

  const ms = typeof value === "number" ? value : null;
  if (ms != null) {
    try {
      return new Date(ms).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates =
    payload.items ??
    payload.data ??
    payload.history ??
    payload.readings ??
    payload.rows;

  return Array.isArray(candidates) ? candidates : [];
}

function readingHasAlert(reading) {
  if (!reading || typeof reading !== "object") return false;

  const temp = Number(reading.temperature ?? reading.temp ?? 0);
  const hum = Number(reading.humidity ?? reading.hum ?? 0);

  const motionRaw = reading.occupancy ?? reading.motion;
  const motion = motionRaw === true ? 1 : motionRaw === false ? 0 : Number(motionRaw ?? 0);

  const lightRaw = reading.lighting ?? reading.light;
  const light = lightRaw === true ? 1 : lightRaw === false ? 0 : Number(lightRaw ?? 0);

  const power = Number(reading.power ?? reading.energy ?? 0);

  // Mirror backend alert rules (best-effort):
  // 1) High temperature in empty room
  if (temp > 32 && motion === 0) return true;
  // 2) Lights ON in empty room
  if (light === 1 && motion === 0) return true;
  // 3) Very high power/energy usage
  if (power > 400) return true;
  // 4) Extreme humidity
  if (hum > 85 || hum < 30) return true;

  return false;
}

export default function ReportsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const queryUrl50 = useMemo(() => {
    const base = API_BASE_URL.replace(/\/$/, "");
    return `${base}/api/history?room_id=room101&limit=50`;
  }, []);

  const queryUrlAll = useMemo(() => {
    const base = API_BASE_URL.replace(/\/$/, "");
    return `${base}/api/history?room_id=room101`;
  }, []);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(queryUrl50);
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }

      const data = await res.json();
      setRows(normalizeRows(data));
    } catch (e) {
      setRows([]);
      setError(e?.message ?? "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [queryUrl50]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const onExportCsv = useCallback(async () => {
    setExporting(true);
    setError(null);

    try {
      const res = await fetch(queryUrlAll);
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }

      const data = await res.json();
      const allRows = normalizeRows(data);

      const header = [
        "Time",
        "Room",
        "Temp",
        "Humidity",
        "Motion",
        "Light",
        "Current",
        "Power",
      ];

      const lines = [header.join(",")];
      for (const r of allRows) {
        const time = formatTime(r.timestamp ?? r.receivedAt ?? r.time);
        const room = r.roomId ?? r.room ?? r.room_id ?? "—";
        const temp = r.temperature ?? r.temp ?? "—";
        const hum = r.humidity ?? r.hum ?? "—";
        const motion = r.occupancy ?? r.motion ?? "—";
        const light = r.lighting ?? r.light ?? "—";
        const current = r.current ?? "—";
        const power = r.power ?? r.energy ?? "—";

        lines.push(
          [time, room, temp, hum, motion, light, current, power]
            .map(toCsvValue)
            .join(",")
        );
      }

      const csv = lines.join("\r\n");
      const filename = `sensor-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadText(filename, csv, "text/csv;charset=utf-8");
    } catch (e) {
      setError(e?.message ?? "CSV export failed");
    } finally {
      setExporting(false);
    }
  }, [queryUrlAll]);

  return (
    <Box className="reportsPage">
      <Box className="pageHeader">
        <Box>
          <Typography variant="h6" className="pageTitle">
            Reports
          </Typography>
          <Typography variant="body2" className="pageSubtitle">
            Last 50 sensor readings (Room 101 - Live)
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            onClick={loadLatest}
            disabled={loading}
            sx={{ textTransform: "none", fontWeight: 800, borderRadius: 2 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            onClick={onExportCsv}
            disabled={exporting}
            sx={{ textTransform: "none", fontWeight: 900, borderRadius: 2 }}
          >
            {exporting ? "Exporting…" : "CSV Export"}
          </Button>
        </Box>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Card className="pageCard">
        <CardContent>
          {loading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Loading readings…
              </Typography>
            </Box>
          ) : rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No readings available.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Sensor readings table">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Time
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Room
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Temp
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Humidity
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Motion
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Light
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Current
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Power
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.map((r, idx) => {
                    const time = formatTime(r.timestamp ?? r.receivedAt ?? r.time);
                    const room = r.roomId ?? r.room ?? r.room_id ?? "—";
                    const temp = r.temperature ?? r.temp ?? "—";
                    const hum = r.humidity ?? r.hum ?? "—";
                    const motion = r.occupancy ?? r.motion ?? "—";
                    const light = r.lighting ?? r.light ?? "—";
                    const current = r.current ?? "—";
                    const power = r.power ?? r.energy ?? "—";

                    const hasAlert = readingHasAlert(r);

                    return (
                      <TableRow
                        key={r.id ?? r.receivedAt ?? idx}
                        sx={(theme) => ({
                          backgroundColor: hasAlert
                            ? alpha(theme.palette.error.main, 0.12)
                            : "transparent",
                          "& td": {
                            borderColor: "var(--cardBorder)",
                            color: "var(--text)",
                            fontWeight: 700,
                          },
                        })}
                      >
                        <TableCell>{time}</TableCell>
                        <TableCell>{room}</TableCell>
                        <TableCell>{temp}</TableCell>
                        <TableCell>{hum}</TableCell>
                        <TableCell>{motion}</TableCell>
                        <TableCell>{light}</TableCell>
                        <TableCell>{current}</TableCell>
                        <TableCell>{power}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
