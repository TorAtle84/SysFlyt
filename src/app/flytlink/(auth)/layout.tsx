import "@/app/globals.css";

export default function FlytLinkAuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(147,51,234,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.08),transparent_25%),var(--color-background)] px-6 py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,255,255,0.08),transparent_20%),radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.05),transparent_22%)] pointer-events-none" />
            <div className="w-full max-w-5xl rounded-3xl border border-border bg-card/80 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] md:p-12">
                <div className="grid gap-10 md:grid-cols-[1.2fr,1fr]">
                    <div className="flex flex-col justify-between gap-8">
                        <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">FlytLink</p>
                            <h1 className="mt-4 flex flex-wrap items-center gap-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">
                                Kravsporing for
                                <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                                    byggeprosjekter
                                </span>
                            </h1>
                            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                                Planlegg, spor krav og koordiner grensesnitt før byggefasen starter.
                            </p>
                        </div>
                        <div className="hidden items-center gap-3 rounded-2xl border border-border bg-muted/30 p-4 md:flex">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 shadow-lg" />
                            <div>
                                <p className="text-sm font-semibold text-foreground">Koordinert planlegging</p>
                                <p className="text-xs text-muted-foreground">Spor krav og grensesnitt på tvers av fagdisipliner.</p>
                            </div>
                        </div>
                    </div>
                    <div className="glass relative overflow-hidden rounded-3xl p-6 shadow-inner">
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10" />
                        <div className="relative">{children}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
