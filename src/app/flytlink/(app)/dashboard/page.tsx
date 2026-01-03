"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSearch, Upload, Settings, ArrowRight } from "lucide-react";

export default function FlytLinkDashboardPage() {
    const { data: session } = useSession();
    const firstName = session?.user?.name?.split(" ")[0] || "bruker";

    return (
        <div className="space-y-8">
            {/* Welcome Section */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    Velkommen til FlytLink, {firstName}!
                </h1>
                <p className="text-muted-foreground">
                    Automatisk kravsporing og analyse av prosjektdokumenter med AI
                </p>
            </div>

            {/* Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white mb-2">
                            <FileSearch className="h-6 w-6" />
                        </div>
                        <CardTitle>Ny Kravsporing</CardTitle>
                        <CardDescription>
                            Last opp dokumenter og start automatisk kravanalyse
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/flytlink/kravsporing">
                            <Button className="w-full group-hover:bg-primary">
                                Start analyse
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white mb-2">
                            <Upload className="h-6 w-6" />
                        </div>
                        <CardTitle>Mine Analyser</CardTitle>
                        <CardDescription>
                            Se tidligere kravsporingsanalyser og resultater
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/flytlink/kravsporing">
                            <Button variant="outline" className="w-full">
                                Se analyser
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/50 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white mb-2">
                            <Settings className="h-6 w-6" />
                        </div>
                        <CardTitle>Innstillinger</CardTitle>
                        <CardDescription>
                            Konfigurer API-nøkler og analyseparametere
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link href="/flytlink/profile">
                            <Button variant="outline" className="w-full">
                                Gå til profil
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>

            {/* Info Section */}
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Slik fungerer FlytLink</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 items-start">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                            1
                        </div>
                        <div>
                            <h4 className="font-medium">Last opp dokumenter</h4>
                            <p className="text-sm text-muted-foreground">
                                Last opp PDF, Word, Excel eller MSG-filer fra ditt prosjekt
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4 items-start">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                            2
                        </div>
                        <div>
                            <h4 className="font-medium">AI analyserer innholdet</h4>
                            <p className="text-sm text-muted-foreground">
                                FlytLink bruker avansert AI for å identifisere krav, spesifikasjoner og ansvar
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-4 items-start">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                            3
                        </div>
                        <div>
                            <h4 className="font-medium">Gjennomgå og eksporter</h4>
                            <p className="text-sm text-muted-foreground">
                                Se over identifiserte krav, korriger ved behov, og eksporter til Excel
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
