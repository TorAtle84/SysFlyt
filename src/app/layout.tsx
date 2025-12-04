import "./globals.css";
import type { Metadata } from "next";
import AuthSessionProvider from "@/components/providers/session-provider";

export const metadata: Metadata = {
  title: "Sluttfase - Prosjekthåndtering",
  description: "Plattform for dokumenthåndtering og QA i sluttfase-prosjekter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="no">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
