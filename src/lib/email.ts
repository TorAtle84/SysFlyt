import nodemailer from "nodemailer";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendResetEmail(to: string, resetUrl: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Tilbakestill passord - SysLink",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SysLink</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">Tilbakestill passord</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                Vi mottok en forespørsel om å tilbakestille passordet for din SysLink-konto. 
                Klikk på knappen nedenfor for å opprette et nytt passord.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Tilbakestill passord
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
                Denne lenken utløper om 1 time. Hvis du ikke har bedt om å tilbakestille passordet, 
                kan du ignorere denne e-posten.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Hvis knappen ikke fungerer, kopier og lim inn denne lenken i nettleseren din:
                <br>
                <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
              </p>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Tilbakestill passord - SysLink

Vi mottok en forespørsel om å tilbakestille passordet for din SysLink-konto.

Klikk på lenken nedenfor for å opprette et nytt passord:
${resetUrl}

Denne lenken utløper om 1 time.

Hvis du ikke har bedt om å tilbakestille passordet, kan du ignorere denne e-posten.

© ${new Date().getFullYear()} SysLink
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Reset email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send reset email:", error);
    throw new Error("Kunne ikke sende e-post");
  }
}

export async function sendWelcomeEmail(to: string, firstName: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Velkommen til SysLink",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SysLink</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">Velkommen, ${firstName}!</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                Takk for at du registrerte deg på SysLink. Din konto venter på godkjenning fra en administrator.
              </p>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                Du vil motta en e-post når kontoen din er aktivert og du kan logge inn.
              </p>
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">
                  <strong>Viktig:</strong> Når kontoen din er aktivert, må du sette opp tofaktorautentisering (2FA) 
                  innen 14 dager for å opprettholde tilgangen.
                </p>
              </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send welcome email:", error);
  }
}

export async function sendTaskAssignedEmail(
  to: string,
  assigneeName: string,
  taskTitle: string,
  projectName: string,
  assignerName: string,
  dueDate: string | null,
  taskUrl: string
) {
  const dueDateText = dueDate
    ? `<p style="color: #4b5563; line-height: 1.6; margin: 0 0 16px 0;"><strong>Frist:</strong> ${dueDate}</p>`
    : "";

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Ny oppgave tildelt: ${taskTitle} - SysLink`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SysLink</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">Ny oppgave tildelt</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                Hei ${assigneeName}, ${assignerName} har tildelt deg en ny oppgave.
              </p>
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">${taskTitle}</p>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">Prosjekt: ${projectName}</p>
              </div>
              ${dueDateText}
              <div style="text-align: center; margin: 32px 0;">
                <a href="${taskUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Se oppgave
                </a>
              </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Ny oppgave tildelt - SysLink

Hei ${assigneeName}, ${assignerName} har tildelt deg en ny oppgave.

Oppgave: ${taskTitle}
Prosjekt: ${projectName}
${dueDate ? `Frist: ${dueDate}` : ""}

Se oppgaven: ${taskUrl}

© ${new Date().getFullYear()} SysLink
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Task assigned email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send task assigned email:", error);
  }
}

export async function sendAccountActivatedEmail(to: string, firstName: string, loginUrl: string) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Kontoen din er aktivert - SysLink",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SysLink</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">Kontoen din er aktivert!</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                Hei ${firstName}, kontoen din på SysLink er nå godkjent og aktivert.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Logg inn nå
                </a>
              </div>
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 16px; margin: 24px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">
                  <strong>Viktig:</strong> Husk å sette opp tofaktorautentisering (2FA) innen 14 dager 
                  for å opprettholde tilgangen til kontoen din.
                </p>
              </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Account activated email sent to ${to}`);
  } catch (error) {
    console.error("Failed to send account activated email:", error);
  }
}

export async function sendProtocolEmail(
  to: string,
  recipientName: string | null,
  senderName: string,
  itemType: "MC_PROTOCOL" | "FUNCTION_TEST",
  itemName: string,
  projectName: string,
  pdfBuffer?: Buffer
) {
  const itemTypeLabel = itemType === "MC_PROTOCOL" ? "MC Protokoll" : "Funksjonstest";
  const greeting = recipientName ? `Hei ${recipientName}` : "Hei";
  const fileName = `${itemName.replace(/[^a-zA-Z0-9æøåÆØÅ\-_ ]/g, "")}-${itemTypeLabel.toLowerCase().replace(" ", "-")}.pdf`;

  const mailOptions: {
    from: string | undefined;
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments?: { filename: string; content: Buffer; contentType: string }[];
  } = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `${itemTypeLabel}: ${itemName} - SysLink`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">SysLink</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 20px;">${itemTypeLabel} delt med deg</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                ${greeting}, ${senderName} har delt en ${itemTypeLabel.toLowerCase()} med deg.
              </p>
              <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="color: #1f2937; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">${itemName}</p>
                <p style="color: #6b7280; margin: 0; font-size: 14px;">Prosjekt: ${projectName}</p>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
                ${pdfBuffer ? "Se vedlagt PDF for detaljer." : "Dokumentet er vedlagt denne e-posten."}
              </p>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
${itemTypeLabel} delt med deg - SysLink

${greeting}, ${senderName} har delt en ${itemTypeLabel.toLowerCase()} med deg.

${itemName}
Prosjekt: ${projectName}

${pdfBuffer ? "Se vedlagt PDF for detaljer." : "Dokumentet er vedlagt denne e-posten."}

© ${new Date().getFullYear()} SysLink
    `,
  };

  // Add PDF attachment if provided
  if (pdfBuffer) {
    mailOptions.attachments = [
      {
        filename: fileName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Protocol email sent to ${to} with${pdfBuffer ? "" : "out"} PDF attachment`);
  } catch (error) {
    console.error("Failed to send protocol email:", error);
    throw new Error("Kunne ikke sende e-post");
  }
}

