// Minimal EventEmitter replacement for the node `events` polyfill,
// covering the subset the app uses. Node semantics preserved:
// "newListener" fires before the listener is added, removal drops the
// most recently added match, emit iterates over a snapshot.
export class MiniEmitter<Events extends Record<string, unknown[]>> {
  private readonly events = new Map<string, ((...args: never[]) => void)[]>();

  addListener<K extends keyof Events & string>(
    type: K,
    listener: (...args: Events[K]) => void,
  ) {
    this.emitInternal("newListener", [type]);
    let listeners = this.events.get(type);
    if (!listeners) {
      listeners = [];
      this.events.set(type, listeners);
    }
    listeners.push(listener as unknown as (...args: never[]) => void);
    return this;
  }

  on<K extends keyof Events & string>(
    type: K,
    listener: (...args: Events[K]) => void,
  ) {
    return this.addListener(type, listener);
  }

  removeListener<K extends keyof Events & string>(
    type: K,
    listener: (...args: Events[K]) => void,
  ) {
    const listeners = this.events.get(type);
    if (listeners) {
      const i = listeners.lastIndexOf(
        listener as unknown as (...args: never[]) => void,
      );
      if (i >= 0) listeners.splice(i, 1);
    }
    return this;
  }

  emit<K extends keyof Events & string>(type: K, ...args: Events[K]) {
    return this.emitInternal(type, args);
  }

  listenerCount(type: keyof Events & string) {
    return this.events.get(type)?.length ?? 0;
  }

  private emitInternal(type: string, args: unknown[]) {
    const listeners = this.events.get(type);
    if (!listeners?.length) return false;
    for (const listener of [...listeners]) {
      (listener as (...a: unknown[]) => void)(...args);
    }
    return true;
  }
}
