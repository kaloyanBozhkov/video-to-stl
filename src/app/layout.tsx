import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video → STL",
  description: "Record a video of an object, get a 3D-printable STL.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
