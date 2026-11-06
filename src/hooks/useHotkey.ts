import { useKey, useLatest } from "react-use";

export function useHotkey(key: string, handler: (e: KeyboardEvent) => void) {
  const handlerRef = useLatest(handler);

  useKey(
    (e) => e.key.toLowerCase() === key,
    (e) => {
      const keepsOwnKeys = (e.target as HTMLElement | null)?.closest(
        'input, textarea, [contenteditable], [role="checkbox"]',
      );
      if (keepsOwnKeys || e.ctrlKey || e.metaKey || e.altKey) return;

      // keep focused controls like buttons and selects from also handling the key
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      handlerRef.current(e);
    },
    { options: { capture: true } },
    [key],
  );
}
