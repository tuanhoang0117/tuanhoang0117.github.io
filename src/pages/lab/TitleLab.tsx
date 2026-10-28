import { HeroTitle } from "../../components/brand/HeroTitle";
import { PageHeader } from "../../components/ui/PageHeader";

// Test bench for the hero title (issue #22). The page keeps its own "Title Lab" h1, so the title
// renders here as an h2; the home page will mount it as its h1. Same padding as the page header,
// so the title gets the width it will have on the home page.
export function TitleLab() {
  return (
    <>
      <PageHeader title="Title Lab" />
      <section data-testid="hero-title-bench" className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <HeroTitle as="h2" />
      </section>
    </>
  );
}
