import { afterEach, describe, expect, it } from "vitest";
import { positionBesideSpan } from "./floatingPosition";

const VIEWPORT = { width: 400, height: 800 };
const EDGE_MARGIN_PX = 8;

/** a tooltip of the given size; jsdom has no layout, so sizes are faked */
function createFloating(width: number, height: number) {
  const el = document.createElement("div");
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  Object.defineProperties(el, {
    offsetWidth: { value: width },
    offsetHeight: { value: height },
  });
  el.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
  document.body.appendChild(el);
  return el;
}

function setViewport({ width, height }: typeof VIEWPORT) {
  const root = document.documentElement;
  Object.defineProperties(root, {
    clientWidth: { value: width, configurable: true },
    clientHeight: { value: height, configurable: true },
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("positionBesideSpan", () => {
  it("places it right of the span when there's room", async () => {
    setViewport(VIEWPORT);
    const floating = createFloating(150, 100);

    const { x } = await positionBesideSpan(
      { left: 20, right: 120, y: 50 },
      floating,
    );

    expect(x).toBe(120);
  });

  it("flips it left of the span when only that side has room", async () => {
    setViewport(VIEWPORT);
    const floating = createFloating(150, 100);

    const { x } = await positionBesideSpan(
      { left: 200, right: 300, y: 50 },
      floating,
    );

    expect(x).toBe(50);
  });

  it("keeps it on screen when neither side has room", async () => {
    setViewport(VIEWPORT);
    const floating = createFloating(300, 100);

    for (const span of [
      { left: 50, right: 280, y: 50 },
      { left: 120, right: 380, y: 50 },
    ]) {
      const { x } = await positionBesideSpan(span, floating);
      expect(x).toBeGreaterThanOrEqual(EDGE_MARGIN_PX);
      expect(x + 300).toBeLessThanOrEqual(VIEWPORT.width - EDGE_MARGIN_PX);
    }
  });

  it("keeps it on screen when the span is off screen", async () => {
    setViewport(VIEWPORT);
    const floating = createFloating(150, 100);

    for (const span of [
      { left: -400, right: -250, y: 50 },
      { left: 600, right: 750, y: 50 },
    ]) {
      const { x } = await positionBesideSpan(span, floating);
      expect(x).toBeGreaterThanOrEqual(EDGE_MARGIN_PX);
      expect(x + 150).toBeLessThanOrEqual(VIEWPORT.width - EDGE_MARGIN_PX);
    }
  });

  it("keeps it above the bottom of the screen", async () => {
    setViewport(VIEWPORT);
    const floating = createFloating(150, 200);

    const { y } = await positionBesideSpan(
      { left: 20, right: 120, y: 700 },
      floating,
    );

    expect(y + 200).toBeLessThanOrEqual(VIEWPORT.height - EDGE_MARGIN_PX);
  });
});
