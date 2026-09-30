import { Shape } from "./shapes";
import { settings } from "./settings";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

export function initViewport(chart: HTMLElement, canvas: HTMLElement) {
    const controls = document.createElement("div");
    controls.className = "canvas-zoom";
    controls.setAttribute("aria-label", "Canvas zoom");
    const level = document.createElement("span");
    level.className = "canvas-zoom-level";

    const render = () => {
        canvas.style.transform = `translate(${Shape.panX}px, ${Shape.panY}px) scale(${Shape.zoom})`;
        level.textContent = `${Math.round(Shape.zoom * 100)}%`;
        const size = settings.gridSize * Shape.zoom;
        chart.style.backgroundImage = settings.showGrid ? "radial-gradient(circle, rgba(0,0,0,0.85) 1px, rgba(0,0,0,0) 1px)" : "none";
        chart.style.backgroundSize = `${size}px ${size}px`;
        chart.style.backgroundPosition = `${Shape.panX - size / 2}px ${Shape.panY - size / 2}px`;
    };

    const zoomAt = (zoom: number, clientX: number, clientY: number) => {
        const next = Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM));
        const rect = chart.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const worldX = (x - Shape.panX) / Shape.zoom;
        const worldY = (y - Shape.panY) / Shape.zoom;
        Shape.zoom = next;
        Shape.panX = x - worldX * next;
        Shape.panY = y - worldY * next;
        render();
    };

    const centreZoom = (zoom: number) => {
        const rect = chart.getBoundingClientRect();
        zoomAt(zoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    const fit = () => {
        const rect = chart.getBoundingClientRect();
        if (Shape.all.length === 0) {
            Shape.zoom = 1;
            Shape.panX = rect.width / 2;
            Shape.panY = rect.height / 2;
            render();
            return;
        }
        const x0 = Math.min(...Shape.all.map((s) => s.posX));
        const y0 = Math.min(...Shape.all.map((s) => s.posY));
        const x1 = Math.max(...Shape.all.map((s) => s.posX + s.getSize().x));
        const y1 = Math.max(...Shape.all.map((s) => s.posY + s.getSize().y));
        const pad = 60;
        const zoom = Math.max(MIN_ZOOM, Math.min(1, (rect.width - pad * 2) / (x1 - x0), (rect.height - pad * 2) / (y1 - y0)));
        Shape.zoom = zoom;
        Shape.panX = rect.width / 2 - ((x0 + x1) / 2) * zoom;
        Shape.panY = rect.height / 2 - ((y0 + y1) / 2) * zoom;
        render();
    };

    const button = (label: string, title: string, action: () => void) => {
        const element = document.createElement("button");
        element.type = "button";
        element.textContent = label;
        element.title = title;
        element.setAttribute("aria-label", title);
        element.addEventListener("click", action);
        controls.appendChild(element);
    };
    button("−", "Zoom out", () => centreZoom(Shape.zoom / 1.2));
    button("+", "Zoom in", () => centreZoom(Shape.zoom * 1.2));
    button("Reset", "Reset zoom", () => centreZoom(1));
    button("Fit", "Fit diagram to view", fit);
    controls.appendChild(level);
    document.body.appendChild(controls);

    chart.addEventListener("wheel", (event: WheelEvent) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
            zoomAt(Shape.zoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
            return;
        }
        Shape.panX -= event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
        Shape.panY -= event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
        render();
    }, { passive: false });

    let spaceDown = false;
    const typing = () => {
        const active = document.activeElement;
        return active instanceof HTMLElement && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
    };
    document.addEventListener("keydown", (event) => {
        if (event.code === "Space" && !typing()) {
            spaceDown = true;
            chart.classList.add("pan-ready");
            if (event.target === document.body) event.preventDefault();
        }
    });
    document.addEventListener("keyup", (event) => {
        if (event.code === "Space") {
            spaceDown = false;
            chart.classList.remove("pan-ready");
        }
    });
    window.addEventListener("blur", () => {
        spaceDown = false;
        chart.classList.remove("pan-ready");
    });

    chart.addEventListener("pointerdown", (event: PointerEvent) => {
        const onBackground = event.target === chart || event.target === canvas;
        const wantsPan = event.button === 1 || (event.button === 0 && (spaceDown || (Shape.readOnly && onBackground)));
        if (!wantsPan || Shape.pendingLink) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        const startX = event.clientX;
        const startY = event.clientY;
        const originX = Shape.panX;
        const originY = Shape.panY;
        chart.classList.add("panning");

        const onMove = (move: PointerEvent) => {
            Shape.panX = originX + move.clientX - startX;
            Shape.panY = originY + move.clientY - startY;
            render();
        };
        const onUp = () => {
            chart.classList.remove("panning");
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    }, true);

    document.addEventListener("flowcraft:settings", render);
    window.addEventListener("resize", render);

    const rect = chart.getBoundingClientRect();
    Shape.panX = rect.width / 2;
    Shape.panY = rect.height / 2;
    render();

    return { fit, render };
}
