import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import PRDetailView from "./PRDetailView";
import { PullRequest } from "../types";

let capturedPanels: any[] = [];
let capturedPanelGroupProps: any = null;

// Mock react-resizable-panels to intercept actual configuration props
vi.mock("react-resizable-panels", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Group: (props: any) => {
      capturedPanelGroupProps = props;
      // We render a flex container, simulating standard Group rendering behavior
      return <div data-testid="mock-panel-group" style={{ display: "flex", flexDirection: props.orientation === "horizontal" ? "row" : "column" }}>{props.children}</div>;
    },
    Panel: (props: any) => {
      capturedPanels.push(props);
      return <div data-testid="mock-panel" data-min-size={props.minSize} data-max-size={props.maxSize}>{props.children}</div>;
    }
  };
});

describe("PRDetailView Sizing and Layout Constraints Test (TDD - Red Phase)", () => {
  const mockPR: PullRequest = {
    number: 42,
    title: "Update security configuration and deployment templates",
    body: "This PR introduces critical fixes for deployment. But the sidebar is pushed off!",
    state: "open",
    html_url: "https://github.com/test/repo/pull/42",
    created_at: "2026-06-18T00:00:00Z",
    updated_at: "2026-06-18T00:00:00Z",
    user: {
      login: "developer-john",
      avatar_url: "https://github.com/developer-john.png",
    },
    labels: [
      { name: "bug", color: "d73a4a" },
      { name: "security", color: "0075ca" }
    ],
  };

  beforeEach(() => {
    capturedPanels = [];
    capturedPanelGroupProps = null;
    // Mock ResizeObserver globally for jsdom
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // Mock the global fetch
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("details")) {
        return Promise.resolve({
          json: () => Promise.resolve({
            ...mockPR,
            base_branch: "main",
            head_branch: "feature/github-dashboard-cleanup",
            diff: [
              { file: "src/App.tsx", status: "modified", additions: 12, deletions: 3, code: "console.log('hi');" }
            ],
          }),
        });
      }
      if (url.includes("comments")) {
        return Promise.resolve({
          json: () => Promise.resolve([]),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({}),
      });
    });
  });

  it("should fail because layout constraints on Panels prevent RHS sidebar from resizing larger than 45% (or main pane restricts sizes incorrectly)", async () => {
    // Render the PRDetailView component
    render(
      <PRDetailView
        owner="dzackgarza"
        repoName="github-dashboard"
        pr={mockPR}
        onRefreshItem={() => {}}
      />
    );

    // Wait for the unpacking of PR diff tree to complete (loading state transitions to loaded state)
    await waitFor(() => {
      expect(screen.queryByText(/Unpacking pull request/i)).toBeNull();
    });

    console.log("TEST DIAGNOSTICS: Captured Panel props count =", capturedPanels.length);
    capturedPanels.forEach((p, idx) => {
      console.log(`Panel ${idx} details:`, { defaultSize: p.defaultSize, minSize: p.minSize, maxSize: p.maxSize });
    });

    // We expect at least one render cycle of the panels
    expect(capturedPanels.length).toBeGreaterThanOrEqual(2);

    const leftPanel = capturedPanels[capturedPanels.length - 2];
    const rightPanel = capturedPanels[capturedPanels.length - 1];

    // Assert that the PanelGroup uses the correct `orientation` prop instead of invalid `direction`
    expect(capturedPanelGroupProps).toBeDefined();
    expect(capturedPanelGroupProps.orientation).toBe("horizontal");

    // Assert that the RHS sidebar has robust resizing options (e.g., maxSize should be at least 70% to let user make it wider)
    // This will FAIL right now because rightPanel.maxSize is 45%
    expect(rightPanel.maxSize).toBeGreaterThanOrEqual(70);

    // Assert that the leftPanel can shrink below 40% (e.g., as low as 20%) to accommodate RHS sidebar width
    // This will check if leftPanel has small minSize constraints
    expect(leftPanel.minSize).toBeLessThanOrEqual(20);
  });
});
