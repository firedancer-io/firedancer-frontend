import { useEffect, useState } from "react";

export default function useIsDocumentVisible() {
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => document.visibilityState === "visible",
  );

  useEffect(() => {
    const onDocumentVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        onDocumentVisibilityChange,
      );
  }, []);

  return isDocumentVisible;
}
