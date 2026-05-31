import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

const INTERVAL_SECONDS = 10;
const WASTED_POWER_THRESHOLD_W = 50;

function formatTime(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "—";
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function toOccupied(value) {
  if (value === true) return true;
  if (value === false) return false;
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0;
}

function clampNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function StatCard({ accent, icon, value, label }) {
  return (
    <Card
      className="pageCard"
      sx={{
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          width: 4,
          background: `linear-gradient(180deg, ${alpha(accent, 0.95)}, ${alpha(
            accent,
            0.25
          )})`,
        },
      }}
    >
      <CardContent className="calcStatCardContent">
        <Box className="calcStatTop">
          <Box className="calcStatIcon" aria-hidden>
            {icon}
          </Box>
          <Typography component="div" className="calcStatLabel">
            {label}
          </Typography>
        </Box>

        <Typography component="div" className="calcStatValue">
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function CalculatorPage({ socket }) {
  const [priceInput, setPriceInput] = useState("25");
  const pricePerUnit = useMemo(
    () => clampNonNegativeNumber(priceInput, 25),
    [priceInput]
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSinceMs, setRecordingSinceMs] = useState(null);
  const [readings, setReadings] = useState([]);

  const isRecordingRef = useRef(isRecording);
  const recordingSinceMsRef = useRef(recordingSinceMs);

  const handleStart = useCallback(() => {
    const now = Date.now();
    setReadings([]);
    setRecordingSinceMs(now);
    setIsRecording(true);
    isRecordingRef.current = true;
    recordingSinceMsRef.current = now;
  }, []);

  const handleReset = useCallback(() => {
    setIsRecording(false);
    setRecordingSinceMs(null);
    setReadings([]);
    isRecordingRef.current = false;
    recordingSinceMsRef.current = null;
  }, []);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    recordingSinceMsRef.current = recordingSinceMs;
  }, [isRecording, recordingSinceMs]);

  useEffect(() => {
    if (!socket) return;

    const handleSensorUpdate = (payload) => {
      if (!isRecordingRef.current) return;
      const sinceMs = recordingSinceMsRef.current;
      if (!sinceMs) return;

      if (!payload || typeof payload !== "object") return;
      if (payload.roomId !== "room101") return;

      const nowMs = Date.now();
      if (nowMs < sinceMs) return;

      const powerW = clampNonNegativeNumber(payload.energy, 0);
      const energyKwh = (powerW * INTERVAL_SECONDS) / 3_600_000;

      const occupied = toOccupied(payload.occupancy);
      const wasted = !occupied && powerW > WASTED_POWER_THRESHOLD_W;

      const temperature = payload.temperature;

      setReadings((prev) => [
        ...prev,
        {
          id: `${nowMs}-${Math.random().toString(16).slice(2)}`,
          timeMs: nowMs,
          temperature,
          occupied,
          powerW,
          energyKwh,
          wasted,
        },
      ]);
    };

    socket.on("sensor_update", handleSensorUpdate);
    return () => {
      socket.off("sensor_update", handleSensorUpdate);
    };
  }, [socket]);

  const totals = useMemo(() => {
    let totalEnergyKwh = 0;
    let wastedEnergyKwh = 0;

    for (const r of readings) {
      const e = clampNonNegativeNumber(r.energyKwh, 0);
      totalEnergyKwh += e;
      if (r.wasted) wastedEnergyKwh += e;
    }

    const totalCost = totalEnergyKwh * pricePerUnit;
    const wastedCost = wastedEnergyKwh * pricePerUnit;

    return {
      totalEnergyKwh,
      totalCost,
      wastedCost,
      potentialSavings: wastedCost,
    };
  }, [pricePerUnit, readings]);

  const recordingStatusText = useMemo(() => {
    if (!isRecording || !recordingSinceMs) return "Not recording";
    return `Recording since: ${formatTime(recordingSinceMs)}`;
  }, [isRecording, recordingSinceMs]);

  return (
    <Box className="calculatorPage">
      {/* SECTION 1 - SETTINGS BAR */}
      <Card className="pageCard">
        <CardContent className="calcSettingsContent">
          <TextField
            label="Price per unit (Rs.)"
            placeholder="Enter Rs. per kWh"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            size="small"
            inputProps={{ inputMode: "decimal" }}
            sx={{
              minWidth: 250,
              "& .MuiInputLabel-root": { color: "var(--muted)", fontWeight: 800 },
              "& .MuiOutlinedInput-root": {
                background: "var(--overlayStrong)",
                borderRadius: 2,
                fontWeight: 800,
              },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--cardBorder)" },
              "& .MuiOutlinedInput-input": { color: "var(--text)" },
            }}
          />

          <Button
            variant="contained"
            onClick={handleStart}
            disabled={isRecording}
            sx={(theme) => ({
              textTransform: "none",
              fontWeight: 900,
              borderRadius: 2,
              bgcolor: theme.palette.success.main,
              "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.85) },
            })}
          >
            Start Tracking
          </Button>

          <Button
            variant="contained"
            onClick={handleReset}
            sx={(theme) => ({
              textTransform: "none",
              fontWeight: 900,
              borderRadius: 2,
              bgcolor: theme.palette.error.main,
              "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.85) },
            })}
          >
            Reset
          </Button>

          <Typography component="div" className="calcRecordingStatus">
            {recordingStatusText}
          </Typography>
        </CardContent>
      </Card>

      {/* SECTION 2 - LIVE STATS CARDS */}
      <Box className="calcStatsGrid" aria-label="Energy totals">
        <StatCard
          accent="#4F8EF7"
          icon="⚡"
          value={`${totals.totalEnergyKwh.toFixed(2)} kWh`}
          label="Energy Consumed"
        />
        <StatCard
          accent="#00C48C"
          icon="💰"
          value={`Rs. ${totals.totalCost.toFixed(0)}`}
          label="Total Cost"
        />
        <StatCard
          accent="#FF4757"
          icon="⚠️"
          value={`Rs. ${totals.wastedCost.toFixed(0)}`}
          label="Energy Wasted"
        />
        <StatCard
          accent="#FFB800"
          icon="📈"
          value={`Rs. ${totals.potentialSavings.toFixed(0)}`}
          label="Potential Savings"
        />
      </Box>

      {/* SECTION 3 - ASSUMPTIONS BOX */}
      <Card className="pageCard">
        <CardContent>
          <Typography variant="h6" className="sectionTitle">
            Calculations based on:
          </Typography>
          <Divider sx={{ borderColor: "var(--cardBorder)", mb: 1.5 }} />
          <Box component="ul" className="calcAssumptionsList">
            <li>Price: Rs. {pricePerUnit} per kWh</li>
            <li>Room 101 live sensor data only</li>
            <li>
              Recording started: {recordingSinceMs ? formatTime(recordingSinceMs) : "—"}
            </li>
            <li>Total readings recorded: {readings.length}</li>
          </Box>
        </CardContent>
      </Card>

      {/* SECTION 4 - READINGS TABLE */}
      <Card className="pageCard">
        <CardContent>
          {recordingSinceMs == null ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
              Click Start Tracking to begin recording energy data for Room 101
            </Typography>
          ) : readings.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
              No readings recorded yet.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Recorded energy readings table">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Time
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Temperature
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Occupancy
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Power (W)
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Cost (Rs.)
                    </TableCell>
                    <TableCell sx={{ color: "var(--muted)", fontWeight: 900 }}>
                      Status
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {readings.map((r) => {
                    const cost = clampNonNegativeNumber(r.energyKwh, 0) * pricePerUnit;
                    const tempNumber = Number(r.temperature);
                    const tempText = Number.isFinite(tempNumber)
                      ? `${tempNumber} °C`
                      : "—";

                    return (
                      <TableRow
                        key={r.id}
                        sx={(theme) => ({
                          backgroundColor: r.wasted
                            ? alpha(theme.palette.error.main, 0.12)
                            : "transparent",
                          "& td": {
                            borderColor: "var(--cardBorder)",
                            color: "var(--text)",
                            fontWeight: 700,
                          },
                        })}
                      >
                        <TableCell>{formatTime(r.timeMs)}</TableCell>
                        <TableCell>{tempText}</TableCell>
                        <TableCell>{r.occupied ? "Occupied" : "Empty"}</TableCell>
                        <TableCell>{Math.round(r.powerW)}</TableCell>
                        <TableCell>{cost.toFixed(2)}</TableCell>
                        <TableCell>{r.wasted ? "Wasted" : "Normal"}</TableCell>
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
