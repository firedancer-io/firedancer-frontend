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
  const resetsRef = useRef<Map<ChartControlKey, () => void>>(new Map());

  const value: ChartControls = useMemo(() => {
    const registerControl = <K extends ChartControlKey>(
      key: K,
      callback: ChartControlCallback<K>,
      reset: () => void,
    ) => {
      callbacksRef.current.set(
        key,
        callback as ChartControlCallback<ChartControlKey>,
      );
      resetsRef.current.set(key, reset);
      return () => {
        callbacksRef.current.delete(key);
        resetsRef.current.delete(key);
      };
    };

    const triggerControl = <K extends ChartControlKey>(
      key: K,
      value: ChartControlMap[K],
    ) => {
      (callbacksRef.current.get(key) as ChartControlCallback<K> | undefined)?.(
        value,
      );
    };

    const resetControl = (key: ChartControlKey) => {
      resetsRef.current.get(key)?.();
    };

    return { registerControl, triggerControl, resetControl };
  }, []);

  return (
    <ChartControlsContext.Provider value={value}>
      {children}
    </ChartControlsContext.Provider>
  );
}
