import { downloadDiagram, importDiagramJson } from "./diagramFile";
import { Shape } from "./shapes";

export async function initDiagramIO(addShape: (shape: Shape) => Shape): Promise<boolean> {
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

    if (Shape.readOnly) {
        const badge = document.createElement("span");
        badge.className = "readonly-badge";
        badge.textContent = "Read only";
        tools.appendChild(badge);
    } else {
        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.textContent = "Export";
        exportButton.addEventListener("click", downloadDiagram);

        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.textContent = "Import";

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
                status.hidden = true;
            } catch (error) {
                report(error instanceof Error ? error.message : "Could not import the flowchart file.", true);
            }
        });
        importButton.addEventListener("click", () => fileInput.click());
        tools.append(exportButton, importButton, fileInput);
    }

    tools.appendChild(status);
    document.body.appendChild(tools);

    const url = new URLSearchParams(window.location.search).get("url");
    if (!url) return true;

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
        status.hidden = true;
        return true;
    } catch (error) {
        report(error instanceof Error ? error.message : "Could not load flowchart from the URL.", true);
        return false;
    }
}
