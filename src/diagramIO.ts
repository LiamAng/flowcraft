import { downloadDiagram, downloadDiagramImage, exportDiagramJson, importDiagramJson, type SimulationExportData } from "./diagramFile";
import { InputOutput, Shape } from "./shapes";
import { initSettingsPanel } from "./settingsPanel";
import { initProjectHistory } from "./projectHistory";
import { settings } from "./settings";
import { createShareUrl, isShareUrl, readShareUrl } from "./shareLink";

export async function initDiagramIO(
    addShape: (shape: Shape) => Shape,
    fitView: () => void,
    onImport: () => void,
    runSimulationForExport: (onProgress: (message: string) => void) => Promise<boolean>
): Promise<boolean> {
    const tools = document.createElement("div");
    tools.className = "diagram-file-tools";

    const status = document.createElement("div");
    status.className = "diagram-file-status";
    status.hidden = true;
    status.setAttribute("role", "status");

    const report = (message: string, error = false) => {
        status.textContent = message;
        status.classList.toggle("error", error);
        status.hidden = false;
    };
    const reportProgress = (message: string, percent?: number) => {
        status.replaceChildren(document.createTextNode(message));
        const progress = document.createElement("progress");
        progress.setAttribute("aria-label", "Image export progress");
        if (percent === undefined) {
            progress.removeAttribute("value");
        } else {
            progress.max = 100;
            progress.value = percent;
        }
        status.appendChild(progress);
        status.classList.remove("error");
        status.hidden = false;
    };
    const history = initProjectHistory(addShape, fitView, (message) => report(message, true));

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) {
            return;
        }
        try {
            importDiagramJson(await file.text(), addShape);
            fitView();
            status.hidden = true;
            onImport();
        } catch (error) {
            report(error instanceof Error ? error.message : "Could not import the flowchart file.", true);
        }
    });
    const shareDialog = document.createElement("dialog");
    shareDialog.className = "program-editor share-link-dialog";
    const shareForm = document.createElement("form");
    const shareTitle = document.createElement("h2");
    shareTitle.textContent = "Share flowchart";
    const shareHelp = document.createElement("p");
    shareHelp.className = "program-editor-help";
    shareHelp.textContent = "Anyone with this link can open the complete flowchart. Large links may not be accepted by every app.";
    const shareField = document.createElement("textarea");
    shareField.readOnly = true;
    shareField.rows = 4;
    shareField.setAttribute("aria-label", "Share link");
    const shareActions = document.createElement("div");
    shareActions.className = "program-editor-actions";
    const closeShare = document.createElement("button");
    closeShare.type = "button";
    closeShare.textContent = "Close";
    closeShare.addEventListener("click", () => shareDialog.close());
    const copyShare = document.createElement("button");
    copyShare.type = "button";
    copyShare.textContent = "Copy link";
    copyShare.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(shareField.value);
            report("Share link copied.");
        } catch {
            shareField.focus();
            shareField.select();
            report("Clipboard access is unavailable. The link is selected so you can copy it manually.", true);
        }
    });
    shareActions.append(closeShare, copyShare);
    shareForm.append(shareTitle, shareHelp, shareField, shareActions);
    shareDialog.appendChild(shareForm);
    document.body.appendChild(shareDialog);
    const shareLink = async () => {
        try {
            shareField.value = await createShareUrl(exportDiagramJson(false));
            shareDialog.showModal();
            shareField.focus();
            shareField.select();
            try {
                await navigator.clipboard.writeText(shareField.value);
                report("Share link copied.");
            } catch {
                report("Select and copy the link to share this flowchart.");
            }
        } catch (error) {
            report(error instanceof Error ? error.message : "Could not create a share link.", true);
        }
    };
    const settingsButton = initSettingsPanel({
        exportDiagram: downloadDiagram,
        exportImage: async () => {
            const inputNames = Shape.all
                .filter((shape): shape is InputOutput => shape instanceof InputOutput && shape.inputOutputType === "input")
                .flatMap((shape) => shape.variables.length > 0
                    ? shape.variables.map(({ name }) => name)
                    : shape.programCode.split(",").map((name) => name.trim()).filter(Boolean));
            const missingInputs = [...new Set(inputNames.filter((name) => {
                if (!Object.prototype.hasOwnProperty.call(settings.inputs, name)) return true;
                const values = settings.inputs[name];
                return Array.isArray(values) && values.length === 0;
            }))];
            if (missingInputs.length > 0 && !window.confirm(
                `Some simulation inputs are not predefined (${missingInputs.join(", ")}). ` +
                "Image export will run the flowchart first. Enter the requested values as the simulation reaches each input, and leave the dialogs open until image generation finishes. Continue?"
            )) {
                report("Image export cancelled.");
                return;
            }

            reportProgress("Running flowchart before image generation…");
            const finished = await runSimulationForExport((message) => reportProgress(message));
            if (!finished) {
                report("Image export cancelled because the simulation did not finish.", true);
                return;
            }
            const table = document.querySelector<HTMLTableElement>(".simulation-table");
            const tableRows = table ? [...table.querySelectorAll("tr")] : [];
            const headers = tableRows[0]
                ? [...tableRows[0].querySelectorAll("th,td")].map((cell) => cell.textContent?.trim() ?? "")
                : [];
            const rows = tableRows.slice(1).map((row) => ({
                cells: [...row.querySelectorAll("th,td")].map((cell) => ({
                    text: cell.textContent?.trim() ?? "",
                    ...(cell instanceof HTMLElement && cell.style.backgroundColor
                        ? { background: cell.style.backgroundColor }
                        : {}),
                })),
            }));
            const wholeOutput = document.querySelector<HTMLElement>(".simulation-output-content");
            const simulation: SimulationExportData = {
                headers,
                rows,
                wholeOutput: wholeOutput?.textContent?.trim() || "No output yet.",
                ...(settings.showShapeContentInSteps
                    ? { stepContentMaxWidth: settings.simulationStepContentMaxWidth }
                    : {}),
            };
            try {
                await downloadDiagramImage(simulation, (percent, message) => reportProgress(message, percent));
            } catch (error) {
                report(error instanceof Error ? error.message : "Could not export the flowchart image.", true);
            }
        },
        importDiagram: () => fileInput.click(),
        shareLink,
        newProject: history.newProject,
    });
    settingsButton.hidden = new URLSearchParams(window.location.search).has("hideSettings") ||
        isShareUrl(window.location.hash);
    tools.append(history.undoButton, history.redoButton, settingsButton, fileInput);

    tools.appendChild(status);
    document.body.appendChild(tools);

    const url = new URLSearchParams(window.location.search).get("url");
    try {
        const sharedJson = await readShareUrl(window.location.hash);
        if (sharedJson !== null) {
            importDiagramJson(sharedJson, addShape);
            fitView();
            status.hidden = true;
            onImport();
            return true;
        }
    } catch (error) {
        report(error instanceof Error ? error.message : "Could not load the shared flowchart.", true);
        return false;
    }
    if (!url) {
        history.loadLocalProject();
        fitView();
        onImport();
        return true;
    }

    try {
        const source = new URL(url, window.location.href);
        if (source.protocol !== "http:" && source.protocol !== "https:") {
            throw new Error("Flowchart URLs must use HTTP or HTTPS.");
        }
        report("Loading flowchart…");
        const response = await fetch(source);
        if (!response.ok) {
            throw new Error(`Could not load flowchart (${response.status} ${response.statusText}).`);
        }
        importDiagramJson(await response.text(), addShape);
        fitView();
        status.hidden = true;
        onImport();
        return true;
    } catch (error) {
        report(error instanceof Error ? error.message : "Could not load flowchart from the URL.", true);
        return false;
    }
}
