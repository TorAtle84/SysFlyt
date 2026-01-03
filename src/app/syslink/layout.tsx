import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "SysLink - Prosjekthåndtering",
    description: "Kvalitetssikring og dokumenthåndtering i byggefasen",
    icons: {
        icon: "/favicon.ico",
    },
};

export default function SysLinkLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
