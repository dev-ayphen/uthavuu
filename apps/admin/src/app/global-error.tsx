"use client";

/**
 * ERROR LAYER 3 of 4 — the root layout failed.
 *
 * This replaces the root layout entirely, so it must render its own <html> and
 * <body>. Critically, it does NOT receive globals.css or the theme attribute —
 * the app's `data-theme` never reaches it. Every style here is therefore
 * inline, and the palette follows the OS colour scheme via `color-scheme`
 * rather than the app's own toggle.
 *
 * Nothing here may import from the design system: if the root layout is
 * broken, its stylesheet is exactly what cannot be relied on.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "Canvas",
          color: "CanvasText",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <title>Uthavu Admin — Console error</title>
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.55,
            }}
          >
            Uthavu Admin
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.25rem", fontWeight: 800 }}>
            The console failed to start
          </h1>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", lineHeight: 1.5, opacity: 0.75 }}>
            Something broke before the interface could render. Reload to try again — if it keeps
            happening, send the reference below to engineering.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "1rem 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                opacity: 0.6,
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#ffffff",
              background: "#16a34a",
              border: "none",
              borderRadius: "0.625rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
