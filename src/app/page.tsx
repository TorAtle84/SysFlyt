"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { ThemeProvider } from "@/components/providers/theme-provider";

const applications = [
  {
    code: "flytlink",
    name: "FlytLink",
    description: "Kravsporing og planlegging før byggefasen",
    logo: "/flytlinklogo.png",
    color: "from-purple-500 to-pink-500",
    href: "/flytlink/login",
    features: ["Kravsporing", "Grensesnittmatrise", "Prosjektplanlegging"],
    comingSoon: false,
  },
  {
    code: "syslink",
    name: "SysLink",
    description: "Kvalitetssikring og dokumenthåndtering i byggefasen",
    logo: "/SysLinkText.png",
    color: "from-blue-500 to-cyan-500",
    href: "/syslink/login",
    features: ["MC-protokoller", "Funksjonstester", "Dokumentkontroll", "Avviksregistrering"],
  },
];

export default function LandingPage() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" disableTransitionOnChange>
      <div className="min-h-screen bg-[#0B1220]">
        {/* Header */}
        <header className="border-b border-[#24314A] bg-[#0B1220]/80 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <Image
                src="/flytlinklogo.png"
                alt="FlytLink"
                width={52}
                height={52}
                className="rounded-xl"
              />
              <div>
                <h1 className="text-xl font-bold text-foreground">FlytLink</h1>
                <p className="text-xs text-muted-foreground">Plattform for byggeprosjekter</p>
              </div>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="container mx-auto px-6 py-16">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              Velg applikasjon
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              FlytLink-plattformen gir deg verktøyene du trenger for å lykkes med komplekse byggeprosjekter.
            </p>
          </div>

          {/* App Cards */}
          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            {applications.map((app) => (
              <Link
                key={app.code}
                href={app.comingSoon ? "#" : app.href}
                className={`group relative overflow-hidden rounded-2xl border border-[#24314A] bg-[#111A2E] p-8 transition-all duration-300 ${app.comingSoon
                  ? "cursor-not-allowed opacity-60"
                  : "hover:border-[#20528D] hover:shadow-xl hover:shadow-[#000]/20"
                  }`}
              >
                {/* Module Top Stripe */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${app.color}`} />


                {/* Coming Soon Badge */}
                {app.comingSoon && (
                  <div className="absolute right-4 top-4 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    Kommer snart
                  </div>
                )}

                {/* Logo */}
                <div className="mb-6 h-24 flex items-center">
                  <Image
                    src={app.logo}
                    alt={app.name}
                    width={app.code === "syslink" ? 225 : 200}
                    height={80}
                    className="object-contain"
                  />
                </div>

                {/* Content */}
                <p className="mb-6 text-muted-foreground">{app.description}</p>

                {/* Features */}
                <ul className="mb-6 space-y-2">
                  {app.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${app.color}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {!app.comingSoon && (
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground group-hover:text-primary">
                    Gå til {app.name}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border/40">
          <div className="container mx-auto px-6 py-6">
            <p className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} FlytLink. Alle rettigheter reservert.
            </p>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  );
}
