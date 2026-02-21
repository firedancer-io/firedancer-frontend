import { useMemo, useRef, type PropsWithChildren } from "react";
import {
  ChartControlsContext,
  type ChartControlKey,
  type ChartControlCallback,
  type ChartControlMap,
  type ChartControls,
} from "./ChartControlsContext";

export default function ChartControlsProvider({ children }: PropsWithChildren) {
  const callbacksRef = useRef<
    Map<ChartControlKey, ChartControlCallback<ChartControlKey>>
  >(new Map());

  const value: ChartControls = useMemo(() => {
    const registerControl = <K extends ChartControlKey>(
      key: K,
      callback: ChartControlCallback<K>,
    ) => {
      callbacksRef.current.set(
        key,
        callback as ChartControlCallback<ChartControlKey>,
      );
      return () => callbacksRef.current.delete(key);
    };

    const triggerControl = <K extends ChartControlKey>(
      key: K,
      value: ChartControlMap[K],
    ) => {
      (callbacksRef.current.get(key) as ChartControlCallback<K> | undefined)?.(
        value,
      );
    };

    return { registerControl, triggerControl };
  }, []);

  return (
    <ChartControlsContext.Provider value={value}>
      {children}
    </ChartControlsContext.Provider>
  );
}
