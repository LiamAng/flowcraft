export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type LinkDirection = "n" | "s" | "e" | "w";

export type LinkRecord = {
    from: Shape;
    to: Shape;
    direction: LinkDirection;
    label: string;
};

export class Shape {
    public static readonly MIN_DRAG = 20;
    public static readonly MAX_SIZE = 20000;
    public static pendingLink: { source: Shape; direction: LinkDirection } | null = null;
    public static connections: LinkRecord[] = [];
    public static linkLayer: SVGSVGElement | null = null;
    public static labelLayer: HTMLDivElement | null = null;

    public element: HTMLElement;
    public content: HTMLElement;
    public posX = 0;
    public posY = 0;
    public outgoingLinks: Array<{ direction: LinkDirection; label: string; to: Shape }> = [];

    protected draggable = true;
    protected dragOffsetX = 0;
    protected dragOffsetY = 0;
    protected minWidth = 80;
    protected minHeight = 80;
    protected ratio = 1;
    protected width = 80;
    protected height = 80;
    protected isDragging = false;

    protected getResizeDirections(): ResizeDirection[] {
        return ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
    }

    protected getVerticalPadding(): number {
        return 0;
    }

    protected shouldKeepWidthFixedOnVerticalResize(): boolean {
        return false;
    }

    protected applyDimensionPadding() {
        const pad = this.getVerticalPadding();
        if (pad > 0) {
            this.content.style.paddingTop = `${pad}px`;
            this.content.style.paddingBottom = `${pad}px`;
            return;
        }

        this.content.style.paddingTop = "";
        this.content.style.paddingBottom = "";
    }

    protected constrainResize(nextWidth: number, nextHeight: number, startHeight: number, startWidth: number): { width: number; height: number } {
        if (this.contentHeightFor(nextWidth) > startHeight) {
            nextWidth = Math.max(nextWidth, this.minWidthForHeight(startHeight, nextWidth));
        }

        if (this.contentHeightFor(startWidth) > nextHeight) {
            nextHeight = Math.max(nextHeight, this.contentHeightFor(startWidth));
        }

        return { width: nextWidth, height: nextHeight };
    }

    getSize(): { x: number; y: number } {
        return { x: this.width, y: this.height };
    }

    setDraggable(draggable: boolean) {
        this.draggable = draggable;
    }

    protected apply() {
        const chart = document.querySelector(".chart") as HTMLElement | null;
        const bounds = chart ?? document.body;

        this.element.style.left = `${this.posX}px`;
        this.element.style.top = `${this.posY}px`;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
        this.applyDimensionPadding();

        if (this.content.classList.contains("diamond")) {
            this.content.style.clipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
        }

        const maxX = bounds.clientWidth - this.width;
        const maxY = bounds.clientHeight - this.height;
        this.posX = Math.max(0, Math.min(this.posX, maxX));
        this.posY = Math.max(0, Math.min(this.posY, maxY));
        Shape.renderConnections();
    }

    protected contentHeightFor(width: number): number {
        const previousPaddingTop = this.content.style.paddingTop;
        const previousPaddingBottom = this.content.style.paddingBottom;

        this.element.style.width = `${width}px`;
        this.element.style.height = "0px";
        this.content.style.justifyContent = "flex-start";
        this.applyDimensionPadding();

        const needed = Math.ceil(this.content.scrollHeight);

        this.content.style.justifyContent = "";
        this.content.style.paddingTop = previousPaddingTop;
        this.content.style.paddingBottom = previousPaddingBottom;

        return needed;
    }

    protected clampPosition(value: number, size: number): number {
        const chart = document.querySelector(".chart") as HTMLElement | null;
        const bounds = chart ?? document.body;
        return Math.max(0, Math.min(value, bounds.clientWidth - size));
    }

    protected updateResizeHandles() {
        const supported = this.getResizeDirections();

        this.element.querySelectorAll<HTMLElement>(".handle").forEach((handle) => {
            const dir = handle.dataset.dir ?? "";
            handle.style.display = supported.includes(dir as ResizeDirection) ? "" : "none";
        });
    }

    protected updateLinkHandles() {
        this.element.querySelectorAll<HTMLButtonElement>(".link-handle").forEach((handle) => {
            const dir = handle.dataset.linkDir as LinkDirection | undefined;
            if (!dir) {
                handle.style.display = "none";
                return;
            }

            const used = this.outgoingLinks.some((link) => link.direction === dir);
            handle.style.display = used ? "none" : "";
        });
    }

