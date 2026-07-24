import { Shell } from "@/components/shell";
import PersonForm from "../person-form";

export default function NewPersonPage() {
  return (
    <Shell narrow>
      <header className="pt-12 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-ink-3">New person</p>
        <h1 className="font-serif text-5xl text-ink mt-2">Add a person</h1>
        <p className="text-ink-2 mt-3 text-base leading-relaxed">
          Patient details + primary insurance. Names, DOB, member IDs are encrypted at rest — only decrypted at call placement.
        </p>
      </header>
      <PersonForm />
    </Shell>
  );
}
