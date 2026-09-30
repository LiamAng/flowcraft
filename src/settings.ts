import { Shape } from "./shapes";

export type Settings = {
    readOnly: boolean;
    snap: boolean;
    gridSize: number;
    guides: boolean;
    showGrid: boolean;
    showSteps: boolean;
    autorun: boolean;
    inputs: Record<string, unknown>;
};

export const defaultSettings: Settings = {
    readOnly: false,
    snap: true,
    gridSize: 40,
    guides: true,
    showGrid: true,
    showSteps: false,
    autorun: false,
    inputs: {},
};

export const settings: Settings = { ...defaultSettings, inputs: {} };

export function sanitizeSettings(raw: unknown): Partial<Settings> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const value = raw as Record<string, unknown>;
    const result: Partial<Settings> = {};
    (["readOnly", "snap", "guides", "showGrid", "showSteps", "autorun"] as const).forEach((key) => {
        if (typeof value[key] === "boolean") result[key] = value[key] as boolean;
    });
    if (typeof value.gridSize === "number" && Number.isFinite(value.gridSize)) {
        result.gridSize = Math.max(5, Math.min(200, Math.round(value.gridSize)));
    }
    if (value.inputs && typeof value.inputs === "object" && !Array.isArray(value.inputs)) {
        result.inputs = { ...(value.inputs as Record<string, unknown>) };
    }
    return result;
}

export function applySettings(patch: Partial<Settings>) {
    Object.assign(settings, sanitizeSettings(patch));
    Shape.readOnly = settings.readOnly;
    Shape.showSimulationFlowline = settings.showSteps;
    document.documentElement.classList.toggle("read-only", settings.readOnly);
    document.dispatchEvent(new CustomEvent("flowcraft:settings"));
}

export function resetSettings() {
    applySettings({ ...defaultSettings, inputs: {} });
}

export function snapshotSettings(): Settings {
    return { ...settings, inputs: { ...settings.inputs } };
}
