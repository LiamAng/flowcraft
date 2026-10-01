import { Shape } from "./shapes";

export type Settings = {
    title: string;
    description: string;
    decisionBranchLabels: "yes-no" | "true-false";
    readOnly: boolean;
    snap: boolean;
    gridSize: number;
    guides: boolean;
    showGrid: boolean;
    showSteps: boolean;
    showStepNumbers: boolean;
    showShapeContentInSteps: boolean;
    compressSimulationTable: boolean;
    collapseConsecutiveConditions: boolean;
    collapseOtherSteps: boolean;
    autorun: boolean;
    inputs: Record<string, unknown>;
    simulationRatio: number;
    simulationStepContentMaxWidth: number;
    valueAccuracy: number;
    simulationStepDelay: number;
};

export const defaultSettings: Settings = {
    title: "",
    description: "",
    decisionBranchLabels: "yes-no",
    readOnly: false,
    snap: true,
    gridSize: 40,
    guides: true,
    showGrid: true,
    showSteps: false,
    showStepNumbers: true,
    showShapeContentInSteps: false,
    compressSimulationTable: false,
    collapseConsecutiveConditions: false,
    collapseOtherSteps: false,
    autorun: false,
    inputs: {},
    simulationRatio: 0.32,
    simulationStepContentMaxWidth: 200,
    valueAccuracy: 2,
    simulationStepDelay: 0,
};

export const settings: Settings = { ...defaultSettings, inputs: {} };

export function sanitizeSettings(raw: unknown): Partial<Settings> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const value = raw as Record<string, unknown>;
    const result: Partial<Settings> = {};
    if (typeof value.title === "string") result.title = value.title.slice(0, 120);
    if (typeof value.description === "string") result.description = value.description.slice(0, 500);
    if (value.decisionBranchLabels === "yes-no" || value.decisionBranchLabels === "true-false") {
        result.decisionBranchLabels = value.decisionBranchLabels;
    }
    (["readOnly", "snap", "guides", "showGrid", "showSteps", "showStepNumbers", "showShapeContentInSteps", "compressSimulationTable", "collapseConsecutiveConditions", "collapseOtherSteps", "autorun"] as const).forEach((key) => {
        if (typeof value[key] === "boolean") result[key] = value[key] as boolean;
    });
    if (typeof value.showShapeContentInSteps === "boolean") {
        result.showShapeContentInSteps = value.showShapeContentInSteps;
    } else if (typeof value.showProcessContentInSteps === "boolean") {
        result.showShapeContentInSteps = value.showProcessContentInSteps;
    }
    if (typeof value.gridSize === "number" && Number.isFinite(value.gridSize)) {
        result.gridSize = Math.max(5, Math.min(200, Math.round(value.gridSize)));
    }
    if (value.inputs && typeof value.inputs === "object" && !Array.isArray(value.inputs)) {
        result.inputs = { ...(value.inputs as Record<string, unknown>) };
    }
    if (typeof value.simulationRatio === "number" && Number.isFinite(value.simulationRatio)) {
        result.simulationRatio = Math.max(0.15, Math.min(0.7, value.simulationRatio));
    }
    if (typeof value.simulationStepContentMaxWidth === "number" && Number.isFinite(value.simulationStepContentMaxWidth)) {
        result.simulationStepContentMaxWidth = Math.max(80, Math.min(600, Math.round(value.simulationStepContentMaxWidth)));
    }
    if (typeof value.valueAccuracy === "number" && Number.isFinite(value.valueAccuracy)) {
        result.valueAccuracy = Math.max(0, Math.min(10, Math.round(value.valueAccuracy)));
    }
    const simulationStepDelay = value.simulationStepDelay;
    if (typeof simulationStepDelay === "number" && Number.isFinite(simulationStepDelay)) {
        const delays = [0, 100, 250, 500, 1000];
        result.simulationStepDelay = delays.reduce((nearest, delay) =>
            Math.abs(delay - simulationStepDelay) < Math.abs(nearest - simulationStepDelay) ? delay : nearest, delays[0]);
    }
    return result;
}

export function applySettings(patch: Partial<Settings>) {
    const branchLabelsChanged = patch.decisionBranchLabels !== undefined &&
        patch.decisionBranchLabels !== settings.decisionBranchLabels;
    Object.assign(settings, sanitizeSettings(patch));
    Shape.readOnly = settings.readOnly;
    Shape.showSimulationFlowline = settings.showSteps;
    Shape.decisionBranchLabels = settings.decisionBranchLabels;
    document.documentElement.classList.toggle("read-only", settings.readOnly);
    if (branchLabelsChanged) Shape.refreshConnections();
    document.dispatchEvent(new CustomEvent("flowcraft:settings"));
}

export function resetSettings() {
    applySettings({ ...defaultSettings, inputs: {} });
}

export function snapshotSettings(): Settings {
    return { ...settings, inputs: { ...settings.inputs } };
}
