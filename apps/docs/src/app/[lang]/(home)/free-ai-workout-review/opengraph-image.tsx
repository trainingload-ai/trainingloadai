import { ImageResponse } from "next/og";

export const alt = "Free AI Workout Review by Trainingload.ai";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#f3eddf",
        color: "#17201c",
        padding: "48px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          border: "4px solid #17201c",
          boxShadow: "12px 12px 0 #17201c",
          background: "#fffaf0",
        }}
      >
        <div
          style={{
            width: "57%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px",
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              display: "flex",
              border: "3px solid #17201c",
              boxShadow: "5px 5px 0 #17201c",
              background: "#f5cf58",
              padding: "12px 16px",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            TRAININGLOAD.AI / FREE TOOL
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 68,
                fontWeight: 900,
                lineHeight: 0.96,
                letterSpacing: -4,
              }}
            >
              FREE AI
              <br />
              WORKOUT REVIEW
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 24,
                color: "#52605a",
              }}
            >
              FIT / GPX / TCX - evidence, recovery and next workout
            </div>
          </div>
        </div>
        <div
          style={{
            width: "43%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderLeft: "4px solid #17201c",
            background: "#07110f",
            color: "#f7f3e9",
            padding: "34px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            <span>3D ROUTE LAB</span>
            <span style={{ color: "#76efa3" }}>LIVE</span>
          </div>
          <svg width="420" height="330" viewBox="0 0 420 330" fill="none">
            <defs>
              <linearGradient
                id="og-route"
                x1="28"
                y1="270"
                x2="390"
                y2="50"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#7C3AED" />
                <stop offset=".3" stopColor="#2563EB" />
                <stop offset=".6" stopColor="#0DB8B0" />
                <stop offset="1" stopColor="#F5CF58" />
              </linearGradient>
            </defs>
            <path
              d="M28 270C76 292 93 238 135 243C181 248 164 166 218 172C268 178 260 216 311 160C344 124 334 72 390 50"
              stroke="#020504"
              strokeWidth="22"
              strokeLinecap="round"
            />
            <path
              d="M28 270C76 292 93 238 135 243C181 248 164 166 218 172C268 178 260 216 311 160C344 124 334 72 390 50"
              stroke="url(#og-route)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle
              cx="28"
              cy="270"
              r="13"
              fill="#76EFA3"
              stroke="#07110F"
              strokeWidth="5"
            />
            <path
              d="M390 28L406 54L390 64L374 54L390 28Z"
              fill="#F5CF58"
              stroke="#07110F"
              strokeWidth="5"
            />
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 18,
              fontWeight: 700,
              color: "#9ba8a1",
            }}
          >
            <span>PRIVATE</span>
            <span>NO ACCOUNT</span>
            <span>FREE</span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
