import type { Simulator } from "./simulator";
import { Decision, Initialization, Shape, Terminator, InputOutput, type LinkRecord, type VariableDefinition } from "./shapes";
import { Process } from "./shapes/Process";
import { validateFlowchart } from "./flowValidation";
import { applySettings, settings } from "./settings";
import { createSimulationInputsControl } from "./simulationInputsDialog";

type SimulationRow = {
    step: number;
    stepEnd: number;
    shape: Shape;
    variables: Record<string, unknown>;
    variableReasons: Record<string, string>;
    conditions: Record<string, boolean[]>;
    conditionReasons: Record<string, string[]>;
    output: unknown;
    outputs: unknown[];
    outputReasons: string[];
    preferFirstVariables?: boolean;
};

type SimulationColumn = {
    id: string;
    title: string;
    kind: "step" | "variable" | "condition" | "output";
    name?: string;
    shape?: Decision;
};

const MAX_STEPS = 10000;
type InputDialogResult = { cancelled: true } | { cancelled: false; values: Record<string, unknown> };

function inputVariables(shape: InputOutput): VariableDefinition[] {
    if (shape.variables.length > 0) return shape.variables;
    return shape.programCode.split(",").map((name) => ({
        name: name.trim(),
        type: "string" as const,
    })).filter((variable) => variable.name);
}

function conditionColumnIds(shapes: Decision[]): Map<Decision, string> {
    const occurrences = new Map<string, number>();
    return new Map(shapes.map((shape) => {
        const signature = `${shape.content.innerText.trim()}\u0000${shape.programCode.trim()}`;
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        return [shape, `condition:${encodeURIComponent(signature)}:${occurrence}`];
    }));
}

function display(value: unknown, accuracy: number): string {
    if (value === undefined) return "";
    if (value === null) return "null";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return String(value);
        return Number.isInteger(value) ? String(value) : value.toFixed(accuracy);
    }
    if (typeof value === "string") return value;
    if (typeof value === "object") {
        try {
            return JSON.stringify(value, (_key, item: unknown) =>
                typeof item === "number" && Number.isFinite(item) ? Number(item.toFixed(accuracy)) : item
            );
        } catch {
            return "[value]";
        }
    }
    return String(value);
}

