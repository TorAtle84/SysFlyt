import nodemailer from "nodemailer";

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
