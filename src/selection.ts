import { Shape } from "./shapes";

const DRAG_THRESHOLD = 3;

export function initSelection(chart: HTMLElement) {
    const box = document.createElement("div");
    box.className = "selection-box";
    document.body.appendChild(box);

    const page = (event: PointerEvent) => ({ x: event.clientX + window.scrollX, y: event.clientY + window.scrollY });

    const inside = (shape: Shape, r: { x0: number; y0: number; x1: number; y1: number }) => {
        const size = shape.getSize();
        const x0 = shape.posX;
        const y0 = shape.posY;
        const x1 = x0 + size.x;
        const y1 = y0 + size.y;
        return x0 >= r.x0 && x1 <= r.x1 && y0 >= r.y0 && y1 <= r.y1;
    };

    chart.addEventListener("pointerdown", (event: PointerEvent) => {

        if (event.button !== 0 || event.target !== chart || Shape.pendingLink) {
            return;
        }
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();

        const start = page(event);
        const additive = event.shiftKey;
        const base = additive ? new Set(Shape.selection) : new Set<Shape>();
        let dragging = false;

        if (!additive) {
            Shape.clearSelection();
        }

        const onMove = (moveEvent: PointerEvent) => {
            const now = page(moveEvent);
            if (!dragging && Math.hypot(now.x - start.x, now.y - start.y) < DRAG_THRESHOLD) {
                return;
            }
            dragging = true;

            const rect = { x0: Math.min(start.x, now.x), y0: Math.min(start.y, now.y), x1: Math.max(start.x, now.x), y1: Math.max(start.y, now.y) };
            box.style.display = "block";
            box.style.left = `${rect.x0}px`;
            box.style.top = `${rect.y0}px`;
            box.style.width = `${rect.x1 - rect.x0}px`;
            box.style.height = `${rect.y1 - rect.y0}px`;

            const picked = new Set(base);
            Shape.all.forEach((shape) => {
                if (inside(shape, rect)) {
                    picked.add(shape);
                }
            });
            Shape.setSelection(picked);
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            box.style.display = "none";
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    });

    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape" && !Shape.pendingLink) {
            Shape.clearSelection();
            return;
        }

        if ((event.key !== "Delete" && event.key !== "Backspace") || event.defaultPrevented || Shape.selection.size === 0) {
            return;
        }

        const active = document.activeElement;
        if (active instanceof HTMLElement && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) {
            return;
        }

        event.preventDefault();
        Shape.removeShapes(Shape.selection);
    });
}
