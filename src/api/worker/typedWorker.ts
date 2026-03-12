export interface TypedWorker<To, From>
  extends Omit<Worker, "postMessage" | "onmessage" | "addEventListener"> {
  postMessage(message: To, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<From>) => unknown) | null;
  addEventListener(
    type: "message",
    listener: (ev: MessageEvent<From>) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export function createTypedWorker<To, From>(
  Ctor: new () => Worker,
): TypedWorker<To, From> {
  return new Ctor() as unknown as TypedWorker<To, From>;
}
