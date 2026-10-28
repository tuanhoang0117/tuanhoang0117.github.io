import { useEffect } from "react";
import { HomeHero } from "../components/home/HomeHero";
import { HomeIntro } from "../components/home/HomeIntro";
import { site } from "../content/site";

export function Home() {
  // The hero replaces PageHeader here, which is what sets the title on every other page.
  useEffect(() => {
    document.title = site.name;
  }, []);

  return (
    <HomeHero>
      <HomeIntro />
    </HomeHero>
  );
}
