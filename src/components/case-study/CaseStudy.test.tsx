import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projects } from "../../content/projects";
import { pagePrompts } from "../../content/site";
import type { CaseStudy as CaseStudyData, Project } from "../../content/types";
import { cardShadow, pageThemes } from "../../styles/themes";
import { STAGGER_STEP_MS } from "../motion/motion";
import { ProjectDetail } from "../../pages/ProjectDetail";
import { linkHints } from "./labels";

const SLUG = "tar-syndrome-website";

function findProject(slug: string): Project {
  const p = projects.find((x) => x.slug === slug);
  if (!p) throw new Error(`no project ${slug} in projects.ts`);
  return p;
}

const dfg = findProject(SLUG);
const study = () => dfg.caseStudy!;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/portfolio/:slug" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const section = (key: string) => {
  const el = document.querySelector<HTMLElement>(`[data-section="${key}"]`);
  if (!el) throw new Error(`no ${key} section rendered`);
  return el;
};

/**
 * Runs `fn` with the project's content temporarily changed, then restores the original object,
 * so a test can show the page follows the data.
 */
function withProject(patch: (p: Project) => void, fn: () => void) {
  const original = structuredClone(dfg);
  try {
    patch(dfg);
    fn();
  } finally {
    for (const key of Object.keys(dfg) as (keyof Project)[]) delete dfg[key];
    Object.assign(dfg, original);
  }
}

