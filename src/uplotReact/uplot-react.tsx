// Pulled from https://github.com/skalinichev/uplot-wrappers
import { useCallback, useEffect, useRef } from "react";
import uPlot from "uplot";
import { dataMatch, optionsUpdateState } from "./utils";
import { useSetAtom } from "jotai";
import { uplotRefsAtom } from "./atoms";
import { useDebouncedCallback } from "use-debounce";

interface UplotReactProps {
  id: string;
  options: uPlot.Options;
  data: uPlot.AlignedData;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  target?: HTMLElement | ((self: uPlot, init: Function) => void);
  onDelete?: (chart: uPlot) => void;
  onCreate?: (chart: uPlot) => void;
  resetScales?: boolean;
  className?: string;
}

export interface UplotChartRef {
  getChart: () => uPlot | null;
}

export default function UplotReact({
  id,
  options,
  data,
  target,
  onDelete,
  onCreate,
  resetScales = true,
  className,
}: UplotReactProps): JSX.Element | null {
  const chartRef = useRef<uPlot | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const propOptionsRef = useRef(options);
  const propTargetRef = useRef(target);
  const propDataRef = useRef(data);
  const onCreateRef = useRef(onCreate);
  const onDeleteRef = useRef(onDelete);

  const setUplotRef = useSetAtom(uplotRefsAtom);

  useEffect(() => {
    onCreateRef.current = onCreate;
    onDeleteRef.current = onDelete;
  });

  const destroy = useCallback(
    (chart: uPlot | null) => {
      if (chart) {
        onDeleteRef.current?.(chart);
        chart.destroy();
        chartRef.current = null;
        setUplotRef((prev) => {
          const state = { ...prev };
          delete state[id];
          return state;
        });
      }
    },
    [id, setUplotRef],
  );

  const create = useCallback(() => {
    const newChart = new uPlot(
      propOptionsRef.current,
      propDataRef.current,
      propTargetRef.current || (targetRef.current as HTMLDivElement),
    );
    chartRef.current = newChart;
    setUplotRef((prev) => {
      return { ...prev, [id]: () => chartRef.current };
    });
    onCreateRef.current?.(newChart);
  }, [id, setUplotRef]);

  useEffect(() => {
    create();
    return () => {
      destroy(chartRef.current);
    };
  }, [create, destroy]);

  useEffect(() => {
    if (propOptionsRef.current !== options) {
      const optionsState = optionsUpdateState(propOptionsRef.current, options);
      propOptionsRef.current = options;
      if (!chartRef.current || optionsState === "create") {
        destroy(chartRef.current);
        create();
      } else if (optionsState === "update") {
        console.log("update chart");

        chartRef.current.setSize({
          width: options.width,
          height: options.height,
        });
      }
    }
  }, [options, create, destroy]);

  useEffect(() => {
    if (propDataRef.current !== data) {
      if (!chartRef.current) {
        propDataRef.current = data;
        create();
      } else if (!dataMatch(propDataRef.current, data)) {
        if (resetScales) {
          chartRef.current.setData(data, true);
        } else {
          chartRef.current.setData(data, false);
          chartRef.current.redraw();
        }
      }
      propDataRef.current = data;
    }
  }, [data, resetScales, create]);

  useEffect(() => {
    if (propTargetRef.current !== target) {
      propTargetRef.current = target;
      create();
    }

    return () => destroy(chartRef.current);
  }, [target, create, destroy]);

  const setDbSize = useDebouncedCallback(() => {
    requestAnimationFrame(() =>
      chartRef.current?.setSize({
        width: options.width,
        height: options.height,
      }),
    );
  }, 100);

  if (
    options.height !== chartRef.current?.height ||
    options.width !== chartRef.current?.width
  ) {
    setDbSize();
  }

  return target ? null : <div ref={targetRef} className={className}></div>;
}