    protected getLinkDirections(): LinkDirection[] {
        return ["n", "s", "e", "w"];
    }

    protected getLinkLimit(): number {
        return 1;
    }

    protected getOutgoingLinkCount(): number {
        return this.outgoingLinks.length;
    }

    protected canAcceptLink(): boolean {
        return this.getOutgoingLinkCount() < this.getLinkLimit();
    }

    protected connectTo(target: Shape, direction: LinkDirection, label: string) {
        if (this === target || !this.canAcceptLink()) {
            return;
        }

        const existing = Shape.connections.some((link) => link.from === this && link.direction === direction);
        if (existing) {
            return;
        }

        const record: LinkRecord = { from: this, to: target, direction, label };
        Shape.connections.push(record);
        this.outgoingLinks.push({ direction, label, to: target });
        this.updateLinkHandles();
        Shape.renderConnections();
    }

    protected onLink(direction: LinkDirection) {
        if (Shape.pendingLink && Shape.pendingLink.source !== this) {
            const pending = Shape.pendingLink;
            pending.source.connectTo(this, pending.direction, "");
            Shape.pendingLink = null;
            this.element.classList.remove("linking");
            return;
        }

        if (this.getOutgoingLinkCount() >= this.getLinkLimit()) {
            return;
        }

        if (this.outgoingLinks.some((link) => link.direction === direction)) {
            return;
        }

        Shape.pendingLink = { source: this, direction };
        this.element.classList.add("linking");
    }

    protected static getOppositeDirection(direction: LinkDirection): LinkDirection {
        if (direction === "n") {
            return "s";
        }
        if (direction === "s") {
            return "n";
        }
        if (direction === "w") {
            return "e";
        }
        return "w";
    }

    protected static getLinkAnchor(shape: Shape, direction: LinkDirection): { x: number; y: number } {
        const centerX = shape.posX + shape.width / 2;
        const centerY = shape.posY + shape.height / 2;

        if (direction === "n") {
            return { x: centerX, y: shape.posY };
        }
        if (direction === "s") {
            return { x: centerX, y: shape.posY + shape.height };
        }
        if (direction === "w") {
            return { x: shape.posX, y: centerY };
        }
        return { x: shape.posX + shape.width, y: centerY };
    }

    protected static getLinkEndpoint(shape: Shape, direction: LinkDirection): { x: number; y: number } {
        const anchor = Shape.getLinkAnchor(shape, direction);
        const offset = 8;

        if (direction === "n") {
            return { x: anchor.x, y: anchor.y - offset };
        }
        if (direction === "s") {
            return { x: anchor.x, y: anchor.y + offset };
        }
        if (direction === "w") {
            return { x: anchor.x - offset, y: anchor.y };
        }
        return { x: anchor.x + offset, y: anchor.y };
    }

