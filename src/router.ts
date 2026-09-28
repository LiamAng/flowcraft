export type Side = "n" | "e" | "s" | "w";
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface RouteSource { shape: object; side: Side; point: Point }
export interface RouteTarget { shape: object; anchors: Record<Side, Point>; stub?: number }
export interface RouteObstacle { shape: object; rect: Rect }
export interface RouteBounds { width: number; height: number }
export interface RouteResult { points: Point[]; entry: Side }

export const ROUTE_STYLE = {
    stub: 22,
    minStub: 6,
    margin: 12,
    bend: 40,
    crossing: 30,
    overlap: 0.8,
    outside: 6,
    radius: 8,
};

const SIDES: Side[] = ["n", "e", "s", "w"];
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const INDEX: Record<Side, number> = { n: 0, e: 1, s: 2, w: 3 };
const VEC: Record<Side, Point> = {
    n: { x: 0, y: -1 },
    e: { x: 1, y: 0 },
    s: { x: 0, y: 1 },
    w: { x: -1, y: 0 },
};

type Box = { x0: number; y0: number; x1: number; y1: number };
type Seg = { x1: number; y1: number; x2: number; y2: number };
type Found = RouteResult & { cost: number };

const snap = (v: number) => Math.round(v * 100) / 100;
const uniqSorted = (values: number[]) => Array.from(new Set(values.map(snap))).sort((a, b) => a - b);
const strictlyInside = (b: Box, p: Point) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;

class MinHeap {
    private keys: number[] = [];
    private vals: number[] = [];

    get size() {
        return this.keys.length;
    }

    push(key: number, val: number) {
        let i = this.keys.length;
        this.keys.push(key);
        this.vals.push(val);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.keys[parent] <= key) break;
            this.keys[i] = this.keys[parent];
            this.vals[i] = this.vals[parent];
            i = parent;
        }
        this.keys[i] = key;
        this.vals[i] = val;
    }

    pop(): number {
        const top = this.vals[0];
        const lastKey = this.keys.pop()!;
        const lastVal = this.vals.pop()!;
        const n = this.keys.length;
        if (n > 0) {
            let i = 0;
            while (true) {
                let child = 2 * i + 1;
                if (child >= n) break;
                if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++;
                if (this.keys[child] >= lastKey) break;
                this.keys[i] = this.keys[child];
                this.vals[i] = this.vals[child];
                i = child;
            }
            this.keys[i] = lastKey;
            this.vals[i] = lastVal;
        }
        return top;
    }
}

export class Router {
    private used: Seg[] = [];

    reset() {
        this.used = [];
    }

    route(src: RouteSource, dst: RouteTarget, obstacles: RouteObstacle[], bounds: RouteBounds, remember = true): RouteResult {
        let best: Found | null = null;
        for (const side of SIDES) {
            const candidate = this.search(src, dst, side, obstacles, bounds);
            if (candidate && (!best || candidate.cost < best.cost)) {
                best = candidate;
            }
        }

        const result: RouteResult = best ?? this.fallback(src, dst);
        if (remember) this.remember(result.points);
        return { points: result.points, entry: result.entry };
    }

    private remember(points: Point[]) {
        for (let i = 0; i < points.length - 1; i++) {
            this.used.push({ x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y });
        }
    }

    private penalty(ax: number, ay: number, bx: number, by: number): number {
        const { crossing, overlap } = ROUTE_STYLE;
        const horizontal = Math.abs(ay - by) < 1e-6;
        const lo = horizontal ? Math.min(ax, bx) : Math.min(ay, by);
        const hi = horizontal ? Math.max(ax, bx) : Math.max(ay, by);
        const fixed = horizontal ? ay : ax;
        let total = 0;

        for (const u of this.used) {
            const uHorizontal = Math.abs(u.y1 - u.y2) < 1e-6;
            const uFixed = uHorizontal ? u.y1 : u.x1;
            const uLo = uHorizontal ? Math.min(u.x1, u.x2) : Math.min(u.y1, u.y2);
            const uHi = uHorizontal ? Math.max(u.x1, u.x2) : Math.max(u.y1, u.y2);

            if (uHorizontal === horizontal) {
                if (Math.abs(uFixed - fixed) < 0.5) {
                    const shared = Math.min(hi, uHi) - Math.max(lo, uLo);
                    if (shared > 0.5) total += shared * overlap;
                }
            } else if (uFixed > lo + 0.5 && uFixed < hi - 0.5 && fixed > uLo + 0.5 && fixed < uHi - 0.5) {
                total += crossing;
            }
        }
        return total;
    }

