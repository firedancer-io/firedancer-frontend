export type Interval = [start: bigint, end: bigint];

export type FetchResult<TData> = { value: TData } | { errorCode: string };

const RESULT_LIMIT_EXCEEDED = "result_limit_exceeded"; // server error code

export interface SplitFetchOpts<TData> {
  minWindowInterval: bigint;
  empty: () => TData;
  merge: (acc: TData, add: TData) => void;
  fetch: (window: Interval, nodeIdx: number) => Promise<FetchResult<TData>>;
}

export interface SplitFetchResult<TData> {
  data: TData;
  canRetry: boolean;
}

function splitInterval(
  [start, end]: Interval,
  minWindowInterval: bigint,
): [Interval, Interval] | null {
  const mid = start + (end - start) / 2n;
  if (end - start <= minWindowInterval || mid <= start) return null;
  return [
    [start, mid],
    [mid + 1n, end],
  ];
}

/**
 * Recursively fetches `window`, splitting in half whenever the server reports
 * RESULT_LIMIT_EXCEEDED, then merging the halves back together.
 *
 * `nodeIdx` identifies each fetch's position in the binary recursion tree using
 * heap-style indexing: the root is 1, and a node `n` has children `2n` and
 * `2n + 1`.
 *
 *        1          <- initial full window
 *      /   \
 *     2     3       <- split into halves
 *    / \   / \
 *   4   5 6   7     <- each half split again
 *
 */
export async function splitFetch<TData>(
  window: Interval,
  opts: SplitFetchOpts<TData>,
  nodeIdx = 1,
): Promise<SplitFetchResult<TData>> {
  const result = await opts.fetch(window, nodeIdx);

  if ("value" in result) {
    // No need to retry if fetch successfully returned value
    return { data: result.value, canRetry: false };
  }

  if (result.errorCode === RESULT_LIMIT_EXCEEDED) {
    const halves = splitInterval(window, opts.minWindowInterval);
    if (halves) {
      console.warn(
        `Query result limit exceeded. Splitting windows and requerying [${window[0]}, ${window[1]}].`,
      );
      const left = await splitFetch(halves[0], opts, nodeIdx * 2);
      const right = await splitFetch(halves[1], opts, nodeIdx * 2 + 1);
      const data = opts.empty();
      opts.merge(data, left.data);
      opts.merge(data, right.data);
      return { data, canRetry: left.canRetry || right.canRetry };
    }

    console.warn(
      `Query result limit exceeded. Windows [${window[0]}, ${window[1]}] cannot be split further and some results may be missing.`,
    );
    // Cannot retry if querying the minimum window size exceeded result limit
    return { data: opts.empty(), canRetry: false };
  }

  return { data: opts.empty(), canRetry: true };
}