    protected static buildConnectorPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
        const dx = end.x - start.x;
        const dy = end.y - start.y;

        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
            return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
        }

        const pad = 18;
        const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

        if (Math.abs(dx) >= Math.abs(dy)) {
            const minY = Math.min(start.y, end.y) + pad;
            const maxY = Math.max(start.y, end.y) - pad;
            const turnY = maxY > minY ? clamp((start.y + end.y) / 2, minY, maxY) : start.y + (dy >= 0 ? pad : -pad);

            return [
                `M ${start.x} ${start.y}`,
                `L ${start.x} ${turnY}`,
                `L ${end.x} ${turnY}`,
                `L ${end.x} ${end.y}`,
            ].join(" ");
        }

        const minX = Math.min(start.x, end.x) + pad;
        const maxX = Math.max(start.x, end.x) - pad;
        const turnX = maxX > minX ? clamp((start.x + end.x) / 2, minX, maxX) : start.x + (dx >= 0 ? pad : -pad);

        return [
            `M ${start.x} ${start.y}`,
            `L ${turnX} ${start.y}`,
            `L ${turnX} ${end.y}`,
            `L ${end.x} ${end.y}`,
        ].join(" ");
    }

    protected static renderConnections() {
        const chart = document.querySelector(".chart") as HTMLElement | null;
        if (!chart) {
            return;
        }

        if (!Shape.linkLayer) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "link-layer");
            svg.style.position = "absolute";
            svg.style.inset = "0";
            svg.style.pointerEvents = "none";
            svg.style.overflow = "visible";
            Shape.linkLayer = svg;
            chart.appendChild(svg);
        }

        if (!Shape.labelLayer) {
            const layer = document.createElement("div");
            layer.className = "link-label-layer";
            Shape.labelLayer = layer;
            chart.appendChild(layer);
        }

        const svg = Shape.linkLayer;
        const labels = Shape.labelLayer;
        if (!svg || !labels) {
            return;
        }

        svg.innerHTML = "";
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", "link-arrow-head");
        marker.setAttribute("markerWidth", "8");
        marker.setAttribute("markerHeight", "8");
        marker.setAttribute("refX", "6");
        marker.setAttribute("refY", "3");
        marker.setAttribute("orient", "auto");
        marker.setAttribute("markerUnits", "strokeWidth");
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow.setAttribute("d", "M 0 0 L 6 3 L 0 6 z");
        arrow.setAttribute("fill", "#7a7a7a");
        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        labels.innerHTML = "";

        Shape.connections.forEach((link) => {
            const start = Shape.getLinkAnchor(link.from, link.direction);
            const targetDirection = Shape.getOppositeDirection(link.direction);
            const end = Shape.getLinkEndpoint(link.to, targetDirection);
            const curve = Shape.buildConnectorPath(start, end);

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", curve);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "#7a7a7a");
            path.setAttribute("stroke-width", "2");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("marker-end", "url(#link-arrow-head)");
            svg.appendChild(path);

            const midpointX = (start.x + end.x) / 2;
            const midpointY = (start.y + end.y) / 2 - 10;
            const label = document.createElement("div");
            label.className = "link-label";
            label.setAttribute("contenteditable", "true");
            label.setAttribute("spellcheck", "false");
            label.textContent = link.label || "";
            label.style.left = `${midpointX}px`;
            label.style.top = `${midpointY}px`;
            label.addEventListener("input", () => {
                link.label = label.textContent ?? "";
                Shape.renderConnections();
            });
            label.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    label.blur();
                }
            });
            labels.appendChild(label);
        });
    }

    protected minWidthForHeight(height: number, start: number): number {
        if (this.contentHeightFor(Shape.MIN_DRAG) <= height) {
            return Shape.MIN_DRAG;
        }

        let low = Shape.MIN_DRAG;
        let high = Math.max(start, Shape.MIN_DRAG + 1);

        while (this.contentHeightFor(high) > height && high < Shape.MAX_SIZE) {
            high *= 2;
        }

        for (let i = 0; i < 20; i++) {
            const mid = (low + high) / 2;
            if (this.contentHeightFor(mid) <= height) {
                high = mid;
            } else {
                low = mid;
            }
        }

        return high;
    }

    protected fits(height: number): boolean {
        return this.contentHeightFor(height * this.ratio) <= height;
    }

    protected fit() {
        const centerX = this.posX + this.width / 2;
        const centerY = this.posY + this.height / 2;
        let result = this.minHeight;

        if (!this.fits(this.minHeight)) {
            let low = this.minHeight;
            let high = this.minHeight * 2;
            while (!this.fits(high) && high < Shape.MAX_SIZE) {
                low = high;
                high *= 2;
            }

            for (let i = 0; i < 20; i++) {
                const mid = (low + high) / 2;
                if (this.fits(mid)) {
                    high = mid;
                } else {
                    low = mid;
                }
            }

            result = high;
        }

        this.height = result;
        this.width = this.height * this.ratio;
        this.posX = centerX - this.width / 2;
        this.posY = centerY - this.height / 2;
        this.apply();
    }

    private handleResize(direction: ResizeDirection, handle: HTMLElement, event: PointerEvent) {
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        this.element.classList.add("dragging");

        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = this.posX;
        const startTop = this.posY;
        const startWidth = this.width;
        const startHeight = this.height;

        const onMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            let nextWidth = startWidth;
            let nextHeight = startHeight;
            const isVerticalOnly = direction === "n" || direction === "s";

            if (direction.includes("e")) {
                nextWidth = Math.max(Shape.MIN_DRAG, startWidth + dx);
            } else if (direction.includes("w")) {
                nextWidth = Math.max(Shape.MIN_DRAG, startWidth - dx);
            }

            if (direction.includes("s")) {
                nextHeight = Math.max(Shape.MIN_DRAG, startHeight + dy);
            } else if (direction.includes("n")) {
                nextHeight = Math.max(Shape.MIN_DRAG, startHeight - dy);
            }

            if (this.shouldKeepWidthFixedOnVerticalResize() && isVerticalOnly) {
                nextWidth = startWidth;
                if (this.contentHeightFor(nextWidth) > nextHeight) {
                    nextHeight = Math.max(nextHeight, this.contentHeightFor(nextWidth));
                }
            } else {
                const constrained = this.constrainResize(nextWidth, nextHeight, startHeight, startWidth);
                nextWidth = constrained.width;
                nextHeight = constrained.height;
            }

            this.width = nextWidth;
            this.height = nextHeight;

            if (direction.includes("w")) {
                this.posX = startLeft + startWidth - this.width;
            }
            if (direction.includes("n")) {
                this.posY = startTop + startHeight - this.height;
            }

            this.apply();
        };

        const onUp = () => {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
            this.element.classList.remove("dragging");

            this.minWidth = this.width;
            this.minHeight = this.height;
            this.ratio = this.minWidth / this.minHeight;

            if (!(this.shouldKeepWidthFixedOnVerticalResize() && (direction === "n" || direction === "s"))) {
                this.fit();
            }
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    }

    onMouseDown(event: MouseEvent) {
        if (!this.draggable) {
            return;
        }

        const size = this.getSize();
        const target = event.target as HTMLElement;
        if (target && target.classList.contains("handle")) {
            return;
        }

        if (event.clientX >= this.posX + size.x && event.clientY >= this.posY + size.y) {
            return;
        }

        this.isDragging = true;
        this.dragOffsetX = event.clientX - this.posX;
        this.dragOffsetY = event.clientY - this.posY;
    }

    onMouseMove(event: MouseEvent) {
        if (!this.isDragging) {
            return;
        }

        const size = this.getSize();
        this.posX = this.clampPosition(event.clientX - this.dragOffsetX, size.x);
        this.posY = this.clampPosition(event.clientY - this.dragOffsetY, size.y);
        this.apply();
        this.element.style.cursor = "grabbing";
    }

    onMouseUp() {
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.element.style.cursor = "default";
    }

    constructor() {
        this.element = document.createElement("div");
        this.element.classList.add("shape");
        this.content = document.createElement("div");
        this.content.classList.add("content");
        this.content.innerHTML = "<br>";
        this.content.contentEditable = "true";
        this.content.setAttribute("spellcheck", "false");
        this.element.appendChild(this.content);

        this.getResizeDirections().forEach((direction) => {
            const handle = document.createElement("div");
            handle.classList.add("handle", direction);
            handle.setAttribute("data-dir", direction);
            handle.addEventListener("pointerdown", (event: PointerEvent) => this.handleResize(direction, handle, event));
            this.element.appendChild(handle);
        });

        this.getLinkDirections().forEach((direction) => {
            const linkHandle = document.createElement("button");
            linkHandle.type = "button";
            linkHandle.classList.add("link-handle", direction);
            linkHandle.setAttribute("data-link-dir", direction);
            linkHandle.title = `Link ${direction}`;
            linkHandle.addEventListener("pointerdown", (event: PointerEvent) => {
                event.preventDefault();
                event.stopPropagation();
                this.onLink(direction);
            });
            this.element.appendChild(linkHandle);
        });

        this.updateResizeHandles();
        this.updateLinkHandles();

        this.element.addEventListener("mousedown", (event: MouseEvent) => {
            if (Shape.pendingLink && Shape.pendingLink.source !== this) {
                const pending = Shape.pendingLink;
                Shape.pendingLink = null;
                this.element.classList.remove("linking");
                pending.source.connectTo(this, pending.direction, "");
                return;
            }
            this.onMouseDown(event);
        });
        document.addEventListener("mousemove", this.onMouseMove.bind(this));
        document.addEventListener("mouseup", this.onMouseUp.bind(this));

        this.ratio = this.minWidth / this.minHeight;
        this.width = this.minWidth;
        this.height = this.minHeight;

        const chart = document.querySelector(".chart") as HTMLElement | null;
        const bounds = chart ?? document.body;
        this.posX = (bounds.clientWidth - this.width) / 2;
        this.posY = (bounds.clientHeight - this.height) / 2;
        this.apply();

        this.content.addEventListener("input", () => {
            if (this.content.innerHTML.trim() === "") {
                this.content.innerHTML = "<br>";
            }
            this.fit();
        });

        Shape.renderConnections();
    }
}
