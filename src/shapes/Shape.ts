import { Router, roundedPath, labelPoint, findCrossingJumps, type Side, type RouteTarget, type RouteObstacle } from "../router";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type LinkDirection = "n" | "s" | "e" | "w";

export type LinkRecord = {
    from: Shape;
    to: Shape;
    direction: LinkDirection;
    label: string;
    /** Which side of `to` the router last entered from. Set by renderConnections(); used to keep incoming lines off sides that are already in use. */
    entrySide?: LinkDirection;
};

export class Shape {
    public static readonly MIN_DRAG = 20;
    public static readonly MAX_SIZE = 20000;
    public static pendingLink: { source: Shape; direction: LinkDirection } | null = null;
    public static connections: LinkRecord[] = [];
    public static linkLayer: SVGSVGElement | null = null;
    public static labelLayer: HTMLDivElement | null = null;
    public static all: Shape[] = [];
    protected static router = new Router();
    public static readonly DEFAULT_SIZE = 80;
    public static ghostLayer: SVGSVGElement | null = null;
    protected static pointer = { x: 0, y: 0 };
    protected static hover: Shape | null = null;
    protected static ghostFrozen = false;
    protected static tracking = false;
    protected static ghostTarget = {};

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

    setCenter(x: number, y: number) {
        this.posX = x - this.width / 2;
        this.posY = y - this.height / 2;
        this.apply();
    }

    setDraggable(draggable: boolean) {
        this.draggable = draggable;
    }

