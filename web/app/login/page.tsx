import LoginButton from "./login-button";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="card-pop p-8 sm:p-10 w-full max-w-md text-center">
        <div
          aria-hidden
          className="inline-block w-12 h-12 rounded-full mx-auto"
          style={{ background: "radial-gradient(circle at 30% 30%, #EE6F50 0%, #9B87F5 70%, #5FBF94 100%)" }}
        />
        <h1 className="font-serif text-4xl text-ink mt-4">book-d</h1>
        <p className="text-ink-2 text-sm mt-2 leading-relaxed">
          Sign in to manage your bookings.
        </p>
        <LoginButton next={searchParams.next} error={searchParams.error} />
        <p className="text-[11px] text-ink-3 mt-6 leading-relaxed">
          This is a private deployment. Only the account owner can sign in.
        </p>
      </div>
    </main>
  );
}
