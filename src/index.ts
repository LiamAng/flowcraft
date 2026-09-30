import { Shape, Process, Decision, InputOutput, Terminator } from "./shapes";
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
        { key: 'terminator', label: 'Terminator' },
    ] as const;

    palette.innerHTML = '';

    tools.forEach((tool) => {
        const item = document.createElement('div');
        item.className = 'shape-tool';
        item.dataset.kind = tool.key;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.innerHTML = `
            <div class="mini-shape ${tool.key === 'input-output' ? 'io' : tool.key}">${tool.label}</div>
            <span class="shape-tool-label">${tool.label}</span>
        `;

        const activate = () => {
            selectedTool = tool.key;
            document.querySelectorAll('.shape-tool').forEach((node) => {
                node.classList.toggle('active', node === item);
            });
        };

        item.addEventListener('pointerdown', (event: PointerEvent) => {
            event.preventDefault();
            activate();

            const preview = document.createElement('div');
            preview.className = 'tool-preview';
            preview.innerHTML = `<div class="mini-shape ${tool.key === 'input-output' ? 'io' : tool.key}">${tool.label}</div>`;
            document.body.appendChild(preview);

            const move = (moveEvent: PointerEvent) => {
                preview.style.left = `${moveEvent.clientX}px`;
                preview.style.top = `${moveEvent.clientY}px`;
            };

            const drop = (upEvent: PointerEvent) => {
                const element = document.elementFromPoint(upEvent.clientX, upEvent.clientY) as Element | null;
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

                preview.remove();
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', drop);
            };

            move(event);
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', drop, { once: true });
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
void initDiagramIO(addShape, viewport.fit, autorun);
