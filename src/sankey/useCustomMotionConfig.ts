import { useMotionConfig } from "@nivo/core";

export function useCustomMotionConfig() {
  const motionConfig = useMotionConfig();
  motionConfig.config.tension = 200;
  return motionConfig;
}
