import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Typography,
} from "@mui/material";
import { Warning, CheckCircle, NotificationsOff } from "@mui/icons-material";

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function AlertsPage({
  alerts,
  roomsById,
  acknowledgedById,
  onAcknowledge,
  onClearAll,
}) {
  const [filter, setFilter] = useState("all"); // all | critical | warning | acknowledged

  const counts = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let acknowledged = 0;

    for (const alert of alerts) {
      if (acknowledgedById[alert.id]) {
        acknowledged += 1;
        continue;
      }
      if (alert.severity === "critical") critical += 1;
      else warning += 1;
    }

    return {
      total: alerts.length,
      critical,
      warning,
      acknowledged,
    };
  }, [alerts, acknowledgedById]);

  const visibleAlerts = useMemo(() => {
    if (filter === "all") return alerts;
    if (filter === "acknowledged")
      return alerts.filter((a) => acknowledgedById[a.id]);

    return alerts.filter(
      (a) =>
        !acknowledgedById[a.id] &&
        (filter === "critical" ? a.severity === "critical" : a.severity !== "critical")
    );
  }, [alerts, acknowledgedById, filter]);

  return (
    <Box className="alertsPage">
      <Box className="alertsSummary">
        <Box className="alertsSummaryLeft">
          <Typography variant="h6" className="alertsSummaryTitle">
            Alerts
          </Typography>
          <Box className="alertsSummaryChips">
            <Box className="alertsChip">
              <span className="alertsChipLabel">Total</span>
              <span className="alertsChipValue">{counts.total}</span>
            </Box>
            <Box className="alertsChip isCritical">
              <span className="alertsChipLabel">Critical</span>
              <span className="alertsChipValue">{counts.critical}</span>
            </Box>
            <Box className="alertsChip isWarning">
              <span className="alertsChipLabel">Warning</span>
              <span className="alertsChipValue">{counts.warning}</span>
            </Box>
            <Box className="alertsChip isAck">
              <span className="alertsChipLabel">Acknowledged</span>
              <span className="alertsChipValue">{counts.acknowledged}</span>
            </Box>
          </Box>
        </Box>

        <Box className="alertsSummaryRight">
          <Button
            variant="outlined"
            className="alertsClearAll"
            onClick={onClearAll}
            disabled={alerts.length === 0}
          >
            Clear All
          </Button>
        </Box>
      </Box>

      <Box className="alertsFilters">
        {[
          { id: "all", label: "All" },
          { id: "critical", label: "Critical" },
          { id: "warning", label: "Warning" },
          { id: "acknowledged", label: "Acknowledged" },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "alertsFilter isActive" : "alertsFilter"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </Box>

      {visibleAlerts.length === 0 ? (
        <Card className="alertsEmptyCard">
          <CardContent className="alertsEmptyCardContent">
            <NotificationsOff sx={{ color: "text.secondary" }} />
            <Typography variant="body2" color="text.secondary">
              No alerts to show.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box className="alertsListFull" role="region" aria-label="Alerts list">
          {visibleAlerts
            .slice()
            .reverse()
            .map((alert) => {
              const roomName = roomsById[alert.roomId] ?? alert.roomId;
              const isAck = Boolean(acknowledgedById[alert.id]);
              const isCritical = alert.severity === "critical";

              return (
                <Card
                  key={alert.id}
                  className={
                    isCritical
                      ? "alertCard isCritical"
                      : "alertCard isWarning"
                  }
                >
                  <CardContent className="alertCardContent">
                    <Box className="alertCardLeft">
                      <Box className="alertSeverityIcon">
                        {isCritical ? (
                          <Warning sx={{ color: "var(--danger)" }} />
                        ) : (
                          <Warning sx={{ color: "var(--warning)" }} />
                        )}
                      </Box>
                      <Box className="alertCardBody">
                        <Typography className="alertRoomName">
                          {roomName}
                        </Typography>
                        <Typography className="alertMessage" color="text.primary">
                          {alert.message}
                        </Typography>
                        <Typography className="alertTime" color="text.secondary">
                          {formatTime(alert.receivedAt)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box className="alertCardRight">
                      <IconButton
                        size="small"
                        className={isAck ? "ackBtn isAck" : "ackBtn"}
                        onClick={() => onAcknowledge(alert.id)}
                        aria-label="Acknowledge alert"
                      >
                        <CheckCircle
                          sx={{
                            color: isAck
                              ? "var(--muted)"
                              : "var(--success)",
                          }}
                        />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
        </Box>
      )}

      {alerts.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Acknowledging hides alerts from Critical/Warning filters.
          </Alert>
        </Box>
      )}
    </Box>
  );
}
