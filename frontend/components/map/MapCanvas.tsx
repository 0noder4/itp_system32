"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACCENT_COLOR } from "@/lib/colors";
import type { MapSegment } from "@/lib/mapLayout";
import {
  DEFAULT_MAP_VIEW,
  MAP_MINE_COLOR,
  MAP_PARTNER_COLOR,
  MAP_SIZE_COLORS,
  isDefaultMapView,
  isPartnerStatus,
  sizeColorForArea,
  type MapViewFlags,
} from "@/lib/mapViews";

export type CanvasCompanyStand = {
  companyId: number;
  companyName: string;
  standNumber: string;
  logoUrl?: string | null;
  /** Opiekun FR (imię i nazwisko). */
  frRespName?: string | null;
  /** Company package status for partner coloring. */
  status?: "main" | "partner" | "basic" | string | null;
  /** Current user is FR opiekun of this company. */
  isMine?: boolean;
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
  /** Staff map color overlays (ignored for exhibitor highlight mode). */
  colorView?: MapViewFlags;
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

type ResolvedPaint = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  emphasized: boolean;
};

function resolvePaint(
  seg: MapSegment,
  opts: {
    selected: boolean;
    assigned: boolean;
    stand: CanvasCompanyStand | undefined;
    userStandNumber: string | null;
    colorView: MapViewFlags;
  }
): ResolvedPaint {
  const { selected, assigned, stand, userStandNumber, colorView } = opts;

  if (selected) {
    return {
      fill: "#3b82f6",
      fillOpacity: 0.3,
      stroke: "#2563eb",
      strokeWidth: 2,
      emphasized: true,
    };
  }

  // Exhibitor mode: only own stand highlighted.
  if (userStandNumber) {
    if (assigned) {
      return {
        fill: ACCENT_COLOR,
        fillOpacity: 0.3,
        stroke: ACCENT_COLOR,
        strokeWidth: 2,
        emphasized: true,
      };
    }
    return {
      fill: "#ffffff",
      fillOpacity: 0.02,
      stroke: "#000",
      strokeWidth: 1,
      emphasized: false,
    };
  }

  if (colorView.mine) {
    if (stand?.isMine) {
      return {
        fill: MAP_MINE_COLOR,
        fillOpacity: 0.55,
        stroke: MAP_MINE_COLOR,
        strokeWidth: 2,
        emphasized: true,
      };
    }
    return {
      fill: "#ffffff",
      fillOpacity: 0.02,
      stroke: "#000",
      strokeWidth: 1,
      emphasized: false,
    };
  }

  if (colorView.standSizes || colorView.partners) {
    const partnerHit =
      colorView.partners && isPartnerStatus(stand?.status ?? null);
    if (partnerHit) {
      return {
        fill: MAP_PARTNER_COLOR,
        fillOpacity: 0.85,
        stroke: "#c45c5c",
        strokeWidth: 1.5,
        emphasized: true,
      };
    }
    if (colorView.standSizes) {
      const sizeFill = sizeColorForArea(seg.area_m2) ?? "#ffffff";
      return {
        fill: sizeFill,
        fillOpacity: 0.9,
        stroke: "#000",
        strokeWidth: 1,
        emphasized: true,
      };
    }
    // Partners-only: non-partners stay blank.
    return {
      fill: "#ffffff",
      fillOpacity: 0.02,
      stroke: "#000",
      strokeWidth: 1,
      emphasized: false,
    };
  }

  // Default view.
  if (assigned) {
    return {
      fill: ACCENT_COLOR,
      fillOpacity: 0.3,
      stroke: ACCENT_COLOR,
      strokeWidth: 2,
      emphasized: true,
    };
  }
  return {
    fill: "#ffffff",
    fillOpacity: 0.02,
    stroke: "#000",
    strokeWidth: 1,
    emphasized: false,
  };
}

