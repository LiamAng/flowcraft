import { applySettings, defaultSettings, settings, type Settings } from "./settings";

export function initSettingsPanel(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Settings";

    const dialog = document.createElement("dialog");
    dialog.className = "program-editor settings-dialog";
    const form = document.createElement("form");
    const title = document.createElement("h2");
    title.textContent = "Settings";
    const error = document.createElement("p");
    error.className = "settings-error";
    error.hidden = true;

    const checkbox = (key: "snap" | "guides" | "showGrid" | "readOnly" | "showSteps" | "autorun", text: string) => {
        const label = document.createElement("label");
        label.className = "settings-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        label.append(input, document.createTextNode(text));
        return { label, input, key };
    };

    const checks = [
        checkbox("snap", "Snap to grid"),
        checkbox("guides", "Snap to other shapes and show alignment guides"),
        checkbox("showGrid", "Show grid"),
        checkbox("showSteps", "Highlight the active flowline during simulation"),
        checkbox("autorun", "Run simulation automatically on load"),
        checkbox("readOnly", "Read only"),
    ];

    const gridLabel = document.createElement("label");
    gridLabel.textContent = "Grid size (px)";
    const gridInput = document.createElement("input");
    gridInput.type = "number";
    gridInput.min = "5";
    gridInput.max = "200";
    gridInput.step = "1";
    gridLabel.appendChild(gridInput);

    const ratioLabel = document.createElement("label");
    ratioLabel.textContent = "Simulation panel size (%)";
    const ratioInput = document.createElement("input");
    ratioInput.type = "number";
    ratioInput.min = "15";
    ratioInput.max = "70";
    ratioInput.step = "1";
    ratioLabel.appendChild(ratioInput);

    const accuracyLabel = document.createElement("label");
    accuracyLabel.textContent = "Displayed decimal places";
    const accuracyInput = document.createElement("select");
    [
        "Whole numbers",
        "Tenths",
        "Hundredths",
        "Thousandths",
        ...Array.from({ length: 7 }, (_, index) => `${index + 4} decimal places`),
    ].forEach((label, value) => {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = `${value}: ${label}`;
        accuracyInput.appendChild(option);
    });
    accuracyLabel.appendChild(accuracyInput);

    const inputsLabel = document.createElement("label");
    inputsLabel.textContent = "Simulation inputs (JSON object)";
    const inputsArea = document.createElement("textarea");
    inputsArea.spellcheck = false;
    inputsArea.className = "settings-inputs";
    inputsLabel.appendChild(inputsArea);

    const actions = document.createElement("div");
    actions.className = "program-editor-actions";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Defaults";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    actions.append(reset, cancel, save);

    form.append(title, ...checks.map((c) => c.label), gridLabel, ratioLabel, accuracyLabel, inputsLabel, error, actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    const fill = (values: Settings) => {
        checks.forEach(({ input, key }) => {
            input.checked = values[key];
        });
        gridInput.value = String(values.gridSize);
        ratioInput.value = String(Math.round(values.simulationRatio * 100));
        accuracyInput.value = String(values.valueAccuracy);
        inputsArea.value = JSON.stringify(values.inputs, null, 2);
        error.hidden = true;
    };

    button.addEventListener("click", () => {
        fill(settings);
        dialog.showModal();
    });
    reset.addEventListener("click", () => fill(defaultSettings));
    cancel.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        let inputs: unknown;
        try {
            inputs = inputsArea.value.trim() ? JSON.parse(inputsArea.value) : {};
        } catch {
            inputs = null;
        }
        if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
            error.textContent = "Inputs must be a JSON object, for example {\"count\": 3}.";
            error.hidden = false;
            return;
        }
        const gridSize = Number(gridInput.value);
        if (!Number.isFinite(gridSize) || gridSize < 5 || gridSize > 200) {
            error.textContent = "Grid size must be between 5 and 200.";
            error.hidden = false;
            return;
        }
        const simulationRatio = Number(ratioInput.value) / 100;
        if (!Number.isFinite(simulationRatio) || simulationRatio < 0.15 || simulationRatio > 0.7) {
            error.textContent = "Simulation panel size must be between 15% and 70%.";
            error.hidden = false;
            return;
        }
        applySettings({
            ...Object.fromEntries(checks.map(({ input, key }) => [key, input.checked])),
            gridSize,
            simulationRatio,
            valueAccuracy: Number(accuracyInput.value),
            inputs: inputs as Record<string, unknown>,
        });
        dialog.close();
    });

    return button;
}
