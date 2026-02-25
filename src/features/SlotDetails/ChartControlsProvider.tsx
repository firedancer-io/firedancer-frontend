import { useCallback, useMemo, useRef, type PropsWithChildren } from "react";
import {
  ChartControlsContext,
  type ChartControlKey,
  type ChartControls,
} from "./ChartControlsContext";

type ChartControlCallback = (value: unknown) => void;

export default function ChartControlsProvider({ children }: PropsWithChildren) {
  const callbacksRef = useRef<Map<ChartControlKey, ChartControlCallback>>(
    new Map(),
  );

  const registerControl = useCallback(
    (key: ChartControlKey, callback: ChartControlCallback) => {
      callbacksRef.current.set(key, callback);
      return () => callbacksRef.current.delete(key);
    },
    [],
  ) as ChartControls["registerControl"];

  const triggerControl = useCallback((key: ChartControlKey, value: unknown) => {
    callbacksRef.current.get(key)?.(value);
  }, []) as ChartControls["triggerControl"];

  const value: ChartControls = useMemo(
    () => ({ triggerControl, registerControl }),
    [triggerControl, registerControl],
  );

  return (
    <ChartControlsContext.Provider value={value}>
      {children}
    </ChartControlsContext.Provider>
  );
}
