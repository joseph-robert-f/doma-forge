import {
  DEFAULT_PARAMETERS,
  normalizeParameters,
  type OrganizerParameters,
} from "./parameters";

export type PresetId = "cutlery" | "desk-supplies" | "hardware" | "custom";

export interface OrganizerPreset {
  id: Exclude<PresetId, "custom">;
  label: string;
  description: string;
  parameters: OrganizerParameters;
}

export const PRESETS: OrganizerPreset[] = [
  {
    id: "cutlery",
    label: "Cutlery",
    description: "Long, roomy utensil lanes",
    parameters: normalizeParameters({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 360,
      drawerDepth: 260,
      organizerHeight: 55,
      cornerRadius: 10,
      rows: 2,
      columns: 4,
      dividerThickness: 2.2,
    }),
  },
  {
    id: "desk-supplies",
    label: "Desk supplies",
    description: "Balanced everyday compartments",
    parameters: normalizeParameters({
      ...DEFAULT_PARAMETERS,
      drawerWidth: 320,
      drawerDepth: 220,
      organizerHeight: 45,
      rows: 2,
      columns: 3,
    }),
  },
  {
    id: "hardware",
    label: "Hardware",
    description: "A dense grid for small parts",
    parameters: normalizeParameters({
      ...DEFAULT_PARAMETERS,
      organizerHeight: 38,
      rows: 4,
      columns: 4,
      fingerScoop: false,
    }),
  },
];

export function loadPreset(id: Exclude<PresetId, "custom">): OrganizerParameters {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown organizer preset: ${id}`);
  return { ...preset.parameters };
}
