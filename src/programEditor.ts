import { Decision, Initialization, InputOutput, Shape, type VariableDefinition } from "./shapes";
import { settings } from "./settings";

let dialog: HTMLDialogElement | null = null;
let editor: HTMLTextAreaElement | null = null;
let variableEditor: HTMLDivElement | null = null;
let dialogTitle: HTMLHeadingElement | null = null;
let help: HTMLParagraphElement | null = null;
let error: HTMLParagraphElement | null = null;
let activeShape: Shape | null = null;
let variableRows: Array<{ row: HTMLDivElement; name: HTMLInputElement; type: HTMLSelectElement; value: HTMLInputElement | null }> = [];

function createVariableRow(initial: VariableDefinition, needsValue: boolean) {
    if (!variableEditor) return;
    const row = document.createElement("div");
    row.className = `variable-editor-row${needsValue ? " with-value" : ""}`;
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Variable name";
    name.value = initial.name;
    name.setAttribute("aria-label", "Variable name");
    const type = document.createElement("select");
    type.setAttribute("aria-label", "Variable type");
    const types = needsValue
        ? [
            { value: "number", label: "Number" },
            { value: "string", label: "String" },
            { value: "variable", label: "From variable" },
        ]
        : [
            { value: "number", label: "Number" },
            { value: "string", label: "String" },
        ];
    types.forEach(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        type.appendChild(option);
    });
    type.value = initial.type;
    const value = needsValue ? document.createElement("input") : null;
    if (value) {
        value.type = initial.type === "number" ? "number" : "text";
        value.value = initial.value === undefined ? "" : String(initial.value);
        value.placeholder = initial.type === "variable" ? "Variable name" : "Initial value";
        value.setAttribute("aria-label", initial.type === "variable" ? "Source variable name" : "Initial value");
        type.addEventListener("change", () => {
            const previous = value.value;
            value.type = type.value === "number" ? "number" : "text";
            value.value = previous;
            value.placeholder = type.value === "variable" ? "Variable name" : "Initial value";
            value.setAttribute("aria-label", type.value === "variable" ? "Source variable name" : "Initial value");
        });
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove variable");
    remove.addEventListener("click", () => {
        row.remove();
        variableRows = variableRows.filter((item) => item.row !== row);
    });
    row.append(name, type);
    if (value) row.appendChild(value);
    row.appendChild(remove);
    variableEditor.appendChild(row);
    variableRows.push({ row, name, type, value });
}

