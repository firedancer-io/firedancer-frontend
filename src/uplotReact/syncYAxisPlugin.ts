import type uPlot from "uplot";
import { getAxisSize } from "./utils";

interface SyncGroupState {
  charts: Map<string, uPlot>;
  naturalSizes: Map<string, number>;
  maxSize: number;
  pendingSync: number | null;
}

const syncGroups = new Map<string, SyncGroupState>();

const scheduleSync = (key: string) => {
  const group = syncGroups.get(key);
  if (!group || group.pendingSync !== null) return;

  const newMaxSize = Math.max(0, ...group.naturalSizes.values());
  if (newMaxSize === group.maxSize) return;

  group.maxSize = newMaxSize;
  group.pendingSync = requestAnimationFrame(() => {
    for (const chart of group.charts.values()) {
      chart.redraw(false, true);
    }

    group.pendingSync = null;
  });
};

export function syncYAxisPlugin(
  chartId: string,
  syncKey: string,
  syncAxisIdx = 1,
): uPlot.Plugin {
  return {
    opts: (_u, chartOpts) => {
      const yAxis = chartOpts.axes?.[syncAxisIdx];
      if (!yAxis) return;

      const originalYAxisSize = yAxis.size;

      yAxis.size = (self, values, axisIdx, cycleNum) => {
        const original =
          typeof originalYAxisSize === "function"
            ? originalYAxisSize(self, values, axisIdx, cycleNum)
            : (originalYAxisSize ?? getAxisSize(self.axes[axisIdx]));

        const group = syncGroups.get(syncKey);
        if (!group) return original;

        group.naturalSizes.set(chartId, original);
        return Math.max(original, group.maxSize);
      };
    },

    hooks: {
      ready: (u) => {
        const group = syncGroups.get(syncKey);
        if (!group) {
          syncGroups.set(syncKey, {
            charts: new Map([[chartId, u]]),
            naturalSizes: new Map(),
            maxSize: 0,
            pendingSync: null,
          });
        } else {
          group.charts.set(chartId, u);
        }
      },

      destroy: (u) => {
        const group = syncGroups.get(syncKey);
        if (!group) return;
        if (group.charts.get(chartId) !== u) return;

        group.charts.delete(chartId);
        group.naturalSizes.delete(chartId);

        if (group.charts.size === 0) {
          if (group.pendingSync !== null) {
            cancelAnimationFrame(group.pendingSync);
          }
          syncGroups.delete(syncKey);
        } else {
          scheduleSync(syncKey);
        }
      },

      draw: (_u) => scheduleSync(syncKey),
    },
  };
}
