import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gigit",
  description: "Book live music, comedy, and sound techs for your venue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <Link href="/" className="brand">
            Gigit
          </Link>
          <Link href="/slots/new">Post a slot</Link>
          <Link href="/techs">Sound techs</Link>
          <Link href="/bookings">Bookings</Link>
          <Link href="/inbox">Inbox</Link>
          <Link href="/me">Profile</Link>
          <Link href="/login">Sign in</Link>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
