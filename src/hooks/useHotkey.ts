import { useKey, useLatest } from "react-use";

export function useHotkey(key: string, handler: (e: KeyboardEvent) => void) {
  const handlerRef = useLatest(handler);

  useKey(
    (e) => e.key.toLowerCase() === key,
    (e) => {
      const isTyping = (e.target as HTMLElement | null)?.closest(
        "input, textarea, [contenteditable]",
      );
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) {
        e.preventDefault();
        return;
      }

      handlerRef.current(e);
    },
    undefined,
    [key],
  );
}
