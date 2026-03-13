import type uPlot from "uplot";
import placement from "../uplot/placement";
import { throttle } from "lodash";

const CLOSEST_IDX_SERIES = 1;

// Persisted tooltip function should persist across charts, only 1 shown tooltip at a time
let persistTooltip = false;

function getScrollContainer() {
  return document.getElementById("scroll-container") ?? document.body;
}

interface BaseTooltipPluginProps {
  elId: string;
  showOnCursor: (u: uPlot, val: number, idx: number) => boolean;
  showPointer?: boolean;
  closeTooltipElId?: string;
  getClosestIdx?: (u: uPlot) => number | null;
}

export function baseTooltipPlugin({
  elId,
  showOnCursor,
  showPointer,
  closeTooltipElId,
  getClosestIdx,
}: BaseTooltipPluginProps): uPlot.Plugin {
  let over: HTMLDivElement;
  let bound: HTMLElement;
  let bLeft: number;
  let bTop: number;
  let isCurrentlyHovered = false;

  function syncBounds() {
    const bbox = over.getBoundingClientRect();
    bLeft = bbox.left;
    bTop = bbox.top;
  }

  function openPersistedTooltip() {
    persistTooltip = true;
    // Changing pointer events so that hover focus doesn't go over the tooltip instead of the chart
    overlay.style.pointerEvents = "auto";
    unsetCursorPointer();
    // Put at the end of the queue so the current click event is not registered by the added listener
    setTimeout(() => {
      document.addEventListener("click", handleClickOutsideTooltip);
      if (closeTooltipElId) {
        document
          .getElementById(closeTooltipElId)
          ?.addEventListener("click", closePersistedTooltip);
      }
    }, 0);
  }

  function closePersistedTooltip() {
    persistTooltip = false;
    overlay.style.pointerEvents = "none";
    overlay.style.display = "none";
    document.removeEventListener("click", handleClickOutsideTooltip);
    if (closeTooltipElId) {
      document
        .getElementById(closeTooltipElId)
        ?.removeEventListener("click", closePersistedTooltip);
    }
  }

  const tClosePersistedTooltip = throttle(closePersistedTooltip, 100, {
    leading: true,
    trailing: true,
  });

  function setCursorPointer() {
    if (!showPointer) return;

    document.body.style.cursor = "pointer";
    document.body.addEventListener("click", openPersistedTooltip);
  }

  function unsetCursorPointer() {
    if (!showPointer) return;

    document.body.style.cursor = "unset";
    document.body.removeEventListener("click", openPersistedTooltip);
  }

  // Removes the persisted tooltip if click detected outside the tooltip
  function handleClickOutsideTooltip(e: Event) {
    const tooltipEl = document.getElementById(elId);
    if (e.target && tooltipEl?.contains(e.target as Node)) return;
    closePersistedTooltip();
    unsetCursorPointer();
  }

  let overlay: HTMLElement;

  return {
    opts: (_u, opts) => {
      if (!getClosestIdx) return;
      opts.cursor ??= {};
      /* uPlot uses dataIdx to set the active index per series for highlighting.
       * If multiple non-x series are added, getClosestIdx would need to accept
       * seriesIdx and return a value based on the series.
       */
      opts.cursor.dataIdx = (u, seriesIdx, closestIdx) => {
        if (seriesIdx === CLOSEST_IDX_SERIES) return getClosestIdx(u);
        return closestIdx;
      };
    },
    hooks: {
      init: (u) => {
        const tooltipEl = document.getElementById(elId);
        if (tooltipEl) {
          overlay = tooltipEl;
        } else {
          overlay = document.createElement("div");
          overlay.id = elId;
          document.body.appendChild(overlay);
        }
        if (!overlay) return;

        overlay.style.display = "none";
        overlay.style.pointerEvents = "none";

        over = u.over;
        bound = document.body;

        over.onmouseenter = () => {
          isCurrentlyHovered = true;
        };

        over.onmouseleave = () => {
          isCurrentlyHovered = false;
          if (persistTooltip) return;
          overlay.style.display = "none";
          unsetCursorPointer();
          persistTooltip = false;
        };

        getScrollContainer().addEventListener("scroll", tClosePersistedTooltip);
      },
      destroy: () => {
        over.onmouseenter = null;
        over.onmouseleave = null;
        unsetCursorPointer();
        closePersistedTooltip();

        getScrollContainer().removeEventListener(
          "scroll",
          tClosePersistedTooltip,
        );
      },
      setSize: () => {
        syncBounds();
      },
      syncRect: () => {
        syncBounds();
      },
      setCursor: (u) => {
        // setCursor is called across cursor sync'd charts
        // only allow showing tooltip on actively hovered chart to prevents multiple tooltips across charts showing
        if (!isCurrentlyHovered) return;
        if (persistTooltip) return;

        const { left, top } = u.cursor;
        /* This idx is used to determine whether and what to show in the tooltip.
         * uPlot's convention is for series 0 to be the x-axis and closestIdx
         * to be calculated by closest x value.
         * When getClosestIdx exists, we read from CLOSEST_IDX_SERIES instead,
         * which has the custom idx set via dataIdx above. */
        const idx = u.cursor.idxs?.[getClosestIdx ? CLOSEST_IDX_SERIES : 0];

        /* idx is undefined when the cursor not yet initialized and
         * null when no data is in range (and we should hide the tooltip) */
        if (left === undefined || top === undefined || idx === undefined)
          return;

        const xVal = u.posToVal(left, u.series[0].scale ?? "x");
        const showTooltip = idx !== null && showOnCursor(u, xVal, idx);
        if (showTooltip) {
          const anchor = {
            left: left + bLeft + 5,
            top: top + bTop,
          };
          overlay.style.display = "block";
          overlay.style.pointerEvents = "none";
          setCursorPointer();
          placement(overlay, anchor, "right", "start", { bound });
        } else {
          overlay.style.display = "none";
          unsetCursorPointer();
        }
      },
      // Remove the persisted tooltip on scale change
      setScale: () => {
        unsetCursorPointer();
        closePersistedTooltip();
      },
    },
  };
}