export type ProtocolStatusReportItem = {
  title: string;
  progress: number;
  missingLabels: string[];
  link?: string | null;
};

export async function sendProtocolStatusReportEmail(input: {
  to: string;
  recipientName?: string | null;
  projectName: string;
  generatedAt: Date;
  protocols: ProtocolStatusReportItem[];
  functionTests: ProtocolStatusReportItem[];
  projectUrl?: string | null;
  profileUrl?: string | null;
}) {
  const {
    to,
    recipientName,
    projectName,
    generatedAt,
    protocols,
    functionTests,
    projectUrl,
    profileUrl,
  } = input;

  const greeting = recipientName ? `Hei ${escapeHtml(recipientName)}` : "Hei";
  const projectNameSafe = escapeHtml(projectName);
  const dateLabel = format(generatedAt, "dd.MM.yyyy", { locale: nb });

  const missingProtocolCount = protocols.filter((p) => p.missingLabels.length > 0).length;
  const missingFunctionTestCount = functionTests.filter((t) => t.missingLabels.length > 0).length;

  const summaryText =
    missingProtocolCount + missingFunctionTestCount === 0
      ? "Alle protokoller og funksjonstester har komplett informasjon."
      : `Mangler info i ${missingProtocolCount} MC-protokoller og ${missingFunctionTestCount} funksjonstester.`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
        <div style="max-width: 720px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%; padding: 32px; text-align: left;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">Protokollstatus</h1>
            <p style="color: #d1d5db; margin: 8px 0 0 0; font-size: 14px;">${projectNameSafe} • ${dateLabel}</p>
          </div>
          <div style="padding: 28px 32px 8px 32px;">
            <p style="color: #1f2937; line-height: 1.6; margin: 0 0 12px 0;">
              ${greeting}, her er dagens statusrapport.
            </p>
            <p style="color: #6b7280; line-height: 1.6; margin: 0 0 24px 0;">
              ${summaryText}
            </p>
            ${renderSection("MC Protokoller", protocols)}
            ${renderSection("Funksjonstester", functionTests)}
            <div style="margin-top: 24px;">
              ${
                projectUrl
                  ? `<a href="${projectUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">Åpne prosjekt</a>`
                  : ""
              }
              ${
                profileUrl
                  ? `<a href="${profileUrl}" style="display: inline-block; margin-left: 12px; color: #0f172a; text-decoration: none; font-size: 14px;">Rapportinnstillinger</a>`
                  : ""
              }
            </div>
          </div>
          <div style="background-color: #f9fafb; padding: 16px 32px; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              © ${new Date().getFullYear()} SysLink. Alle rettigheter forbeholdt.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = [
    `Protokollstatus - ${projectName}`,
    `Dato: ${dateLabel}`,
    "",
    greeting + ", her er dagens statusrapport.",
    summaryText,
    "",
    formatSectionText("MC Protokoller", protocols),
    "",
    formatSectionText("Funksjonstester", functionTests),
    "",
    projectUrl ? `Prosjekt: ${projectUrl}` : "",
    profileUrl ? `Rapportinnstillinger: ${profileUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Protokollstatus - ${projectName}`,
    html,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Protocol status report sent to ${to}`);
  } catch (error) {
    console.error("Failed to send protocol status report:", error);
    throw new Error("Kunne ikke sende rapport");
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function renderSection(title: string, items: ProtocolStatusReportItem[]): string {
  const rows = items.length === 0
    ? `<tr><td style="padding: 12px 0; color: #6b7280;">Ingen funnet.</td></tr>`
    : items
      .map((item) => {
        const missingText = item.missingLabels.length > 0
          ? escapeHtml(item.missingLabels.join(", "))
          : "OK";
        const missingColor = item.missingLabels.length > 0 ? "#b91c1c" : "#16a34a";
        const link = item.link
          ? `<a href="${item.link}" style="color: #0f172a; text-decoration: none; font-weight: 600;">Åpne</a>`
          : "-";
        return `
          <tr>
            <td style="padding: 12px 8px 12px 0; border-bottom: 1px solid #e5e7eb;">
              <div style="font-weight: 600; color: #111827;">${escapeHtml(item.title)}</div>
            </td>
            <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; color: #111827;">
              ${item.progress}%
            </td>
            <td style="padding: 12px 8px; border-bottom: 1px solid #e5e7eb; color: ${missingColor};">
              ${missingText}
            </td>
            <td style="padding: 12px 0 12px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">
              ${link}
            </td>
          </tr>
        `;
      })
      .join("");

  return `
    <div style="margin-bottom: 20px;">
      <h2 style="margin: 0 0 8px 0; font-size: 16px; color: #111827;">${escapeHtml(title)}</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px 8px 8px 0; color: #6b7280; font-weight: 500;">Navn</th>
            <th style="text-align: right; padding: 8px 8px; color: #6b7280; font-weight: 500;">Fremdrift</th>
            <th style="text-align: left; padding: 8px 8px; color: #6b7280; font-weight: 500;">Mangler</th>
            <th style="text-align: right; padding: 8px 0 8px 8px; color: #6b7280; font-weight: 500;">Link</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function formatSectionText(title: string, items: ProtocolStatusReportItem[]): string {
  if (items.length === 0) return `${title}: Ingen funnet.`;
  const lines = items.map((item) => {
    const missingText = item.missingLabels.length > 0 ? item.missingLabels.join(", ") : "OK";
    const link = item.link ? ` | ${item.link}` : "";
    return `- ${item.title}: ${item.progress}% | Mangler: ${missingText}${link}`;
  });
  return `${title}:\n${lines.join("\n")}`;
}
