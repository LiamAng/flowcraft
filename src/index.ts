import { Shape, Process, Decision, InputOutput, Initialization, Terminator } from "./shapes";
import { pickTerminatorType } from "./terminatorPicker";
import { pickInputOutputType } from "./inputOutputPicker";
import { initLinkPicker } from "./linkPicker";
import { initSelection } from "./selection";
import { initTooltip } from "./tooltip";
import { initFlowValidation } from "./flowValidation";
import { initDiagramIO } from "./diagramIO";
import { initSimulationPanel } from "./simulationPanel";
import { initViewport } from "./viewport";
import { applySettings, settings } from "./settings";

export const chart: HTMLElement = document.querySelector('.chart') as HTMLElement;
const canvas = document.createElement("div");
canvas.className = "chart-world";
chart.appendChild(canvas);
Shape.canvas = canvas;
const palette = document.getElementById('shape-palette') as HTMLDivElement;

applySettings(settings);

const heading = document.querySelector<HTMLElement>(".flowchart-heading");
const renderHeading = () => {
    if (!heading) return;
    heading.replaceChildren();
    if (settings.title) {
        const title = document.createElement("h1");
        title.textContent = settings.title;
        heading.appendChild(title);
    }
    if (settings.description) {
        const description = document.createElement("p");
        description.textContent = settings.description;
        heading.appendChild(description);
    }
    document.title = settings.title || "Flowcraft";
};
document.addEventListener("flowcraft:settings", renderHeading);
renderHeading();

const factoryMap = {
    process: () => new Process(),
    decision: () => new Decision(),
    'input-output': () => new InputOutput(),
    initialization: () => new Initialization(),
    terminator: () => new Terminator(),
} as const;

let selectedTool: keyof typeof factoryMap = 'process';

function addShape<T extends Shape>(shape: T): T {
    canvas.appendChild(shape.element);
    Shape.notifyDiagramChange();
    return shape;
}

function createShape(kind: keyof typeof factoryMap, x: number, y: number): Shape {
    const shape = factoryMap[kind]();
    shape.setCenter(x, y);
    return addShape(shape);
}

function renderPalette() {
    const tools = [
        { key: 'process', label: 'Process' },
        { key: 'decision', label: 'Decision' },
        { key: 'input-output', label: 'Input / Output' },
        { key: 'initialization', label: 'Initialization' },
        { key: 'terminator', label: 'Terminator' },
    ] as const;

    palette.innerHTML = '';
    const dock = document.createElement("div");
    dock.className = "palette-dock";
    const updatePaletteVisibility = () => {
        dock.hidden = Shape.readOnly;
        if (Shape.readOnly) {
            dock.classList.remove("palette-open");
            document.documentElement.classList.remove("palette-open");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Show shapes");
            toggle.title = "Show shapes";
        }
    };
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "palette-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Show shapes");
    toggle.title = "Show shapes";
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    toggle.addEventListener("click", () => {
        const open = dock.classList.toggle("palette-open");
        document.documentElement.classList.toggle("palette-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", `${open ? "Hide" : "Show"} shapes`);
        toggle.title = `${open ? "Hide" : "Show"} shapes`;
    });
    dock.append(toggle, palette);
    document.body.appendChild(dock);
    document.addEventListener("flowcraft:settings", updatePaletteVisibility);
    updatePaletteVisibility();

    tools.forEach((tool) => {
        const item = document.createElement('div');
        item.className = 'shape-tool';
        item.dataset.kind = tool.key;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute("aria-label", tool.label);
        item.title = tool.label;
        item.innerHTML = `<div class="mini-shape ${tool.key === 'input-output' ? 'io' : tool.key}"></div>`;

        const activate = () => {
            selectedTool = tool.key;
            document.querySelectorAll('.shape-tool').forEach((node) => {
                node.classList.toggle('active', node === item);
            });
        };

        item.addEventListener('pointerdown', (event: PointerEvent) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
            activate();

            const preview = document.createElement('div');
            preview.className = 'tool-preview';
            preview.innerHTML = `<div class="mini-shape ${tool.key === 'input-output' ? 'io' : tool.key}">${tool.label}</div>`;
            document.body.appendChild(preview);

            const move = (moveEvent: PointerEvent) => {
                if (moveEvent.pointerId !== event.pointerId) return;
                preview.style.left = `${moveEvent.clientX}px`;
                preview.style.top = `${moveEvent.clientY}px`;
            };

            const cleanup = () => {
                preview.remove();
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', drop);
                document.removeEventListener('pointercancel', cancel);
            };
            const cancel = (cancelEvent: PointerEvent) => {
                if (cancelEvent.pointerId === event.pointerId) cleanup();
            };
            const drop = (upEvent: PointerEvent) => {
                if (upEvent.pointerId !== event.pointerId) return;
                const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
                const chartTarget = element?.closest('.chart');
                const dropPoint = Shape.clientToCanvas(upEvent.clientX, upEvent.clientY);
                const dropX = dropPoint.x;
                const dropY = dropPoint.y;

                if (chartTarget === chart) {
                    if (tool.key === 'terminator') {
                        pickTerminatorType(upEvent.clientX, upEvent.clientY).then((type) => {
                            if (type) {
                                const shape = new Terminator(type);
                                shape.setCenter(dropX, dropY);
                                addShape(shape);
                            }
                        });
                    } else if (tool.key === 'input-output') {
                        pickInputOutputType(upEvent.clientX, upEvent.clientY).then((type) => {
                            if (type) {
                                const shape = new InputOutput(type);
                                shape.setCenter(dropX, dropY);
                                addShape(shape);
                            }
                        });
                    } else {
                        createShape(tool.key, dropX, dropY);
                    }
                }

                cleanup();
            };

            move(event);
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', drop);
            document.addEventListener('pointercancel', cancel);
        });

        item.addEventListener('click', () => activate());
        item.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
            }
        });

        palette.appendChild(item);
    });

    const active = palette.querySelector(`[data-kind="${selectedTool}"]`) as HTMLElement | null;
    active?.classList.add('active');
}

const viewport = initViewport(chart, canvas);
renderPalette();
initLinkPicker(chart, addShape);
initSelection(chart);
initTooltip();
initFlowValidation();
const autorun = initSimulationPanel();
const loadingScreen = document.querySelector<HTMLElement>(".app-loading");
const hideLoadingScreen = () => {
    if (!loadingScreen) return;
    loadingScreen.classList.add("is-hidden");
    window.setTimeout(() => loadingScreen.remove(), 250);
};
void initDiagramIO(addShape, viewport.fit, autorun).then(() => {
    void document.fonts.ready.then(() => {
        window.requestAnimationFrame(hideLoadingScreen);
    });
}).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Flowcraft could not finish loading.";
    if (loadingScreen) {
        loadingScreen.setAttribute("role", "alert");
        loadingScreen.replaceChildren(document.createTextNode(message));
    }
    console.error("Flowcraft initialization failed.", error);
});