    private search(
        src: RouteSource,
        dst: RouteTarget,
        side: Side,
        obstacles: RouteObstacle[],
        bounds: RouteBounds
    ): Found | null {
        const cfg = ROUTE_STYLE;
        const sv = VEC[src.side];
        const ev = VEC[side];
        const ea = dst.anchors[side];

        const dx = ea.x - src.point.x;
        const dy = ea.y - src.point.y;
        const gapS = dx * sv.x + dy * sv.y;
        const gapE = -(dx * ev.x + dy * ev.y);
        const sLen = gapS > 0 && gapS < 2 * cfg.stub ? Math.max(cfg.minStub, gapS / 2) : cfg.stub;
        const eLen = dst.stub ?? (gapE > 0 && gapE < 2 * cfg.stub ? Math.max(cfg.minStub, gapE / 2) : cfg.stub);

        const s: Point = { x: src.point.x + sv.x * sLen, y: src.point.y + sv.y * sLen };
        const e: Point = { x: ea.x + ev.x * eLen, y: ea.y + ev.y * eLen };

        const boxes: Box[] = [];
        for (const o of obstacles) {
            const isSrc = o.shape === src.shape;
            const isDst = o.shape === dst.shape;
            let m = cfg.margin;
            if (isSrc) m = Math.min(m, sLen - 0.5);
            else if (isDst) m = Math.min(m, eLen - 0.5);

            const box: Box = { x0: o.rect.x - m, y0: o.rect.y - m, x1: o.rect.x + o.rect.w + m, y1: o.rect.y + o.rect.h + m };

            if (strictlyInside(box, s) || strictlyInside(box, e)) {
                if (isSrc || isDst) return null;

                const raw: Box = { x0: o.rect.x, y0: o.rect.y, x1: o.rect.x + o.rect.w, y1: o.rect.y + o.rect.h };
                if (!strictlyInside(raw, s) && !strictlyInside(raw, e)) boxes.push(raw);
                continue;
            }
            boxes.push(box);
        }

        const xs = uniqSorted([s.x, e.x, (s.x + e.x) / 2, ...boxes.flatMap((b) => [b.x0, b.x1])]);
        const ys = uniqSorted([s.y, e.y, (s.y + e.y) / 2, ...boxes.flatMap((b) => [b.y0, b.y1])]);
        const nx = xs.length;
        const ny = ys.length;
        const xi = new Map<number, number>();
        const yi = new Map<number, number>();
        xs.forEach((v, i) => xi.set(v, i));
        ys.forEach((v, i) => yi.set(v, i));

        const costH = new Float32Array(nx * ny);
        const costV = new Float32Array(nx * ny);
        const outOfCanvas = (a: number, b: number, limit: number) => a < 0 || b < 0 || a > limit || b > limit;

        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx - 1; ix++) {
                const bad = outOfCanvas(xs[ix], xs[ix + 1], bounds.width) || outOfCanvas(ys[iy], ys[iy], bounds.height);
                costH[iy * nx + ix] = (xs[ix + 1] - xs[ix]) * (bad ? cfg.outside : 1);
            }
        }
        for (let iy = 0; iy < ny - 1; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const bad = outOfCanvas(xs[ix], xs[ix], bounds.width) || outOfCanvas(ys[iy], ys[iy + 1], bounds.height);
                costV[iy * nx + ix] = (ys[iy + 1] - ys[iy]) * (bad ? cfg.outside : 1);
            }
        }

        for (const b of boxes) {
            const i0 = xi.get(snap(b.x0))!;
            const i1 = xi.get(snap(b.x1))!;
            const j0 = yi.get(snap(b.y0))!;
            const j1 = yi.get(snap(b.y1))!;
            for (let iy = j0 + 1; iy < j1; iy++) {
                for (let ix = i0; ix < i1; ix++) costH[iy * nx + ix] = Infinity;
            }
            for (let iy = j0; iy < j1; iy++) {
                for (let ix = i0 + 1; ix < i1; ix++) costV[iy * nx + ix] = Infinity;
            }
        }

        if (this.used.length > 0) {
            for (let iy = 0; iy < ny; iy++) {
                for (let ix = 0; ix < nx - 1; ix++) {
                    const idx = iy * nx + ix;
                    if (costH[idx] !== Infinity) costH[idx] += this.penalty(xs[ix], ys[iy], xs[ix + 1], ys[iy]);
                }
            }
            for (let iy = 0; iy < ny - 1; iy++) {
                for (let ix = 0; ix < nx; ix++) {
                    const idx = iy * nx + ix;
                    if (costV[idx] !== Infinity) costV[idx] += this.penalty(xs[ix], ys[iy], xs[ix], ys[iy + 1]);
                }
            }
        }

        const sIx = xi.get(snap(s.x))!;
        const sIy = yi.get(snap(s.y))!;
        const eIx = xi.get(snap(e.x))!;
        const eIy = yi.get(snap(e.y))!;
        const arrive = (INDEX[side] + 2) & 3;
        const heuristic = (ix: number, iy: number) => Math.abs(xs[ix] - xs[eIx]) + Math.abs(ys[iy] - ys[eIy]);

        let nodes: Point[];
        let pathCost: number;

        if (sIx === eIx && sIy === eIy) {
            nodes = [{ x: xs[sIx], y: ys[sIy] }];
            pathCost = 0;
        } else {
            const states = nx * ny * 4;
            const dist = new Float64Array(states).fill(Infinity);
            const prev = new Int32Array(states).fill(-1);
            const closed = new Uint8Array(states);
            const heap = new MinHeap();
            const startState = (sIy * nx + sIx) * 4 + INDEX[src.side];
            dist[startState] = 0;
            heap.push(heuristic(sIx, sIy), startState);

            let goal = -1;
            while (heap.size > 0) {
                const st = heap.pop();
                if (closed[st]) continue;
                closed[st] = 1;

                const d = st & 3;
                const node = st >> 2;
                const ix = node % nx;
                const iy = (node - ix) / nx;
                if (ix === eIx && iy === eIy) {
                    goal = st;
                    break;
                }

                const g = dist[st];
                for (let nd = 0; nd < 4; nd++) {
                    if (nd === ((d + 2) & 3)) continue;

                    const nix = ix + DX[nd];
                    const niy = iy + DY[nd];
                    if (nix < 0 || nix >= nx || niy < 0 || niy >= ny) continue;

                    let edge: number;
                    if (nd === 1) edge = costH[iy * nx + ix];
                    else if (nd === 3) edge = costH[iy * nx + nix];
                    else if (nd === 2) edge = costV[iy * nx + ix];
                    else edge = costV[niy * nx + ix];
                    if (edge === Infinity) continue;

                    let ng = g + edge + (nd !== d ? cfg.bend : 0);
                    if (nix === eIx && niy === eIy) {
                        if (nd === ((arrive + 2) & 3)) continue;
                        if (nd !== arrive) ng += cfg.bend;
                    }

                    const ns = (niy * nx + nix) * 4 + nd;
                    if (ng < dist[ns]) {
                        dist[ns] = ng;
                        prev[ns] = st;
                        heap.push(ng + heuristic(nix, niy), ns);
                    }
                }
            }

            if (goal < 0) return null;

            nodes = [];
            for (let st = goal; st !== -1; st = prev[st]) {
                const node = st >> 2;
                const ix = node % nx;
                nodes.push({ x: xs[ix], y: ys[(node - ix) / nx] });
            }
            nodes.reverse();
            pathCost = dist[goal];
        }

        return {
            points: simplify([src.point, ...nodes, ea]),
            entry: side,
            cost: pathCost + sLen + eLen,
        };
    }

    private fallback(src: RouteSource, dst: RouteTarget): RouteResult {
        const cfg = ROUTE_STYLE;
        let entry: Side = "n";
        let bestDistance = Infinity;
        for (const side of SIDES) {
            const a = dst.anchors[side];
            const d = Math.abs(a.x - src.point.x) + Math.abs(a.y - src.point.y);
            if (d < bestDistance) {
                bestDistance = d;
                entry = side;
            }
        }

        const sv = VEC[src.side];
        const ev = VEC[entry];
        const ea = dst.anchors[entry];
        const s = { x: src.point.x + sv.x * cfg.stub, y: src.point.y + sv.y * cfg.stub };
        const e = { x: ea.x + ev.x * cfg.stub, y: ea.y + ev.y * cfg.stub };
        const horizontal = src.side === "e" || src.side === "w";
        const elbow = horizontal ? { x: e.x, y: s.y } : { x: s.x, y: e.y };

        return { points: simplify([src.point, s, elbow, e, ea]), entry };
    }
}

