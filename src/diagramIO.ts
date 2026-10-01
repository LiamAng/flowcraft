import { downloadDiagram, importDiagramJson } from "./diagramFile";
import { Shape } from "./shapes";
import { initSettingsPanel } from "./settingsPanel";
import { initProjectHistory } from "./projectHistory";

export async function initDiagramIO(
    addShape: (shape: Shape) => Shape,
    fitView: () => void,
    onImport: () => void
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
    const settingsButton = initSettingsPanel({
        exportDiagram: downloadDiagram,
        importDiagram: () => fileInput.click(),
        newProject: history.newProject,
    });
    settingsButton.hidden = new URLSearchParams(window.location.search).has("hideSettings");
    tools.append(history.undoButton, history.redoButton, settingsButton, fileInput);

    tools.appendChild(status);
    document.body.appendChild(tools);

    const url = new URLSearchParams(window.location.search).get("url");
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
