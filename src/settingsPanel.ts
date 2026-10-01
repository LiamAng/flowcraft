import { applySettings, defaultSettings, settings, type Settings } from "./settings";

export function initSettingsPanel(fileActions: { exportDiagram: () => void; exportImage: () => void; importDiagram: () => void; newProject: () => boolean }): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Settings";

    const dialog = document.createElement("dialog");
    dialog.className = "program-editor settings-dialog";
    const form = document.createElement("form");
    const title = document.createElement("h2");
    title.textContent = "Settings";
    const chartTitleLabel = document.createElement("label");
    chartTitleLabel.textContent = "Flowchart title";
    const chartTitleInput = document.createElement("input");
    chartTitleInput.type = "text";
    chartTitleInput.maxLength = 120;
    chartTitleInput.placeholder = "Untitled flowchart";
    chartTitleLabel.appendChild(chartTitleInput);

    const descriptionLabel = document.createElement("label");
    descriptionLabel.textContent = "Description";
    const descriptionInput = document.createElement("textarea");
    descriptionInput.className = "settings-description";
    descriptionInput.maxLength = 500;
    descriptionInput.rows = 3;
    descriptionLabel.appendChild(descriptionInput);

    const branchLabelsLabel = document.createElement("label");
    branchLabelsLabel.textContent = "Decision flowline labels";
    const branchLabelsSelect = document.createElement("select");
    [
        { value: "yes-no", text: "Yes / No" },
        { value: "true-false", text: "True / False" },
    ].forEach(({ value, text }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        branchLabelsSelect.appendChild(option);
    });
    branchLabelsLabel.appendChild(branchLabelsSelect);
    const error = document.createElement("p");
    error.className = "settings-error";
    error.hidden = true;

    const checkbox = (key: "snap" | "guides" | "showGrid" | "readOnly" | "showSteps" | "showStepNumbers" | "showShapeContentInSteps" | "processContentAsCode" | "compressSimulationTable" | "collapseConsecutiveConditions" | "collapseOtherSteps" | "autorun", text: string) => {
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
        checkbox("showStepNumbers", "Show step numbers in simulation"),
        checkbox("showShapeContentInSteps", "Show shape content instead of step numbers"),
        checkbox("processContentAsCode", "Use Process shape content as code"),
        checkbox("compressSimulationTable", "Compress unchanged simulation steps"),
        checkbox("collapseConsecutiveConditions", "Collapse consecutive conditions into one row"),
        checkbox("collapseOtherSteps", "Collapse consecutive input/output steps into one row"),
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

    const stepContentWidthLabel = document.createElement("label");
    stepContentWidthLabel.textContent = "Simulation step content max width (px)";
    const stepContentWidthInput = document.createElement("input");
    stepContentWidthInput.type = "number";
    stepContentWidthInput.min = "80";
    stepContentWidthInput.max = "600";
    stepContentWidthInput.step = "10";
    stepContentWidthLabel.appendChild(stepContentWidthInput);

    const speedLabel = document.createElement("label");
    speedLabel.textContent = "Simulation speed";
    const speedInput = document.createElement("select");
    [
        { delay: 0, label: "Instant" },
        { delay: 50, label: "Very fast" },
        { delay: 100, label: "Fast" },
        { delay: 250, label: "Normal" },
        { delay: 500, label: "Slow" },
    ].forEach(({ delay, label }) => {
        const option = document.createElement("option");
        option.value = String(delay);
        option.textContent = label;
        speedInput.appendChild(option);
    });
    speedLabel.appendChild(speedInput);

    const inputsLabel = document.createElement("div");
    inputsLabel.className = "settings-variable-section";
    const inputsHeading = document.createElement("strong");
    inputsHeading.textContent = "Simulation inputs";
    const inputsArea = document.createElement("div");
    inputsArea.className = "settings-variable-list";
    const addInput = document.createElement("button");
    addInput.type = "button";
    addInput.textContent = "Add input";
    const inputRows: Array<{ row: HTMLDivElement; name: HTMLInputElement; type: HTMLSelectElement; values: HTMLInputElement[] }> = [];
    const addInputRow = (nameValue = "", rawValue: unknown = "") => {
        const row = document.createElement("div");
        row.className = "settings-variable-row";
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
        const valueList = document.createElement("div");
        valueList.className = "settings-input-values";
        const values: HTMLInputElement[] = [];
        const addValue = (raw: unknown = "") => {
            const entry = document.createElement("div");
            entry.className = "settings-input-value";
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
            valueList.appendChild(entry);
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
        row.append(name, type, remove, valueList, addValueButton);
        inputsArea.appendChild(row);
        inputRows.push({ row, name, type, values });
    };
    addInput.addEventListener("click", () => addInputRow());
    inputsLabel.append(inputsHeading, inputsArea, addInput);

    const actionBar = document.createElement("div");
    actionBar.className = "program-editor-actions";
    const newProjectButton = document.createElement("button");
    newProjectButton.type = "button";
    newProjectButton.textContent = "New project";
    newProjectButton.addEventListener("click", () => {
        if (fileActions.newProject()) dialog.close();
    });
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export";
    exportButton.addEventListener("click", fileActions.exportDiagram);
    const exportImageButton = document.createElement("button");
    exportImageButton.type = "button";
    exportImageButton.textContent = "Export as image";
    exportImageButton.addEventListener("click", () => {
        dialog.close();
        fileActions.exportImage();
    });
    const importButton = document.createElement("button");
    importButton.type = "button";
    importButton.textContent = "Import";
    importButton.addEventListener("click", () => {
        dialog.close();
        fileActions.importDiagram();
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Defaults";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    actionBar.append(newProjectButton, exportButton, exportImageButton, importButton, reset, cancel, save);

    form.append(title, chartTitleLabel, descriptionLabel, branchLabelsLabel, ...checks.map((c) => c.label), gridLabel, ratioLabel, accuracyLabel, stepContentWidthLabel, speedLabel, inputsLabel, error, actionBar);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    const fill = (values: Settings) => {
        chartTitleInput.value = values.title;
        descriptionInput.value = values.description;
        branchLabelsSelect.value = values.decisionBranchLabels;
        checks.forEach(({ input, key }) => {
            input.checked = values[key];
        });
        gridInput.value = String(values.gridSize);
        ratioInput.value = String(Math.round(values.simulationRatio * 100));
        accuracyInput.value = String(values.valueAccuracy);
        stepContentWidthInput.value = String(values.simulationStepContentMaxWidth);
        speedInput.value = String(values.simulationStepDelay);
        inputsArea.replaceChildren();
        inputRows.length = 0;
        Object.entries(values.inputs).forEach(([name, value]) => addInputRow(name, value));
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
        const simulationStepContentMaxWidth = Number(stepContentWidthInput.value);
        if (!Number.isFinite(simulationStepContentMaxWidth) || simulationStepContentMaxWidth < 80 || simulationStepContentMaxWidth > 600) {
            error.textContent = "Simulation step content max width must be between 80 and 600 pixels.";
            error.hidden = false;
            stepContentWidthInput.focus();
            return;
        }
        applySettings({
            title: chartTitleInput.value.trim(),
            description: descriptionInput.value.trim(),
            decisionBranchLabels: branchLabelsSelect.value as Settings["decisionBranchLabels"],
            ...Object.fromEntries(checks.map(({ input, key }) => [key, input.checked])),
            gridSize,
            simulationRatio,
            simulationStepContentMaxWidth,
            valueAccuracy: Number(accuracyInput.value),
            simulationStepDelay: Number(speedInput.value),
            inputs,
        });
        dialog.close();
    });

    return button;
}
