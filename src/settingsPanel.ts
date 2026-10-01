import { applySettings, defaultSettings, settings, type Settings } from "./settings";

export function initSettingsPanel(fileActions: { exportDiagram: () => void; exportImage: () => void; importDiagram: () => void; shareLink: () => void; newProject: () => boolean }): HTMLButtonElement {
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

    const checkbox = (key: "snap" | "snapResizeToGrid" | "guides" | "showGrid" | "readOnly" | "showSteps" | "showStepNumbers" | "showShapeContentInSteps" | "processContentAsCode" | "setShapeContentBasedOnProgram" | "compressSimulationTable" | "collapseConsecutiveConditions" | "collapseOtherSteps" | "autorun", text: string) => {
        const label = document.createElement("label");
        label.className = "settings-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        label.append(input, document.createTextNode(text));
        return { label, input, key };
    };

    const checks = [
        checkbox("snap", "Snap to grid"),
        checkbox("snapResizeToGrid", "Snap resized shapes to grid"),
        checkbox("guides", "Snap to other shapes and show alignment guides"),
        checkbox("showGrid", "Show grid"),
        checkbox("showSteps", "Highlight the active flowline during simulation"),
        checkbox("showStepNumbers", "Show step numbers in simulation"),
        checkbox("showShapeContentInSteps", "Show shape content in the simulation table instead of step numbers"),
        checkbox("processContentAsCode", "Run Process shape text as code"),
        checkbox("setShapeContentBasedOnProgram", "Automatically generate shape content from program"),
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
    const shareButton = document.createElement("button");
    shareButton.type = "button";
    shareButton.textContent = "Share link";
    shareButton.addEventListener("click", () => {
        dialog.close();
        fileActions.shareLink();
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
    actionBar.append(newProjectButton, exportButton, exportImageButton, importButton, shareButton, reset, cancel, save);

    form.append(title, chartTitleLabel, descriptionLabel, branchLabelsLabel, ...checks.map((c) => c.label), gridLabel, ratioLabel, accuracyLabel, stepContentWidthLabel, speedLabel, error, actionBar);
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
        });
        dialog.close();
    });

    return button;
}
