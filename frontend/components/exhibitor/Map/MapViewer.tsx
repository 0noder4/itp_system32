"use client";

import React, { useEffect, useRef, useState } from "react";
import { ACCENT_COLOR } from "@/lib/colors";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface MapViewerProps {
  mapPath: string;
  userStandNumber: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
}

// Helper function to calculate center point of a polygon or rect using getBBox
// This accounts for transforms and gives accurate center for all shapes
function getElementCenter(element: Element): { x: number; y: number } | null {
  try {
    // Use getBBox() which returns the bounding box after all transforms
    // This works for both rect and polygon, and handles transforms correctly
    const bbox = (element as SVGGraphicsElement).getBBox();
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };
  } catch (error) {
    // Fallback for elements that don't support getBBox (shouldn't happen with SVG shapes)
    console.warn("getBBox failed for element:", error);
    return null;
  }
}

export function MapViewer({
  mapPath,
  userStandNumber,
  companyName,
  companyLogoUrl,
}: MapViewerProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const userStandGroupRef = useRef<SVGGElement | null>(null);
  const [triggerPosition, setTriggerPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

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
        const standGroups = Array.from(
          svgClone.querySelectorAll("g[id]")
        ).filter((g) => {
          const id = g.getAttribute("id") || "";
          // Filter out non-stand IDs (like "def")
          return /^[A-Z]/.test(id);
        });

        // Add labels and highlight user's stand
        standGroups.forEach((group) => {
          const standId = group.getAttribute("id");
          if (!standId) return;

          // Find all polygon or rect elements in this group
          const shapeElements = group.querySelectorAll("polygon, rect");
          if (shapeElements.length === 0) return;

          // Use the first shape for center calculation
          const firstShape = shapeElements[0];
          const center = getElementCenter(firstShape);
          if (!center) return;

          // Check if this is the user's stand
          const isUserStand = userStandNumber === standId;

          // Highlight user's stand
          if (isUserStand) {
            userStandGroupRef.current = group as SVGGElement;
            // Apply orange fill with transparency to all shapes in the group
            shapeElements.forEach((shape) => {
              shape.setAttribute("fill", ACCENT_COLOR);
              shape.setAttribute("fill-opacity", "0.3");
              shape.setAttribute("stroke", ACCENT_COLOR);
              shape.setAttribute("stroke-width", "1.5");
              // Make cursor pointer for hoverable stands
              shape.setAttribute("style", "cursor: pointer;");
            });
            // Make cursor pointer for hoverable stands
            group.setAttribute("style", "cursor: pointer;");

            // Calculate trigger position after SVG is rendered
            setTimeout(() => {
              if (!svgContainerRef.current || !userStandGroupRef.current) return;
              try {
                const bbox = userStandGroupRef.current.getBBox();
                const svgBBox = svgContainerRef.current
                  .querySelector("svg")
                  ?.getBoundingClientRect();
                const containerBBox =
                  svgContainerRef.current.getBoundingClientRect();
                if (!svgBBox) return;

                const svgPoint = svgContainerRef.current
                  .querySelector("svg")
                  ?.createSVGPoint();
                if (!svgPoint) return;

                const centerX = bbox.x + bbox.width / 2;
                const centerY = bbox.y + bbox.height / 2;
                svgPoint.x = centerX;
                svgPoint.y = centerY;

                const ctm = userStandGroupRef.current.getScreenCTM();
                if (!ctm) return;
                const screenPoint = svgPoint.matrixTransform(ctm);

                setTriggerPosition({
                  x: screenPoint.x - containerBBox.left,
                  y: screenPoint.y - containerBBox.top,
                });
              } catch (error) {
                console.warn("Failed to calculate trigger position:", error);
              }
            }, 100);
          }

          // Add text label for stand code (no background box)
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
            isUserStand ? "bold" : "normal"
          );
          textElement.setAttribute("fill", isUserStand ? ACCENT_COLOR : "#000");
          // Add white stroke outline for better readability
          textElement.setAttribute("stroke", "#fff");
          textElement.setAttribute("stroke-width", "0.3");
          textElement.setAttribute("paint-order", "stroke fill");
          textElement.textContent = standId;

          // Append text directly to group
          group.appendChild(textElement);
        });
      })
      .catch((error) => {
        console.error("Error loading SVG:", error);
      });
  }, [mapPath, userStandNumber]);

  // Recalculate position on resize
  useEffect(() => {
    const handleResize = () => {
      if (!svgContainerRef.current || !userStandGroupRef.current) return;
      try {
        const bbox = userStandGroupRef.current.getBBox();
        const svgBBox = svgContainerRef.current
          .querySelector("svg")
          ?.getBoundingClientRect();
        const containerBBox = svgContainerRef.current.getBoundingClientRect();
        if (!svgBBox) return;

        const svgPoint = svgContainerRef.current
          .querySelector("svg")
          ?.createSVGPoint();
        if (!svgPoint) return;

        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;
        svgPoint.x = centerX;
        svgPoint.y = centerY;

        const ctm = userStandGroupRef.current.getScreenCTM();
        if (!ctm) return;
        const screenPoint = svgPoint.matrixTransform(ctm);

        setTriggerPosition({
          x: screenPoint.x - containerBBox.left,
          y: screenPoint.y - containerBBox.top,
        });
      } catch (error) {
        console.warn("Failed to recalculate trigger position:", error);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="relative w-full">
      <div
        ref={svgContainerRef}
        className="w-full bg-white rounded-lg border border-border overflow-auto"
        style={{ minHeight: "400px" }}
      />
      {companyName && triggerPosition && (
        <HoverCard>
          <HoverCardTrigger asChild>
            <div
              style={{
                position: "absolute",
                left: `${triggerPosition.x}px`,
                top: `${triggerPosition.y}px`,
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
              {companyLogoUrl && (
                <div className="flex justify-center">
                  <img
                    src={companyLogoUrl}
                    alt={companyName}
                    className="max-w-full max-h-24 object-contain"
                  />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-center">
                  {companyName}
                </p>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
