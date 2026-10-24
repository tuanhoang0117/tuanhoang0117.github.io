import { useEffect } from "react";
import { ContactCard } from "../components/contact/ContactCard";
import { contactNav } from "../components/contact/links";
import { site } from "../content/site";

export function Contact() {
  // The card carries its own heading, so this page doesn't use PageHeader, which sets the title.
  useEffect(() => {
    document.title = `${contactNav.label} · ${site.name}`;
  }, []);

  return (
    <section className="px-4 py-12 sm:px-8 sm:py-20">
      <ContactCard />
    </section>
  );
}
