"use client";

import { useId } from "react";
import { DRAWER_TRAY_SPECS, deriveTrayLayout, type DrawerTrayParameters } from "../../lib/products/drawer-tray";
import { formatMillimeters } from "../../lib/products/shared";
import type { AxisLayout, AxisLayoutSpec } from "../../lib/products/types";

function supportedCount(layout: AxisLayout, spec: AxisLayoutSpec): boolean {
  const count = layout.mode === "even" ? layout.count : layout.fixedSizesMm.length + 1;
  return Number.isInteger(count) && count >= spec.minCount && count <= spec.maxCount;
}

/** A measurement view of the same layout calculation used to build the mesh. */
export function TrayLayoutMap({ parameters, valid }: { parameters: DrawerTrayParameters; valid: boolean }) {
  const clipId = `tray-map-${useId().replaceAll(":", "")}`;
  if (!valid) {
    return (
      <div className="tray-layout-map tray-layout-map--unavailable" data-testid="tray-layout-map">
        <strong>Compartment plan</strong>
        <p>Fix the highlighted measurements to see the compartment plan.</p>
      </div>
    );
  }
  let layout: ReturnType<typeof deriveTrayLayout>;
  try {
    layout = deriveTrayLayout(parameters);
  } catch {
    return (
      <div className="tray-layout-map tray-layout-map--unavailable" data-testid="tray-layout-map">
        <strong>Compartment plan</strong>
        <p>Fix the highlighted measurements to see the compartment plan.</p>
      </div>
    );
  }
  const { outsideWidth, outsideDepth, insideWidth, insideDepth, columns, rows } = layout;
  const usable = supportedCount(parameters.columnLayout, DRAWER_TRAY_SPECS.columnLayout) &&
    supportedCount(parameters.rowLayout, DRAWER_TRAY_SPECS.rowLayout) &&
    Number.isFinite(outsideWidth) && Number.isFinite(outsideDepth) &&
    outsideWidth > 0 && outsideDepth > 0 &&
    columns.sizesMm.length > 0 && rows.sizesMm.length > 0 &&
    columns.sizesMm.every((size) => Number.isFinite(size) && size > 0) &&
    rows.sizesMm.every((size) => Number.isFinite(size) && size > 0);

  if (!usable) {
    return (
      <div className="tray-layout-map tray-layout-map--unavailable" data-testid="tray-layout-map">
        <strong>Compartment plan</strong>
        <p>Fix the highlighted measurements to see the compartment plan.</p>
      </div>
    );
  }

  const scale = Math.min(280 / outsideWidth, 175 / outsideDepth);
  const left = (360 - outsideWidth * scale) / 2 - 6;
  const top = 36;
  const outsideSvgWidth = outsideWidth * scale;
  const outsideSvgDepth = outsideDepth * scale;
  const x = (point: number) => left + (outsideWidth / 2 + point) * scale;
  const y = (point: number) => top + (outsideDepth / 2 + point) * scale;
  const dimension = (size: number) => formatMillimeters(size, 3);
  const cells = rows.spans.flatMap((row, rowIndex) =>
    columns.spans.map((column, columnIndex) => ({ row, rowIndex, column, columnIndex }))
  );

  return (
    <section className="tray-layout-map" data-testid="tray-layout-map" aria-label="Compartment plan">
      <div className="tray-layout-map-heading">
        <strong>Compartment plan</strong>
        <span>{columns.sizesMm.length} columns × {rows.sizesMm.length} rows</span>
      </div>
      <svg
        viewBox="0 0 360 250"
        role="img"
        aria-label={`Top-down tray plan: ${columns.sizesMm.length} columns left to right and ${rows.sizesMm.length} rows front to back.`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={left + parameters.wallThickness * scale}
              y={top + parameters.wallThickness * scale}
              width={insideWidth * scale}
              height={insideDepth * scale}
              rx={Math.max(0, parameters.cornerRadius - parameters.wallThickness) * scale}
            />
          </clipPath>
        </defs>
        <text className="tray-map-front" x={left} y={top - 22}>Front ↑</text>
        <rect className="tray-map-shell" x={left} y={top} width={outsideSvgWidth} height={outsideSvgDepth} rx={parameters.cornerRadius * scale} />
        <g clipPath={`url(#${clipId})`}>
          {cells.map(({ row, rowIndex, column, columnIndex }) => (
            <rect
              className="tray-map-cell"
              key={`${rowIndex}-${columnIndex}`}
              x={x(column.start)}
              y={y(row.start)}
              width={column.size * scale}
              height={row.size * scale}
            />
          ))}
        </g>
        {columns.spans.map((column, index) => column.size * scale >= 30 ? (
          <text className="tray-map-dimension" key={`column-${index}`} x={x(column.center)} y={top - 6} textAnchor="middle">
            {dimension(column.size)}
          </text>
        ) : null)}
        {rows.spans.map((row, index) => row.size * scale >= 18 ? (
          <text className="tray-map-dimension" key={`row-${index}`} x={left + outsideSvgWidth + 6} y={y(row.center) + 3} textAnchor="start">
            {dimension(row.size)}
          </text>
        ) : null)}
      </svg>
      <details className="tray-map-list" data-testid="tray-layout-cell-list">
        <summary>List all {cells.length} compartment sizes</summary>
        <ol>
          {cells.map(({ row, rowIndex, column, columnIndex }) => (
            <li key={`${rowIndex}-${columnIndex}`}>
              Row {rowIndex + 1}, column {columnIndex + 1}: {dimension(column.size)} × {dimension(row.size)} mm
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
