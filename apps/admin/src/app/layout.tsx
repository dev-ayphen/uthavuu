import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Tamil, Noto_Serif_Tamil } from "next/font/google";

import { Providers } from "@/components/providers/providers";
import { SITE } from "@/config/site";
import "./globals.css";

/**
 * Latin UI face. A console is read at 10–13px all day, so the priority is
 * legibility at small sizes and unambiguous digits, not personality.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Tamil text face.
 *
 * The chrome is english-only (App Profile: `apps/admin` is an internal staff
 * tool), but every report, comment and name flowing through moderation is
 * user-generated Tamil. Without this the console renders that content in
 * tofu boxes and a moderator cannot do their job.
 *
 * Inter carries no Tamil glyphs, so listing Noto Sans Tamil second in
 * --font-sans makes the browser fall through to it per-codepoint. No
 * per-string font switching, no locale detection.
 */
const notoSansTamil = Noto_Sans_Tamil({
  subsets: ["tamil", "latin"],
  variable: "--font-noto-tamil",
  display: "swap",
});

/** Tamil display face — the login headline only, matching the approved design. */
const notoSerifTamil = Noto_Serif_Tamil({
  subsets: ["tamil", "latin"],
  weight: ["600", "700"],
  variable: "--font-noto-serif-tamil",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} — Control Panel`,
    template: `%s · ${SITE.name}`,
  },
  description: "Moderation and operations console for the Uthavu community help network.",
  // An internal ops tool must never end up in a search index.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required on <html>: next-themes writes the
    // `data-theme` attribute from a blocking script before React hydrates, so
    // the server markup and the first client render legitimately differ here.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${notoSansTamil.variable} ${notoSerifTamil.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
