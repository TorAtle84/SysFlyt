import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import AuthSessionProvider from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { InactivityProvider } from "@/components/providers/inactivity-provider";

export const metadata: Metadata = {
  title: "SysLink - Prosjekthåndtering",
  description: "Plattform for dokumenthåndtering og QA i byggeprosjekter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="no" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthSessionProvider>
            <InactivityProvider timeoutMinutes={15}>
              {children}
            </InactivityProvider>
          </AuthSessionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
