"use client";

import { Construction } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FlytLinkDashboardPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500">
                <Construction className="h-10 w-10 text-white" />
            </div>
            <div className="text-center">
                <h1 className="text-3xl font-bold text-foreground">FlytLink Dashboard</h1>
                <p className="mt-2 text-muted-foreground">
                    Denne modulen er under utvikling. Kom tilbake snart!
                </p>
            </div>
            <Link href="/">
                <Button variant="outline">Tilbake til startsiden</Button>
            </Link>
        </div>
    );
}
