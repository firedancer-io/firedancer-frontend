import { useCallback, useEffect } from "react";
import { useLatest } from "react-use";
import { cancelFrameRender, requestFrameRender } from "../../frameLoop";

// renders once in the next frame, after that frame's clock updates
export function useFrameRender(render: () => void) {
  const renderRef = useLatest(render);
  const renderInFrame = useCallback(() => renderRef.current(), [renderRef]);

  useEffect(() => () => cancelFrameRender(renderInFrame), [renderInFrame]);

  return useCallback(() => requestFrameRender(renderInFrame), [renderInFrame]);
}
