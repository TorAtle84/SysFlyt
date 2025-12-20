"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Shield, ExternalLink, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface TotpWarningBannerProps {
  daysRemaining: number;
  onDismiss?: () => void;
}

const AUTHENTICATOR_GUIDES = [
  {
    name: "Google Authenticator",
    icon: "🔐",
    links: [
      { label: "Android", url: "https://support.google.com/accounts/answer/1066447?hl=no&co=GENIE.Platform%3DAndroid" },
      { label: "iPhone", url: "https://support.google.com/accounts/answer/1066447?hl=no&co=GENIE.Platform%3DiOS" },
    ],
  },
  {
    name: "Microsoft Authenticator",
    icon: "🛡️",
    links: [
      { label: "Veiledning (norsk)", url: "https://support.microsoft.com/nb-no/account-billing/how-to-use-the-microsoft-authenticator-app-9783c865-0308-42fb-a519-8cf666fe0acc" },
    ],
  },
];

export function TotpWarningBanner({ daysRemaining, onDismiss }: TotpWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [showGuides, setShowGuides] = useState(false);

  // De siste 3 dagene kan ikke lukkes
  const canBeDismissed = daysRemaining > 3;
  const isUrgent = daysRemaining <= 3;

  useEffect(() => {
    // Hvis det er mindre enn 3 dager igjen, tving visning
    if (!canBeDismissed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
      return;
    }

    const dismissedUntil = localStorage.getItem("totp-warning-dismissed");
    if (dismissedUntil) {
      const dismissedDate = new Date(dismissedUntil);
      if (dismissedDate > new Date()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(true);
      } else {
        localStorage.removeItem("totp-warning-dismissed");
      }
    }
  }, [canBeDismissed]);

  const handleDismiss = () => {
    if (!canBeDismissed) return;

    const dismissUntil = new Date();
    dismissUntil.setTime(dismissUntil.getTime() + 24 * 60 * 60 * 1000);
    localStorage.setItem("totp-warning-dismissed", dismissUntil.toISOString());
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  const bgColor = isUrgent ? "bg-destructive/10 border-destructive" : "bg-warning/10 border-warning";
  const textColor = isUrgent ? "text-destructive" : "text-warning-foreground";
  const iconColor = isUrgent ? "text-destructive" : "text-warning";

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 border-t ${bgColor} shadow-lg`}>
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-start gap-4 p-4">
          <div className={`p-2 rounded-full flex-shrink-0 ${isUrgent ? "bg-destructive/20" : "bg-warning/20"}`}>
            {isUrgent ? (
              <AlertTriangle className={`h-5 w-5 ${iconColor}`} />
            ) : (
              <Clock className={`h-5 w-5 ${iconColor}`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className={`font-semibold ${textColor}`}>
                {isUrgent ? "⚠️ HASTEVARSEL: " : "📢 "}
                Aktiver tofaktor-autentisering
              </h3>
              {canBeDismissed && (
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:bg-muted rounded-md transition-colors flex-shrink-0"
                  title="Skjul til i morgen"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>

            <p className="text-sm mt-1">
              {daysRemaining === 1 ? (
                <span className={textColor}>
                  Du har <strong>1 dag</strong> igjen til å aktivere tofaktor-autentisering.
                </span>
              ) : daysRemaining === 0 ? (
                <span className={textColor}>
                  <strong>Siste dag!</strong> Aktiver tofaktor-autentisering i dag, ellers blir kontoen din deaktivert.
                </span>
              ) : (
                <>
                  Du har <strong className={textColor}>{daysRemaining} dager</strong> igjen til å aktivere tofaktor-autentisering.
                </>
              )}
              {" "}
              {!isUrgent && "Kontoen din vil bli deaktivert hvis du ikke aktiverer dette innen fristen."}
              {isUrgent && <strong>Kontoen blir automatisk deaktivert når fristen utløper.</strong>}
            </p>

            <div className="flex flex-wrap gap-2 mt-3">
              <Link href="/profile">
                <Button variant={isUrgent ? "destructive" : "default"} size="sm" className="gap-2">
                  <Shield className="h-4 w-4" />
                  Aktiver nå
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGuides(!showGuides)}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                {showGuides ? "Skjul veiledninger" : "Hvordan sette opp?"}
              </Button>
            </div>

            {showGuides && (
              <div className="mt-4 p-3 bg-background rounded-lg border space-y-3">
                <p className="text-sm font-medium">
                  Last ned en authenticator-app og følg veiledningen:
                </p>
                {AUTHENTICATOR_GUIDES.map((guide) => (
                  <div key={guide.name} className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{guide.icon}</span>
                    <span className="text-sm font-medium">{guide.name}:</span>
                    {guide.links.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Etter at du har installert appen, gå til din profil og følg instruksjonene for å aktivere tofaktor-autentisering.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
