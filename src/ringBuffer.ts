export interface RingBuffer<T> {
  length: number;
  push(item: T): void;
  toArray(): T[];
  clear(): void;
}

/**
 * Fixed size ring buffer.
 * Automatically overwrites oldest entries when full.
 */
export function createRingBuffer<T>(size: number): RingBuffer<T> {
  const buffer = new Array<T | undefined>(size);
  let head = 0;
  let length = 0;

  return {
    get length() {
      return length;
    },

    push(item: T) {
      buffer[head] = item;
      head = (head + 1) % size;
      if (length < size) length++;
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
