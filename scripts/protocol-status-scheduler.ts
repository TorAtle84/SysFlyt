import { sendDailyProtocolStatusReports } from "../src/lib/reports/protocol-status";

const DEFAULT_SEND_AT = "06:00";

function parseSendAt(value: string): { hour: number; minute: number } {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: 6, minute: 0 };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 6, minute: 0 };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 6, minute: 0 };
  return { hour, minute };
}

function getNextRun(hour: number, minute: number, now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function formatDelay(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}t ${rest}m`;
}

async function runOnce() {
  console.log("[reports] Running Protokollstatus...");
  const result = await sendDailyProtocolStatusReports();
  console.log("[reports] Done:", result);
}

async function startScheduler() {
  const timeZone = process.env.REPORT_TIMEZONE;
  if (timeZone) {
    process.env.TZ = timeZone;
  }

  const sendAt = process.env.REPORT_SEND_AT || DEFAULT_SEND_AT;
  const { hour, minute } = parseSendAt(sendAt);
  const next = getNextRun(hour, minute);
  const delay = next.getTime() - Date.now();

  console.log(
    `[reports] Scheduler active. Next run at ${next.toISOString()} (${formatDelay(delay)}).`
  );

  setTimeout(async () => {
    try {
      await runOnce();
    } catch (error) {
      console.error("[reports] Failed to send Protokollstatus:", error);
    } finally {
      startScheduler();
    }
  }, delay);
}

if (process.argv.includes("--once")) {
  runOnce().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  startScheduler();
}
