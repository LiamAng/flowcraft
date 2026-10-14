import { Shape } from "./shapes";

export type Settings = {
    title: string;
    description: string;
    decisionBranchLabels: "yes-no" | "true-false";
    readOnly: boolean;
    snap: boolean;
    snapResizeToGrid: boolean;
    gridSize: number;
    guides: boolean;
    showGrid: boolean;
    showSteps: boolean;
    hideSteps: boolean;
    showStepNumbers: boolean;
    showShapeContentInSteps: boolean;
    processContentAsCode: boolean;
    setShapeContentBasedOnProgram: boolean;
    collapseNonConflictingChanges: boolean;
    compressSimulationTable: boolean;
    showReasonForValue: boolean;
    collapseConsecutiveConditions: boolean;
    collapseOtherSteps: boolean;
    collapsedInputOutputValueTiming: "first" | "last";
    autorun: boolean;
    inputs: Record<string, unknown>;
    simulationRatio: number;
    simulationStepContentMaxWidth: number;
    valueAccuracy: number;
    simulationStepDelay: number;
    simulationColumnOrder: string[];
};

export const defaultSettings: Settings = {
    title: "",
    description: "",
    decisionBranchLabels: "true-false",
    readOnly: false,
    snap: false,
    snapResizeToGrid: false,
    gridSize: 40,
    guides: true,
    showGrid: true,
    showSteps: false,
    hideSteps: true,
    showStepNumbers: true,
    showShapeContentInSteps: true,
    processContentAsCode: true,
    setShapeContentBasedOnProgram: true,
    collapseNonConflictingChanges: true,
    compressSimulationTable: true,
    showReasonForValue: true,
    collapseConsecutiveConditions: true,
    collapseOtherSteps: true,
    collapsedInputOutputValueTiming: "first",
    autorun: true,
    inputs: {},
    simulationRatio: 0.32,
    simulationStepContentMaxWidth: 200,
    valueAccuracy: 2,
    simulationStepDelay: 0,
    simulationColumnOrder: [],
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
    if (value.collapsedInputOutputValueTiming === "first" || value.collapsedInputOutputValueTiming === "last") {
        result.collapsedInputOutputValueTiming = value.collapsedInputOutputValueTiming;
    }
    (["readOnly", "snap", "snapResizeToGrid", "guides", "showGrid", "showSteps", "hideSteps", "showStepNumbers", "showShapeContentInSteps", "processContentAsCode", "setShapeContentBasedOnProgram", "collapseNonConflictingChanges", "compressSimulationTable", "showReasonForValue", "collapseConsecutiveConditions", "collapseOtherSteps", "autorun"] as const).forEach((key) => {
        if (typeof value[key] === "boolean") result[key] = value[key] as boolean;
    });
    if (typeof value.hideSteps === "boolean") {
        result.showStepNumbers = !value.hideSteps;
    } else if (typeof value.showStepNumbers === "boolean") {
        result.hideSteps = !value.showStepNumbers;
    }
    if (typeof value.collapseNonConflictingChanges === "boolean") {
        result.compressSimulationTable = value.collapseNonConflictingChanges;
    } else if (typeof value.compressSimulationTable === "boolean") {
        result.collapseNonConflictingChanges = value.compressSimulationTable;
    }
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
    if (Array.isArray(value.simulationColumnOrder)) {
        result.simulationColumnOrder = value.simulationColumnOrder
            .filter((column): column is string => typeof column === "string")
            .slice(0, 200);
    }
    return result;
}

export function applySettings(patch: Partial<Settings>) {
    const branchLabelsChanged = patch.decisionBranchLabels !== undefined &&
        patch.decisionBranchLabels !== settings.decisionBranchLabels;
    Object.assign(settings, sanitizeSettings(patch));
    Shape.readOnly = settings.readOnly;
    Shape.snapEnabled = settings.snap;
    Shape.snapResizeToGrid = settings.snapResizeToGrid;
    Shape.gridSize = settings.gridSize;
    Shape.guidesEnabled = settings.guides;
    Shape.showSimulationFlowline = settings.showSteps;
    Shape.decisionBranchLabels = settings.decisionBranchLabels;
    Shape.runProcessContentAsCode = settings.processContentAsCode;
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
