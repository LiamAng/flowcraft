import type { Simulator } from "./simulator";
import { Decision, Initialization, Shape, Terminator, InputOutput, type LinkRecord, type VariableDefinition } from "./shapes";
import { Process } from "./shapes/Process";
import { validateFlowchart } from "./flowValidation";
import { applySettings, settings } from "./settings";

type SimulationRow = {
    step: number;
    shape: Shape;
    variables: Record<string, unknown>;
    conditions: Record<string, boolean>;
    output: unknown;
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

function columnColor(name: string): string {
    let hash = 0;
    for (const character of name) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    return `hsl(${Math.abs(hash) % 360} 75% 92%)`;
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
    panel.setAttribute("aria-label", "Flowchart simulation");

    const header = document.createElement("div");
    header.className = "simulation-header";
    const heading = document.createElement("h2");
    heading.textContent = "Simulation";
    const collapseButton = document.createElement("button");
    collapseButton.type = "button";
    collapseButton.className = "simulation-collapse";
    collapseButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    collapseButton.setAttribute("aria-expanded", "false");
    collapseButton.setAttribute("aria-label", "Hide simulation buttons");
    collapseButton.addEventListener("click", () => {
        const collapsed = document.documentElement.classList.toggle("simulation-controls-collapsed");
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} simulation buttons`);
        collapseButton.title = `${collapsed ? "Show" : "Hide"} simulation buttons`;
        collapseButton.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    });
    const setControlsCollapsed = (collapsed: boolean) => {
        document.documentElement.classList.toggle("simulation-controls-collapsed", collapsed);
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} simulation buttons`);
        collapseButton.title = `${collapsed ? "Show" : "Hide"} simulation buttons`;
        collapseButton.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
    };
    setControlsCollapsed(settings.autorun);
    header.append(heading, collapseButton);

    const controls = document.createElement("div");
    controls.className = "simulation-controls";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = "Next step";

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "Run all";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    const runWithoutInputsButton = document.createElement("button");
    runWithoutInputsButton.type = "button";
    runWithoutInputsButton.textContent = "Run without predefined inputs";
    const showInputsButton = document.createElement("button");
    showInputsButton.type = "button";
    showInputsButton.textContent = "Show predefined inputs";
    showInputsButton.setAttribute("aria-expanded", "false");
    const status = document.createElement("span");
    status.className = "simulation-status";
    status.setAttribute("role", "status");

    controls.append(nextButton, runButton, resetButton, runWithoutInputsButton, showInputsButton);

    const inputsPreview = document.createElement("div");
    inputsPreview.className = "simulation-input-preview";
    inputsPreview.hidden = true;
    inputsPreview.setAttribute("aria-label", "Predefined simulation inputs");
    const renderInputsPreview = () => {
        inputsPreview.replaceChildren();
        const entries = Object.entries(settings.inputs);
        if (entries.length === 0) {
            inputsPreview.textContent = "No predefined inputs.";
            return;
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
    showInputsButton.addEventListener("click", () => {
        const visible = inputsPreview.hidden;
        inputsPreview.hidden = !visible;
        showInputsButton.setAttribute("aria-expanded", String(visible));
        showInputsButton.textContent = `${visible ? "Hide" : "Show"} predefined inputs`;
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

    const renderTable = () => {
        table.replaceChildren();
        const variableNames: string[] = [];
        rows.forEach((row) => {
            Object.keys(row.variables).forEach((name) => {
                if (!variableNames.includes(name)) variableNames.push(name);
            });
        });
        const decisionShapes = Shape.all.filter((shape) => shape instanceof Decision);
        const head = document.createElement("thead");
        const headerRow = document.createElement("tr");
        [ ...(settings.showStepNumbers ? ["Step"] : []), ...variableNames, ...decisionShapes.map((shape) => `Condition: ${shape.content.textContent?.trim() || shape.id}`), "Output"].forEach((title, index, all) => {
            const cell = document.createElement("th");
            cell.textContent = title;
            if (index > 0 && index < all.length - 1) cell.style.backgroundColor = columnColor(title);
            headerRow.appendChild(cell);
        });
        head.appendChild(headerRow);
        table.appendChild(head);

        const body = document.createElement("tbody");
        rows.forEach((row) => {
            const tr = document.createElement("tr");
            if (settings.showStepNumbers) {
                const step = document.createElement("th");
                step.scope = "row";
                step.textContent = settings.showProcessContentInSteps && row.shape instanceof Process
                    ? row.shape.content.innerText.trim() || String(row.step)
                    : String(row.step);
                tr.appendChild(step);
            }
            variableNames.forEach((name) => {
                const cell = document.createElement("td");
                cell.textContent = display(row.variables[name], settings.valueAccuracy);
                cell.style.backgroundColor = columnColor(name);
                tr.appendChild(cell);
            });
            decisionShapes.forEach((shape) => {
                const cell = document.createElement("td");
                const condition = row.conditions[shape.id];
                cell.textContent = condition === undefined ? "" : condition ? "true" : "false";
                cell.style.backgroundColor = columnColor(`condition:${shape.id}`);
                tr.appendChild(cell);
            });
            const output = document.createElement("td");
            output.textContent = display(row.output, settings.valueAccuracy);
            tr.appendChild(output);
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
        wholeOutputPanel.hidden = true;
        runtime.reset();
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(current);
    };

    const step = async (usePredefinedInputs = true): Promise<boolean> => {
        if (!current) await start();
        if (!current) return false;
        const runtime = await getSimulator();
        if (executedSteps >= MAX_STEPS) {
            throw new Error(`Simulation stopped after ${MAX_STEPS} steps to prevent an infinite loop.`);
        }

        const shape = current;
        const stepNumber = executedSteps + 1;
        let condition: boolean | undefined;
        if (shape instanceof InputOutput && shape.inputOutputType === "input") {
            const variables = inputVariables(shape);
            if (variables.length === 0) throw new Error(`Add at least one variable to Input ${shape.id}.`);
            const inputValues = settings.inputs;
            const configuredValues = new Map<string, unknown>();
            const missingVariables = variables.filter(({ name }) => {
                const values = inputSequence(inputValues[name]);
                const index = inputIndexes[name] ?? 0;
                if (usePredefinedInputs && index < values.length) {
                    configuredValues.set(name, values[index]);
                    return false;
                }
                return true;
            });
            let enteredValues: Record<string, unknown> = {};
            if (missingVariables.length > 0) {
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
                if (configuredValues.has(name)) inputIndexes[name] = (inputIndexes[name] ?? 0) + 1;
            });
        } else if (shape instanceof Decision) {
            if (!shape.programCode.trim()) throw new Error(`Enter a true/false expression in Decision ${shape.id}'s code.`);
            condition = Boolean(runtime.evaluate(shape.programCode));
        } else if (shape instanceof InputOutput && shape.inputOutputType === "output") {
            if (!shape.programCode.trim()) throw new Error(`Enter an expression in Output ${shape.id}'s code.`);
            lastOutput = runtime.evaluate(shape.programCode);
            wholeOutput.push(lastOutput);
        } else if (shape instanceof Process && shape.programCode.trim()) {
            runtime.exec(shape.programCode);
        } else if (shape instanceof Initialization) {
            if (shape.variables.length === 0) throw new Error(`Add at least one variable to Initialization ${shape.id}.`);
            shape.variables.forEach(({ name, type, value }) => {
                if (value === undefined || value === "") throw new Error(`Set an initial value for ${name} in Initialization ${shape.id}.`);
                if (type === "variable") {
                    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(runtime.getScope(), value)) {
                        throw new Error(`Source variable ${String(value)} for ${name} is not initialized.`);
                    }
                    runtime.getScope()[name] = runtime.getScope()[value];
                    return;
                }
                runtime.getScope()[name] = type === "number" ? Number(value) : String(value);
            });
        }

        executedSteps = stepNumber;
        if (!(shape instanceof Terminator)) {
            const nextRow: SimulationRow = {
                step: stepNumber,
                shape,
                variables: { ...runtime.getScope() },
                conditions: shape instanceof Decision && condition !== undefined ? { [shape.id]: condition } : {},
                output: shape instanceof InputOutput && shape.inputOutputType === "output" ? lastOutput : "",
            };
            const previousRow = rows[rows.length - 1];
            const unchanged = previousRow &&
                recordsEqual(previousRow.variables, nextRow.variables) &&
                recordsEqual(previousRow.conditions, nextRow.conditions) &&
                valuesEqual(previousRow.output, nextRow.output);
            if (!settings.compressSimulationTable || !unchanged) rows.push(nextRow);
        }

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
        Shape.setSimulationFocus(shape, previousConnection);

        if (!current) {
            setStatus("Finished");
            renderWholeOutput();
            Shape.setSimulationFocus(null);
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
        wholeOutputPanel.hidden = true;
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(null);
    };

    nextButton.addEventListener("click", () => guard(async () => { await step(); }));
    const runAll = async (usePredefinedInputs: boolean) => {
        if (running) return;
        running = true;
        nextButton.disabled = true;
        runButton.disabled = true;
        runWithoutInputsButton.disabled = true;
        try {
            while (await step(usePredefinedInputs)) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, settings.simulationStepDelay));
            }
        } catch (error) {
            setError(error);
        } finally {
            running = false;
            nextButton.disabled = false;
            runButton.disabled = false;
            runWithoutInputsButton.disabled = false;
        }
    };
    runButton.addEventListener("click", () => runAll(true));
    runWithoutInputsButton.addEventListener("click", () => runAll(false));
    resetButton.addEventListener("click", reset);
    document.addEventListener("flowcraft:diagramchange", reset);
    document.addEventListener("flowcraft:settings", () => {
        renderTable();
        if (!inputsPreview.hidden) renderInputsPreview();
    });

    const autorun = () => {
        if (!settings.autorun) return;
        setControlsCollapsed(true);
        try {
            const inputValues = settings.inputs;
            const inputs = Shape.all.filter((shape): shape is InputOutput =>
                shape instanceof InputOutput && shape.inputOutputType === "input"
            );
            const missing = inputs.flatMap((shape) => inputVariables(shape).filter(({ name }) =>
                inputSequence(inputValues[name]).length === 0
            ).map(({ name }) => name));
            if (missing.length > 0) {
                throw new Error(`Autorun requires simulation inputs in settings for: ${[...new Set(missing)].join(", ")}.`);
            }
            runButton.click();
        } catch (error) {
            setError(error);
        }
    };

    return autorun;
}
