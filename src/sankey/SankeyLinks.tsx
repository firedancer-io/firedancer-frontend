import { sankeyLinkHorizontal, sankeyLinkVertical } from "./links";
import type {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyLinkDatum,
} from "./types";
import { SankeyLinksItem } from "./SankeyLinksItem";
import { useMemo } from "react";

interface SankeyLinksProps<N extends DefaultNode, L extends DefaultLink> {
  layout: SankeyCommonProps<N, L>["layout"];
  links: SankeyLinkDatum<N, L>[];
  linkContract: SankeyCommonProps<N, L>["linkContract"];
  enableLinkGradient: SankeyCommonProps<N, L>["enableLinkGradient"];
  getLinkColor?: SankeyCommonProps<N, L>["getLinkColor"];
}

export const SankeyLinks = <N extends DefaultNode, L extends DefaultLink>({
  links,
  layout,
  linkContract,
  enableLinkGradient,
  getLinkColor,
}: SankeyLinksProps<N, L>) => {
  const getLinkPath = useMemo(
    () =>
      layout === "horizontal" ? sankeyLinkHorizontal() : sankeyLinkVertical(),
    [layout],
  );

  return (
    <>
      {links.map((link) => (
        <SankeyLinksItem<N, L>
          key={`${link.source.id}.${link.target.id}.${link.index}`}
          link={link}
          layout={layout}
          path={getLinkPath(link, linkContract)}
          color={link.color}
          enableGradient={enableLinkGradient}
          getLinkColor={getLinkColor}
        />
      ))}
    </>
  );
};
