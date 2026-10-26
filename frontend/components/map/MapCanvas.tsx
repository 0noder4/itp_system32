"use client";

import React, { useMemo, useRef, useState } from "react";
import { ACCENT_COLOR } from "@/lib/colors";
import type { MapSegment } from "@/lib/mapLayout";

export type CanvasCompanyStand = {
  companyId: number;
  companyName: string;
  standNumber: string;
  logoUrl?: string | null;
  /** Opiekun FR (imię i nazwisko). */
  frRespName?: string | null;
};

type MapCanvasProps = {
  segments: MapSegment[];
  companyStands?: CanvasCompanyStand[];
  /** When set, only this stand is highlighted (exhibitor). */
  userStandNumber?: string | null;
  selectedLabels?: string[];
  onToggleSelect?: (label: string) => void;
  /** Right-click on a selected booth (edit mode). */
  onSelectedContextMenu?: (label: string) => void;
  editable?: boolean;
};

function shapeCenter(shape: MapSegment["shape"]): { x: number; y: number } {
  if (shape.type === "rect") {
    return {
      x: shape.x + shape.width / 2,
      y: shape.y + shape.height / 2,
    };
  }
  const nums = shape.points.trim().split(/[\s,]+/).map(Number);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function renderShape(
  seg: MapSegment,
  common: Record<string, unknown>
) {
  if (seg.shape.type === "polygon") {
    return <polygon points={seg.shape.points} {...common} />;
  }
  return (
    <rect
      x={seg.shape.x}
      y={seg.shape.y}
      width={seg.shape.width}
      height={seg.shape.height}
      transform={seg.shape.transform}
      {...common}
    />
  );
}

export function MapCanvas({
  segments,
  companyStands = [],
  userStandNumber = null,
  selectedLabels = [],
  onToggleSelect,
  onSelectedContextMenu,
  editable = false,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  );

  const standMap = useMemo(() => {
    const m = new Map<string, CanvasCompanyStand>();
    companyStands.forEach((s) => m.set(s.standNumber, s));
    return m;
  }, [companyStands]);

  const selectedSet = useMemo(
    () => new Set(selectedLabels),
    [selectedLabels]
  );

  const isHighlighted = (label: string) => {
    if (userStandNumber) return label === userStandNumber;
    return standMap.has(label);
  };

  const showCompanyTip = (label: string) => {
    if (userStandNumber && label !== userStandNumber) return false;
    return standMap.has(label);
  };

  // Assigned/selected last so their stroke wins over neighbour black borders.
  const orderedSegments = useMemo(() => {
    const score = (label: string) => {
      if (selectedSet.has(label)) return 2;
      if (isHighlighted(label)) return 1;
      return 0;
    };
    return [...segments].sort((a, b) => score(a.label) - score(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, selectedSet, standMap, userStandNumber]);

  const updateTooltipAnchor = (label: string) => {
    const seg = segments.find((s) => s.label === label);
    const svg = svgRef.current;
    if (!seg || !svg) return;
    const c = shapeCenter(seg.shape);
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / vb.width;
    const scaleY = rect.height / vb.height;
    setTooltipPos({ x: c.x * scaleX, y: c.y * scaleY });
  };

  const hoveredStand = hoveredLabel ? standMap.get(hoveredLabel) : undefined;

  return (
    <div className="relative w-full overflow-auto rounded-md border bg-slate-50">
      <svg
        ref={svgRef}
        viewBox="0 0 534.8 297.8"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x="0" y="0" width="534.8" height="297.8" fill="#f8fafc" />
        {orderedSegments.map((seg) => {
          const assigned = isHighlighted(seg.label);
          const selected = selectedSet.has(seg.label);
          const tip = showCompanyTip(seg.label);
          const fill = selected
            ? "#3b82f6"
            : assigned
              ? ACCENT_COLOR
              : "#ffffff";
          // Keep a tiny fill so empty booths still receive clicks (opacity 0
          // can miss pointer events in some browsers).
          const fillOpacity = selected || assigned ? 0.3 : 0.02;
          const stroke = selected
            ? "#2563eb"
            : assigned
              ? ACCENT_COLOR
              : "#000";
          const strokeWidth = selected || assigned ? 2 : 1;
          const center = shapeCenter(seg.shape);
          const common = {
            fill,
            fillOpacity,
            stroke,
            strokeWidth,
            paintOrder: "fill stroke" as const,
            style: {
              cursor: editable || tip ? "pointer" : "default",
            } as React.CSSProperties,
            onClick: editable
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onToggleSelect?.(seg.label);
                }
              : undefined,
            onContextMenu:
              editable && selected
                ? (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectedContextMenu?.(seg.label);
                  }
                : undefined,
            onMouseEnter: tip
              ? () => {
                  setHoveredLabel(seg.label);
                  updateTooltipAnchor(seg.label);
                }
              : undefined,
            onMouseLeave: tip
              ? () => {
                  setHoveredLabel((cur) =>
                    cur === seg.label ? null : cur
                  );
                  setTooltipPos(null);
                }
              : undefined,
          };
          return (
            <g key={seg.label} id={seg.label}>
              {renderShape(seg, common)}
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fontWeight={assigned || selected ? "bold" : "normal"}
                fill={selected ? "#1d4ed8" : assigned ? ACCENT_COLOR : "#000"}
                stroke="#fff"
                strokeWidth={0.3}
                paintOrder="stroke fill"
                style={{ pointerEvents: "none" }}
              >
                {seg.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredStand && tooltipPos ? (
        <div
          className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          style={{
            left: tooltipPos.x,
            top: Math.max(8, tooltipPos.y - 8),
          }}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">{hoveredStand.companyName}</p>
            <p className="text-xs text-muted-foreground">
              Stoisko {hoveredStand.standNumber}
            </p>
            {hoveredStand.frRespName ? (
              <p className="text-xs text-muted-foreground">
                Opiekun: {hoveredStand.frRespName}
              </p>
            ) : null}
            {hoveredStand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hoveredStand.logoUrl}
                alt=""
                className="mt-2 max-h-16 object-contain"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
