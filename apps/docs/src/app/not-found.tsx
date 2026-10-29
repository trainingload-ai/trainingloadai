import Link from "next/link";

export default function RootNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        background: "var(--background, #FAFAF7)",
        color: "var(--foreground, #191B18)",
        fontFamily:
          'var(--tl-font-ui, "Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif)',
        padding: "32px",
      }}
    >
      <section style={{ width: "100%", maxWidth: "720px" }}>
        <Link
          href="/"
          style={{
            color: "var(--foreground, #191B18)",
            fontSize: "20px",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Trainingload.ai
        </Link>
        <p
          style={{
            marginTop: "48px",
            color: "var(--success, #287A4A)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: 0,
            textTransform: "uppercase",
          }}
        >
          Page not found
        </p>
        <h1
          style={{
            margin: "12px 0 0",
            maxWidth: "620px",
            color: "var(--foreground, #191B18)",
            fontSize: "48px",
            lineHeight: 1,
            fontWeight: 800,
          }}
        >
          This page is off the route.
        </h1>
        <p
          style={{
            marginTop: "20px",
            maxWidth: "560px",
            color: "var(--muted-foreground, #70746C)",
            fontSize: "18px",
            lineHeight: 1.7,
          }}
        >
          The page may have moved, or the link may be missing a language prefix.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            marginTop: "32px",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "44px",
              borderRadius: "var(--tl-radius-control, 10px)",
              background: "var(--brand, #20C77A)",
              color: "var(--brand-foreground, #102319)",
              padding: "0 18px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Back home
          </Link>
          <Link
            href="/docs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "44px",
              border: "1px solid var(--border, #E3E6DE)",
              borderRadius: "var(--tl-radius-control, 10px)",
              color: "var(--foreground, #191B18)",
              padding: "0 18px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open docs
          </Link>
        </div>
      </section>
    </main>
  );
}
