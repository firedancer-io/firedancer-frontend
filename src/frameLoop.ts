type FrameUpdate = (frameTimeMs: number) => void;
type FrameRender = () => void;

// one animation frame callback: clocks update every frame, then queued renders run once
const updates = new Set<FrameUpdate>();
let queuedRenders = new Set<FrameRender>();
let runningRenders = new Set<FrameRender>();
let rafId: number | undefined;

function callSafely(callback: () => void) {
  try {
    callback();
  } catch (error) {
    // a failing callback doesn't stop the rest of the frame
    setTimeout(() => {
      throw error;
    });
  }
}

function runFrame(frameTimeMs: number) {
  rafId = undefined;
  for (const update of updates) callSafely(() => update(frameTimeMs));

  runningRenders = queuedRenders;
  queuedRenders = new Set();
  for (const render of runningRenders) callSafely(render);
  runningRenders = new Set();

  requestFrame();
}

function requestFrame() {
  if (rafId !== undefined || (!updates.size && !queuedRenders.size)) return;
  rafId = requestAnimationFrame(runFrame);
}

// runs update every frame until the returned stop is called
export function onFrameUpdate(update: FrameUpdate) {
  updates.add(update);
  requestFrame();
  return () => {
    updates.delete(update);
  };
}

export function requestFrameRender(render: FrameRender) {
  queuedRenders.add(render);
  requestFrame();
}

export function cancelFrameRender(render: FrameRender) {
  queuedRenders.delete(render);
  runningRenders.delete(render);
}
