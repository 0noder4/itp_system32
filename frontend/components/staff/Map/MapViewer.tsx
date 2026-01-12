"use client";

import React, { useEffect, useRef, useState } from "react";
import { ACCENT_COLOR } from "@/lib/colors";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface CompanyStand {
  companyId: number;
  companyName: string;
  standNumber: string;
  logoUrl?: string | null;
}

interface MapViewerProps {
  mapPath: string;
  companyStands: CompanyStand[];
}

// Helper function to calculate center point of a polygon or rect using getBBox
function getElementCenter(element: Element): { x: number; y: number } | null {
  try {
    const bbox = (element as SVGGraphicsElement).getBBox();
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };
  } catch (error) {
    console.warn("getBBox failed for element:", error);
    return null;
  }
}

export function MapViewer({ mapPath, companyStands }: MapViewerProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [standGroups, setStandGroups] = useState<
    Map<string, SVGGElement>
  >(new Map());

  // Create a map of stand numbers to company data for quick lookup
  const standToCompanyMap = new Map<string, CompanyStand>();
  companyStands.forEach((stand) => {
    standToCompanyMap.set(stand.standNumber, stand);
  });

  useEffect(() => {
    if (!svgContainerRef.current) return;

    // Load SVG
    fetch(mapPath)
      .then((response) => response.text())
      .then((svgText) => {
        if (!svgContainerRef.current) return;

        // Create a temporary container to parse the SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;

        // Clear container
        svgContainerRef.current.innerHTML = "";

        // Clone the SVG element to avoid modifying the parsed document
        const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
        svgContainerRef.current.appendChild(svgClone);
        svgRef.current = svgClone;

        // Make SVG responsive
        svgClone.setAttribute("width", "100%");
        svgClone.setAttribute("height", "auto");
        svgClone.setAttribute("preserveAspectRatio", "xMidYMid meet");

        // Find all stand groups (elements with id starting with letter)
        const groups = Array.from(svgClone.querySelectorAll("g[id]")).filter(
          (g) => {
            const id = g.getAttribute("id") || "";
            return /^[A-Z]/.test(id);
          }
        );

        const groupsMap = new Map<string, SVGGElement>();

        // Add labels and highlight assigned stands
        groups.forEach((group) => {
          const standId = group.getAttribute("id");
          if (!standId) return;

          // Find all polygon or rect elements in this group
          const shapeElements = group.querySelectorAll("polygon, rect");
          if (shapeElements.length === 0) return;

          // Use the first shape for center calculation
          const firstShape = shapeElements[0];
          const center = getElementCenter(firstShape);
          if (!center) return;

          // Check if this stand is assigned to a company
          const companyStand = standToCompanyMap.get(standId);
          const isAssigned = !!companyStand;

          // Highlight assigned stands
          if (isAssigned) {
            groupsMap.set(standId, group as SVGGElement);
            // Apply orange fill with transparency to all shapes in the group
            shapeElements.forEach((shape) => {
              shape.setAttribute("fill", ACCENT_COLOR);
              shape.setAttribute("fill-opacity", "0.3");
              shape.setAttribute("stroke", ACCENT_COLOR);
              shape.setAttribute("stroke-width", "1.5");
              shape.setAttribute("style", "cursor: pointer;");
            });
            // Make cursor pointer for hoverable stands
            group.setAttribute("style", "cursor: pointer;");
          }

          // Add text label for stand code
          const textElement = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );
          textElement.setAttribute("x", center.x.toString());
          textElement.setAttribute("y", center.y.toString());
          textElement.setAttribute("text-anchor", "middle");
          textElement.setAttribute("dominant-baseline", "middle");
          textElement.setAttribute("font-size", "10");
          textElement.setAttribute(
            "font-weight",
            isAssigned ? "bold" : "normal"
          );
          textElement.setAttribute("fill", isAssigned ? ACCENT_COLOR : "#000");
          textElement.setAttribute("stroke", "#fff");
          textElement.setAttribute("stroke-width", "0.3");
          textElement.setAttribute("paint-order", "stroke fill");
          textElement.textContent = standId;

          // Append text directly to group
          group.appendChild(textElement);
        });

        setStandGroups(groupsMap);
      })
      .catch((error) => {
        console.error("Error loading SVG:", error);
      });
  }, [mapPath, companyStands]);

  // Calculate trigger positions for all stands
  const [triggerPositions, setTriggerPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());

  useEffect(() => {
    if (standGroups.size === 0 || !svgContainerRef.current) return;

    const calculatePositions = () => {
      const positions = new Map<string, { x: number; y: number }>();
      standGroups.forEach((group, standId) => {
        try {
          const bbox = group.getBBox();
          const svgBBox = svgContainerRef.current
            ?.querySelector("svg")
            ?.getBoundingClientRect();
          const containerBBox = svgContainerRef.current?.getBoundingClientRect();
          if (!svgBBox || !containerBBox) return;

          const svgPoint = svgContainerRef.current
            ?.querySelector("svg")
            ?.createSVGPoint();
          if (!svgPoint) return;

          const centerX = bbox.x + bbox.width / 2;
          const centerY = bbox.y + bbox.height / 2;
          svgPoint.x = centerX;
          svgPoint.y = centerY;

          const ctm = group.getScreenCTM();
          if (!ctm) return;
          const screenPoint = svgPoint.matrixTransform(ctm);

          positions.set(standId, {
            x: screenPoint.x - containerBBox.left,
            y: screenPoint.y - containerBBox.top,
          });
        } catch (error) {
          console.warn(`Failed to calculate position for stand ${standId}:`, error);
        }
      });
      setTriggerPositions(positions);
    };

    // Calculate positions after a short delay to ensure SVG is rendered
    const timer = setTimeout(calculatePositions, 100);
    return () => clearTimeout(timer);
  }, [standGroups]);

  // Recalculate positions on resize
  useEffect(() => {
    const handleResize = () => {
      if (standGroups.size === 0 || !svgContainerRef.current) return;
      const positions = new Map<string, { x: number; y: number }>();
      standGroups.forEach((group, standId) => {
        try {
          const bbox = group.getBBox();
          const svgBBox = svgContainerRef.current
            ?.querySelector("svg")
            ?.getBoundingClientRect();
          const containerBBox = svgContainerRef.current?.getBoundingClientRect();
          if (!svgBBox || !containerBBox) return;

          const svgPoint = svgContainerRef.current
            ?.querySelector("svg")
            ?.createSVGPoint();
          if (!svgPoint) return;

          const centerX = bbox.x + bbox.width / 2;
          const centerY = bbox.y + bbox.height / 2;
          svgPoint.x = centerX;
          svgPoint.y = centerY;

          const ctm = group.getScreenCTM();
          if (!ctm) return;
          const screenPoint = svgPoint.matrixTransform(ctm);

          positions.set(standId, {
            x: screenPoint.x - containerBBox.left,
            y: screenPoint.y - containerBBox.top,
          });
        } catch (error) {
          console.warn(`Failed to recalculate position for stand ${standId}:`, error);
        }
      });
      setTriggerPositions(positions);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [standGroups]);

  return (
    <div className="relative w-full">
      <div
        ref={svgContainerRef}
        className="w-full bg-white rounded-lg border border-border overflow-auto"
        style={{ minHeight: "400px" }}
      />
      {Array.from(standToCompanyMap.entries()).map(([standNumber, stand]) => {
        const position = triggerPositions.get(standNumber);
        if (!position) return null;

        return (
          <HoverCard key={standNumber}>
            <HoverCardTrigger asChild>
              <div
                style={{
                  position: "absolute",
                  left: `${position.x}px`,
                  top: `${position.y}px`,
                  width: "20px",
                  height: "20px",
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
              />
            </HoverCardTrigger>
            <HoverCardContent className="w-64">
              <div className="space-y-3">
                {stand.logoUrl && (
                  <div className="flex justify-center">
                    <img
                      src={stand.logoUrl}
                      alt={stand.companyName}
                      className="max-w-full max-h-24 object-contain"
                    />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-center">
                    {stand.companyName}
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
