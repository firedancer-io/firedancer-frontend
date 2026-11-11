import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useLayoutEffect } from "react";
import { TimelineEventType } from "../../api/entities";
import { visibleRangeAtom } from "./atoms";
import { eventsByTypeFamily } from "./Events/atoms";
import { isAggHeaderVisibleAtom } from "./HeaderTrack/aggAtoms";
import TrackEventMarkers from "./TrackEventMarkers";

// jsdom has no layout; report the track width. Hoisted, as react-use's
// useMeasure checks for ResizeObserver when it's imported
vi.hoisted(() => {
  const widthPx = 1_000;
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb(
        [{ contentRect: { width: widthPx } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
});

const store = getDefaultStore();
const eventType = TimelineEventType.LeaderSkip;
const cullMarginPx = { left: 5, right: 5 };
const renderNothing = () => null;

// skipped slots at 1s, 2s and 8s
const events = [
  { slot: 1, ts: 1_000 },
  { slot: 2, ts: 2_000 },
  { slot: 8, ts: 8_000 },
];

let rootEl: HTMLElement;

function renderMarkers() {
  const { container } = render(
    <TrackEventMarkers
      eventType={eventType}
      showIn="agg"
      rootClassName="root"
      markerParentClassName="marker"
      cullMarginPx={cullMarginPx}
      renderMarker={renderNothing}
    />,
  );
  rootEl = container.firstElementChild as HTMLElement;
}

const markers = () => [...rootEl.children] as HTMLElement[];
const shownMarkers = () =>
  markers().filter((marker) => marker.style.display !== "none");

beforeEach(() => {
  store.set(isAggHeaderVisibleAtom, true);
  store.set(eventsByTypeFamily(eventType), events);
  store.set(visibleRangeAtom, [0, 4_000]);
});

afterEach(() => {
  cleanup();
});

describe("TrackEventMarkers", () => {
  it("renders a marker as one element when renderMarker draws nothing", () => {
    renderMarkers();
    expect(markers()).toHaveLength(2);
    for (const marker of markers()) expect(marker.childNodes).toHaveLength(0);
  });

  it("renders each marker for its slot", () => {
    render(
      <TrackEventMarkers
        eventType={eventType}
        showIn="agg"
        rootClassName="root"
        markerParentClassName="marker"
        cullMarginPx={cullMarginPx}
        renderMarker={(slot) => `slot ${slot}`}
      />,
    );
    expect(
      [...document.querySelectorAll(".marker")].map((el) => el.textContent),
    ).toEqual(["slot 1", "slot 2"]);
  });

  it("positions markers in px from the track's left edge", () => {
    renderMarkers();
    expect(markers().map((marker) => marker.style.transform)).toEqual([
      "translateX(250px)",
      "translateX(500px)",
    ]);
  });

  it("hides markers leaving view right away, before React re-renders", () => {
    renderMarkers();
    // outside act, so React hasn't re-rendered when we look
    store.set(visibleRangeAtom, [1_500, 5_500]);
    const [first, second] = markers();
    expect(first.style.display).toBe("none");
    expect(second.style.display).toBe("block");
  });

  it("hides markers right away when the header mode changes", () => {
    renderMarkers();
    store.set(isAggHeaderVisibleAtom, false);
    expect(shownMarkers()).toHaveLength(0);
  });

  it("shows new markers already positioned in the commit that adds them", () => {
    store.set(visibleRangeAtom, [3_000, 7_000]);
    // markers' display at the end of each commit, before the browser paints:
    // a parent's layout effect runs after its children's, before any useEffect
    const displaysAtCommit: string[][] = [];
    function Probe() {
      useAtomValue(visibleRangeAtom);
      useLayoutEffect(() => {
        displaysAtCommit.push(markers().map((marker) => marker.style.display));
      });
      return (
        <TrackEventMarkers
          eventType={eventType}
          showIn="agg"
          rootClassName="root"
          markerParentClassName="marker"
          cullMarginPx={cullMarginPx}
          renderMarker={renderNothing}
        />
      );
    }
    const { container } = render(<Probe />);
    rootEl = container.firstElementChild as HTMLElement;

    act(() => store.set(visibleRangeAtom, [6_000, 10_000]));

    expect(displaysAtCommit.at(-1)).toEqual(["block"]);
  });
});
