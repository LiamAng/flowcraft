import { Router, roundedPath, labelPoint, findCrossingJumps, type Side, type Point, type RouteTarget, type RouteObstacle } from "../router";
import { openProgramEditor } from "../programEditor";

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type LinkDirection = "n" | "s" | "e" | "w";

export type LinkRole = "next" | "altNext";

export type Waypoint = { ox: number; oy: number; dir: LinkDirection };

export type LinkRecord = {
    from: Shape;
    to: Shape;
    direction: LinkDirection;
    role: LinkRole;
    label: string;

    waypoints?: Waypoint[];

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
    protected static nextId = 0;
    protected static renderSuspended = false;
    protected static draggingLink: LinkRecord | null = null;
    protected static selectedLink: LinkRecord | null = null;
    protected static deleteHooked = false;
    protected static lastLineClick: { link: LinkRecord; time: number } | null = null;
    protected static groupDrag: { leader: Shape; startX: number; startY: number; origins: Map<Shape, { x: number; y: number }> } | null = null;

    public static selection = new Set<Shape>();

    public readonly id = `shape-${++Shape.nextId}`;
    public element: HTMLElement;
    public content: HTMLElement;
    public posX = 0;
    public posY = 0;
    public outgoingLinks: Array<{ direction: LinkDirection; role: LinkRole; label: string; to: Shape }> = [];
    public programCode = "";

    get next(): Shape | null {
        return this.outgoingLinks.find((link) => link.role === "next")?.to ?? null;
    }

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

    getCenter(): Point {
        return { x: this.posX + this.width / 2, y: this.posY + this.height / 2 };
    }

    protected syncLinkData() {
        const write = (key: string, target: Shape | null) => {
            if (target) {
                this.element.dataset[key] = target.id;
            } else {
                delete this.element.dataset[key];
            }
        };
        write("next", this.next);
    }

    public static setSelection(shapes: Iterable<Shape>) {
        Shape.selection = new Set(shapes);
        Shape.all.forEach((shape) => shape.element.classList.toggle("selected", Shape.selection.has(shape)));
    }

    public static clearSelection() {
        if (Shape.selection.size > 0) {
            Shape.setSelection([]);
        }
    }

    public static removeShapes(shapes: Iterable<Shape>) {
        const removed = new Set(shapes);
        if (removed.size === 0) {
            return;
        }

        if (Shape.groupDrag && [...Shape.groupDrag.origins.keys()].some((shape) => removed.has(shape))) {
            Shape.groupDrag = null;
        }
        removed.forEach((shape) => shape.onMouseUp());

        const removedConnections = Shape.connections.filter((link) => removed.has(link.from) || removed.has(link.to));
        Shape.connections = Shape.connections.filter((link) => !removed.has(link.from) && !removed.has(link.to));
        Shape.all = Shape.all.filter((shape) => !removed.has(shape));
        removed.forEach((shape) => shape.element.remove());

        Shape.selection = new Set([...Shape.selection].filter((shape) => !removed.has(shape)));
        Shape.all.forEach((shape) => {
            shape.element.classList.toggle("selected", Shape.selection.has(shape));
            shape.outgoingLinks = shape.outgoingLinks.filter((outgoing) =>
                !removedConnections.some((link) =>
                    link.from === shape && link.to === outgoing.to && link.direction === outgoing.direction && link.role === outgoing.role
                )
            );
            if (removedConnections.some((link) => link.from === shape)) {
                shape.syncLinkData();
            }
        });

        if (Shape.selectedLink && removedConnections.includes(Shape.selectedLink)) {
            Shape.selectedLink = null;
        }
        if (Shape.draggingLink && removedConnections.includes(Shape.draggingLink)) {
            Shape.draggingLink = null;
        }
        if (Shape.hover && removed.has(Shape.hover)) {
            Shape.hover = null;
        }
        if (Shape.pendingLink && removed.has(Shape.pendingLink.source)) {
            Shape.endLink();
        } else {
            Shape.renderConnections();
        }
    }

    setCenter(x: number, y: number) {
        this.posX = x - this.width / 2;
        this.posY = y - this.height / 2;
        this.apply();
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
        const atLimit = this.getOutgoingLinkCount() >= this.getLinkLimit();

        this.element.querySelectorAll<HTMLButtonElement>(".link-handle").forEach((handle) => {
            const dir = handle.dataset.linkDir as LinkDirection | undefined;
            if (!dir || !supported.includes(dir) || atLimit) {
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

    protected isProgrammable(): boolean {
        return false;
    }

    protected getOutgoingLinkCount(): number {
        return this.outgoingLinks.length;
    }

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

        const role: LinkRole = this.outgoingLinks.some((link) => link.role === "next") ? "altNext" : "next";
        const record: LinkRecord = { from: this, to: target, direction, role, label };
        Shape.connections.push(record);
        this.outgoingLinks.push({ direction, role, label, to: target });
        this.syncLinkData();
        Shape.renderConnections();
    }

    public static removeConnection(connection: LinkRecord) {
        Shape.connections = Shape.connections.filter((link) => link !== connection);
        connection.from.outgoingLinks = connection.from.outgoingLinks.filter((link) =>
            link.role !== connection.role || link.to !== connection.to || link.direction !== connection.direction
        );
        if (Shape.selectedLink === connection) {
            Shape.selectedLink = null;
        }
        if (Shape.draggingLink === connection) {
            Shape.draggingLink = null;
        }
        connection.from.syncLinkData();
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

        if (!Shape.deleteHooked) {
            Shape.deleteHooked = true;
            document.addEventListener(
                "pointerdown",
                (event: PointerEvent) => {
                    const onLink = event.target instanceof Element && event.target.closest(".link-hit, .link-turn");
                    if (!onLink && Shape.selectedLink) {
                        Shape.selectedLink = null;
                        Shape.renderConnections();
                    }
                },
                true
            );
            document.addEventListener("keydown", (event: KeyboardEvent) => {
                if ((event.key !== "Delete" && event.key !== "Backspace") || !Shape.selectedLink) {
                    return;
                }
                const active = document.activeElement as HTMLElement | null;
                if (active?.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
                    return;
                }
                event.preventDefault();
                Shape.removeConnection(Shape.selectedLink);
            });
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
        if (Shape.renderSuspended) {
            return;
        }

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

        const routed = Shape.connections.map((link) => {
            const anchors = Shape.buildTargetAnchors(link.to);
            const avoid = Shape.reservedSidesFor(link.to, link);

            const source = { shape: link.from, side: link.direction, point: Shape.getLinkAnchor(link.from, link.direction) };
            const dest = { shape: link.to, anchors };

            let route;
            if (link.waypoints && link.waypoints.length > 0) {
                const c = link.from.getCenter();
                const via = link.waypoints.map((w) => ({ point: { x: c.x + w.ox, y: c.y + w.oy }, dir: w.dir }));
                route = Shape.router.routeVia(source, dest, via, obstacles, bounds, true, avoid);
            } else {
                route = Shape.router.route(source, dest, obstacles, bounds, true, avoid);
            }
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
            const highlight = (on: boolean) => {
                path.setAttribute("stroke", on ? "#6495ed" : "#475569");
                path.setAttribute("stroke-width", on ? "2.5" : "1.75");
            };
            if (Shape.draggingLink === link || Shape.selectedLink === link) {
                highlight(true);
            }
            svg.appendChild(path);

            for (let seg = 0; seg < points.length - 1; seg++) {
                const a = points[seg];
                const b = points[seg + 1];
                const horizontal = Math.abs(a.y - b.y) < 0.01;
                if (!horizontal && Math.abs(a.x - b.x) >= 0.01) {
                    continue;
                }

                const hit = document.createElementNS("http://www.w3.org/2000/svg", "line");
                hit.setAttribute("class", "link-hit");
                hit.setAttribute("x1", `${a.x}`);
                hit.setAttribute("y1", `${a.y}`);
                hit.setAttribute("x2", `${b.x}`);
                hit.setAttribute("y2", `${b.y}`);
                hit.setAttribute("stroke", "transparent");
                hit.setAttribute("stroke-width", "12");
                hit.style.pointerEvents = "stroke";
                hit.style.cursor = horizontal ? "ns-resize" : "ew-resize";
                hit.addEventListener("pointerenter", () => highlight(true));
                hit.addEventListener("pointerleave", () => {
                    if (Shape.draggingLink !== link && Shape.selectedLink !== link) {
                        highlight(false);
                    }
                });
                hit.addEventListener("pointerdown", (event: PointerEvent) => Shape.beginLineDrag(link, points, seg, event));
                svg.appendChild(hit);
            }

            if (Shape.selectedLink === link) {
                const centre = link.from.getCenter();
                (link.waypoints ?? []).forEach((waypoint, waypointIndex) => {
                    const corner = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    corner.setAttribute("class", "link-turn");
                    corner.setAttribute("cx", `${centre.x + waypoint.ox}`);
                    corner.setAttribute("cy", `${centre.y + waypoint.oy}`);
                    corner.setAttribute("r", "7");
                    corner.setAttribute("role", "button");
                    corner.setAttribute("tabindex", "0");
                    corner.setAttribute("aria-label", "Delete flowline corner");
                    corner.setAttribute("title", "Delete corner");
                    corner.style.pointerEvents = "all";
                    const removeCorner = () => {
                        const waypoints = [...(link.waypoints ?? [])];
                        waypoints.splice(waypointIndex, 1);
                        link.waypoints = waypoints.length > 0 ? waypoints : undefined;
                        Shape.renderConnections();
                    };
                    corner.addEventListener("pointerdown", (event: PointerEvent) => {
                        event.preventDefault();
                        event.stopPropagation();
                    });
                    corner.addEventListener("click", removeCorner);
                    corner.addEventListener("keydown", (event: KeyboardEvent) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            removeCorner();
                        }
                    });
                    svg.appendChild(corner);
                });
            }

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

    protected static beginLineDrag(link: LinkRecord, points: Point[], seg: number, event: PointerEvent) {
        if (event.button !== 0 || Shape.pendingLink) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        const p0 = points[seg];
        const p1 = points[seg + 1];
        const horizontal = Math.abs(p0.y - p1.y) < 0.01;
        const dir: LinkDirection = horizontal ? (p1.x >= p0.x ? "e" : "w") : p1.y >= p0.y ? "s" : "n";
        const centre = link.from.getCenter();
        const waypoints = [...(link.waypoints ?? [])];
        const absolute = (w: Waypoint): Point => ({ x: centre.x + w.ox, y: centre.y + w.oy });

        const segmentOf = (w: Waypoint): number => {
            const at = absolute(w);
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const onH = Math.abs(a.y - b.y) < 0.01 && Math.abs(at.y - a.y) < 1.5 && at.x >= Math.min(a.x, b.x) - 1.5 && at.x <= Math.max(a.x, b.x) + 1.5;
                const onV = Math.abs(a.x - b.x) < 0.01 && Math.abs(at.x - a.x) < 1.5 && at.y >= Math.min(a.y, b.y) - 1.5 && at.y <= Math.max(a.y, b.y) + 1.5;
                if (onH || onV) {
                    return i;
                }
            }
            return -1;
        };

        let index = waypoints.findIndex((w) => segmentOf(w) === seg);
        const isNew = index < 0;
        const base: Point = isNew ? { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 } : absolute(waypoints[index]);
        const insertAt = isNew ? waypoints.filter((w) => {
            const at = segmentOf(w);
            return at >= 0 && at < seg;
        }).length : index;

        const startX = event.clientX;
        const startY = event.clientY;
        let moved = false;
        const previousCursor = document.body.style.cursor;

        const onMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (!moved && Math.hypot(dx, dy) < 3) {
                return;
            }
            if (!moved) {
                moved = true;
                Shape.draggingLink = link;
                document.body.style.cursor = horizontal ? "ns-resize" : "ew-resize";
            }

            const at = horizontal ? { x: base.x, y: base.y + dy } : { x: base.x + dx, y: base.y };
            const waypoint: Waypoint = { ox: at.x - centre.x, oy: at.y - centre.y, dir };
            if (isNew && index < 0) {
                waypoints.splice(insertAt, 0, waypoint);
                index = insertAt;
            } else {
                waypoints[index] = waypoint;
            }
            link.waypoints = [...waypoints];
            Shape.renderConnections();
        };

        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            document.body.style.cursor = previousCursor;
            if (Shape.draggingLink) {
                Shape.draggingLink = null;
                Shape.renderConnections();
            }

            if (moved) {
                Shape.lastLineClick = null;
                Shape.selectedLink = link;
                Shape.renderConnections();
                return;
            }

            Shape.selectedLink = link;
            Shape.renderConnections();
            const now = performance.now();
            const previous = Shape.lastLineClick;
            if (previous && previous.link === link && now - previous.time < 400) {
                Shape.lastLineClick = null;
                if (link.waypoints && link.waypoints.length > 0) {
                    link.waypoints = undefined;
                    Shape.renderConnections();
                }
            } else {
                Shape.lastLineClick = { link, time: now };
            }
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
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

        if (event.shiftKey) {
            event.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
            const next = new Set(Shape.selection);
            if (!next.delete(this)) {
                next.add(this);
            }
            Shape.setSelection(next);
            return;
        }

        if (!Shape.selection.has(this)) {
            Shape.clearSelection();
        }

        this.isDragging = true;
        this.dragOffsetX = event.clientX - this.posX;
        this.dragOffsetY = event.clientY - this.posY;

        if (Shape.selection.size > 1) {

            event.preventDefault();
            Shape.groupDrag = {
                leader: this,
                startX: event.clientX,
                startY: event.clientY,
                origins: new Map([...Shape.selection].map((shape) => [shape, { x: shape.posX, y: shape.posY }])),
            };
        }
    }

    onMouseMove(event: MouseEvent) {
        if (!this.isDragging) {
            return;
        }

        const group = Shape.groupDrag;
        if (group && group.leader === this) {
            const chart = document.querySelector(".chart") as HTMLElement | null;
            const bounds = chart ?? document.body;
            let dx = event.clientX - group.startX;
            let dy = event.clientY - group.startY;

            group.origins.forEach((origin, shape) => {
                dx = Math.max(-origin.x, Math.min(dx, bounds.clientWidth - shape.width - origin.x));
                dy = Math.max(-origin.y, Math.min(dy, bounds.clientHeight - shape.height - origin.y));
            });

            Shape.renderSuspended = true;
            group.origins.forEach((origin, shape) => {
                shape.posX = origin.x + dx;
                shape.posY = origin.y + dy;
                shape.apply();
            });
            Shape.renderSuspended = false;
            Shape.renderConnections();
            this.element.style.cursor = "grabbing";
            return;
        }

        const size = this.getSize();
        this.posX = this.clampPosition(event.clientX - this.dragOffsetX, size.x);
        this.posY = this.clampPosition(event.clientY - this.dragOffsetY, size.y);
        this.apply();
        this.element.style.cursor = "grabbing";
    }

    onMouseUp() {
        if (Shape.groupDrag?.leader === this) {
            Shape.groupDrag = null;
        }
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.element.style.cursor = "default";
    }

    constructor() {
        Shape.all.push(this);
        this.element = document.createElement("div");
        this.element.classList.add("shape");
        this.element.dataset.id = this.id;
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

        const actions = document.createElement("div");
        actions.className = "shape-actions";

        if (this.isProgrammable()) {
            const programButton = document.createElement("button");
            programButton.type = "button";
            programButton.className = "shape-action";
            programButton.title = "Edit code";
            programButton.setAttribute("aria-label", "Edit shape code");
            programButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18"/></svg>';
            programButton.addEventListener("click", (event) => {
                event.stopPropagation();
                openProgramEditor(this);
            });
            programButton.addEventListener("pointerdown", (event) => event.stopPropagation());
            programButton.addEventListener("mousedown", (event) => event.stopPropagation());
            actions.appendChild(programButton);
        }

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "shape-action delete-shape";
        deleteButton.title = "Delete shape";
        deleteButton.setAttribute("aria-label", "Delete shape");
        deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>';
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            Shape.removeShapes([this]);
        });
        deleteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
        deleteButton.addEventListener("mousedown", (event) => event.stopPropagation());
        actions.appendChild(deleteButton);
        this.element.appendChild(actions);

        this.updateResizeHandles();
        this.updateLinkHandles();

        this.element.addEventListener("mousedown", (event: MouseEvent) => {
            if (Shape.pendingLink && Shape.pendingLink.source !== this) {
                event.preventDefault();
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
