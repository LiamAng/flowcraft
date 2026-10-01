import { Shape } from "./shapes";
import { settings } from "./settings";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const WHEEL_ZOOM_SENSITIVITY = 0.0025;

export function initViewport(chart: HTMLElement, canvas: HTMLElement) {
    const controls = document.createElement("div");
    controls.className = "canvas-zoom";
    controls.setAttribute("aria-label", "Canvas zoom");
    const level = document.createElement("span");
    level.className = "canvas-zoom-level";

    const render = () => {
        canvas.style.transform = `translate(${Shape.panX}px, ${Shape.panY}px) scale(${Shape.zoom})`;
        canvas.style.setProperty("--ui-inverse-zoom", String(1 / Shape.zoom));
        canvas.style.setProperty("--ui-offset-18", `${18 / Shape.zoom}px`);
        canvas.style.setProperty("--ui-offset-negative-18", `${-18 / Shape.zoom}px`);
        canvas.style.setProperty("--ui-offset-negative-40", `${-40 / Shape.zoom}px`);
        level.textContent = `${Math.round(Shape.zoom * 100)}%`;
        const size = settings.gridSize * Shape.zoom;
        const dotRadius = Math.max(0.35, Shape.zoom);
        chart.style.backgroundImage = settings.showGrid
            ? `radial-gradient(circle, rgba(0,0,0,0.85) ${dotRadius}px, rgba(0,0,0,0) ${dotRadius}px)`
            : "none";
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

    let targetWheelZoom = Shape.zoom;
    let wheelZoomCenter = { x: 0, y: 0 };
    let wheelZoomFrame = 0;
    let targetWheelPan = { x: Shape.panX, y: Shape.panY };
    let wheelPanFrame = 0;
    const stopWheelPan = () => {
        if (wheelPanFrame) window.cancelAnimationFrame(wheelPanFrame);
        wheelPanFrame = 0;
        targetWheelPan = { x: Shape.panX, y: Shape.panY };
    };
    const stopWheelZoom = () => {
        if (wheelZoomFrame) window.cancelAnimationFrame(wheelZoomFrame);
        wheelZoomFrame = 0;
        targetWheelZoom = Shape.zoom;
    };
    const animateWheelPan = () => {
        const remainingX = targetWheelPan.x - Shape.panX;
        const remainingY = targetWheelPan.y - Shape.panY;
        if (Math.hypot(remainingX, remainingY) < 0.35) {
            Shape.panX = targetWheelPan.x;
            Shape.panY = targetWheelPan.y;
            wheelPanFrame = 0;
            render();
            return;
        }
        Shape.panX += remainingX * 0.22;
        Shape.panY += remainingY * 0.22;
        render();
        wheelPanFrame = window.requestAnimationFrame(animateWheelPan);
    };
    const centreZoom = (zoom: number) => {
        stopWheelPan();
        stopWheelZoom();
        targetWheelZoom = zoom;
        const rect = chart.getBoundingClientRect();
        zoomAt(zoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    const animateWheelZoom = () => {
        const remaining = targetWheelZoom - Shape.zoom;
        if (Math.abs(remaining) < 0.001) {
            zoomAt(targetWheelZoom, wheelZoomCenter.x, wheelZoomCenter.y);
            wheelZoomFrame = 0;
            return;
        }
        zoomAt(Shape.zoom + remaining * 0.2, wheelZoomCenter.x, wheelZoomCenter.y);
        wheelZoomFrame = window.requestAnimationFrame(animateWheelZoom);
    };

    const fit = () => {
        stopWheelPan();
        stopWheelZoom();
        const rect = chart.getBoundingClientRect();
        if (Shape.all.length === 0) {
            Shape.zoom = 1;
            targetWheelZoom = Shape.zoom;
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
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (rect.width - pad * 2) / width, (rect.height - pad * 2) / height));
        Shape.zoom = zoom;
        targetWheelZoom = zoom;
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
            stopWheelPan();
            const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? chart.clientHeight
                : 1;
            wheelZoomCenter = { x: event.clientX, y: event.clientY };
            if (wheelZoomFrame === 0) targetWheelZoom = Shape.zoom;
            targetWheelZoom = Math.max(
                MIN_ZOOM,
                Math.min(targetWheelZoom * Math.exp(-event.deltaY * deltaScale * WHEEL_ZOOM_SENSITIVITY), MAX_ZOOM)
            );
            if (wheelZoomFrame === 0) {
                wheelZoomFrame = window.requestAnimationFrame(animateWheelZoom);
            }
            return;
        }
        stopWheelZoom();
        if (wheelPanFrame === 0) {
            targetWheelPan = { x: Shape.panX, y: Shape.panY };
        }
        const panX = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
        const panY = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
        targetWheelPan.x -= panX;
        targetWheelPan.y -= panY;
        if (wheelPanFrame === 0) {
            wheelPanFrame = window.requestAnimationFrame(animateWheelPan);
        }
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
                stopWheelPan();
                stopWheelZoom();
                return;
            }
        }
        const onBackground = event.target === chart || event.target === canvas;
        const touchBackgroundPan = event.pointerType === "touch" && (onBackground || Shape.readOnly);
        const wantsPan = event.button === 1 || (event.button === 0 && (spaceDown || touchBackgroundPan || (Shape.readOnly && onBackground)));
        if (!wantsPan || Shape.pendingLink) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        stopWheelPan();
        stopWheelZoom();

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
