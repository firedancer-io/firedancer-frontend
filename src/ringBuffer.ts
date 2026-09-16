export interface RingBuffer<T> {
  length: number;
  /** Returns the item that was evicted by this push, or undefined if the buffer was not yet full. */
  push(item: T): T | undefined;
  toArray(): T[];
  clear(): void;
}

/**
 * Fixed size ring buffer.
 * Automatically overwrites oldest entries when full.
 */
export function createRingBuffer<T>(size: number): RingBuffer<T> {
  if (size < 1) {
    throw new Error("Ring buffer size must be at least 1");
  }

  const buffer = new Array<T | undefined>(size);
  let head = 0;
  let length = 0;

  return {
    get length() {
      return length;
    },

    push(item: T): T | undefined {
      const evicted = length === size ? buffer[head] : undefined;
      buffer[head] = item;
      head = (head + 1) % size;
      if (length < size) length++;
      return evicted;
    },

    toArray(): T[] {
      const start = length < size ? 0 : head;
      const result = new Array<T>(length);
      for (let i = 0; i < length; i++) {
        result[i] = buffer[(start + i) % size] as T;
      }
      return result;
    },

    clear() {
      head = 0;
      length = 0;
    },
  };
}
