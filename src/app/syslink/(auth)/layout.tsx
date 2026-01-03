import "@/app/globals.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.08),transparent_25%),var(--color-background)] px-6 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,255,255,0.08),transparent_20%),radial-gradient(circle_at_90%_20%,rgba(255,255,255,0.05),transparent_22%)] pointer-events-none" />
      <div className="w-full max-w-5xl rounded-3xl border border-border bg-card/80 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)] md:p-12">
        <div className="grid gap-10 md:grid-cols-[1.2fr,1fr]">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">SysLink</p>
              <h1 className="mt-4 flex flex-wrap items-center gap-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">
                Byggebransjen møter
                <img src="/SysLinkText.png" alt="SysLink Logo" className="h-[2.4em] rounded-lg shadow-sm" />
              </h1>
              <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                Logg inn eller registrer deg for å få tilgang til prosjektrom, dokumenthåndtering og verktøy som er skreddersydd for dine byggeprosjekter.
              </p>
            </div>
            <div className="hidden items-center gap-3 rounded-2xl border border-border bg-muted/30 p-4 md:flex">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-900 to-slate-700 shadow-lg" />
              <div>
                <p className="text-sm font-semibold text-foreground">Robust sikkerhet</p>
                <p className="text-xs text-muted-foreground">RBAC, godkjenning og audit-traces bygget inn fra start.</p>
              </div>
            </div>
          </div>
          <div className="glass relative overflow-hidden rounded-3xl p-6 shadow-inner">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-info/10" />
            <div className="relative">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

