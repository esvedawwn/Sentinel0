/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
expect.extend(jestDomMatchers);
import FilePreviewTooltip from "../FilePreviewTooltip";

afterEach(() => {
  cleanup();
});

describe("FilePreviewTooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders its children", () => {
    render(
      <FilePreviewTooltip name="photo.jpg" path="/photos/photo.jpg">
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    expect(screen.getByText("file-row")).toBeInTheDocument();
  });

  it("does not show the tooltip immediately on mount", () => {
    render(
      <FilePreviewTooltip name="photo.jpg" path="/photos/photo.jpg">
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    expect(screen.queryByText("photo.jpg")).not.toBeInTheDocument();
  });

  it("does not show the tooltip before the delay elapses", () => {
    render(
      <FilePreviewTooltip name="report.pdf" path="/docs/report.pdf" delayMs={280}>
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    // Only advance 100 ms — delay has not elapsed yet
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
  });

  it("shows the tooltip after the delay elapses", () => {
    render(
      <FilePreviewTooltip name="report.pdf" path="/docs/report.pdf" delayMs={280}>
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("hides the tooltip when the mouse leaves", () => {
    render(
      <FilePreviewTooltip name="script.ts" path="/src/script.ts" delayMs={0}>
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText("script.ts")).toBeInTheDocument();

    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.queryByText("script.ts")).not.toBeInTheDocument();
  });

  it("displays the category when provided", () => {
    render(
      <FilePreviewTooltip
        name="budget.xlsx"
        path="/finance/budget.xlsx"
        category="Banking & Finance"
        delayMs={0}
      >
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText("Banking & Finance")).toBeInTheDocument();
  });

  it("displays the aiCategory when provided", () => {
    render(
      <FilePreviewTooltip
        name="taxes.pdf"
        path="/docs/taxes.pdf"
        aiCategory="Tax"
        delayMs={0}
      >
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText("Tax")).toBeInTheDocument();
  });

  it("cancels the pending timer when mouse leaves before delay", () => {
    render(
      <FilePreviewTooltip name="quick.txt" path="/quick.txt" delayMs={500}>
        <span>file-row</span>
      </FilePreviewTooltip>
    );
    const wrapper = screen.getByText("file-row").closest("div")!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(wrapper);
    // Advance past the original delay — tooltip should still NOT appear
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByText("quick.txt")).not.toBeInTheDocument();
  });
});
