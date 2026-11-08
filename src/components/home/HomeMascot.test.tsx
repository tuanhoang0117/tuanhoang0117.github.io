import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mascotCounterLabel, mascotLabel, mascotPrompt } from "../../content/mascot";
import type { MascotActivation } from "../mascot/Mascot";
import type { CounterClient } from "../mascot/counter/client";
import { HomeMascot } from "./HomeMascot";

// The real mascot draws on a canvas; this suite only needs its press callback, so it stands in a
// plain button that reports a press the way the real one does.
vi.mock("../mascot/Mascot", async () => {
  const { mascotLabel } = await import("../../content/mascot");
  return {
    Mascot: ({ onActivate }: { onActivate?: (a: MascotActivation) => void }) => (
      <button
        type="button"
        aria-label={mascotLabel}
        onClick={() => onActivate?.({ x: 1, y: 2, input: "pointer" })}
      />
    ),
  };
});

const counter = () => screen.getByText(new RegExp(`^${mascotCounterLabel}:`));

/** Renders, then logs each change to the counter's text from the first render on. */
function recordAnnouncements(renderIt: () => void) {
  renderIt();
  const announced: string[] = [];
  const observer = new MutationObserver(() => announced.push(counter().textContent ?? ""));
  observer.observe(counter(), { childList: true, characterData: true, subtree: true });
  return { announced, stop: () => observer.disconnect() };
}

describe("HomeMascot", () => {
  it("shows the prompt and a counter at 0 inside the mascot's group", () => {
    render(<HomeMascot />);
    const group = screen.getByRole("group", { name: mascotLabel });
    expect(group).toContainElement(screen.getByText(mascotPrompt, { exact: true }));
    expect(group).toContainElement(counter());
    expect(counter()).toHaveTextContent(`${mascotCounterLabel}: 0`);
  });

  it("counts each press and passes it on", async () => {
    const onActivate = vi.fn();
    render(<HomeMascot onActivate={onActivate} />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: mascotLabel });

    await user.click(button);
    expect(counter()).toHaveTextContent(`${mascotCounterLabel}: 1`);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(counter()).toHaveTextContent(`${mascotCounterLabel}: 3`);
    expect(onActivate).toHaveBeenCalledTimes(3);
    expect(onActivate).toHaveBeenLastCalledWith({ x: 1, y: 2, input: "pointer" });
  });

  it("announces the count politely, as one phrase", () => {
    render(<HomeMascot />);
    expect(counter()).toHaveAttribute("aria-live", "polite");
    expect(counter()).toHaveAttribute("aria-atomic", "true");
  });

  it("puts the prompt and counter before the mustang, so they read and sit above it", () => {
    render(<HomeMascot />);
    const button = screen.getByRole("button", { name: mascotLabel });
    for (const el of [screen.getByText(mascotPrompt, { exact: true }), counter()]) {
      expect(el.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows the shared total and adds each press to it at once", async () => {
    let total = 1234;
    const client: CounterClient = {
      kind: "http",
      read: async () => total,
      increment: async (by) => (total += by),
    };
    render(<HomeMascot counterClient={client} />);
    expect(await screen.findByText(`${mascotCounterLabel}: 1234`)).toBe(counter());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: mascotLabel }));
    expect(counter()).toHaveTextContent(`${mascotCounterLabel}: 1235`);
    expect(counter()).toHaveAttribute("data-counter-mode", "shared");
  });

  it("announces once per press, not again when the batch is sent", async () => {
    let total = 500;
    const sent: number[] = [];
    const client: CounterClient = {
      kind: "http",
      read: async () => total,
      increment: async (by) => {
        sent.push(by);
        return (total += by);
      },
    };
    render(<HomeMascot counterClient={client} counterOptions={{ flushMs: 20 }} />);
    await screen.findByText(`${mascotCounterLabel}: 500`);

    const announced: string[] = [];
    const observer = new MutationObserver(() => announced.push(counter().textContent ?? ""));
    observer.observe(counter(), { childList: true, characterData: true, subtree: true });
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: mascotLabel });
    for (let i = 0; i < 4; i++) await user.click(button);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    observer.disconnect();

    expect(sent.reduce((a, b) => a + b, 0)).toBe(4);
    expect(sent.length).toBeLessThan(4);
    expect(announced).toEqual([501, 502, 503, 504].map((n) => `${mascotCounterLabel}: ${n}`));
    expect(counter()).toHaveAttribute("aria-live", "polite");
  });

  it("announces once more at load and once at an answer that shows others' presses", async () => {
    let total = 500;
    const client: CounterClient = {
      kind: "http",
      read: async () => total,
      // Seven presses by other visitors land with this batch.
      increment: async (by) => (total += by + 7),
    };
    const { announced, stop } = recordAnnouncements(() =>
      render(<HomeMascot counterClient={client} counterOptions={{ flushMs: 20 }} />),
    );
    await screen.findByText(`${mascotCounterLabel}: 500`);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: mascotLabel });
    await user.click(button);
    await user.click(button);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    stop();

    expect(announced).toEqual([500, 501, 502, 509].map((n) => `${mascotCounterLabel}: ${n}`));
  });

  it("sends waiting presses once with keepalive when the page is hidden, not again on unmount", async () => {
    const sent: { by: number; keepalive?: boolean }[] = [];
    const client: CounterClient = {
      kind: "http",
      read: async () => 10,
      increment: async (by, options) => {
        sent.push({ by, keepalive: options?.keepalive });
        return 10 + by;
      },
    };
    const { unmount } = render(<HomeMascot counterClient={client} />);
    await screen.findByText(`${mascotCounterLabel}: 10`);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: mascotLabel }));
    await user.click(screen.getByRole("button", { name: mascotLabel }));

    // Well inside the 1 s batch window, as when a tab closes right after a click.
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
    });
    expect(sent).toEqual([{ by: 2, keepalive: true }]);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    unmount();
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(sent).toEqual([{ by: 2, keepalive: true }]);
  });

  it("keeps sending presses after the page comes back from the back-forward cache", async () => {
    const sent: number[] = [];
    let total = 10;
    const client: CounterClient = {
      kind: "http",
      read: async () => total,
      increment: async (by) => {
        sent.push(by);
        return (total += by);
      },
    };
    render(<HomeMascot counterClient={client} counterOptions={{ flushMs: 20 }} />);
    await screen.findByText(`${mascotCounterLabel}: 10`);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: mascotLabel }));
    await vi.waitFor(() => expect(sent).toEqual([1]));
  });

  it("keeps counting locally when the service is down", async () => {
    const client: CounterClient = {
      kind: "http",
      read: () => Promise.reject(new Error("offline")),
      increment: () => Promise.reject(new Error("offline")),
    };
    render(<HomeMascot counterClient={client} counterOptions={{ backoffMs: 1, maxFailures: 2 }} />);
    await vi.waitFor(() => expect(counter()).toHaveAttribute("data-counter-mode", "local"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: mascotLabel }));
    await user.click(screen.getByRole("button", { name: mascotLabel }));
    expect(counter()).toHaveTextContent(`${mascotCounterLabel}: 2`);
  });
});
