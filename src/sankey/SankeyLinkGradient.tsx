import { SankeyCommonProps } from "./types";

interface SankeyLinkGradientProps {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: SankeyCommonProps<any, any>["layout"];
  startColor: string;
  endColor: string;
}

export const SankeyLinkGradient = ({ id, layout }: SankeyLinkGradientProps) => {
  let gradientProps: {
    x1: string;
    x2: string;
    y1: string;
    y2: string;
  };
  if (layout === "horizontal") {
    gradientProps = {
      x1: "0%",
      x2: "100%",
      y1: "0%",
      y2: "0%",
    };
  } else {
    gradientProps = {
      x1: "0%",
      x2: "0%",
      y1: "0%",
      y2: "100%",
    };
  }

  return (
    <linearGradient id={id} spreadMethod="pad" {...gradientProps}>
      <stop stopColor="#183A5A" />
      <stop offset="0.24" stopColor="#10273D" />
      <stop offset="1" stopColor="#183A5A" />
    </linearGradient>
  );
};
