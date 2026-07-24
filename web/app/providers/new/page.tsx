import { Shell } from "@/components/shell";
import ProviderForm from "../provider-form";

export default function NewProviderPage() {
  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">New provider</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Add a provider</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">
          Phone number, service type, address. Everything else is optional but helps the agent on the call.
        </p>
      </header>
      <ProviderForm />
    </Shell>
  );
}
