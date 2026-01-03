import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "FlytLink - Kravsporing",
    description: "Kravsporing og planlegging før byggefasen",
    icons: {
        icon: "/flytlinkfavikon.png",
    },
};

export default function FlytLinkLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