function MapViewLegend({ colorView }: { colorView: MapViewFlags }) {
  if (isDefaultMapView(colorView)) return null;

  const items: { color: string; label: string }[] = [];
  if (colorView.mine) {
    items.push({ color: MAP_MINE_COLOR, label: "Moje firmy" });
  } else {
    if (colorView.standSizes) {
      items.push(
        { color: MAP_SIZE_COLORS[4], label: "4 m²" },
        { color: MAP_SIZE_COLORS[6], label: "6 m²" },
        { color: MAP_SIZE_COLORS[8], label: "8 m²" },
        { color: MAP_SIZE_COLORS[12], label: "12 m²" }
      );
    }
    if (colorView.partners) {
      items.push({ color: MAP_PARTNER_COLOR, label: "Partner" });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-white/90 px-3 py-2 text-xs text-slate-700">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-black/25"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
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
  colorView = DEFAULT_MAP_VIEW,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  /** Stand center in viewport (client) coordinates. */
  const [tooltipAnchor, setTooltipAnchor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<{
    left: number;
    top: number;
  } | null>(null);

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
    if (colorView.mine) return !!standMap.get(label)?.isMine;
    if (colorView.standSizes || colorView.partners) {
      const stand = standMap.get(label);
      if (colorView.partners && isPartnerStatus(stand?.status ?? null)) {
        return true;
      }
      if (colorView.standSizes) return true;
      return false;
    }
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
  }, [segments, selectedSet, standMap, userStandNumber, colorView]);

  const updateTooltipAnchor = (label: string) => {
    const seg = segments.find((s) => s.label === label);
    const svg = svgRef.current;
    if (!seg || !svg) return;
    const c = shapeCenter(seg.shape);
    const vb = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / vb.width;
    const scaleY = rect.height / vb.height;
    setTooltipAnchor({
      x: rect.left + c.x * scaleX,
      y: rect.top + c.y * scaleY,
    });
  };

  const hoveredStand = hoveredLabel ? standMap.get(hoveredLabel) : undefined;

  useLayoutEffect(() => {
    if (!hoveredStand || !tooltipAnchor || !tooltipRef.current) {
      setTooltipStyle(null);
      return;
    }
    const el = tooltipRef.current;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const pad = 8;
    const gap = 8;
    let left = tooltipAnchor.x - tw / 2;
    let top = tooltipAnchor.y - th - gap;
    if (top < pad) {
      top = tooltipAnchor.y + gap;
    }
    left = Math.min(Math.max(pad, left), window.innerWidth - tw - pad);
    top = Math.min(Math.max(pad, top), window.innerHeight - th - pad);
    setTooltipStyle({ left, top });
  }, [hoveredStand, tooltipAnchor]);

  const tooltip =
    hoveredStand && tooltipAnchor
      ? createPortal(
          <div
            ref={tooltipRef}
            className="pointer-events-none fixed z-50 w-56 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
            style={{
              left: tooltipStyle?.left ?? -9999,
              top: tooltipStyle?.top ?? -9999,
              visibility: tooltipStyle ? "visible" : "hidden",
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
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative w-full overflow-hidden rounded-md border bg-slate-50">
      <div className="overflow-auto">
        <svg
          ref={svgRef}
          viewBox="0 0 534.8 297.8"
          className="h-auto w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <rect x="0" y="0" width="534.8" height="297.8" fill="#f8fafc" />
          {orderedSegments.map((seg) => {
            const stand = standMap.get(seg.label);
            const assigned = userStandNumber
              ? seg.label === userStandNumber
              : standMap.has(seg.label);
            const selected = selectedSet.has(seg.label);
            const tip = showCompanyTip(seg.label);
            const paint = resolvePaint(seg, {
              selected,
              assigned,
              stand,
              userStandNumber,
              colorView,
            });
            const center = shapeCenter(seg.shape);
            const common = {
              fill: paint.fill,
              fillOpacity: paint.fillOpacity,
              stroke: paint.stroke,
              strokeWidth: paint.strokeWidth,
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
                    setTooltipAnchor(null);
                    setTooltipStyle(null);
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
                  fontWeight={paint.emphasized ? "bold" : "normal"}
                  fill={
                    selected
                      ? "#1d4ed8"
                      : paint.emphasized && !colorView.standSizes && !colorView.partners
                        ? paint.stroke
                        : "#000"
                  }
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
      </div>
      <MapViewLegend colorView={colorView} />
      {tooltip}
    </div>
  );
}
