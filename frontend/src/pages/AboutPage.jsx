import { useEffect, useMemo } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";

const PROJECT_TITLE = "Digital Twin of Smart Campus Using IoT Sensors";
const UNIVERSITY = "The Islamia University of Bahawalpur";
const DEPARTMENT = "Department of Software Engineering";
const SUPERVISOR = "Ms. Tayyaba Rashid";
const CONTACT_EMAIL = "talhachmeo@gmail.com";

const ACCENT_BLUE = "#4F8EF7";
const ACCENT_PURPLE = "#7C3AED";
const ACCENT_SUCCESS = "#00C48C";
const ACCENT_WARNING = "#FFB800";
const ACCENT_DANGER = "#FF4757";

function googleDetailsUrl(term) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${term} details`)}`;
}

function hexToRgb(hex) {
  const value = String(hex || "")
    .trim()
    .replace(/^#/, "");

  if (value.length === 3) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    return { r, g, b };
  }

  if (value.length !== 6) return null;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "rgba(255,255,255,0.08)";
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const tt = Math.max(0, Math.min(1, Number(t)));
  const r = Math.round(ca.r + (cb.r - ca.r) * tt);
  const g = Math.round(ca.g + (cb.g - ca.g) * tt);
  const bb = Math.round(ca.b + (cb.b - ca.b) * tt);
  return `#${[r, g, bb]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function useScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const elements = Array.from(document.querySelectorAll(".aboutReveal"));
    if (elements.length === 0) return;

    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    if (prefersReduced) {
      for (const el of elements) el.classList.add("isVisible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("isVisible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -12% 0px" }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);
}

export default function AboutPage() {
  useScrollReveal();

  const features = useMemo(
    () => [
      {
        title: "Real-time Monitoring",
        icon: "📡",
        text: "Live sensor data visualization",
      },
      {
        title: "AI-Powered Alerts",
        icon: "🤖",
        text: "Automatic anomaly detection",
      },
      {
        title: "Remote Monitoring",
        icon: "💡",
        text: "Monitor devices from anywhere",
      },
    ],
    []
  );

  const tech = useMemo(() => {
    const teal = mixHex(ACCENT_BLUE, ACCENT_SUCCESS, 0.55);
    const orange = mixHex(ACCENT_WARNING, ACCENT_DANGER, 0.55);
    const indigo = mixHex(ACCENT_BLUE, ACCENT_PURPLE, 0.55);

    return [
      { label: "ESP32", accent: ACCENT_BLUE },
      { label: "MQTT", accent: ACCENT_PURPLE },
      { label: "Flask", accent: ACCENT_WARNING },
      { label: "React", accent: ACCENT_SUCCESS },
      { label: "SQLite", accent: ACCENT_DANGER },
      { label: "WebSocket", accent: indigo },
      { label: "Python", accent: orange },
      { label: "Arduino", accent: teal },
    ];
  }, []);

  return (
    <Box className="aboutPage">
      {/* Hero */}
      <Box
        className="aboutHero"
        sx={{
          "--heroBlue": ACCENT_BLUE,
          "--heroPurple": ACCENT_PURPLE,
          "--heroBlueGlow": rgba(ACCENT_BLUE, 0.22),
          "--heroPurpleGlow": rgba(ACCENT_PURPLE, 0.18),
        }}
      >
        <Box className="aboutHeroInner">
          <Typography component="h2" className="aboutHeroTitle">
            {PROJECT_TITLE}
          </Typography>
          <Typography component="div" className="aboutHeroSubtitle">
            Real-time IoT Monitoring System
          </Typography>
          <Typography component="div" className="aboutHeroUniversity">
            {UNIVERSITY}
          </Typography>

          <Box className="aboutHeroMeta" aria-label="Project details">
            <Box className="aboutMetaPill">
              <span className="aboutMetaLabel">Department</span>
              <span className="aboutMetaValue">{DEPARTMENT}</span>
            </Box>
            <Box className="aboutMetaPill">
              <span className="aboutMetaLabel">Supervisor</span>
              <span className="aboutMetaValue">{SUPERVISOR}</span>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Project description / highlights */}
      <Box className="aboutSection">
        <Typography variant="h6" className="aboutSectionTitle">
          Project Highlights
        </Typography>
        <Box className="aboutFeaturesGrid">
          {features.map((f) => (
            <Card key={f.title} className="aboutFeatureCard aboutReveal">
              <CardContent className="aboutFeatureCardContent">
                <Box className="aboutFeatureIcon" aria-hidden>
                  {f.icon}
                </Box>
                <Box className="aboutFeatureBody">
                  <Typography component="div" className="aboutFeatureTitle">
                    {f.title}
                  </Typography>
                  <Typography component="div" className="aboutFeatureText">
                    {f.text}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Team */}
      <Box className="aboutSection">
        <Typography variant="h6" className="aboutSectionTitle">
          Meet The Team
        </Typography>

        <Box className="aboutTeamGrid" aria-label="Team members">
          <Card
            className="pageCard aboutReveal"
            sx={{ borderColor: rgba(ACCENT_BLUE, 0.35) }}
          >
            <CardContent
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 1.25,
                py: 3,
              }}
            >
              <Box
                className="aboutAvatar"
                sx={{
                  "--avatarFrom": ACCENT_BLUE,
                  "--avatarTo": mixHex(ACCENT_BLUE, ACCENT_SUCCESS, 0.38),
                }}
                aria-label="Talha Azmat avatar"
              >
                T
              </Box>
              <Typography component="div" sx={{ fontWeight: 950 }}>
                Talha Azmat
              </Typography>
            </CardContent>
          </Card>

          <Card
            className="pageCard aboutReveal"
            sx={{ borderColor: rgba(ACCENT_PURPLE, 0.35) }}
          >
            <CardContent
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 1.25,
                py: 3,
              }}
            >
              <Box
                className="aboutAvatar"
                sx={{
                  "--avatarFrom": ACCENT_PURPLE,
                  "--avatarTo": mixHex(ACCENT_PURPLE, ACCENT_BLUE, 0.38),
                }}
                aria-label="Muhammad Taha avatar"
              >
                T
              </Box>
              <Typography component="div" sx={{ fontWeight: 950 }}>
                Muhammad Taha
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Tech stack */}
      <Box className="aboutSection">
        <Typography variant="h6" className="aboutSectionTitle">
          Built With
        </Typography>
        <Box className="aboutTechRow" role="list" aria-label="Technology stack">
          {tech.map((t) => (
            <Box
              key={t.label}
              component="a"
              role="listitem"
              className="aboutTechPill"
              href={googleDetailsUrl(t.label)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Search Google for ${t.label} details`}
              aria-label={`Open Google search for ${t.label} details`}
              sx={{
                "--pillAccent": t.accent,
                "--pillAccentSoft": rgba(t.accent, 0.16),
                "--pillAccentGlow": rgba(t.accent, 0.3),
              }}
            >
              {t.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Contact */}
      <Box className="aboutSection aboutReveal">
        <Typography variant="h6" className="aboutSectionTitle">
          Contact Us
        </Typography>

        <Typography component="div" sx={{ fontWeight: 950 }}>
          <a className="aboutEmailLink" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </Typography>
      </Box>
    </Box>
  );
}
