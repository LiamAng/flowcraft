import { exportDiagramJson, importDiagramJson } from "./diagramFile";
import { Shape } from "./shapes";
import { applySettings, defaultSettings, settings } from "./settings";

const STORAGE_KEY = "flowcraft.local-project.v1";
const MAX_HISTORY = 100;

export function initProjectHistory(addShape: (shape: Shape) => Shape, fitView: () => void, onError: (message: string) => void) {
    const history = [exportDiagramJson(false)];
    let historyIndex = 0;
    let changeTimer = 0;
    let applyingHistory = false;
    const controls: HTMLButtonElement[] = [];

    const updateControls = () => {
        controls.forEach((button) => {
            button.hidden = settings.readOnly;
        });
        controls[0].disabled = historyIndex === 0;
        controls[1].disabled = historyIndex >= history.length - 1;
    };
    const saveLocally = (snapshot = exportDiagramJson(false)) => {
        try {
            localStorage.setItem(STORAGE_KEY, snapshot);
        } catch (error) {
            const detail = error instanceof Error ? ` ${error.message}` : "";
            onError(`Could not save the flowchart locally.${detail}`);
        }
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
        saveLocally(snapshot);
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
        saveLocally(snapshot);
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
    window.addEventListener("pagehide", () => {
        window.clearTimeout(changeTimer);
        saveLocally();
    });

    const loadLocalProject = () => {
        let snapshot: string | null;
        try {
            snapshot = localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            const detail = error instanceof Error ? ` ${error.message}` : "";
            onError(`Could not read the locally saved flowchart.${detail}`);
            return false;
        }
        if (!snapshot) return false;
        applyingHistory = true;
        try {
            importDiagramJson(snapshot, addShape);
            fitView();
            history[0] = exportDiagramJson(false);
            historyIndex = 0;
            updateControls();
            return true;
        } catch (error) {
            const detail = error instanceof Error ? error.message : "The locally saved flowchart is invalid.";
            onError(`Could not restore the locally saved flowchart. ${detail}`);
            return false;
        } finally {
            applyingHistory = false;
        }
    };

    const newProject = () => {
        if (!window.confirm("Start a new project? Your current flowchart is saved locally and can be restored with Undo.")) {
            return false;
        }
        Shape.removeShapes([...Shape.all]);
        applySettings({ ...defaultSettings, inputs: {} });
        fitView();
        return true;
    };

    return { undoButton, redoButton, undo, redo, loadLocalProject, newProject };
}