    protected apply() {
        const chart = document.querySelector(".chart") as HTMLElement | null;
        const bounds = chart ?? document.body;

        const maxX = bounds.clientWidth - this.width;
        const maxY = bounds.clientHeight - this.height;
        this.posX = Math.max(0, Math.min(this.posX, maxX));
        this.posY = Math.max(0, Math.min(this.posY, maxY));

        this.element.style.left = `${this.posX}px`;
        this.element.style.top = `${this.posY}px`;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
        this.applyDimensionPadding();

        if (this.content.classList.contains("diamond")) {
            this.content.style.clipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
        }

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
        const supported = this.getLinkDirections();
        const used = Shape.reservedSidesFor(this);

        this.element.querySelectorAll<HTMLButtonElement>(".link-handle").forEach((handle) => {
            const dir = handle.dataset.linkDir as LinkDirection | undefined;
            if (!dir || !supported.includes(dir)) {
                handle.style.display = "none";
                return;
            }

            handle.style.display = used.has(dir) ? "none" : "";
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

    /**
     * Sides of `shape` that already have a line touching them — either an
     * outgoing link leaving from that side, or an incoming link's last-known
     * entry side. Used both to hide a shape's link handles on occupied sides
     * and to steer new/rerouted lines toward the sides that are still free.
     * `exclude` leaves out one link's own entry (so re-routing that link
     * doesn't count its previous position against itself).
     */
    protected static reservedSidesFor(shape: Shape, exclude?: LinkRecord): Set<LinkDirection> {
        const reserved = new Set<LinkDirection>(shape.outgoingLinks.map((link) => link.direction));

        Shape.connections.forEach((link) => {
            if (link.to === shape && link !== exclude && link.entrySide) {
                reserved.add(link.entrySide);
            }
        });

        return reserved;
    }

    protected static buildTargetAnchors(shape: Shape): Record<Side, { x: number; y: number }> {
        return {
            n: Shape.getLinkAnchor(shape, "n"),
            e: Shape.getLinkAnchor(shape, "e"),
            s: Shape.getLinkAnchor(shape, "s"),
            w: Shape.getLinkAnchor(shape, "w"),
        } as Record<Side, { x: number; y: number }>;
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
        Shape.renderConnections();
    }

    public static removeConnection(connection: LinkRecord) {
        Shape.connections = Shape.connections.filter((link) => link !== connection);
        connection.from.outgoingLinks = connection.from.outgoingLinks.filter((link) => link.to !== connection.to || link.direction !== connection.direction);
        Shape.renderConnections();
    }

    protected onLink(direction: LinkDirection) {
        const pending = Shape.pendingLink;

        if (pending && pending.source !== this) {
            Shape.completeLink(this);
            return;
        }

        if (pending && pending.source === this && pending.direction === direction) {
            Shape.cancelLink();
            return;
        }

        if (this.getOutgoingLinkCount() >= this.getLinkLimit()) {
            return;
        }

        if (this.outgoingLinks.some((link) => link.direction === direction)) {
            return;
        }

        Shape.startLink(this, direction);
    }

    public static isLinking(): boolean {
        return Shape.pendingLink !== null;
    }

    public static startLink(source: Shape, direction: LinkDirection) {
        Shape.clearLinkVisuals();
        Shape.pendingLink = { source, direction };
        Shape.ghostFrozen = false;
        Shape.hover = null;
        source.element.classList.add("linking");
        document.querySelector(".chart")?.classList.add("linking-mode");
        Shape.trackPointer();
        Shape.renderGhost();
        Shape.announceLinkState();
    }

    public static completeLink(target: Shape) {
        const pending = Shape.pendingLink;
        if (!pending || pending.source === target) {
            return;
        }
        pending.source.connectTo(target, pending.direction, "");
        Shape.endLink();
    }

    public static cancelLink() {
        if (Shape.pendingLink) {
            Shape.endLink();
        }
    }

    public static freezeGhostAt(x: number, y: number) {
        Shape.hover?.element.classList.remove("link-target");
        Shape.hover = null;
        Shape.pointer = { x, y };
        Shape.ghostFrozen = true;
        Shape.renderGhost();
    }

    public static unfreezeGhost() {
        if (Shape.ghostFrozen) {
            Shape.ghostFrozen = false;
            Shape.renderGhost();
        }
    }

    protected static endLink() {
        Shape.clearLinkVisuals();
        Shape.pendingLink = null;
        Shape.ghostFrozen = false;
        Shape.hover = null;
        document.querySelector(".chart")?.classList.remove("linking-mode");
        Shape.renderGhost();
        Shape.announceLinkState();
    }

    protected static clearLinkVisuals() {
        Shape.all.forEach((shape) => shape.element.classList.remove("linking", "link-target"));
    }

    protected static announceLinkState() {
        document.dispatchEvent(new CustomEvent("flowcraft:linkstate", { detail: { active: Shape.pendingLink !== null } }));
    }

    protected static trackPointer() {
        if (Shape.tracking) {
            return;
        }
        Shape.tracking = true;

        document.addEventListener("pointermove", (event: PointerEvent) => {
            const pending = Shape.pendingLink;
            if (!pending || Shape.ghostFrozen) {
                return;
            }

            Shape.pointer = { x: event.clientX, y: event.clientY };
            const el = event.target instanceof Element ? event.target.closest(".shape") : null;
            const hovered = el ? Shape.all.find((shape) => shape.element === el && shape !== pending.source) ?? null : null;

            if (hovered !== Shape.hover) {
                Shape.hover?.element.classList.remove("link-target");
                hovered?.element.classList.add("link-target");
                Shape.hover = hovered;
            }
            Shape.renderGhost();
        });
    }

    protected static renderGhost() {
        const layer = Shape.ghostLayer;
        if (!layer) {
            return;
        }

        layer.innerHTML = "";
        const pending = Shape.pendingLink;
        const chart = document.querySelector(".chart") as HTMLElement | null;
        if (!pending || !chart) {
            return;
        }

        const ns = "http://www.w3.org/2000/svg";
        const accent = "#6495ed";
        const size = Shape.DEFAULT_SIZE;
        const bounds = { width: chart.clientWidth, height: chart.clientHeight };
        const obstacles: RouteObstacle[] = Shape.all.map((shape) => ({
            shape,
            rect: { x: shape.posX, y: shape.posY, w: shape.width, h: shape.height },
        }));
        const rectAnchors = (r: { x: number; y: number; w: number; h: number }) => ({
            n: { x: r.x + r.w / 2, y: r.y },
            e: { x: r.x + r.w, y: r.y + r.h / 2 },
            s: { x: r.x + r.w / 2, y: r.y + r.h },
            w: { x: r.x, y: r.y + r.h / 2 },
        }) as Record<Side, { x: number; y: number }>;

        layer.appendChild(Shape.createArrowDefs("ghost-arrow-head", accent));

        const source = pending.source;
        const start = Shape.getLinkAnchor(source, pending.direction);
        const p = Shape.pointer;
        let target: RouteTarget;
        let arrow = true;

        let avoid: Set<LinkDirection> | undefined;

        if (Shape.hover) {
            const h = Shape.hover;
            target = { shape: h, anchors: Shape.buildTargetAnchors(h) };
            avoid = Shape.reservedSidesFor(h);
        } else if (Shape.ghostFrozen) {
            const cx = Math.max(size / 2, Math.min(p.x, bounds.width - size / 2));
            const cy = Math.max(size / 2, Math.min(p.y, bounds.height - size / 2));
            const rect = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
            obstacles.push({ shape: Shape.ghostTarget, rect });
            target = { shape: Shape.ghostTarget, anchors: rectAnchors(rect) };

            const box = document.createElementNS(ns, "rect");
            box.setAttribute("x", `${rect.x}`);
            box.setAttribute("y", `${rect.y}`);
            box.setAttribute("width", `${rect.w}`);
            box.setAttribute("height", `${rect.h}`);
            box.setAttribute("rx", "8");
            box.setAttribute("fill", "rgba(100, 149, 237, 0.12)");
            box.setAttribute("stroke", accent);
            box.setAttribute("stroke-width", "1.5");
            box.setAttribute("stroke-dasharray", "5 4");
            layer.appendChild(box);
        } else {
            target = { shape: Shape.ghostTarget, anchors: { n: p, e: p, s: p, w: p }, stub: 0 };
            arrow = false;
        }

        let points: Array<{ x: number; y: number }>;
        const overSource =
            !Shape.hover &&
            !Shape.ghostFrozen &&
            p.x > source.posX && p.x < source.posX + source.width &&
            p.y > source.posY && p.y < source.posY + source.height;

        if (overSource) {
            const out = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[pending.direction];
            points = [start, { x: start.x + out[0] * 24, y: start.y + out[1] * 24 }];
        } else {
            points = Shape.router.route(
                { shape: source, side: pending.direction, point: start },
                target,
                obstacles,
                bounds,
                false,
                avoid
            ).points;
        }

        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", roundedPath(points));
        path.setAttribute("class", "ghost-path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", accent);
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-dasharray", "6 5");
        path.setAttribute("stroke-linejoin", "round");
        if (arrow && !overSource) {
            path.setAttribute("marker-end", "url(#ghost-arrow-head)");
        }
        layer.appendChild(path);

        if (!arrow) {
            const end = points[points.length - 1];
            const dot = document.createElementNS(ns, "circle");
            dot.setAttribute("cx", `${end.x}`);
            dot.setAttribute("cy", `${end.y}`);
            dot.setAttribute("r", "5");
            dot.setAttribute("fill", "#fff");
            dot.setAttribute("stroke", accent);
            dot.setAttribute("stroke-width", "2");
            layer.appendChild(dot);
        }
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

    protected getEdgePoint(direction: LinkDirection): { x: number; y: number } {
        const centerX = this.posX + this.width / 2;
        const centerY = this.posY + this.height / 2;

        if (direction === "n") {
            return { x: centerX, y: this.posY };
        }
        if (direction === "s") {
            return { x: centerX, y: this.posY + this.height };
        }
        if (direction === "w") {
            return { x: this.posX, y: centerY };
        }
        return { x: this.posX + this.width, y: centerY };
    }

    protected static getLinkAnchor(shape: Shape, direction: LinkDirection): { x: number; y: number } {
        return shape.getEdgePoint(direction);
    }

    protected static ensureLayers(chart: HTMLElement) {
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

        if (!Shape.ghostLayer) {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "ghost-layer");
            svg.style.position = "absolute";
            svg.style.inset = "0";
            svg.style.pointerEvents = "none";
            svg.style.overflow = "visible";
            Shape.ghostLayer = svg;
            chart.appendChild(svg);
        }
    }

    protected static createArrowDefs(id = "link-arrow-head", color = "#475569"): SVGDefsElement {
        const ns = "http://www.w3.org/2000/svg";
        const defs = document.createElementNS(ns, "defs");
        const marker = document.createElementNS(ns, "marker");
        marker.setAttribute("id", id);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "10");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "10");
        marker.setAttribute("markerHeight", "10");
        marker.setAttribute("markerUnits", "userSpaceOnUse");
        marker.setAttribute("orient", "auto");
        marker.style.overflow = "visible";
        const arrow = document.createElementNS(ns, "path");
        arrow.setAttribute("d", "M 0 0.5 L 10 5 L 0 9.5 L 2.5 5 z");
        arrow.setAttribute("fill", color);
        marker.appendChild(arrow);
        defs.appendChild(marker);
        return defs;
    }

    protected static renderConnections() {
        const chart = document.querySelector(".chart") as HTMLElement | null;
        if (!chart) {
            return;
        }

        Shape.ensureLayers(chart);
        const svg = Shape.linkLayer;
        const labels = Shape.labelLayer;
        if (!svg || !labels) {
            return;
        }

        svg.innerHTML = "";
        svg.appendChild(Shape.createArrowDefs());
        labels.innerHTML = "";

        const bounds = { width: chart.clientWidth, height: chart.clientHeight };
        const obstacles = Shape.all.map((shape) => ({
            shape,
            rect: { x: shape.posX, y: shape.posY, w: shape.width, h: shape.height },
        }));

        Shape.router.reset();

        // Routing is stateful (each route avoids sides/paths already claimed), so it has to run
        // for every link before line-crossing jumps can be worked out across all of them.
        const routed = Shape.connections.map((link) => {
            const anchors = Shape.buildTargetAnchors(link.to);
            const avoid = Shape.reservedSidesFor(link.to, link);

            const route = Shape.router.route(
                { shape: link.from, side: link.direction, point: Shape.getLinkAnchor(link.from, link.direction) },
                { shape: link.to, anchors },
                obstacles,
                bounds,
                true,
                avoid
            );
            link.entrySide = route.entry;
            return { link, points: route.points };
        });

        const jumps = findCrossingJumps(routed.map((r) => r.points));

        routed.forEach(({ link, points }, index) => {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", roundedPath(points, undefined, jumps[index]));
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "#475569");
            path.setAttribute("stroke-width", "1.75");
            path.setAttribute("stroke-linecap", "butt");
            path.setAttribute("stroke-linejoin", "round");
            path.setAttribute("marker-end", "url(#link-arrow-head)");
            path.style.cursor = "pointer";
            path.addEventListener("pointerdown", (event: PointerEvent) => {
                event.preventDefault();
                event.stopPropagation();
                Shape.removeConnection(link);
            });
            svg.appendChild(path);

            const mid = labelPoint(points);
            const label = document.createElement("div");
            label.className = "link-label";
            label.setAttribute("contenteditable", "true");
            label.setAttribute("spellcheck", "false");
            label.textContent = link.label || "";
            label.style.left = `${mid.x}px`;
            label.style.top = `${mid.y}px`;
            label.addEventListener("input", () => {
                link.label = label.textContent ?? "";
            });
            label.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    label.blur();
                }
            });
            labels.appendChild(label);
        });

        Shape.all.forEach((shape) => shape.updateLinkHandles());

        if (Shape.pendingLink) {
            Shape.renderGhost();
        }
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
        Shape.all.push(this);
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
                Shape.pointer = { x: event.clientX, y: event.clientY };
                this.onLink(direction);
            });
            this.element.appendChild(linkHandle);
        });

        this.updateResizeHandles();
        this.updateLinkHandles();

        this.element.addEventListener("mousedown", (event: MouseEvent) => {
            if (Shape.pendingLink && Shape.pendingLink.source !== this) {
                event.preventDefault(); // don't drop a text caret into the target
                Shape.completeLink(this);
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


