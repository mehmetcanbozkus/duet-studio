import { ImageResponse } from "next/og";

export const alt =
  "Duet Studio — a browser music studio where you and your AI agent produce a track together";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HUMAN = "#f2a03d";
const AGENT = "#b07df5";
const EMPTY = "#1f1f1f";

// The same four tracks the studio opens with, drawn as the grid an agent reads.
const ROWS: { color: string; pattern: string }[] = [
  { color: HUMAN, pattern: "X...x...X...x..." },
  { color: HUMAN, pattern: "..x...x...x...x." },
  { color: AGENT, pattern: "x..x..x...x..x.." },
  { color: AGENT, pattern: "x.......x......." },
];

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0f0f0f",
        color: "#fafafa",
        padding: "64px 72px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 7,
              height: 64,
            }}
          >
            <div
              style={{
                width: 12,
                height: 34,
                borderRadius: 6,
                background: HUMAN,
              }}
            />
            <div
              style={{
                width: 12,
                height: 52,
                borderRadius: 6,
                background: HUMAN,
              }}
            />
            <div
              style={{
                width: 12,
                height: 26,
                borderRadius: 6,
                background: AGENT,
              }}
            />
            <div
              style={{
                width: 12,
                height: 44,
                borderRadius: 6,
                background: AGENT,
              }}
            />
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>
            Duet Studio
          </div>
        </div>
        {/* One span per line: satori renders no <br /> inside the Next runtime. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 34,
            color: "#a3a3a3",
            lineHeight: 1.3,
          }}
        >
          <span>A browser music studio where you and your AI agent</span>
          <span>produce a track together.</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {ROWS.map((row) => (
          <div key={row.pattern} style={{ display: "flex", gap: 10 }}>
            {row.pattern.split("").map((step, i) => (
              <div
                key={i}
                style={{
                  width: 55,
                  height: 55,
                  borderRadius: 10,
                  background: step === "." ? EMPTY : row.color,
                  opacity: step === "x" ? 0.75 : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 26,
          color: "#8a8a8a",
        }}
      >
        <span style={{ color: HUMAN }}>you</span>
        <span>+</span>
        <span style={{ color: AGENT }}>agent</span>
        <span style={{ color: "#3f3f3f" }}>·</span>
        <span>every note is a WebMCP tool on document.modelContext</span>
      </div>
    </div>,
    size,
  );
}
