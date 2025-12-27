import { NextRequest, NextResponse } from "next/server";
import { sendDailyProtocolStatusReports } from "@/lib/reports/protocol-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseSendAt(value: string): { hour: number; minute: number } {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 6, minute: 0 };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 6, minute: 0 };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 6, minute: 0 };
  return { hour, minute };
}

function getTimeParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

function shouldRunNow(request: NextRequest): boolean {
  const force = request.nextUrl.searchParams.get("force");
  if (force === "1" || force === "true") return true;

  const sendAt = process.env.REPORT_SEND_AT || "06:00";
  const timeZone = process.env.REPORT_TIMEZONE || "Europe/Oslo";
  const { hour, minute } = parseSendAt(sendAt);
  const now = getTimeParts(new Date(), timeZone);
  return now.hour === hour && now.minute === minute;
}

function isAuthorized(request: NextRequest): boolean {
  const isVercelCron = process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") === "1";
  if (isVercelCron) return true;

  const secret = process.env.REPORTS_CRON_SECRET;
  if (!secret) return true;

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const querySecret = request.nextUrl.searchParams.get("secret");
  return token === secret || querySecret === secret;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!shouldRunNow(request)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Outside send window" });
  }

  try {
    const result = await sendDailyProtocolStatusReports();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Protocol status report failed:", error);
    return NextResponse.json({ error: "Kunne ikke sende rapport" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
