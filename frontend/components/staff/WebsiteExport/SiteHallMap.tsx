"use client";

import React, { useMemo } from "react";
import { MapDayLayout, MapSegment, segmentsForDay } from "@/lib/mapLayout";
import styles from "./sitePreview.module.scss";

// Port of targus CompanyDetails/components/Maps/HallMap.tsx — keep rendering identical.
const ACCENT = "#F55718";
const VIEWBOX = "0 0 534.8 297.8";

function renderShape(
  shape: MapSegment["shape"],
  common: React.SVGProps<SVGElement>
) {
  if (shape.type === "polygon") {
    return (
      <polygon
        points={shape.points}
        {...(common as React.SVGProps<SVGPolygonElement>)}
      />
    );
  }
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      transform={shape.transform}
      {...(common as React.SVGProps<SVGRectElement>)}
    />
  );
}

type Props = {
  stand: string;
  day: 1 | 2;
  layout: MapDayLayout | null | undefined;
};

export function SiteHallMap({ stand, day, layout }: Props) {
  const segments = useMemo(() => segmentsForDay(layout), [layout]);
  const ordered = useMemo(() => {
    return [...segments].sort((a, b) => {
      const score = (label: string) => (label === stand ? 1 : 0);
      return score(a.label) - score(b.label);
    });
  }, [segments, stand]);

  const dayClass = day === 1 ? styles.day_1 : styles.day_2;

  if (!stand || ordered.length === 0) {
    return (
      <div className={`${styles.mapContainer} ${dayClass}`}>
        <div className={styles.mapLabel}>
          <label>Stoisko: {stand || "—"}</label>
          <label>dzień {day}</label>
        </div>
        <div className={styles.map}>brak mapy</div>
      </div>
    );
  }

  return (
    <div className={`${styles.mapContainer} ${dayClass}`}>
      <div className={styles.mapLabel}>
        <label>Stoisko: {stand}</label>
        <label>dzień {day}</label>
      </div>
      <div className={styles.map}>
        <svg
          viewBox={VIEWBOX}
          className={styles.hallSvg}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Mapa hali, dzień ${day}, stoisko ${stand}`}
        >
          <rect x="0" y="0" width="534.8" height="297.8" fill="#ffffff" />
          {ordered.map((seg) => {
            const assigned = seg.label === stand;
            return (
              <g key={seg.label} id={seg.label}>
                {renderShape(seg.shape, {
                  fill: assigned ? ACCENT : "#ffffff",
                  fillOpacity: assigned ? 1 : 0.02,
                  stroke: assigned ? ACCENT : "#000000",
                  strokeWidth: assigned ? 2 : 1,
                  paintOrder: "fill stroke",
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
