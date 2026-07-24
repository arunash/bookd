import Link from "next/link";
import { Shell } from "@/components/shell";
import { prisma } from "@/lib/db";
import { decryptForUser } from "@/lib/crypto";

export const dynamic = "force-dynamic";

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const STATUS_DOT: Record<string, string> = {
  booked:       "#2F7A5A",
  in_progress:  "#B6492C",
  queued:       "#5B49B5",
  failed:       "#9B2849",
  cancelled:    "#9CA0AA",
  needs_user_input: "#B6492C",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  // Anchor month from `m=YYYY-MM` param or current month.
  const now = new Date();
  const anchor = sp.m && /^\d{4}-\d{2}$/.test(sp.m)
    ? new Date(parseInt(sp.m.slice(0, 4)), parseInt(sp.m.slice(5, 7)) - 1, 1)
    : startOfMonth(now);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);

  // Pull confirmed bookings overlapping the month + any pending requests with a
  // preferred earliestStart in the month.
  const [bookings, pendingRequests] = user
    ? await Promise.all([
        prisma.booking.findMany({
          where: {
            userId: user.id,
            scheduledStart: { gte: monthStart, lte: new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59) },
          },
          include: {
            provider: { select: { name: true } },
            person: { select: { firstNameEnc: true } },
            request: { select: { id: true, status: true } },
          },
          orderBy: { scheduledStart: "asc" },
        }),
        prisma.bookingRequest.findMany({
          where: {
            userId: user.id,
            earliestStart: { gte: monthStart, lte: new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59) },
            status: { in: ["queued", "in_progress", "needs_user_input"] },
          },
          include: {
            provider: { select: { name: true } },
            person: { select: { firstNameEnc: true } },
          },
        }),
      ])
    : [[], []];

  // Build event list keyed by date.
  type DayEvent = { id: string; href: string; label: string; time: string | null; statusColor: string; kind: "booked" | "pending" };
  const eventsByDay = new Map<string, DayEvent[]>();
  // Abstract calendar-cell dates are constructed at local (server=UTC) midnight,
  // so their Y-M-D components are the intended date. Real event instants must be
  // bucketed by their *Pacific* date, or a 7pm-PT booking lands on tomorrow.
  const k = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const ptKey = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  };

  for (const b of bookings) {
    const t = new Date(b.scheduledStart);
    const first = user ? decryptForUser(user.id, new Uint8Array(b.person.firstNameEnc)) ?? "" : "";
    const key = ptKey(t);
    const arr = eventsByDay.get(key) ?? [];
    arr.push({
      id: b.id,
      href: `/bookings/${b.requestId}`,
      label: `${b.provider.name}${first ? ` · ${first}` : ""}`,
      time: t.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }),
      statusColor: STATUS_DOT.booked,
      kind: "booked",
    });
    eventsByDay.set(key, arr);
  }
  for (const r of pendingRequests) {
    if (!r.earliestStart) continue;
    const t = new Date(r.earliestStart);
    const first = user ? decryptForUser(user.id, new Uint8Array(r.person.firstNameEnc)) ?? "" : "";
    const arr = eventsByDay.get(k(t)) ?? [];
    arr.push({
      id: r.id,
      href: `/bookings/${r.id}`,
      label: `${r.provider?.name ?? "Provider not set"}${first ? ` · ${first}` : ""}`,
      time: null,
      statusColor: STATUS_DOT[r.status] ?? STATUS_DOT.queued,
      kind: "pending",
    });
    eventsByDay.set(k(t), arr);
  }

  // Build the calendar grid: pad to start on Sunday.
  const firstWeekday = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const prevMonth = addMonths(anchor, -1);
  const nextMonth = addMonths(anchor, 1);
  const fmtMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Shell>
      <header className="pt-12 pb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">Calendar</p>
          <h1 className="font-serif text-5xl text-ink mt-2">{monthLabel}</h1>
          <p className="text-ink-2 mt-3 text-sm">
            <Legend color={STATUS_DOT.booked} label="Confirmed booking" />
            <span className="mx-3 text-ink-3">·</span>
            <Legend color={STATUS_DOT.queued} label="Queued / in flight" />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?m=${fmtMonth(prevMonth)}`} className="btn-ghost text-sm">← {prevMonth.toLocaleDateString(undefined, { month: "short" })}</Link>
          <Link href="/calendar" className="btn-ghost text-sm">Today</Link>
          <Link href={`/calendar?m=${fmtMonth(nextMonth)}`} className="btn-ghost text-sm">{nextMonth.toLocaleDateString(undefined, { month: "short" })} →</Link>
        </div>
      </header>

      <section className="card-pop p-4">
        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-ink-3 font-semibold mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="aspect-square" />;
            const isToday = sameDay(cell, now);
            const events = eventsByDay.get(k(cell)) ?? [];
            return (
              <div
                key={i}
                className="rounded-xl p-1.5 sm:p-2 min-h-[88px] sm:min-h-[110px] flex flex-col gap-1 transition-colors"
                style={{
                  background: isToday ? "rgba(238,111,80,0.08)" : "rgba(255,255,255,0.4)",
                  border: isToday ? "1px solid rgba(238,111,80,0.40)" : "1px solid rgba(27,27,31,0.04)",
                }}
              >
                <div className={`text-[11px] font-mono ${isToday ? "text-[#B6492C] font-semibold" : "text-ink-3"}`}>
                  {cell.getDate()}
                </div>
                <ul className="flex-1 space-y-1">
                  {events.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link href={e.href} className="block rounded-md px-1.5 py-0.5 text-[10px] sm:text-[11px] truncate hover:underline" style={{ background: `${e.statusColor}1F`, color: e.statusColor }}>
                        {e.time && <span className="font-mono mr-1">{e.time}</span>}
                        {e.label}
                      </Link>
                    </li>
                  ))}
                  {events.length > 3 && (
                    <li className="text-[10px] text-ink-3">+{events.length - 3} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </Shell>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
