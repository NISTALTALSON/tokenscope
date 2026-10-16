// @vitest-environment jsdom
import { act } from "react";
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import TokenScopeApp from "../src/components/TokenScopeApp";

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

describe("TokenScope app boot", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  it("leaves the loading screen when browser storage is available", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<TokenScopeApp />);
      await wait(100);
    });
    expect(container.textContent).toContain("Make your usage visible");
    expect(container.textContent).not.toContain("Opening your local workspace");
  });
});
