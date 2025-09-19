import { useSetAtom } from "jotai";
import { isNavCollapsedAtom } from "../../atoms";
import { maxZIndex } from "../../consts";

export default function NavBlur() {
  const setIsNavCollapsed = useSetAtom(isNavCollapsedAtom);

  return (
    <div
      onClick={() => setIsNavCollapsed(true)}
      className="blur"
      style={{
        zIndex: maxZIndex - 2,
      }}
    />
  );
}
