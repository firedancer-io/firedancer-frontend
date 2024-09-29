import { useInterval, useMeasure } from "react-use";
import { useMemo, useState } from "react";
import { isDefined } from "../../../utils";

const dataCount = 160;

interface TileParkLineProps {
  value?: number;
  queryBusy?: number[];
}

export default function TileSparkLine({ value, queryBusy }: TileParkLineProps) {
  const [ref, { width, height }] = useMeasure<SVGSVGElement>();

  const [busyData, setBusyData] = useState<(number | undefined)[]>([]);

  useInterval(() => {
    if (queryBusy?.length) return;

    setBusyData((prev) => {
      const newState = [...prev, value];
      if (newState.length >= dataCount) {
        newState.shift();
      }
      return newState;
    });
  }, 10);

  const scaledDataPoints = useMemo(() => {
    const data = queryBusy ?? busyData;

    const xRatio = width / data.length;

    return data
      .map((d, i) => {
        if (d === undefined) return;

        return {
          x: i * xRatio,
          y: Math.trunc((1 - d) * height),
        };
      })
      .filter(isDefined);
  }, [queryBusy, busyData, width, height]);

  const points = scaledDataPoints.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="20px"
      //   viewBox="0 0 123 12"
      fill="none"
      style={{ background: "#232A38", padding: "2px 0" }}
      // background=""
    >
      {/* <path
        d="M1.79999 10.8781C4.06614 10.6785 6.32967 10.4691 8.61441 10.3038C9.26967 10.2564 10.03 10.1765 10.6948 10.2575C12.2993 10.4531 13.5526 10.1668 15.1333 10.1047C16.1576 10.0644 17.1668 10.3054 18.0707 10.4474C19.4246 10.66 20.8477 10.8933 22.2964 10.9892C23.0029 11.036 23.9663 10.919 24.6014 10.8642C25.5862 10.7792 27.4015 10.6075 28.3839 10.4983C28.895 10.4415 29.558 10.3751 30.0269 10.2482C30.3039 10.1733 30.4156 10.0303 30.8189 10.0398C31.8614 10.0646 33.0435 10.3553 34.0281 10.4821C34.3484 10.5234 35.1332 10.6674 35.5116 10.5631C36.3339 10.3367 36.929 9.89721 37.6038 9.60914C38.2418 9.33677 38.9687 9.12371 39.7255 8.90522C40.4143 8.70638 40.8381 8.58661 41.5163 8.39117C41.7762 8.31626 42.175 8.16825 42.5506 8.15267C43.4513 8.11531 44.6449 8.37658 45.4525 8.50927C45.8936 8.58175 46.2776 8.68484 46.6995 8.77092C47.5197 8.93829 48.421 9.04235 49.2586 9.19698C49.6902 9.27666 50.2773 9.34963 50.6416 9.47716C51.1173 9.6437 51.3552 9.94594 51.6581 10.1602C52.3073 10.6194 54.913 9.55535 55.8425 9.47947C56.066 9.46124 56.6737 9.71427 56.8118 9.75271C57.1175 9.83775 57.5614 9.99244 57.9347 10.0352C58.5233 10.1026 59.2652 10.1178 59.8555 10.151C61.2187 10.2277 62.5708 10.3251 63.8981 10.1301C65.0498 9.96093 66.1324 9.70471 67.2019 9.47021C67.7814 9.34314 68.4478 9.22115 68.9395 9.03952C69.1795 8.95087 69.3947 8.85152 69.6487 8.76861C70.0327 8.64323 70.5094 8.76858 70.9194 8.81955C73.3711 9.12434 75.9632 9.24789 78.4489 9.50726C79.6314 9.63065 80.3393 9.80804 81.3863 10.0167C81.8429 10.1077 82.3167 10.2238 82.7811 10.3038C82.919 10.3276 82.9234 10.3164 83.0175 10.2853C83.393 10.1612 83.9869 10.1158 84.4477 10.0722C85.7397 9.95017 85.3759 10.2352 86.1617 10.5354C86.6121 10.7074 88.2854 10.333 88.4667 10.3038C88.7088 10.2647 92.5074 9.6401 92.7811 9.59525C93.3994 9.49393 93.9912 9.35439 94.6487 9.30349C95.9816 9.2003 99.2907 9.82435 99.9028 9.14372C100.404 8.58642 100.325 7.96826 101.221 7.46959C101.78 7.1585 102.41 6.86822 102.97 6.55727C103.459 6.28585 103.688 6.07614 104.542 5.97839C105.55 5.86309 106.592 5.77523 107.616 5.68432C107.944 5.65519 108.737 5.53866 109.111 5.61485C109.583 5.71097 110.097 5.93316 110.571 5.7561C111.281 5.49059 112.49 5.62544 112.822 5.23511C113.397 4.55971 113.369 3.68422 114.542 3.11176C115.332 2.72662 116.938 2.47335 118.136 2.35227C118.591 2.30627 119.204 1 119.471 2.48889C120.089 1 120.62 1 121.8 1"
        stroke="url(#paint0_linear_2971_11300)"
        stroke-width="2"
        stroke-linecap="round"
      /> */}
      <polyline
        points={points}
        stroke="url(#paint0_linear_2971_11300)"
        widths={2}
        strokeWidth={2}
        strokeLinecap="round"
      />

      <defs>
        <linearGradient
          id="paint0_linear_2971_11300"
          x1="59.5"
          y1="20"
          x2="59.5"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#55BA83" />
          <stop offset="1" stopColor="#D94343" />
        </linearGradient>
      </defs>
    </svg>
  );
  // <div className={styles.container}></div>;
}
