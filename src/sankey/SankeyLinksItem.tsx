import { SankeyLinkGradient } from "./SankeyLinkGradient";
import type {
  DefaultLink,
  DefaultNode,
  SankeyCommonProps,
  SankeyLinkDatum,
} from "./types";
import { useShowNode } from "./useShowNode";

interface SankeyLinksItemProps<N extends DefaultNode, L extends DefaultLink> {
  link: SankeyLinkDatum<N, L>;
  layout: SankeyCommonProps<N, L>["layout"];
  path: string;
  color: string;
  enableGradient: SankeyCommonProps<N, L>["enableLinkGradient"];
  getLinkColor?: SankeyCommonProps<N, L>["getLinkColor"];
}

export const SankeyLinksItem = <N extends DefaultNode, L extends DefaultLink>({
  link,
  layout,
  path,
  color,
  enableGradient,
  getLinkColor,
}: SankeyLinksItemProps<N, L>) => {
  const showNode = useShowNode(link.target.id, link.value);
  if (!showNode) return null;

  const linkId = `${link.source.id}.${link.target.id}.${link.index}`;
  return (
    <>
      {enableGradient && (
        <SankeyLinkGradient
          id={linkId}
          layout={layout}
          startColor={link.startColor || link.source.color}
          endColor={link.endColor || link.target.color}
        />
      )}
      <path
        fill={
          getLinkColor?.(link) ??
          (enableGradient ? `url("#${encodeURI(linkId)}")` : color)
        }
        d={path}
      />
    </>
  );
};
