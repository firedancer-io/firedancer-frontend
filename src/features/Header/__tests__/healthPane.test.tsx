import { render, act } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeAll, describe, expect, it } from "vitest";
import HealthPane from "../HealthPane";
import { healthAtom } from "../../../api/atoms";
import type { Health } from "../../../api/types";

beforeAll(() => {
  // react-use's useMedia needs matchMedia, which jsdom lacks
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

const renderPane = () => {
  const store = createStore();
  const utils = render(
    <Provider store={store}>
      <HealthPane />
    </Provider>,
  );
  return { store, ...utils };
};

describe("HealthPane", () => {
  it("reserves three invisible boxes until the first health message", () => {
    const { container } = renderPane();
    const pane = container.firstElementChild as HTMLElement;
    expect(pane.getAttribute("aria-hidden")).toBe("true");
    expect(pane.style.visibility).toBe("hidden");
    expect(pane.querySelectorAll("button")).toHaveLength(3);
  });

  it("swaps to the config-dependent boxes when health arrives", () => {
    const { container, store } = renderPane();
    act(() =>
      store.set(healthAtom, {
        vote: "voting",
        bundle: "disabled",
        turbine: "running",
        replay: "running",
      } satisfies Health),
    );
    const pane = container.firstElementChild as HTMLElement;
    expect(pane.getAttribute("aria-label")).toBe("Health Pane");
    expect(pane.style.visibility).not.toBe("hidden");
    expect(pane.querySelectorAll("button")).toHaveLength(3);

    act(() =>
      store.set(healthAtom, {
        vote: "voting",
        bundle: "connected",
        turbine: "running",
        replay: "running",
      } satisfies Health),
    );
    expect(pane.querySelectorAll("button")).toHaveLength(4);
  });
});
