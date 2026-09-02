import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ProductSwitcher } from "./components/ProductSwitcher";
import { resolvePublicOrigin } from "../lib/origin";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "A browser-based parametric generator for simple, 3D-printable drawer organizers.";

export function generateMetadata(): Metadata {
  const origin = resolvePublicOrigin();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "DrawerForge",
      template: "%s · DrawerForge",
    },
    description,
    applicationName: "DrawerForge",
    openGraph: {
      type: "website",
      url: origin,
      siteName: "DrawerForge",
      title: "DrawerForge — Measure. Divide. Print.",
      description,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1731,
          height: 909,
          alt: "DrawerForge beside an amber 2 by 3 drawer organizer",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "DrawerForge — Measure. Divide. Print.",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="app-header">
          <Link
            href="/"
            className="brand-lockup"
            aria-label="DrawerForge home"
          >
            <span className="brand-mark" aria-hidden="true">
              DF
            </span>
            <div>
              <div className="brand-name">DrawerForge</div>
              <div className="brand-tagline">Measure. Divide. Print.</div>
            </div>
          </Link>
          <div className="header-actions">
            <ProductSwitcher />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
