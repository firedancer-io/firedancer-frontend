import { useMedia } from "react-use";

export function useShredsChartScale() {
  const isXL = useMedia("(max-width: 2100px)");
  const isL = useMedia("(max-width: 1800px)");
  const isM = useMedia("(max-width: 1500px)");
  const isS = useMedia("(max-width: 1200px)");
  const isXS = useMedia("(max-width: 900px)");
  const isXXS = useMedia("(max-width: 600px)");
  const scale = isXXS
    ? 1 / 7
    : isXS
      ? 2 / 7
      : isS
        ? 3 / 7
        : isM
          ? 4 / 7
          : isL
            ? 5 / 7
            : isXL
              ? 6 / 7
              : 1;

  return scale;
}
