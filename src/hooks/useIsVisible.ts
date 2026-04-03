import { useEffect, useState, type RefObject } from "react";

/**
 * Returns true when the element is within or near the viewport.
 * Uses IntersectionObserver with a root margin so elements
 * start updating slightly before they scroll into view.
 */
export default function useIsVisible(
  ref: RefObject<Element | null>,
  rootMargin = "200px",
) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return isVisible;
}
