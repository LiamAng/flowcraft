import { applySettings, settings } from "./settings";

type InputRow = {
    row: HTMLDivElement;
    name: HTMLInputElement;
    type: HTMLSelectElement;
    values: HTMLInputElement[];
};

export function createSimulationInputsControl(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Configure inputs";
    button.title = "Configure predefined simulation inputs";
    button.setAttribute("aria-label", "Configure simulation inputs");

    const dialog = document.createElement("dialog");
    dialog.className = "program-editor simulation-inputs-dialog";
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    heading.textContent = "Simulation inputs";
    const inputsArea = document.createElement("div");
    inputsArea.className = "simulation-input-list";
    const error = document.createElement("p");
    error.className = "settings-error";
    error.hidden = true;
    const actions = document.createElement("div");
    actions.className = "program-editor-actions";
    const addInput = document.createElement("button");
    addInput.type = "button";
    addInput.textContent = "Add input";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    actions.append(addInput, cancel, save);
    form.append(heading, inputsArea, error, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    let inputRows: InputRow[] = [];
    const addInputRow = (nameValue = "", rawValue: unknown = "") => {
        const row = document.createElement("div");
        row.className = "simulation-input-row";
        const name = document.createElement("input");
        name.type = "text";
        name.placeholder = "Variable name";
        name.value = nameValue;
        name.setAttribute("aria-label", "Input variable name");
        const type = document.createElement("select");
        type.setAttribute("aria-label", "Input variable type");
        const rawValues = Array.isArray(rawValue) ? rawValue : [rawValue];
        const isNumber = typeof rawValues[0] === "number";
        [{ value: "string", text: "String" }, { value: "number", text: "Number" }].forEach(({ value, text }) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            type.appendChild(option);
        });
        type.value = isNumber ? "number" : "string";
        const valuesArea = document.createElement("div");
        valuesArea.className = "simulation-input-values";
        const values: HTMLInputElement[] = [];
        const addValue = (raw: unknown = "") => {
            const entry = document.createElement("div");
            entry.className = "simulation-input-value";
            const value = document.createElement("input");
            value.type = type.value === "number" ? "number" : "text";
            value.value = raw === undefined ? "" : String(raw);
            value.placeholder = "Value";
            value.setAttribute("aria-label", `Input value ${values.length + 1}`);
            const removeValue = document.createElement("button");
            removeValue.type = "button";
            removeValue.textContent = "Remove value";
            removeValue.addEventListener("click", () => {
                if (values.length <= 1) return;
                entry.remove();
                const index = values.indexOf(value);
                if (index >= 0) values.splice(index, 1);
            });
            entry.append(value, removeValue);
            valuesArea.appendChild(entry);
            values.push(value);
        };
        (rawValues.length > 0 ? rawValues : [""]).forEach(addValue);
        const addValueButton = document.createElement("button");
        addValueButton.type = "button";
        addValueButton.textContent = "Add value";
        addValueButton.addEventListener("click", () => addValue());
        type.addEventListener("change", () => {
            values.forEach((value) => {
                value.type = type.value === "number" ? "number" : "text";
                if (type.value === "number" && !value.value) value.value = "0";
            });
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
            row.remove();
            const index = inputRows.findIndex((item) => item.row === row);
            if (index >= 0) inputRows.splice(index, 1);
        });
        row.append(name, type, remove, valuesArea, addValueButton);
        inputsArea.appendChild(row);
        inputRows.push({ row, name, type, values });
    };
    const fill = () => {
        inputsArea.replaceChildren();
        inputRows = [];
        Object.entries(settings.inputs).forEach(([name, value]) => addInputRow(name, value));
        error.hidden = true;
    };

    button.addEventListener("click", () => {
        fill();
        dialog.showModal();
    });
    addInput.addEventListener("click", () => addInputRow());
    cancel.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const inputs: Record<string, unknown> = {};
        for (const row of inputRows) {
            const name = row.name.value.trim();
            if (!/^[A-Za-z_$][\w$]*$/.test(name) || Object.prototype.hasOwnProperty.call(inputs, name)) {
                error.textContent = "Input variable names must be valid, unique identifiers.";
                error.hidden = false;
                row.name.focus();
                return;
            }
            if (row.type.value === "number" && row.values.some((value) => !value.value.trim())) {
                error.textContent = `Enter a value for ${name}.`;
                error.hidden = false;
                row.values.find((value) => !value.value.trim())?.focus();
                return;
            }
            const values = row.values.map((input) => row.type.value === "number" ? Number(input.value) : input.value);
            if (values.some((value) => typeof value === "number" && !Number.isFinite(value))) {
                error.textContent = `Enter valid numbers for ${name}.`;
                error.hidden = false;
                row.values.find((input) => !Number.isFinite(Number(input.value)))?.focus();
                return;
            }
            inputs[name] = values.length === 1 ? values[0] : values;
        }
        applySettings({ inputs });
        dialog.close();
    });

    return button;
}
