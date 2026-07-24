import Link from "next/link";

export function Shell({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen bg-cream">
      <Nav />
      <main className={`mx-auto px-6 sm:px-8 pb-24 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>
        {children}
      </main>
      <footer className="border-t border-rule mt-16">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 text-[11px] text-ink-3 flex items-center justify-between">
          <span>Personal scheduling agent.</span>
          <span className="font-serif italic">book-d</span>
        </div>
      </footer>
    </div>
  );
}

const TABS = [
  { href: "/new",       label: "New booking" },
  { href: "/calendar",  label: "Calendar" },
  { href: "/bookings",  label: "Bookings" },
  { href: "/providers", label: "Providers" },
  { href: "/people",    label: "People" },
  { href: "/voices",    label: "Voices" },
  { href: "/settings",  label: "Settings" },
];

function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur supports-[backdrop-filter]:bg-cream/65">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            aria-hidden
            className="inline-block w-7 h-7 rounded-full"
            style={{
              background: "radial-gradient(circle at 30% 30%, #EE6F50 0%, #9B87F5 70%, #5FBF94 100%)",
            }}
          />
          <span className="font-serif text-xl text-ink">book-d</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-1">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="btn-ghost text-sm">
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
