/** @vitest-environment jsdom */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SurfaceTreatmentsControl } from "../app/components/ParameterControls";
import { drawerTray } from "../lib/products/drawer-tray";
import type { SuggestedSurfacePattern } from "../lib/surface-availability";
import type { SurfaceTreatments } from "../lib/surface-patterns";

const spec = drawerTray.specs.surfaceTreatments;

function Form({
  suggestion,
  availability,
  errors,
}: {
  suggestion?: SuggestedSurfacePattern;
  availability?: Record<string, string>;
  errors?: string[];
}) {
  const [value, setValue] = useState<SurfaceTreatments>(
    () => drawerTray.normalize(drawerTray.defaults).surfaceTreatments,
  );
  return <>
    <SurfaceTreatmentsControl
      parameterKey="surfaceTreatments"
      spec={spec}
      value={value}
      suggestedPattern={suggestion}
      availability={availability}
      errors={errors}
      onChange={(_key, next) => setValue(next)}
    />
    <output data-testid="surface-value">{JSON.stringify(value)}</output>
  </>;
}

describe("surface treatment control", () => {
  it("chooses a real pattern for an individual zone and keeps other zones solid", () => {
    render(<Form />);
    expect(screen.queryByTestId("param-surface-treatments-floor-holes")).toBeNull();
    fireEvent.click(screen.getByTestId("param-surface-treatments-toggle"));
    expect((screen.getByTestId("param-surface-treatments-floor-holes") as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByTestId("param-surface-treatments-floor-opening"), { target: { value: "10" } });
    const value = JSON.parse(screen.getByTestId("surface-value").textContent ?? "null") as SurfaceTreatments;
    expect(value.enabled).toBe(true);
    expect(value.zones.floor).toMatchObject({ mode: "holes", opening: 10 });
    expect(value.zones.walls.mode).toBe("solid");
    expect(value.zones.dividers.mode).toBe("solid");
  });

  it("uses the preflight suggestion when the first zone cannot fit and shows a zone-specific reason", () => {
    render(<Form
      suggestion={{
        zoneId: "walls",
        setting: { mode: "holes", opening: 4, web: 1.2, margin: 2.4 },
      }}
      availability={{ walls: "No wall opening fits with these dimensions." }}
      errors={["No wall opening fits with these dimensions."]}
    />);
    fireEvent.click(screen.getByTestId("param-surface-treatments-toggle"));
    const value = JSON.parse(screen.getByTestId("surface-value").textContent ?? "null") as SurfaceTreatments;
    expect(value.zones.floor.mode).toBe("solid");
    expect(value.zones.walls).toEqual({ mode: "holes", opening: 4, web: 1.2, margin: 2.4 });
    expect(screen.getByTestId("param-surface-treatments-walls-unavailable").textContent)
      .toMatch(/No wall opening fits/);
    expect(screen.queryByTestId("param-surface-treatments-error")).toBeNull();
  });

  it("places an invalid web message beside its selected zone", () => {
    render(<Form errors={["Floor web must be between 0.8 and 12 mm."]} />);
    fireEvent.click(screen.getByTestId("param-surface-treatments-toggle"));
    expect(screen.getByTestId("param-surface-treatments-floor-error").textContent)
      .toMatch(/Floor web must be between/);
    expect(screen.queryByTestId("param-surface-treatments-error")).toBeNull();
  });
});
