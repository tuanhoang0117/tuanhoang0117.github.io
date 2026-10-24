import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site } from "../../content/site";
import { COPIED_MS, CopyEmailButton } from "./CopyEmailButton";

function mockClipboard(clipboard: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

// Lets the awaited writeText promise settle and React commit the resulting state.
async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

describe("CopyEmailButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    mockClipboard(undefined);
  });

  it("copies the site email, confirms, then resets after the timeout", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText });
    render(<CopyEmailButton email={site.email} />);

    await click(screen.getByRole("button", { name: "Copy email" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(site.email);
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/copied/i);

    act(() => vi.advanceTimersByTime(COPIED_MS - 1));
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Copy email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows the address as text and says so when the clipboard rejects", async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<CopyEmailButton email={site.email} />);

    await click(screen.getByRole("button", { name: "Copy email" }));

    expect(screen.getByRole("button", { name: /couldn't copy/i })).toBeInTheDocument();
    expect(screen.getByText(site.email)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/couldn't copy/i);
  });

  it("takes the same fallback when the Clipboard API is missing", async () => {
    mockClipboard(undefined);
    render(<CopyEmailButton email={site.email} />);

    await click(screen.getByRole("button", { name: "Copy email" }));

    expect(screen.getByRole("button", { name: /couldn't copy/i })).toBeInTheDocument();
    expect(screen.getByText(site.email)).toBeVisible();
  });

  it("doesn't show the address as text before a failure", () => {
    render(<CopyEmailButton email={site.email} />);
    expect(screen.queryByText(site.email)).not.toBeInTheDocument();
  });
});
