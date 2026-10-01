import { Shape } from "./shapes";
import { settings } from "./settings";

const MIN_ZOOM = 0.01;
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
        const bounds = Shape.getDiagramBounds();
        if (!bounds) return;
        const { x0, y0, x1, y1 } = bounds;
        const pad = 60;
        const width = Math.max(1, x1 - x0);
        const height = Math.max(1, y1 - y0);
        const zoom = Math.max(MIN_ZOOM, Math.min(1, (rect.width - pad * 2) / width, (rect.height - pad * 2) / height));
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

    const touchPoints = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; zoom: number } | null = null;
    let stopActivePan: (() => void) | null = null;

    document.addEventListener("pointermove", (event: PointerEvent) => {
        if (event.pointerType !== "touch" || !touchPoints.has(event.pointerId)) return;
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (!pinch || touchPoints.size < 2) return;
        const [first, second] = [...touchPoints.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const centerX = (first.x + second.x) / 2;
        const centerY = (first.y + second.y) / 2;
        if (distance > 0) zoomAt(pinch.zoom * distance / pinch.distance, centerX, centerY);
        event.preventDefault();
    }, { passive: false });

    const finishTouch = (event: PointerEvent) => {
        if (event.pointerType !== "touch" || !touchPoints.has(event.pointerId)) return;
        touchPoints.delete(event.pointerId);
        if (pinch) {
            pinch = null;
            touchPoints.clear();
        }
    };
    document.addEventListener("pointerup", finishTouch);
    document.addEventListener("pointercancel", finishTouch);

    chart.addEventListener("pointerdown", (event: PointerEvent) => {
        if (event.pointerType === "touch") {
            touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (touchPoints.size >= 2) {
                const [first, second] = [...touchPoints.values()];
                const distance = Math.hypot(second.x - first.x, second.y - first.y);
                const points = [...touchPoints.entries()];
                stopActivePan?.();
                stopActivePan = null;
                points.forEach(([pointerId]) => {
                    document.dispatchEvent(new PointerEvent("pointercancel", {
                        bubbles: true,
                        pointerId,
                        pointerType: "touch",
                        isPrimary: pointerId === event.pointerId,
                        button: -1,
                    }));
                });
                touchPoints.clear();
                points.forEach(([pointerId, point]) => touchPoints.set(pointerId, point));
                pinch = distance > 0 ? { distance, zoom: Shape.zoom } : null;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
        }
        const onBackground = event.target === chart || event.target === canvas;
        const touchBackgroundPan = event.pointerType === "touch" && (onBackground || Shape.readOnly);
        const wantsPan = event.button === 1 || (event.button === 0 && (spaceDown || touchBackgroundPan || (Shape.readOnly && onBackground)));
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
            stopActivePan = null;
        };
        stopActivePan = onUp;
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
