export type Rect = { x: number; y: number; w: number; h: number };
export type SnapConfig = { grid: number; snap: boolean; guides: boolean };
export type Guide = { axis: "x" | "y"; pos: number; from: number; to: number };

const EPS = 0.5;

export function linesOf(rect: Rect, axis: "x" | "y"): number[] {
    return axis === "x"
        ? [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
        : [rect.y, rect.y + rect.h / 2, rect.y + rect.h];
}

export function snapValue(value: number, candidates: number[], config: SnapConfig, threshold: number): number {
    if (config.guides) {
        let best: number | null = null;
        for (const candidate of candidates) {
            if (Math.abs(candidate - value) <= threshold && (best === null || Math.abs(candidate - value) < Math.abs(best - value))) {
                best = candidate;
            }
        }
        if (best !== null) return best;
    }
    return config.snap ? Math.round(value / config.grid) * config.grid : value;
}

function snapAxis(rect: Rect, axis: "x" | "y", others: Rect[], config: SnapConfig, threshold: number): number {
    const mine = linesOf(rect, axis);
    if (config.guides) {
        let best: number | null = null;
        for (const other of others) {
            for (const target of linesOf(other, axis)) {
                for (const line of mine) {
                    const delta = target - line;
                    if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) {
                        best = delta;
                    }
                }
            }
        }
        if (best !== null) return best;
    }
    if (config.snap) {
        const origin = axis === "x" ? rect.x : rect.y;
        return Math.round(origin / config.grid) * config.grid - origin;
    }
    return 0;
}

export function snapRect(rect: Rect, others: Rect[], config: SnapConfig, threshold: number): { dx: number; dy: number } {
    return {
        dx: snapAxis(rect, "x", others, config, threshold),
        dy: snapAxis(rect, "y", others, config, threshold),
    };
}

export function edgeCandidates(axis: "x" | "y", others: Rect[]): number[] {
    return others.flatMap((other) => linesOf(other, axis));
}

export function alignmentGuides(rect: Rect, others: Rect[]): Guide[] {
    const guides: Guide[] = [];
    (["x", "y"] as const).forEach((axis) => {
        const cross = axis === "x" ? "y" : "x";
        const seen = new Set<number>();
        linesOf(rect, axis).forEach((line) => {
            const matches = others.filter((other) => linesOf(other, axis).some((candidate) => Math.abs(candidate - line) < EPS));
            if (matches.length === 0) return;
            const key = Math.round(line * 100);
            if (seen.has(key)) return;
            seen.add(key);
            const spans = [rect, ...matches].map((r) => cross === "x" ? [r.x, r.x + r.w] : [r.y, r.y + r.h]);
            guides.push({
                axis,
                pos: line,
                from: Math.min(...spans.map((s) => s[0])),
                to: Math.max(...spans.map((s) => s[1])),
            });
        });
    });
    return guides;
}
