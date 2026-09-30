import { Simulator } from "./simulator";
import { Decision, Shape, Terminator, InputOutput, type LinkRecord } from "./shapes";
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

const INPUT_NAME = /^[A-Za-z_$][\w$]*$/;
const MAX_STEPS = 10000;
type InputDialogResult = { cancelled: true } | { cancelled: false; values: Record<string, unknown> };

function parseInputNames(code: string, shapeId: string): string[] {
    const names = code.split(",").map((name) => name.trim());
    if (!code.trim() || names.some((name) => !INPUT_NAME.test(name)) || new Set(names).size !== names.length) {
        throw new Error(`Set one or more unique, valid variable names separated by commas in the code for Input ${shapeId}.`);
    }
    return names;
}

function display(value: unknown, accuracy: number): string {
    if (value === undefined) return "";
    if (value === null) return "null";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(accuracy) : String(value);
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

function columnColor(name: string): string {
    let hash = 0;
    for (const character of name) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }
    return `hsl(${Math.abs(hash) % 360} 75% 92%)`;
}

function parseInputValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
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

    const request = (names: string[]): Promise<InputDialogResult> => new Promise((resolve) => {
        title.textContent = names.length === 1 ? `Input: ${names[0]}` : "Enter input values";
        fields.replaceChildren();
        const inputs = names.map((name) => {
            const label = document.createElement("label");
            label.textContent = name;
            const input = document.createElement("input");
            input.type = "text";
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
            const values = Object.fromEntries(inputs.map((input) => [input.name, parseInputValue(input.value)]));
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
    collapseButton.textContent = "Collapse";
    collapseButton.setAttribute("aria-expanded", "true");
    collapseButton.setAttribute("aria-label", "Collapse simulation panel");
    collapseButton.addEventListener("click", () => {
        const collapsed = document.documentElement.classList.toggle("simulation-collapsed");
        collapseButton.textContent = collapsed ? "Expand" : "Collapse";
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} simulation panel`);
    });
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

    const status = document.createElement("span");
    status.className = "simulation-status";
    status.setAttribute("role", "status");

    controls.append(nextButton, runButton, resetButton);

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
    panel.append(header, controls, tableWrapper, wholeOutputPanel, status);
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

    const simulator = new Simulator();
    const requestInput = createInputDialog();
    let current: Shape | null = null;
    let previousConnection: LinkRecord | null = null;
    let lastOutput: unknown = "";
    let wholeOutput: unknown[] = [];
    let rows: SimulationRow[] = [];
    let running = false;

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
        ["Step", ...variableNames, ...decisionShapes.map((shape) => `Condition: ${shape.content.textContent?.trim() || shape.id}`), "Output"].forEach((title, index, all) => {
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
            const step = document.createElement("th");
            step.scope = "row";
            step.textContent = `${row.step}. ${row.shape.content.textContent?.trim() || row.shape.id}`;
            tr.appendChild(step);
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
    };

    const setStatus = (message: string) => {
        status.textContent = message;
        status.classList.remove("error");
    };

    const start = () => {
        if (current) return;
        const issues = validateFlowchart();
        if (issues.length > 0) {
            throw new Error(`Fix flowchart warnings before running: ${issues.join(" ")}`);
        }
        const starts = Shape.all.filter((shape) => shape instanceof Terminator && shape.terminatorType === "start");
        if (starts.length !== 1) throw new Error("Simulation requires exactly one Start terminator.");
        current = starts[0];
        previousConnection = null;
        lastOutput = "";
        wholeOutput = [];
        rows = [];
        wholeOutputPanel.hidden = true;
        simulator.reset();
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(current);
    };

    const step = async (): Promise<boolean> => {
        if (!current) start();
        if (!current) return false;
        if (rows.length >= MAX_STEPS) {
            throw new Error(`Simulation stopped after ${MAX_STEPS} steps to prevent an infinite loop.`);
        }

        const shape = current;
        let condition: boolean | undefined;
        if (shape instanceof InputOutput && shape.inputOutputType === "input") {
            const names = parseInputNames(shape.programCode, shape.id);
            const inputValues = settings.inputs;
            const missingNames = names.filter((name) => !Object.prototype.hasOwnProperty.call(inputValues, name));
            let enteredValues: Record<string, unknown> = {};
            if (missingNames.length > 0) {
                const entered = await requestInput(missingNames);
                if (entered.cancelled) {
                    setStatus("Input cancelled");
                    return false;
                }
                enteredValues = entered.values;
            }
            names.forEach((name) => {
                simulator.getScope()[name] = Object.prototype.hasOwnProperty.call(inputValues, name) ? inputValues[name] : enteredValues[name];
            });
        } else if (shape instanceof Decision) {
            if (!shape.programCode.trim()) throw new Error(`Enter a true/false expression in Decision ${shape.id}'s code.`);
            condition = Boolean(simulator.evaluate(shape.programCode));
        } else if (shape instanceof InputOutput && shape.inputOutputType === "output") {
            if (!shape.programCode.trim()) throw new Error(`Enter an expression in Output ${shape.id}'s code.`);
            lastOutput = simulator.evaluate(shape.programCode);
            wholeOutput.push(lastOutput);
        } else if (shape instanceof Process && shape.programCode.trim()) {
            simulator.exec(shape.programCode);
        }

        if (!(shape instanceof Terminator)) {
            rows.push({
                step: rows.length + 1,
                shape,
                variables: { ...simulator.getScope() },
                conditions: shape instanceof Decision && condition !== undefined ? { [shape.id]: condition } : {},
                output: shape instanceof InputOutput && shape.inputOutputType === "output" ? lastOutput : "",
            });
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
            return false;
        }
        setStatus(`Step ${rows.length}`);
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
        simulator.reset();
        current = null;
        previousConnection = null;
        lastOutput = "";
        wholeOutput = [];
        rows = [];
        wholeOutputPanel.hidden = true;
        renderTable();
        setStatus("Ready");
        Shape.setSimulationFocus(null);
    };

    nextButton.addEventListener("click", () => guard(async () => { await step(); }));
    runButton.addEventListener("click", async () => {
        if (running) return;
        running = true;
        nextButton.disabled = true;
        runButton.disabled = true;
        try {
            while (await step()) {
                await new Promise<void>((resolve) => window.setTimeout(resolve, settings.simulationStepDelay));
            }
        } catch (error) {
            setError(error);
        } finally {
            running = false;
            nextButton.disabled = false;
            runButton.disabled = false;
        }
    });
    resetButton.addEventListener("click", reset);
    document.addEventListener("flowcraft:diagramchange", reset);
    document.addEventListener("flowcraft:settings", renderTable);

    const autorun = () => {
        if (!settings.autorun) return;
        try {
            const inputValues = settings.inputs;
            const inputs = Shape.all.filter((shape) => shape instanceof InputOutput && shape.inputOutputType === "input");
            const missing = inputs.flatMap((shape) => parseInputNames(shape.programCode, shape.id).filter((name) => !Object.prototype.hasOwnProperty.call(inputValues, name)));
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