export function simplify(points: Point[]): Point[] {
    const unique: Point[] = [];
    for (const p of points) {
        const last = unique[unique.length - 1];
        if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) {
            unique.push(p);
        }
    }

    const result: Point[] = [];
    for (let i = 0; i < unique.length; i++) {
        const a = result[result.length - 1];
        const b = unique[i];
        const c = unique[i + 1];
        if (a && c) {
            const straightX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
            const straightY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
            if (straightX || straightY) continue;
        }
        result.push(b);
    }
    return result;
}

export function roundedPath(points: Point[], radius = ROUTE_STYLE.radius): string {
    if (points.length === 0) return "";
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
        const p0 = points[i - 1];
        const p1 = points[i];
        const p2 = points[i + 1];
        const len1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const len2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const r = Math.min(radius, len1 / 2, len2 / 2);

        if (r < 0.5) {
            d += ` L ${p1.x} ${p1.y}`;
            continue;
        }

        const ax = p1.x + ((p0.x - p1.x) / len1) * r;
        const ay = p1.y + ((p0.y - p1.y) / len1) * r;
        const bx = p1.x + ((p2.x - p1.x) / len2) * r;
        const by = p1.y + ((p2.y - p1.y) / len2) * r;
        d += ` L ${ax} ${ay} Q ${p1.x} ${p1.y} ${bx} ${by}`;
    }

    const last = points[points.length - 1];
    return `${d} L ${last.x} ${last.y}`;
}

export function labelPoint(points: Point[]): Point {
    let best = points[0];
    let bestLength = -1;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length > bestLength) {
            bestLength = length;
            best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
    }
    return best;
}
