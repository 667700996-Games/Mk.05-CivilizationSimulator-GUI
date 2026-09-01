"use client";

import { useEffect, useRef } from "react";
import { AxialCoord, coordKey, Nation, SimulationSnapshot } from "./simulation";

export type MapOverlay = "Territory" | "Climate" | "Conflict";

const NATION_COLORS: Record<Nation, string> = {
  Tera: "#4f86ff",
  Sora: "#ff5574",
  Aqua: "#34d6a2",
  Solar: "#ffc34f",
  Luna: "#d7e2ed",
};

type Point = AxialCoord & { x: number; y: number; size: number; owner: Nation };

export function WorldMap({
  snapshot,
  overlay,
  selected,
  focus,
  onSelect,
}: {
  snapshot: SimulationSnapshot;
  overlay: MapOverlay;
  selected: AxialCoord | null;
  focus: Nation | null;
  onSelect(coord: AxialCoord): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<Point[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    function draw() {
      if (!canvas || !context) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const width = bounds.width;
      const height = bounds.height;
      context.clearRect(0, 0, width, height);

      const raw = snapshot.grid.hexes.map((hex) => ({
        ...hex,
        x: Math.sqrt(3) * (hex.q + hex.r / 2),
        y: 1.5 * hex.r,
      }));
      const minX = Math.min(...raw.map((point) => point.x));
      const maxX = Math.max(...raw.map((point) => point.x));
      const minY = Math.min(...raw.map((point) => point.y));
      const maxY = Math.max(...raw.map((point) => point.y));
      const size = Math.max(2.2, Math.min((width - 38) / (maxX - minX + 2), (height - 38) / (maxY - minY + 2)));
      const offsetX = (width - (maxX - minX) * size) / 2 - minX * size;
      const offsetY = (height - (maxY - minY) * size) / 2 - minY * size;
      const combat = new Set(snapshot.combat_hexes.map(coordKey));
      const nuclear = new Set(snapshot.nuclear_hexes.map(coordKey));
      const selectedKey = selected ? coordKey(selected) : "";
      const risk = Math.min(snapshot.science_victory.climate_risk / 140, 1);

      pointsRef.current = raw.map((hex) => ({ ...hex, x: offsetX + hex.x * size, y: offsetY + hex.y * size, size }));
      for (const point of pointsRef.current) {
        const key = coordKey(point);
        const isCombat = combat.has(key);
        const isNuclear = nuclear.has(key);
        let fill = NATION_COLORS[point.owner];
        if (overlay === "Climate") {
          const red = Math.round(risk * 215 + 30);
          const green = Math.round(180 - risk * 120);
          const blue = Math.round(150 - risk * 110);
          fill = `rgb(${red}, ${green}, ${blue})`;
        } else if (overlay === "Conflict") {
          fill = isCombat ? "#ff4e68" : mixColor(NATION_COLORS[point.owner], "#18222b", .62);
        }
        if (focus && point.owner !== focus) fill = mixColor(fill, "#071018", .72);

        drawHex(context, point.x, point.y, size * .94);
        context.fillStyle = fill;
        context.globalAlpha = selectedKey === key ? 1 : .76;
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = selectedKey === key ? "#ffffff" : "rgba(105, 145, 166, .22)";
        context.lineWidth = selectedKey === key ? 1.6 : .55;
        context.stroke();

        if (isCombat || isNuclear || (snapshot.science_victory.leader === point.owner && (point.q + point.r) % 17 === 0)) {
          context.beginPath();
          context.arc(point.x, point.y, Math.max(1.2, size * .18), 0, Math.PI * 2);
          context.fillStyle = isNuclear ? "#ffe36a" : isCombat ? "#ffedf0" : "#061015";
          context.fill();
          if (isNuclear) {
            context.strokeStyle = "#ff765e";
            context.lineWidth = 1;
            context.stroke();
          }
        }
      }
    }

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [focus, overlay, selected, snapshot]);

  function selectAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    let closest: Point | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const point of pointsRef.current) {
      const next = Math.hypot(x - point.x, y - point.y);
      if (next < distance) {
        distance = next;
        closest = point;
      }
    }
    if (closest && distance <= closest.size) onSelect({ q: closest.q, r: closest.r });
  }

  function moveSelection(direction: number) {
    const hexes = snapshot.grid.hexes;
    if (!hexes.length) return;
    const index = selected ? hexes.findIndex((hex) => coordKey(hex) === coordKey(selected)) : -1;
    const next = hexes[(index + direction + hexes.length) % hexes.length];
    onSelect({ q: next.q, r: next.r });
  }

  return (
    <canvas
      ref={canvasRef}
      className="world-canvas"
      onClick={(event) => selectAt(event.clientX, event.clientY)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveSelection(1); }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1); }
        if (event.key === "Enter" && selected) onSelect(selected);
      }}
      role="img"
      tabIndex={0}
      aria-label={`${overlay} world map with ${snapshot.grid.hexes.length} selectable hexes. Use arrow keys to move the selected territory.`}
    />
  );
}

function drawHex(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
  context.beginPath();
  for (let side = 0; side < 6; side += 1) {
    const angle = (Math.PI / 180) * (60 * side - 30);
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (side === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function mixColor(first: string, second: string, amount: number) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const channel = (key: keyof typeof a) => Math.round(a[key] * (1 - amount) + b[key] * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

function hexToRgb(color: string) {
  const value = color.replace("#", "");
  return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) };
}