function supportsReasonValue(value: unknown): boolean {
    return typeof value === "number" || typeof value === "boolean" ||
        (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function displayReasonValue(value: unknown, reason: string | undefined, accuracy: number): string {
    const text = display(value, accuracy);
    return settings.showReasonForValue && supportsReasonValue(value) && reason ? `${text} (${reason})` : text;
}

function inputSequence(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
        leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
}

function formatExpressionValue(value: unknown): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
    if (value === undefined) return "undefined";
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function substituteExpressionValues(expression: string, scope: Record<string, unknown>): string {
    const keywords = new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);
    return expression.replace(/\b[A-Za-z_$][\w$]*\b/g, (name, offset, source) => {
        const previous = source[offset - 1];
        if (previous === "." || keywords.has(name) || !Object.prototype.hasOwnProperty.call(scope, name)) {
            return name;
        }
        return formatExpressionValue(scope[name]);
    }).replace(/\s+/g, " ").trim();
}

function assignmentReasons(code: string, before: Record<string, unknown>, after: Record<string, unknown>): Record<string, string> {
    const reasons: Record<string, string> = {};
    const statements = code.split(/[;\r\n]+/).map((statement) => statement.trim()).filter(Boolean);
    statements.forEach((statement) => {
        const increment = statement.match(/^([A-Za-z_$][\w$]*)\s*(\+\+|--)$/);
        if (increment) {
            const [, name, operator] = increment;
            reasons[name] = `${name} = ${formatExpressionValue(before[name])} ${operator === "++" ? "+" : "-"} 1`;
            return;
        }
        const compound = statement.match(/^([A-Za-z_$][\w$]*)\s*([+\-*/%])=\s*(.+)$/);
        if (compound) {
            const [, name, operator, expression] = compound;
            reasons[name] = `${name} = ${formatExpressionValue(before[name])} ${operator} ${substituteExpressionValues(expression, before)}`;
            return;
        }
        const assignment = statement.match(/^(?:(?:let|var|const)\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?!=)(.+)$/);
        if (assignment) {
            const [, name, expression] = assignment;
            reasons[name] = `${name} = ${substituteExpressionValues(expression, before)}`;
        }
    });
    Object.keys(after).forEach((name) => {
        if (!valuesEqual(before[name], after[name]) && !reasons[name]) {
            reasons[name] = `${name} = ${formatExpressionValue(after[name])}`;
        }
    });
    return reasons;
}

function inferredVariableReason(name: string, previous: unknown, value: unknown): string {
    const previousNumber = typeof previous === "number" || (typeof previous === "string" && previous.trim() !== "")
        ? Number(previous)
        : NaN;
    const valueNumber = typeof value === "number" || (typeof value === "string" && value.trim() !== "")
        ? Number(value)
        : NaN;
    if (Number.isFinite(previousNumber) && Number.isFinite(valueNumber)) {
        if (valueNumber === previousNumber + 1) return `${name} = ${previous} + 1`;
        if (valueNumber === previousNumber - 1) return `${name} = ${previous} - 1`;
    }
    return `${name} = ${formatExpressionValue(value)}`;
}

function cloneSimulationRow(row: SimulationRow): SimulationRow {
    return {
        ...row,
        variables: { ...row.variables },
        variableReasons: { ...row.variableReasons },
        conditions: Object.fromEntries(Object.entries(row.conditions).map(([id, conditions]) => [id, [...conditions]])),
        conditionReasons: Object.fromEntries(Object.entries(row.conditionReasons).map(([id, reasons]) => [id, [...reasons]])),
        outputs: [...row.outputs],
        outputReasons: [...row.outputReasons],
    };
}

function mergeSimulationRows(base: SimulationRow, next: SimulationRow): SimulationRow {
    const preferFirstVariables = base.preferFirstVariables || next.preferFirstVariables;
    const conditions = { ...base.conditions };
    Object.entries(next.conditions).forEach(([id, values]) => {
        conditions[id] = [...(conditions[id] ?? []), ...values];
    });
    const conditionReasons = { ...base.conditionReasons };
    Object.entries(next.conditionReasons).forEach(([id, reasons]) => {
        conditionReasons[id] = [...(conditionReasons[id] ?? []), ...reasons];
    });
    return {
        ...base,
        stepEnd: next.stepEnd,
        variables: base.preferFirstVariables ? base.variables : next.variables,
        variableReasons: base.preferFirstVariables
            ? base.variableReasons
            : next.preferFirstVariables
                ? next.variableReasons
                : { ...base.variableReasons, ...next.variableReasons },
        preferFirstVariables,
        conditions,
        conditionReasons,
        output: next.output !== "" ? next.output : base.output,
        outputs: [...base.outputs, ...next.outputs],
        outputReasons: [...base.outputReasons, ...next.outputReasons],
    };
}

function changedVisibleColumns(
    previous: SimulationRow | null,
    row: SimulationRow,
    variableNames: string[],
    decisionShapes: Decision[],
    showOutputColumn: boolean
): Set<string> {
    const changes = new Set<string>();
    variableNames.forEach((name) => {
        const hasValue = Object.prototype.hasOwnProperty.call(row.variables, name);
        const previousValue = previous?.variables[name];
        if (hasValue && (!previous || !valuesEqual(previousValue, row.variables[name]))) {
            changes.add(`variable:${name}`);
        }
    });
    decisionShapes.forEach((shape) => {
        if ((row.conditions[shape.id] ?? []).length > 0) {
            changes.add(`condition:${shape.id}`);
        }
    });
    if (showOutputColumn && row.outputs.length > 0) {
        changes.add("output");
    }
    return changes;
}

function collapseNonConflictingRows(
    sourceRows: SimulationRow[],
    variableNames: string[],
    decisionShapes: Decision[],
    showOutputColumn: boolean
): SimulationRow[] {
    const collapsed: SimulationRow[] = [];
    let group: SimulationRow | null = null;
    let groupChanges = new Set<string>();
    let previousRaw: SimulationRow | null = null;

    sourceRows.forEach((row, index) => {
        const displayRow = cloneSimulationRow(row);
        // An output immediately followed by an input is a prompt. Keep it on
        // its own row so it doesn't get absorbed into the following guess.
        const isPrompt = row.shape instanceof InputOutput && row.shape.inputOutputType === "output" &&
            sourceRows[index + 1]?.shape instanceof InputOutput &&
            (sourceRows[index + 1].shape as InputOutput).inputOutputType === "input";
        if (isPrompt) {
            if (group) collapsed.push(group);
            collapsed.push(displayRow);
            group = null;
            groupChanges = new Set<string>();
            previousRaw = displayRow;
            return;
        }
        const isInput = row.shape instanceof InputOutput && row.shape.inputOutputType === "input";
        if (!isInput && previousRaw) {
            Object.entries(displayRow.variables).forEach(([name, value]) => {
                if (!supportsReasonValue(value) ||
                    valuesEqual(previousRaw?.variables[name], value) || displayRow.variableReasons[name]) return;
                displayRow.variableReasons[name] = inferredVariableReason(name, previousRaw?.variables[name], value);
            });
        }
        const rowChanges = changedVisibleColumns(previousRaw, displayRow, variableNames, decisionShapes, showOutputColumn);
        const isInitialization = displayRow.shape instanceof Initialization;
        const groupIsInitialization = group?.shape instanceof Initialization;
        // Feedback output belongs with the input/condition steps for that
        // guess. A prompt is already isolated above, so this only combines
        // the subsequent feedback with its related simulation steps.
        const feedbackOnly = displayRow.shape instanceof InputOutput &&
            displayRow.shape.inputOutputType === "output" && group?.outputs.length === 0;
        const conflicts = [...rowChanges].some((change) =>
            !(feedbackOnly && change === "output") && groupChanges.has(change)
        );
        if (!group || isInitialization || groupIsInitialization || conflicts) {
            if (group) collapsed.push(group);
            group = displayRow;
            groupChanges = rowChanges;
        } else {
            group = mergeSimulationRows(group, displayRow);
            rowChanges.forEach((change) => groupChanges.add(change));
        }
        previousRaw = displayRow;
    });
    if (group) collapsed.push(group);
    return collapsed;
}

function createInputDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "simulation-input-dialog";
    const form = document.createElement("form");
    const title = document.createElement("h2");
    const fields = document.createElement("div");
    fields.className = "simulation-input-fields";
    const actions = document.createElement("div");
    actions.className = "program-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Continue";
    actions.append(cancel, submit);
    form.append(title, fields, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    const request = (variables: VariableDefinition[]): Promise<InputDialogResult> => new Promise((resolve) => {
        title.textContent = variables.length === 1 ? `Input: ${variables[0].name}` : "Enter input values";
        fields.replaceChildren();
        const inputs = variables.map(({ name, type }) => {
            const label = document.createElement("label");
            label.textContent = name;
            const input = document.createElement("input");
            input.type = type === "number" ? "number" : "text";
            input.autocomplete = "off";
            input.name = name;
            label.appendChild(input);
            fields.appendChild(label);
            return input;
        });
        const finish = (result: InputDialogResult) => {
            dialog.removeEventListener("close", onClose);
            dialog.close();
            resolve(result);
        };
        const onClose = () => resolve({ cancelled: true });
        cancel.onclick = () => finish({ cancelled: true });
        form.onsubmit = (event) => {
            event.preventDefault();
            const values = Object.fromEntries(inputs.map((input, index) => [
                input.name,
                variables[index].type === "number" ? Number(input.value) : input.value,
            ]));
            const invalidNumber = inputs.find((input, index) =>
                variables[index].type === "number" && (!input.value.trim() || !Number.isFinite(Number(input.value)))
            );
            if (invalidNumber) {
                invalidNumber.focus();
                invalidNumber.setCustomValidity("Enter a valid number.");
                invalidNumber.reportValidity();
                invalidNumber.addEventListener("input", () => invalidNumber.setCustomValidity(""), { once: true });
                return;
            }
            finish({ cancelled: false, values });
        };
        dialog.addEventListener("close", onClose, { once: true });
        dialog.showModal();
        inputs[0]?.focus();
    });

    return request;
}

export function initSimulationPanel() {
    document.documentElement.classList.add("simulation-layout");
    const splitter = document.createElement("div");
    splitter.className = "simulation-splitter";
    splitter.setAttribute("role", "separator");
    splitter.setAttribute("tabindex", "0");
    splitter.setAttribute("aria-label", "Resize simulation panel");
    const panel = document.createElement("section");
    panel.className = "simulation-panel";
    panel.id = "flowchart-simulation-panel";
    panel.setAttribute("aria-label", "Flowchart simulation");

    const panelToggle = document.createElement("button");
    panelToggle.type = "button";
    panelToggle.className = "simulation-panel-toggle";
    panelToggle.setAttribute("aria-controls", panel.id);
    let mobilePanelCollapsed = window.matchMedia("(max-width: 760px)").matches;
    panelToggle.setAttribute("aria-expanded", String(!mobilePanelCollapsed));
    panelToggle.setAttribute("aria-label", `${mobilePanelCollapsed ? "Show" : "Hide"} simulation panel`);
    panelToggle.title = `${mobilePanelCollapsed ? "Show" : "Hide"} simulation panel`;
    panelToggle.innerHTML = mobilePanelCollapsed
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
    const setMobilePanelCollapsed = (collapsed: boolean) => {
        mobilePanelCollapsed = collapsed;
        document.documentElement.classList.toggle("simulation-panel-collapsed", collapsed);
        panelToggle.setAttribute("aria-expanded", String(!collapsed));
        panelToggle.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} simulation panel`);
        panelToggle.title = `${collapsed ? "Show" : "Hide"} simulation panel`;
        panelToggle.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>';
        panel.inert = collapsed;
        panel.setAttribute("aria-hidden", String(collapsed));
    };
    const collapsePanelForSimulation = () => {
        if (window.matchMedia("(max-width: 760px)").matches) {
            setMobilePanelCollapsed(true);
        }
    };
    panelToggle.addEventListener("click", () => setMobilePanelCollapsed(!mobilePanelCollapsed));
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && window.matchMedia("(max-width: 760px)").matches && !mobilePanelCollapsed) {
            setMobilePanelCollapsed(true);
            panelToggle.focus();
        }
    });
    setMobilePanelCollapsed(mobilePanelCollapsed);
    let wasMobile = mobilePanelCollapsed;
    window.addEventListener("resize", () => {
        const isMobile = window.matchMedia("(max-width: 760px)").matches;
        if (isMobile !== wasMobile) {
            setMobilePanelCollapsed(isMobile);
            wasMobile = isMobile;
        }
    });

    const header = document.createElement("div");
    header.className = "simulation-header";
    const heading = document.createElement("h2");
    heading.textContent = "Simulation";
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "simulation-collapse";
    collapseButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    collapseButton.setAttribute("aria-expanded", "false");
    collapseButton.setAttribute("aria-label", "Hide controls");
    collapseButton.title = "Hide controls";
    collapseButton.addEventListener("click", () => {
        const collapsed = document.documentElement.classList.toggle("simulation-controls-collapsed");
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} controls`);
        collapseButton.title = `${collapsed ? "Show" : "Hide"} controls`;
        collapseButton.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    });
    const setControlsCollapsed = (collapsed: boolean) => {
        document.documentElement.classList.toggle("simulation-controls-collapsed", collapsed);
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} controls`);
        collapseButton.title = `${collapsed ? "Show" : "Hide"} controls`;
        collapseButton.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    };
    setControlsCollapsed(false);
    header.append(heading, collapseButton);

    const controls = document.createElement("div");
    controls.className = "simulation-controls";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = "Step";
    nextButton.title = "Run next step";
    nextButton.setAttribute("aria-label", "Run next step");

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "Run";
    runButton.title = "Run simulation";
    runButton.setAttribute("aria-label", "Run simulation");

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.title = "Reset simulation";
    resetButton.setAttribute("aria-label", "Reset simulation");
    const runWithoutInputsButton = document.createElement("button");
    runWithoutInputsButton.type = "button";
    runWithoutInputsButton.textContent = "Run (no inputs)";
    runWithoutInputsButton.title = "Run without predefined inputs";
    runWithoutInputsButton.setAttribute("aria-label", "Run without predefined inputs");
    const showInputsButton = document.createElement("button");
    showInputsButton.type = "button";
    showInputsButton.textContent = "Hide inputs";
    showInputsButton.title = "Hide predefined inputs";
    showInputsButton.setAttribute("aria-label", "Hide predefined inputs");
    showInputsButton.setAttribute("aria-expanded", "true");
    const configureInputsButton = createSimulationInputsControl();
    const updateConfigureInputsVisibility = () => {
        configureInputsButton.hidden = settings.readOnly;
    };
    updateConfigureInputsVisibility();
    const status = document.createElement("span");
    status.className = "simulation-status";
    status.setAttribute("role", "status");

    controls.append(nextButton, runButton, resetButton, runWithoutInputsButton, configureInputsButton, showInputsButton);

    const inputsPreview = document.createElement("div");
    inputsPreview.className = "simulation-input-preview";
    inputsPreview.hidden = false;
    inputsPreview.setAttribute("aria-label", "Predefined simulation inputs");
    const renderInputsPreview = () => {
        inputsPreview.replaceChildren();
        const entries = Object.entries(settings.inputs);
        if (entries.length === 0) {
            inputsPreview.hidden = true;
            showInputsButton.hidden = true;
            return;
        }
        const becomingAvailable = showInputsButton.hidden;
        showInputsButton.hidden = false;
        if (becomingAvailable) {
            inputsPreview.hidden = false;
            showInputsButton.textContent = "Hide inputs";
            showInputsButton.setAttribute("aria-expanded", "true");
        }
        entries.forEach(([name, rawValues]) => {
            const line = document.createElement("div");
            const values = inputSequence(rawValues);
            line.textContent = `${name}: ${values.length > 0
                ? values.map((value) => typeof value === "string" ? JSON.stringify(value) : display(value, settings.valueAccuracy)).join(", ")
                : "(no values)"}`;
            inputsPreview.appendChild(line);
        });
    };
    renderInputsPreview();
    showInputsButton.addEventListener("click", () => {
        const visible = inputsPreview.hidden;
        inputsPreview.hidden = !visible;
        showInputsButton.setAttribute("aria-expanded", String(visible));
        showInputsButton.textContent = `${visible ? "Hide" : "Show"} inputs`;
        showInputsButton.title = `${visible ? "Hide" : "Show"} predefined inputs`;
        showInputsButton.setAttribute("aria-label", `${visible ? "Hide" : "Show"} predefined inputs`);
        if (visible) renderInputsPreview();
    });

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "simulation-table-wrapper";
    const table = document.createElement("table");
    table.className = "simulation-table";
    tableWrapper.appendChild(table);
    const wholeOutputPanel = document.createElement("section");
    wholeOutputPanel.className = "simulation-output";
    wholeOutputPanel.hidden = true;
    const wholeOutputHeading = document.createElement("h3");
    wholeOutputHeading.textContent = "Whole output";
    const wholeOutputContent = document.createElement("pre");
    wholeOutputContent.className = "simulation-output-content";
    wholeOutputPanel.append(wholeOutputHeading, wholeOutputContent);
    panel.append(header, controls, inputsPreview, tableWrapper, wholeOutputPanel, status);
    document.body.appendChild(panel);
    document.body.appendChild(splitter);
    document.body.appendChild(panelToggle);

    const updateSplit = () => {
        document.documentElement.style.setProperty("--simulation-width", `${settings.simulationRatio * 100}vw`);
        document.documentElement.style.setProperty("--simulation-height", `${settings.simulationRatio * 100}vh`);
        splitter.setAttribute("aria-valuenow", String(Math.round(settings.simulationRatio * 100)));
        splitter.setAttribute("aria-orientation", window.matchMedia("(max-width: 760px)").matches ? "horizontal" : "vertical");
    };
    const resizeSplit = (event: PointerEvent) => {
        const ratio = window.matchMedia("(max-width: 760px)").matches
            ? (window.innerHeight - event.clientY) / window.innerHeight
            : (window.innerWidth - event.clientX) / window.innerWidth;
        applySettings({ simulationRatio: ratio });
    };
    splitter.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        splitter.setPointerCapture(event.pointerId);
        splitter.addEventListener("pointermove", resizeSplit);
        const stop = () => {
            splitter.removeEventListener("pointermove", resizeSplit);
            splitter.removeEventListener("pointerup", stop);
            splitter.removeEventListener("pointercancel", stop);
        };
        splitter.addEventListener("pointerup", stop);
        splitter.addEventListener("pointercancel", stop);
    });
    splitter.addEventListener("keydown", (event) => {
        const mobile = window.matchMedia("(max-width: 760px)").matches;
        const direction = mobile
            ? event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0
            : event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
        if (direction === 0) return;
        event.preventDefault();
        applySettings({ simulationRatio: settings.simulationRatio + direction * 0.02 });
    });
    document.addEventListener("flowcraft:settings", updateSplit);
    window.addEventListener("resize", updateSplit);
    updateSplit();

    let simulator: Simulator | null = null;
    let simulatorPromise: Promise<Simulator> | null = null;
    const getSimulator = () => {
        if (simulator) return Promise.resolve(simulator);
        if (!simulatorPromise) {
            simulatorPromise = import("./simulator").then(({ Simulator: SimulatorRuntime }) => {
                simulator = new SimulatorRuntime();
                return simulator;
            });
        }
        return simulatorPromise;
    };
    const requestInput = createInputDialog();
    let current: Shape | null = null;
    let previousConnection: LinkRecord | null = null;
    let lastOutput: unknown = "";
    let wholeOutput: unknown[] = [];
    let rows: SimulationRow[] = [];
    let running = false;
    let executedSteps = 0;
    let inputIndexes: Record<string, number> = {};
    let lastStepWasDecision = false;
    let lastStepWasOther = false;
    let lastOtherRowIndex: number | null = null;
    let columnOrder: string[] = [...settings.simulationColumnOrder];
    let draggedColumnId: string | null = null;

    const renderTable = () => {
        table.replaceChildren();
        const variableNames: string[] = [];
        rows.forEach((row) => {
            Object.keys(row.variables).forEach((name) => {
                if (!variableNames.includes(name)) variableNames.push(name);
            });
        });
        const decisionShapes = Shape.all.filter((shape) => shape instanceof Decision);
        const conditionIds = conditionColumnIds(decisionShapes);
        const showOutputColumn = !(settings.hideOutputColumnIfSingleOutput && current === null && wholeOutput.length === 1);
        const availableColumns: SimulationColumn[] = [
            ...(settings.showStepNumbers ? [{ id: "step", title: "Step", kind: "step" as const }] : []),
            ...variableNames.map((name) => ({ id: `variable:${name}`, title: name, kind: "variable" as const, name })),
            ...decisionShapes.map((shape) => ({
                id: conditionIds.get(shape)!,
                title: shape.content.textContent?.trim() || shape.id,
                kind: "condition" as const,
                shape,
            })),
            ...(showOutputColumn ? [{ id: "output", title: "Output", kind: "output" as const }] : []),
        ];
        const availableIds = new Set(availableColumns.map(({ id }) => id));
        // Keep remembered columns in the order while they are temporarily absent,
        // such as variable columns between simulation reset and the first step.
        columnOrder = [
            ...columnOrder,
            ...availableColumns.map(({ id }) => id).filter((id) => !columnOrder.includes(id)),
        ];
        const columns = columnOrder
            .filter((id) => availableIds.has(id))
            .map((id) => availableColumns.find((column) => column.id === id))
            .filter((column): column is SimulationColumn => Boolean(column));
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        columns.forEach((column) => {
            const cell = document.createElement("th");
            cell.textContent = column.title;
            cell.draggable = true;
            cell.addEventListener("dragstart", (event) => {
                draggedColumnId = column.id;
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                event.dataTransfer?.setData("text/plain", column.id);
            });
            cell.addEventListener("dragend", () => { draggedColumnId = null; });
            cell.addEventListener("dragover", (event) => {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            });
            cell.addEventListener("drop", (event) => {
                event.preventDefault();
                event.stopPropagation();
                const draggedId = event.dataTransfer?.getData("text/plain") || draggedColumnId;
                if (!draggedId || draggedId === column.id) return;
                const from = columnOrder.indexOf(draggedId);
                const target = columnOrder.indexOf(column.id);
                if (from < 0 || target < 0) return;
                const rect = cell.getBoundingClientRect();
                let to = target + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0);
                columnOrder.splice(from, 1);
                if (from < to) to -= 1;
                columnOrder.splice(to, 0, draggedId);
                applySettings({ simulationColumnOrder: [...columnOrder] });
                draggedColumnId = null;
            });
            if (column.kind === "step" && settings.showShapeContentInSteps) {
                cell.classList.add("simulation-step-content-column");
                cell.style.width = `${settings.simulationStepContentMaxWidth}px`;
                cell.style.minWidth = `${settings.simulationStepContentMaxWidth}px`;
                cell.style.maxWidth = `${settings.simulationStepContentMaxWidth}px`;
            }
            headerRow.appendChild(cell);
        });
        head.appendChild(headerRow);
        table.appendChild(head);

        const body = document.createElement("tbody");
        const visibleRows = settings.collapseNonConflictingChanges
            ? collapseNonConflictingRows(rows, variableNames, decisionShapes, showOutputColumn)
            : rows;
        visibleRows.forEach((row, rowIndex) => {
            const tr = document.createElement("tr");
            columns.forEach((column) => {
            if (column.kind === "step") {
                const step = document.createElement("th");
                step.scope = "row";
                const stepRange = row.step === row.stepEnd ? String(row.step) : `${row.step}-${row.stepEnd}`;
                const shapeContent = row.shape.content.innerText.trim();
                const processLines = shapeContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
                const processLabel = processLines.join("; ");
                const stepLabel = row.shape instanceof Decision
                    ? "Condition"
                    : row.shape instanceof Initialization
                        ? "Initialization"
                    : settings.showShapeContentInSteps && row.shape instanceof Process
                        ? processLabel.length <= 50 ? processLabel || stepRange : processLines.join("\n") || stepRange
                    : settings.showShapeContentInSteps
                        ? shapeContent || stepRange
                        : stepRange;
                const showingShapeContent = settings.showShapeContentInSteps &&
                    !(row.shape instanceof Decision) &&
                    !(row.shape instanceof Initialization) &&
                    Boolean(shapeContent);
                if (settings.showShapeContentInSteps) {
                    step.classList.add("simulation-step-content-column");
                    step.style.maxWidth = `${settings.simulationStepContentMaxWidth}px`;
                    step.style.minWidth = `${settings.simulationStepContentMaxWidth}px`;
                    step.style.width = `${settings.simulationStepContentMaxWidth}px`;
                }
                if (showingShapeContent) {
                    step.classList.add("simulation-step-shape-content");
                }
                step.textContent = stepLabel;
                tr.appendChild(step);
            }
            if (column.kind === "variable" && column.name) {
                const name = column.name;
                const cell = document.createElement("td");
                const isInputRow = row.shape instanceof InputOutput && row.shape.inputOutputType === "input";
                const previousRow = visibleRows[rowIndex - 1];
                const hasChanged = previousRow && !valuesEqual(previousRow.variables[name], row.variables[name]);
                const fallbackReason = !isInputRow && hasChanged &&
                    supportsReasonValue(row.variables[name])
                    ? inferredVariableReason(name, previousRow.variables[name], row.variables[name])
                    : undefined;
                cell.textContent = displayReasonValue(
                    row.variables[name],
                    row.variableReasons[name] ?? fallbackReason,
                    settings.valueAccuracy
                );
                 tr.appendChild(cell);
                }
             if (column.kind === "condition" && column.shape) {
                const shape = column.shape;
                const cell = document.createElement("td");
                const conditions = row.conditions[shape.id];
                const reasons = row.conditionReasons[shape.id] ?? [];
                cell.textContent = conditions?.map((condition, index) =>
                    displayReasonValue(condition, reasons[index], settings.valueAccuracy)
                ).join(" → ") ?? "";
                 tr.appendChild(cell);
                }
             if (column.kind === "output") {
                const output = document.createElement("td");
                output.classList.add("simulation-output-cell");
                output.textContent = row.outputs.map((value) => display(value, settings.valueAccuracy)).join("\n") ||
                    display(row.output, settings.valueAccuracy);
                tr.appendChild(output);
            }
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        tableWrapper.scrollTop = tableWrapper.scrollHeight;
    };

    const renderWholeOutput = () => {
        wholeOutputContent.textContent = wholeOutput.length > 0
            ? wholeOutput.map((value) => display(value, settings.valueAccuracy)).join("\n")
            : "No output.";
        wholeOutputPanel.hidden = false;
    };

    const setError = (error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "Simulation failed.";
        status.classList.add("error");
        Shape.setSimulationFocus(null);
    };

    const setStatus = (message: string) => {
        status.textContent = message;
        status.classList.remove("error");
    };

    const start = async () => {
        if (current) return;
        const issues = validateFlowchart();
        if (issues.length > 0) {
            throw new Error(`Fix flowchart warnings before running: ${issues.join(" ")}`);
        }
        const starts = Shape.all.filter((shape) => shape instanceof Terminator && shape.terminatorType === "start");
        if (starts.length !== 1) throw new Error("Simulation requires exactly one Start terminator.");
        const runtime = await getSimulator();
        current = starts[0];
        previousConnection = null;
        lastOutput = "";
        wholeOutput = [];
        rows = [];
        executedSteps = 0;
        inputIndexes = {};
        lastStepWasDecision = false;
        lastStepWasOther = false;
        lastOtherRowIndex = null;
        wholeOutputPanel.hidden = true;
        runtime.reset();
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(current);
    };

    const step = async (usePredefinedInputs = true, onProgress?: (message: string) => void): Promise<boolean> => {
        if (!current) await start();
        if (!current) return false;
        const runtime = await getSimulator();
        if (executedSteps >= MAX_STEPS) {
            throw new Error(`Simulation stopped after ${MAX_STEPS} steps to prevent an infinite loop.`);
        }

        const shape = current;
        const stepNumber = executedSteps + 1;
        const scopeBeforeStep = { ...runtime.getScope() };
        let variableReasons: Record<string, string> = {};
        let conditionReason = "";
        let outputReason = "";
        if (shape instanceof InputOutput && shape.inputOutputType === "input") {
            Shape.setSimulationFocus(shape, previousConnection);
        }
        let condition: boolean | undefined;
        if (shape instanceof InputOutput && shape.inputOutputType === "input") {
            const variables = inputVariables(shape);
            if (variables.length === 0) throw new Error(`Add at least one variable to Input ${shape.id}.`);
            const inputValues = settings.inputs;
            const configuredValues = new Map<string, unknown>();
            const missingVariables = variables.filter(({ name }) => {
                const configuredValue = inputValues[name];
                const values = Array.isArray(configuredValue) ? configuredValue : null;
                const index = inputIndexes[name] ?? 0;
                if (usePredefinedInputs && Object.prototype.hasOwnProperty.call(inputValues, name) &&
                    (values === null || index < values.length)) {
                    configuredValues.set(name, values === null ? configuredValue : values[index]);
                    return false;
                }
                return true;
            });
            let enteredValues: Record<string, unknown> = {};
            if (missingVariables.length > 0) {
                onProgress?.(`Waiting for input: ${missingVariables.map(({ name }) => name).join(", ")}`);
                const entered = await requestInput(missingVariables);
                if (entered.cancelled) {
                    setStatus("Input cancelled");
                    Shape.setSimulationFocus(null);
                    return false;
                }
                enteredValues = entered.values;
            }
            variables.forEach(({ name, type }) => {
                const value = configuredValues.has(name) ? configuredValues.get(name) : enteredValues[name];
                runtime.getScope()[name] = type === "number" ? Number(value) : String(value);
                if (configuredValues.has(name) && Array.isArray(inputValues[name])) {
                    inputIndexes[name] = (inputIndexes[name] ?? 0) + 1;
                }
            });
        } else if (shape instanceof Decision) {
            if (!shape.programCode.trim()) throw new Error(`Enter a true/false expression in Decision ${shape.id}'s code.`);
            condition = Boolean(runtime.evaluate(shape.programCode));
            conditionReason = substituteExpressionValues(shape.programCode, scopeBeforeStep);
        } else if (shape instanceof InputOutput && shape.inputOutputType === "output") {
            if (!shape.programCode.trim()) throw new Error(`Enter an expression in Output ${shape.id}'s code.`);
            lastOutput = runtime.evaluate(shape.programCode);
            outputReason = substituteExpressionValues(shape.programCode, scopeBeforeStep);
            wholeOutput.push(lastOutput);
        } else if (shape instanceof Process) {
            const processCode = settings.processContentAsCode ? shape.content.innerText : shape.programCode;
            if (processCode.trim()) {
                runtime.exec(processCode);
                variableReasons = assignmentReasons(processCode, scopeBeforeStep, runtime.getScope());
            }
        } else if (shape instanceof Initialization) {
            if (shape.variables.length === 0) throw new Error(`Add at least one variable to Initialization ${shape.id}.`);
            shape.variables.forEach(({ name, type, value }) => {
                if (value === undefined || value === "") throw new Error(`Set an initial value for ${name} in Initialization ${shape.id}.`);
                if (type === "variable") {
                    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(runtime.getScope(), value)) {
                        throw new Error(`Source variable ${String(value)} for ${name} is not initialized.`);
                    }
                    runtime.getScope()[name] = runtime.getScope()[value];
                    variableReasons[name] = `${name} = ${value}`;
                    return;
                }
                runtime.getScope()[name] = type === "number" ? Number(value) : String(value);
                variableReasons[name] = `${name} = ${formatExpressionValue(runtime.getScope()[name])}`;
            });
        }
        if (!(shape instanceof InputOutput && shape.inputOutputType === "input")) {
            Object.entries(runtime.getScope()).forEach(([name, value]) => {
                if ((typeof value === "number" || typeof value === "boolean") &&
                    !valuesEqual(scopeBeforeStep[name], value) && !variableReasons[name]) {
                    variableReasons[name] = `${name} = ${formatExpressionValue(value)}`;
                }
            });
        }

        executedSteps = stepNumber;
        if (!(shape instanceof Terminator)) {
            const nextRow: SimulationRow = {
                step: stepNumber,
                stepEnd: stepNumber,
                shape,
                variables: { ...runtime.getScope() },
                variableReasons,
                conditions: shape instanceof Decision && condition !== undefined ? { [shape.id]: [condition] } : {},
                conditionReasons: shape instanceof Decision && condition !== undefined ? { [shape.id]: [conditionReason] } : {},
                output: shape instanceof InputOutput && shape.inputOutputType === "output" ? lastOutput : "",
                outputs: shape instanceof InputOutput && shape.inputOutputType === "output" ? [lastOutput] : [],
                outputReasons: shape instanceof InputOutput && shape.inputOutputType === "output" ? [outputReason] : [],
            };
            const previousRow = rows[rows.length - 1];
            const isOtherShape = !(shape instanceof Process || shape instanceof Decision || shape instanceof Initialization);
            if (settings.collapseOtherSteps && isOtherShape && lastStepWasOther &&
                lastOtherRowIndex !== null && rows[lastOtherRowIndex]) {
                const group = rows[lastOtherRowIndex];
                if (settings.collapsedInputOutputValueTiming === "first") {
                    group.preferFirstVariables = true;
                } else {
                    group.variables = nextRow.variables;
                    group.variableReasons = { ...group.variableReasons, ...nextRow.variableReasons };
                }
                group.output = nextRow.output;
                group.outputs.push(...nextRow.outputs);
                group.outputReasons.push(...nextRow.outputReasons);
                group.stepEnd = stepNumber;
            } else if (settings.collapseConsecutiveConditions && shape instanceof Decision && lastStepWasDecision &&
                previousRow?.shape instanceof Decision) {
                Object.entries(nextRow.conditions).forEach(([id, conditions]) => {
                    previousRow.conditions[id] = [...(previousRow.conditions[id] ?? []), ...conditions];
                    previousRow.conditionReasons[id] = [
                        ...(previousRow.conditionReasons[id] ?? []),
                        ...(nextRow.conditionReasons[id] ?? []),
                    ];
                });
                previousRow.variables = nextRow.variables;
                previousRow.variableReasons = { ...previousRow.variableReasons, ...nextRow.variableReasons };
                previousRow.output = nextRow.output;
                previousRow.outputReasons.push(...nextRow.outputReasons);
                previousRow.stepEnd = stepNumber;
            } else {
                const unchanged = previousRow &&
                    recordsEqual(previousRow.variables, nextRow.variables) &&
                    recordsEqual(previousRow.conditions, nextRow.conditions) &&
                    valuesEqual(previousRow.output, nextRow.output);
                const keepGroupStart = settings.collapseOtherSteps && isOtherShape && !lastStepWasOther;
                if (!settings.compressSimulationTable || !unchanged || keepGroupStart) {
                    rows.push(nextRow);
                    lastOtherRowIndex = isOtherShape ? rows.length - 1 : null;
                } else if (!isOtherShape) {
                    lastOtherRowIndex = null;
                }
            }
        }
        lastStepWasDecision = shape instanceof Decision;
        lastStepWasOther = !(shape instanceof Process || shape instanceof Decision || shape instanceof Initialization);

        const incomingConnection = previousConnection;
        let connection: LinkRecord | undefined;
        if (shape instanceof Decision) {
            const role = condition ? "next" : "altNext";
            connection = Shape.connections.find((link) => link.from === shape && link.role === role);
        } else {
            connection = Shape.connections.find((link) => link.from === shape);
        }

        current = connection?.to ?? null;
        previousConnection = connection ?? null;
        renderTable();
        Shape.setSimulationFocus(
            shape,
            connection ?? (shape instanceof Terminator && shape.terminatorType === "end" ? incomingConnection : null)
        );

        if (!current) {
            setStatus("Finished");
            renderWholeOutput();
            return false;
        }
        setStatus(`Step ${executedSteps}`);
        return true;
    };

    const guard = async (action: () => Promise<void> | void) => {
        try {
            await action();
        } catch (error) {
            setError(error);
        }
    };

    const reset = () => {
        simulator?.reset();
        current = null;
        previousConnection = null;
        lastOutput = "";
        wholeOutput = [];
        rows = [];
        executedSteps = 0;
        inputIndexes = {};
        lastStepWasDecision = false;
        lastStepWasOther = false;
        lastOtherRowIndex = null;
        wholeOutputPanel.hidden = true;
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(null);
    };

    nextButton.addEventListener("click", () => {
        collapsePanelForSimulation();
        void guard(async () => { await step(); });
    });
    const runAll = async (usePredefinedInputs: boolean, onProgress?: (message: string) => void): Promise<boolean> => {
        if (running) return false;
        running = true;
        nextButton.disabled = true;
        runButton.disabled = true;
        runWithoutInputsButton.disabled = true;
        let finished = false;
        try {
            while (await step(usePredefinedInputs, onProgress)) {
                onProgress?.(`Running simulation · Step ${executedSteps}`);
                await new Promise<void>((resolve) => window.setTimeout(resolve, settings.simulationStepDelay));
            }
            finished = status.textContent === "Finished";
        } catch (error) {
            setError(error);
        } finally {
            running = false;
            nextButton.disabled = false;
            runButton.disabled = false;
            runWithoutInputsButton.disabled = false;
        }
        return finished;
    };
    runButton.addEventListener("click", () => {
        collapsePanelForSimulation();
        void runAll(true);
    });
    runWithoutInputsButton.addEventListener("click", () => {
        collapsePanelForSimulation();
        void runAll(false);
    });
    resetButton.addEventListener("click", () => {
        collapsePanelForSimulation();
        reset();
    });
    document.addEventListener("flowcraft:diagramchange", reset);
    document.addEventListener("flowcraft:settings", () => {
        columnOrder = [...settings.simulationColumnOrder];
        updateConfigureInputsVisibility();
        renderTable();
        renderInputsPreview();
    });

    const autorun = () => {
        if (!settings.autorun || Shape.all.length === 0) return;
        try {
            const inputValues = settings.inputs;
            const inputs = Shape.all.filter((shape): shape is InputOutput =>
                shape instanceof InputOutput && shape.inputOutputType === "input"
            );
            const missing = inputs.flatMap((shape) => inputVariables(shape).filter(({ name }) =>
                !Object.prototype.hasOwnProperty.call(inputValues, name) ||
                (Array.isArray(inputValues[name]) && inputValues[name].length === 0)
            ).map(({ name }) => name));
            if (missing.length > 0) {
                throw new Error(`Autorun requires simulation inputs in settings for: ${[...new Set(missing)].join(", ")}.`);
            }
            setControlsCollapsed(true);
            runButton.click();
        } catch (error) {
            setError(error);
        }
    };

    const runForExport = async (onProgress: (message: string) => void): Promise<boolean> => {
        if (running) {
            onProgress("A simulation is already running.");
            return false;
        }
        collapsePanelForSimulation();
        reset();
        return runAll(true, onProgress);
    };
    return { autorun, runForExport };
}