describe("ProjectDetail: the Develop for Good case study", () => {
  it("has a case study with a PDF in content (precondition for the rest of this file)", () => {
    expect(dfg.caseStudy).toBeDefined();
    expect(dfg.caseStudy!.pdf).toBeDefined();
  });

  it("renders the title, period, and every case-study section from projects.ts", () => {
    renderAt(`/portfolio/${SLUG}`);
    const s = study();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(dfg.title);
    expect(screen.getByText(dfg.period!)).toBeInTheDocument();

    expect(within(section("overview")).getByText(s.overview)).toBeInTheDocument();
    expect(within(section("problem")).getByText(s.problem)).toBeInTheDocument();
    const steps = within(section("process")).getAllByRole("listitem");
    expect(steps).toHaveLength(s.process.length);
    s.process.forEach((step, i) => {
      expect(within(steps[i]!).getByRole("heading", { level: 3 })).toHaveTextContent(step.title);
      expect(within(steps[i]!).getByText(step.detail)).toBeInTheDocument();
    });
    for (const r of s.role) expect(within(section("role")).getByText(r)).toBeInTheDocument();
    expect(within(section("role")).getByTestId("reflection")).toHaveTextContent(s.reflection!);
    for (const r of s.results) expect(within(section("results")).getByText(r)).toBeInTheDocument();
    for (const t of s.tools) expect(within(section("tools")).getByText(t)).toBeInTheDocument();
  });

  it("follows the content: changed values render and the old ones are gone", () => {
    const before = structuredClone(study());
    const changed: CaseStudyData = {
      overview: "Changed overview.",
      problem: "Changed problem.",
      process: [{ title: "Changed step", detail: "Changed step detail." }],
      role: ["Changed role claim."],
      reflection: "Changed reflection.",
      results: ["Changed result."],
      tools: ["ChangedTool"],
      pdf: { label: "Changed PDF label", href: "/changed.pdf" },
    };
    withProject(
      (p) => {
        p.title = "Changed title";
        p.period = "Changed period";
        p.links = [{ label: "Changed live site", href: "https://example.com/changed" }];
        p.caseStudy = changed;
      },
      () => {
        renderAt(`/portfolio/${SLUG}`);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Changed title");
        for (const text of [
          "Changed period",
          changed.overview,
          changed.problem,
          "Changed step",
          "Changed step detail.",
          "Changed role claim.",
          "Changed reflection.",
          "Changed result.",
          "ChangedTool",
        ]) {
          expect(screen.getByText(text)).toBeInTheDocument();
        }
        expect(screen.getByRole("link", { name: /Changed live site/ })).toHaveAttribute(
          "href",
          "https://example.com/changed",
        );
        expect(screen.getByRole("link", { name: /Changed PDF label/ })).toHaveAttribute(
          "href",
          "/changed.pdf",
        );

        for (const text of [before.overview, before.problem, before.process[0]!.title]) {
          expect(screen.queryByText(text)).not.toBeInTheDocument();
        }
        expect(screen.queryByText(before.role[0]!)).not.toBeInTheDocument();
        expect(screen.queryByText(before.results[0]!)).not.toBeInTheDocument();
      },
    );
  });

  it("links to the live site in a new tab and downloads the PDF, both announced to screen readers", () => {
    renderAt(`/portfolio/${SLUG}`);
    for (const l of dfg.links) {
      const a = screen.getByRole("link", { name: new RegExp(`^${l.label}`) });
      expect(a).toHaveAttribute("href", l.href);
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noreferrer");
      expect(a).toHaveAccessibleName(`${l.label} ${linkHints.newTab}`);
    }
    const pdf = study().pdf!;
    const a = screen.getByRole("link", { name: new RegExp(`^${escape(pdf.label)}`) });
    expect(a).toHaveAttribute("href", pdf.href);
    expect(a).toHaveAttribute("download");
    expect(a).not.toHaveAttribute("target");
    expect(a).toHaveAccessibleName(`${pdf.label} ${linkHints.download}`);
  });

  it("numbers the sections in order and labels each region by its heading", () => {
    renderAt(`/portfolio/${SLUG}`);
    const regions = [...document.querySelectorAll<HTMLElement>("[data-section]")];
    expect(regions.map((r) => r.dataset.section)).toEqual([
      "overview",
      "problem",
      "process",
      "role",
      "results",
      "tools",
    ]);
    regions.forEach((r, i) => {
      const h2 = within(r).getByRole("heading", { level: 2 });
      expect(h2.textContent!.startsWith(String(i + 1).padStart(2, "0"))).toBe(true);
      expect(r).toHaveAttribute("aria-labelledby", h2.id);
    });
  });

  it("puts each section on a hard border with the Portfolio theme's accent shadows", () => {
    renderAt(`/portfolio/${SLUG}`);
    const regions = [...document.querySelectorAll<HTMLElement>("[data-section]")];
    regions.forEach((r, i) => {
      expect(r).toHaveClass("border-2", "border-ink", "shadow-block-lg");
      expect(r).toHaveClass(cardShadow(pageThemes.portfolio, i));
    });
    expect(section("role")).toHaveClass(pageThemes.portfolio.wash);
  });

  it("leaves the screenshots section out when the project has no images", () => {
    expect(dfg.images).toEqual([]);
    renderAt(`/portfolio/${SLUG}`);
    expect(document.querySelector('[data-section="images"]')).toBeNull();
    expect(screen.queryAllByRole("img")).toEqual([]);
  });

  it("shows screenshots with alt text, hard borders, and accent shadows when content has them", () => {
    const images = [
      { src: "/test-a.png", alt: "Test screenshot A" },
      { src: "/test-b.png", alt: "Test screenshot B" },
    ];
    withProject(
      (p) => {
        p.images = images;
      },
      () => {
        renderAt(`/portfolio/${SLUG}`);
        const imgs = within(section("images")).getAllByRole("img");
        expect(imgs.map((i) => [i.getAttribute("src"), i.getAttribute("alt")])).toEqual(
          images.map((i) => [i.src, i.alt]),
        );
        for (const img of imgs) {
          expect(img).toHaveClass("border-2", "border-ink", "shadow-block");
          expect(pageThemes.portfolio.shadows.some((s) => img.classList.contains(s))).toBe(true);
        }
      },
    );
  });

  it("hides optional parts cleanly when content leaves them out", () => {
    withProject(
      (p) => {
        delete p.period;
        delete p.caseStudy!.reflection;
        delete p.caseStudy!.pdf;
        p.caseStudy!.tools = [];
        p.links = [];
      },
      () => {
        const { container } = renderAt(`/portfolio/${SLUG}`);
        expect(screen.queryByTestId("reflection")).toBeNull();
        expect(document.querySelector('[data-section="tools"]')).toBeNull();
        expect(screen.queryAllByRole("link")).toEqual([]);
        expect(container.querySelector(".prompt")).toBeNull();
        expect(container.textContent).not.toMatch(/undefined|null/);
      },
    );
  });

  it("types no copy: every visible text node comes from content or is a UI mechanic", () => {
    const { container } = renderAt(`/portfolio/${SLUG}`);
    const s = study();
    const fromContent = new Set<string>([
      dfg.title,
      dfg.period!,
      s.overview,
      s.problem,
      ...s.process.flatMap((p) => [p.title, p.detail]),
      ...s.role,
      s.reflection!,
      ...s.results,
      ...s.tools,
      s.pdf!.label,
      ...dfg.links.map((l) => l.label),
    ]);
    // Section labels are the CaseStudy field names (no content field exists for headings yet).
    const sectionKey = /^(overview|problem|process|images|role|results|tools)$/;
    const mechanics = new Set(["—", "↗", "↓", linkHints.newTab, linkHints.download]);

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const stray: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent!.trim();
      if (!text) continue;
      if (fromContent.has(text) || mechanics.has(text) || sectionKey.test(text)) continue;
      if (/^\d{2}$/.test(text)) continue;
      stray.push(text);
    }
    expect(stray).toEqual([]);
  });

  describe("entrance", () => {
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).animate;
    });

    it("staggers the section cards one step apart, and only the cards", () => {
      const animate = vi.fn(() => ({ cancel: vi.fn() }));
      Element.prototype.animate = animate as unknown as Element["animate"];
      renderAt(`/portfolio/${SLUG}`);
      const regions = [...document.querySelectorAll("[data-section]")];
      const list = regions[0]!.parentElement!;
      expect(list).toHaveAttribute("data-stagger");
      expect([...list.children]).toEqual(regions);
      // The page title's shimmer animates too; this test is about the entrance stagger only.
      const stagger = animate.mock.contexts
        .map((el, i) => [el as Element, i] as const)
        .filter(([el]) => !el.matches("[data-shimmer]"));
      expect(stagger.map(([el]) => el)).toEqual(regions);
      const calls = animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][];
      expect(stagger.map(([, i]) => calls[i]![1].delay)).toEqual(
        regions.map((_, i) => i * STAGGER_STEP_MS),
      );
    });
  });
});

describe("ProjectDetail: other routes", () => {
  it("shows the site's not-found page for an unknown slug", () => {
    renderAt("/portfolio/not-a-real-project");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("404");
    expect(screen.getByText(pagePrompts.notFound)).toBeInTheDocument();
    expect(document.querySelector("[data-section]")).toBeNull();
  });

  it("renders a project without a case study as its title, summary, and links only", () => {
    const plain = projects.find((p) => !p.caseStudy && p.links.length > 0)!;
    renderAt(`/portfolio/${plain.slug}`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(plain.title);
    expect(screen.getByText(plain.summary)).toBeInTheDocument();
    for (const l of plain.links) {
      expect(screen.getByRole("link", { name: new RegExp(`^${l.label}`) })).toHaveAttribute(
        "href",
        l.href,
      );
    }
    expect(document.querySelector("[data-section]")).toBeNull();
  });
});

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
