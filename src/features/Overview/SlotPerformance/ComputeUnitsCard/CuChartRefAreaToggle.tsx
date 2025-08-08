import { useAtom } from "jotai";
import { showChartProjectionsAtom } from "./atoms";
import ToggleControl from "../../../../components/ToggleControl";
import { primaryTextColor } from "../../../../colors";

interface CuChartBackgroundToggleProps {
  onUplot: (func: (u: uPlot) => void) => void;
}

export default function CuChartProjectionsToggle({
  onUplot,
}: CuChartBackgroundToggleProps) {
  const [showChartProjections, setShowChartProjections] = useAtom(
    showChartProjectionsAtom,
  );

  const onCheckedChange = (checked: boolean) => {
    setShowChartProjections(checked);
    onUplot((u) => {
      u.redraw(false, false);
    });
  };

  return (
    <ToggleControl
      label="Show Projections"
      checked={showChartProjections}
      onCheckedChange={onCheckedChange}
      color={primaryTextColor}
    />
  );
}
