import { exportDiagramJson, importDiagramJson } from "./diagramFile";
import { Shape } from "./shapes";
import { applySettings, defaultSettings, settings } from "./settings";

const MAX_HISTORY = 100;

export function initProjectHistory(addShape: (shape: Shape) => Shape, fitView: () => void, onError: (message: string) => void) {
    const history = [exportDiagramJson(false)];
    let historyIndex = 0;
    let changeTimer = 0;
    let applyingHistory = false;
    let exportedSnapshot = history[0];
    const controls: HTMLButtonElement[] = [];

    try {
        localStorage.removeItem("flowcraft.local-project.v1");
    } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        onError(`Could not clear the previously saved local flowchart.${detail}`);
    }

    const markExported = () => {
        exportedSnapshot = exportDiagramJson(false);
    };
    const updateControls = () => {
        controls.forEach((button) => {
            button.hidden = settings.readOnly;
        });
        controls[0].disabled = historyIndex === 0;
        controls[1].disabled = historyIndex >= history.length - 1;
    };
    const commitCurrentState = () => {
        changeTimer = 0;
        if (applyingHistory) return;
        const snapshot = exportDiagramJson(false);
        if (snapshot !== history[historyIndex]) {
            history.splice(historyIndex + 1);
            history.push(snapshot);
            if (history.length > MAX_HISTORY) history.shift();
            historyIndex = history.length - 1;
            updateControls();
        }
    };
    const scheduleCommit = () => {
        if (applyingHistory) return;
        window.clearTimeout(changeTimer);
        changeTimer = window.setTimeout(commitCurrentState, 250);
    };

    const restore = (snapshot: string) => {
        window.clearTimeout(changeTimer);
        changeTimer = 0;
        applyingHistory = true;
        try {
            importDiagramJson(snapshot, addShape);
        } catch (error) {
            const detail = error instanceof Error ? error.message : "Could not restore the flowchart.";
            onError(detail);
            return false;
        } finally {
            applyingHistory = false;
        }
        return true;
    };
    const undo = () => {
        if (historyIndex === 0) return;
        const nextIndex = historyIndex - 1;
        if (restore(history[nextIndex])) {
            historyIndex = nextIndex;
            updateControls();
        }
    };
    const redo = () => {
        if (historyIndex >= history.length - 1) return;
        const nextIndex = historyIndex + 1;
        if (restore(history[nextIndex])) {
            historyIndex = nextIndex;
            updateControls();
        }
    };

    const makeButton = (label: string, title: string, action: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", action);
        controls.push(button);
        return button;
    };
    const undoButton = makeButton("Undo", "Undo (Ctrl+Z)", undo);
    const redoButton = makeButton("Redo", "Redo (Ctrl+Y or Ctrl+Shift+Z)", redo);
    updateControls();

    document.addEventListener("flowcraft:diagramchange", scheduleCommit);
    document.addEventListener("flowcraft:settings", scheduleCommit);
    document.addEventListener("flowcraft:settings", updateControls);
    document.addEventListener("keydown", (event) => {
        const target = event.target;
        if (target instanceof HTMLElement &&
            (target.isContentEditable || target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement || target.closest("dialog"))) {
            return;
        }
        if (settings.readOnly || !(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === "z") {
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        } else if (key === "y") {
            event.preventDefault();
            redo();
        }
    });
    window.addEventListener("beforeunload", (event) => {
        if (settings.readOnly || exportDiagramJson(false) === exportedSnapshot) return;
        event.preventDefault();
        event.returnValue = "";
    });

    const newProject = () => {
        if (!window.confirm("Start a new project? Unsaved changes will be lost. You can undo while this page remains open.")) {
            return false;
        }
        Shape.removeShapes([...Shape.all]);
        applySettings({ ...defaultSettings, inputs: {} });
        markExported();
        fitView();
        return true;
    };

    return { undoButton, redoButton, undo, redo, markExported, newProject };
}
