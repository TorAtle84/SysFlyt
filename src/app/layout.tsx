import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import AuthSessionProvider from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { InactivityProvider } from "@/components/providers/inactivity-provider";

export const metadata: Metadata = {
  title: "FlytLink - Plattform for byggeprosjekter",
  description: "Plattform for dokumenthåndtering og QA i byggeprosjekter",
  icons: {
    icon: "/flytlinkfavikon.png",
  },
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
          forcedTheme="dark"
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
