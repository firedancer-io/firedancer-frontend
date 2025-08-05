import { useAtom } from "jotai";
import { showChartBackgroundAtom } from "./atoms";
import ToggleControl from "../../../../components/ToggleControl";
import { primaryTextColor } from "../../../../colors";

interface CuChartBackgroundToggleProps {
  onUplot: (func: (u: uPlot) => void) => void;
}

export default function CuChartBackgroundToggle({
  onUplot,
}: CuChartBackgroundToggleProps) {
  const [showChartBackground, setShowChartBackground] = useAtom(
    showChartBackgroundAtom,
  );

  const onCheckedChange = (checked: boolean) => {
    setShowChartBackground(checked);
    onUplot((u) => {
      u.redraw(false, false);
    });
  };

  return (
    <ToggleControl
      label="Toggle Background"
      checked={showChartBackground}
      onCheckedChange={onCheckedChange}
      color={primaryTextColor}
    />
  );
}
