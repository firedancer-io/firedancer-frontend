import { maxZIndex } from "../../consts";
import { useSlotsNavigation } from "../../hooks/useSlotsNavigation";

export default function NavBlur() {
  const { setIsNavCollapsed } = useSlotsNavigation();

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
