import "@/app/globals.css";
import { AppShell } from "@/components/layout/app-shell";

export default function FlytLinkAppLayout({ children }: { children: React.ReactNode }) {
    return <AppShell variant="flytlink">{children}</AppShell>;
}
