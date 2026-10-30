import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mascotCounterLabel, mascotLabel, mascotPrompt } from "../../content/mascot";
import type { MascotActivation } from "../mascot/Mascot";
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
});