function createDialog() {
    const element = document.createElement("dialog");
    element.className = "program-editor";
    const form = document.createElement("form");
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!activeShape) return;
        const isInput = activeShape instanceof InputOutput && activeShape.inputOutputType === "input";
        const isInitialization = activeShape instanceof Initialization;
        if (isInput || isInitialization) {
            const definitions: VariableDefinition[] = [];
            const names = new Set<string>();
            for (const item of variableRows) {
                const name = item.name.value.trim();
                if (!/^[A-Za-z_$][\w$]*$/.test(name) || names.has(name)) {
                    if (error) {
                        error.textContent = "Variable names must be valid, unique identifiers.";
                        error.hidden = false;
                    }
                    item.name.focus();
                    return;
                }
                names.add(name);
                const type = item.type.value as VariableDefinition["type"];
                const definition: VariableDefinition = { name, type };
                if (isInitialization && item.value) {
                    if (!item.value.value.trim()) {
                        if (error) {
                            error.textContent = type === "variable"
                                ? `Enter the source variable for ${name}.`
                                : `Enter an initial value for ${name}.`;
                            error.hidden = false;
                        }
                        item.value.focus();
                        return;
                    }
                    if (type === "variable" && !/^[A-Za-z_$][\w$]*$/.test(item.value.value.trim())) {
                        if (error) {
                            error.textContent = `Enter a valid source variable name for ${name}.`;
                            error.hidden = false;
                        }
                        item.value.focus();
                        return;
                    }
                    definition.value = type === "number"
                        ? Number(item.value.value)
                        : type === "variable"
                            ? item.value.value.trim()
                            : item.value.value;
                    if (type === "number" && typeof definition.value === "number" && !Number.isFinite(definition.value)) {
                        if (error) {
                            error.textContent = `Enter a valid number for ${name}.`;
                            error.hidden = false;
                        }
                        item.value.focus();
                        return;
                    }
                }
                definitions.push(definition);
            }
            if (definitions.length === 0) {
                if (error) {
                    error.textContent = "Add at least one variable.";
                    error.hidden = false;
                }
                return;
            }
            activeShape.variables = definitions;
            activeShape.programCode = "";
        } else if (editor) {
            activeShape.programCode = editor.value;
        }
        Shape.notifyDiagramChange();
        element.close();
    });

    const title = document.createElement("h2");
    dialogTitle = title;
    const codeLabel = document.createElement("label");
    codeLabel.textContent = "Code";
    editor = document.createElement("textarea");
    editor.spellcheck = false;
    editor.setAttribute("aria-label", "Shape code");
    codeLabel.appendChild(editor);

    variableEditor = document.createElement("div");
    variableEditor.className = "variable-editor";
    const addVariable = document.createElement("button");
    addVariable.type = "button";
    addVariable.className = "program-editor-add-variable";
    addVariable.textContent = "Add variable";
    addVariable.addEventListener("click", () => createVariableRow({ name: "", type: "string" }, activeShape instanceof Initialization));

    help = document.createElement("p");
    help.className = "program-editor-help";
    error = document.createElement("p");
    error.className = "settings-error";
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "program-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => element.close());
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    actions.append(cancel, save);
    form.append(title, codeLabel, variableEditor, addVariable, help, error, actions);
    element.appendChild(form);
    element.addEventListener("close", () => {
        activeShape = null;
    });
    document.body.appendChild(element);
    dialog = element;
}

export function openProgramEditor(shape: Shape) {
    if (!dialog || !editor || !variableEditor || !help || !error) createDialog();
    if (!dialog || !editor || !variableEditor || !help || !error) {
        throw new Error("Failed to initialize the shape editor.");
    }
    activeShape = shape;
    editor.value = shape.programCode;
    error.hidden = true;
    variableRows = [];
    variableEditor.replaceChildren();

    const isInput = shape instanceof InputOutput && shape.inputOutputType === "input";
    const isInitialization = shape instanceof Initialization;
    const codeLabel = editor.parentElement as HTMLLabelElement;
    const addVariable = dialog.querySelector<HTMLButtonElement>(".program-editor-add-variable");
    codeLabel.hidden = isInput || isInitialization;
    variableEditor.hidden = !isInput && !isInitialization;
    if (addVariable) addVariable.hidden = !isInput && !isInitialization;

    let guidance: string;
    if (isInput || isInitialization) {
        const definitions = shape.variables.length > 0
            ? shape.variables
            : isInput
                ? shape.programCode.split(",").map((name) => ({ name: name.trim(), type: "string" as const })).filter((variable) => variable.name)
                : [];
        definitions.forEach((variable) => createVariableRow(variable, isInitialization));
        if (variableRows.length === 0) createVariableRow({ name: "", type: "string" }, isInitialization);
        if (dialogTitle) dialogTitle.textContent = isInput ? "Input variables" : "Initialize variables";
        guidance = isInput
            ? "Add variables to request during simulation. Values are collected using the selected type."
            : "Add variables and set each initial value or source variable.";
    } else {
        if (dialogTitle) dialogTitle.textContent = "Edit shape code";
        if (shape instanceof InputOutput) {
            guidance = "Enter a JavaScript expression to display as the output.";
        } else if (shape instanceof Decision) {
            const [positive, negative] = settings.decisionBranchLabels === "true-false" ? ["True", "False"] : ["Yes", "No"];
            guidance = `Enter a JavaScript expression. A truthy result follows ${positive}; a false result follows ${negative}.`;
        } else {
            guidance = "Enter JavaScript statements. Variables are shared with later steps; declare new variables with let or var.";
        }
    }
    help.textContent = guidance;
    dialog.showModal();
    (isInput || isInitialization ? variableRows[0]?.name : editor)?.focus();
}
