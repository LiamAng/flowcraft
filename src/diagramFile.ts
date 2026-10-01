import { applySettings, defaultSettings, sanitizeSettings, settings, snapshotSettings, type Settings } from "./settings";
import { Decision, Initialization, InputOutput, Process, Shape, Terminator, type LinkDirection, type LinkRecord, type LinkRole, type VariableDefinition, type Waypoint } from "./shapes";
import { labelPoint, roundedPath } from "./router";

type ShapeType = "process" | "decision" | "input-output" | "initialization" | "terminator";

type SavedShape = {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    text: string;
    programCode: string;
    terminatorType?: "start" | "end";
    inputOutputType?: "input" | "output";
    variables?: VariableDefinition[];
};

type SavedConnection = {
    from: string;
    to: string;
    direction: LinkDirection;
    role: LinkRole;
    label: string;
    waypoints?: Waypoint[];
};

type DiagramFile = {
    version: 1;
    settings: Partial<Settings>;
    shapes: SavedShape[];
    connections: SavedConnection[];
    preview?: {
        mimeType: "image/svg+xml";
        data: string;
        width: number;
        height: number;
    };
};

const directions: LinkDirection[] = ["n", "s", "e", "w"];
const roles: LinkRole[] = ["next", "altNext"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PREVIEW_MAX_WIDTH = 1200;
const PREVIEW_MAX_HEIGHT = 800;

function escapeXml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
    })[character]!);
}

function wrapPreviewText(value: string, maxCharacters: number): string[] {
    const lines: string[] = [];
    value.replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
        const words = line.split(/\s+/).filter(Boolean);
        let current = "";
        words.forEach((word) => {
            while (word.length > maxCharacters) {
                if (current) {
                    lines.push(current);
                    current = "";
                }
                lines.push(Array.from(word).slice(0, maxCharacters).join(""));
                word = Array.from(word).slice(maxCharacters).join("");
            }
            if (current && current.length + word.length + 1 > maxCharacters) {
                lines.push(current);
                current = word;
            } else {
                current = current ? `${current} ${word}` : word;
            }
        });
        lines.push(current);
    });
    return lines.length ? lines : [""];
}

function createPreviewImage(): { data: string; width: number; height: number } {
    Shape.refreshConnections();
    const bounds = Shape.getDiagramBounds();
    const contentBounds = bounds ?? { x0: 0, y0: 0, x1: 320, y1: 180 };
    const title = snapshotSettings().title;
    const description = snapshotSettings().description;
    const headingHeight = title || description ? (title ? 38 : 0) + (description ? 26 : 0) + 20 : 0;
    const padding = 36;
    const viewWidth = Math.max(1, contentBounds.x1 - contentBounds.x0) + padding * 2;
    const viewHeight = Math.max(1, contentBounds.y1 - contentBounds.y0) + padding * 2 + headingHeight;
    const scale = Math.min(PREVIEW_MAX_WIDTH / viewWidth, PREVIEW_MAX_HEIGHT / viewHeight, 1);
    const width = Math.max(1, Math.round(viewWidth * scale));
    const height = Math.max(1, Math.round(viewHeight * scale));
    const translateX = padding - contentBounds.x0;
    const translateY = padding + headingHeight - contentBounds.y0;
    const output: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${viewHeight}" role="img">`,
        `<rect width="${viewWidth}" height="${viewHeight}" fill="#ffffff"/>`,
        '<defs><marker id="preview-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0.5 L 10 5 L 0 9.5 L 2.5 5 z" fill="#475569"/></marker></defs>',
    ];

    let headingY = 30;
    if (title) {
        output.push(`<text x="${viewWidth / 2}" y="${headingY}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="22" font-weight="600" fill="#0f172a">${escapeXml(title)}</text>`);
        headingY += 34;
    }
    if (description) {
        output.push(`<text x="${viewWidth / 2}" y="${headingY}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="#64748b">${escapeXml(description)}</text>`);
    }

    output.push(`<g transform="translate(${translateX} ${translateY})">`);
    Shape.connections.forEach((link, index) => {
        const points = Shape.routedConnectionPoints[index];
        if (!points?.length) return;
        output.push(`<path d="${roundedPath(points)}" fill="none" stroke="#475569" stroke-width="1.75" stroke-linejoin="round" marker-end="url(#preview-arrow)"/>`);
        const label = link.from instanceof Decision
            ? settings.decisionBranchLabels === "true-false"
                ? (link.role === "next" ? "True" : "False")
                : (link.role === "next" ? "Yes" : "No")
            : link.label;
        if (label) {
            const position = labelPoint(points);
            output.push(`<text x="${position.x}" y="${position.y}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-size="12" fill="#334155" stroke="#ffffff" stroke-width="5" paint-order="stroke">${escapeXml(label)}</text>`);
        }
    });

    Shape.all.forEach((shape, index) => {
        const { x: shapeWidth, y: shapeHeight } = shape.getSize();
        const x = shape.posX;
        const y = shape.posY;
        const fill = shape instanceof Initialization ? "#14b8a6" : "#6495ed";
        const text = shape.content.innerText.replace(/\u00a0/g, " ").trim();
        const maxCharacters = Math.max(1, Math.floor((shapeWidth - 24) / 8));
        const lines = wrapPreviewText(text, maxCharacters);
        const lineHeight = 18;
        const firstLineY = y + shapeHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
        const clipId = `preview-shape-${index}`;

        let outline: string;
        if (shape instanceof Decision) {
            outline = `<polygon points="${x + shapeWidth / 2},${y} ${x + shapeWidth},${y + shapeHeight / 2} ${x + shapeWidth / 2},${y + shapeHeight} ${x},${y + shapeHeight / 2}" fill="${fill}"/>`;
        } else if (shape instanceof InputOutput) {
            const inset = shapeWidth * 0.12;
            outline = `<polygon points="${x + inset},${y} ${x + shapeWidth},${y} ${x + shapeWidth - inset},${y + shapeHeight} ${x},${y + shapeHeight}" fill="${fill}"/>`;
        } else if (shape instanceof Initialization) {
            const inset = shapeWidth * 0.18;
            outline = `<polygon points="${x + inset},${y} ${x + shapeWidth - inset},${y} ${x + shapeWidth},${y + shapeHeight / 2} ${x + shapeWidth - inset},${y + shapeHeight} ${x + inset},${y + shapeHeight} ${x},${y + shapeHeight / 2}" fill="${fill}"/>`;
        } else if (shape instanceof Terminator) {
            outline = `<rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}" rx="${shapeHeight / 2}" fill="${fill}"/>`;
        } else {
            outline = `<rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}" rx="3" fill="${fill}"/>`;
        }

        output.push(`<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${shapeWidth}" height="${shapeHeight}"/></clipPath></defs>`);
        output.push(outline);
        output.push(`<g clip-path="url(#${clipId})" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">`);
        lines.forEach((line, lineIndex) => {
            output.push(`<text x="${x + shapeWidth / 2}" y="${firstLineY + lineIndex * lineHeight}" dominant-baseline="middle">${escapeXml(line)}</text>`);
        });
        output.push("</g>");
    });
    output.push("</g></svg>");
    return { data: `data:image/svg+xml,${encodeURIComponent(output.join(""))}`, width, height };
}

function parseDiagram(json: string): DiagramFile {
    if (json.length > MAX_FILE_SIZE) {
        throw new Error("The flowchart file is larger than 5 MB.");
    }
    const data: unknown = JSON.parse(json);
    if (!data || typeof data !== "object") {
        throw new Error("The file does not contain a flowchart.");
    }

    const candidate = data as Partial<DiagramFile>;
    if (candidate.version !== 1 || !Array.isArray(candidate.shapes) || !Array.isArray(candidate.connections)) {
        throw new Error("Unsupported or invalid flowchart file.");
    }

    const ids = new Set<string>();
    const shapes = candidate.shapes.map((value): SavedShape => {
        if (!value || typeof value !== "object") {
            throw new Error("The flowchart contains an invalid shape.");
        }
        const shape = value as SavedShape;
        if (
            typeof shape.id !== "string" || !shape.id || ids.has(shape.id) ||
            !["process", "decision", "input-output", "initialization", "terminator"].includes(shape.type) ||
            !Number.isFinite(shape.x) || !Number.isFinite(shape.y) ||
            (shape.width !== undefined && (!Number.isFinite(shape.width) || shape.width < Shape.MIN_DRAG || shape.width > Shape.MAX_SIZE)) ||
            (shape.height !== undefined && (!Number.isFinite(shape.height) || shape.height < Shape.MIN_DRAG || shape.height > Shape.MAX_SIZE)) ||
            typeof shape.text !== "string" || typeof shape.programCode !== "string" ||
            (shape.variables !== undefined && (!Array.isArray(shape.variables) || shape.variables.some((variable) =>
                !variable || typeof variable.name !== "string" ||
                !/^[A-Za-z_$][\w$]*$/.test(variable.name) ||
                (variable.type !== "number" && variable.type !== "string" && variable.type !== "variable") ||
                (variable.value !== undefined && typeof variable.value !== "number" && typeof variable.value !== "string") ||
                (typeof variable.value === "number" && !Number.isFinite(variable.value))
            )))
        ) {
            throw new Error("The flowchart contains an invalid or duplicate shape.");
        }
        if (shape.type === "terminator" && shape.terminatorType !== "start" && shape.terminatorType !== "end") {
            throw new Error("A terminator has an invalid type.");
        }
        if (shape.type === "input-output" && shape.inputOutputType !== "input" && shape.inputOutputType !== "output") {
            throw new Error("An Input / Output shape has an invalid type.");
        }
        if (shape.variables) {
            const variableNames = new Set<string>();
            shape.variables.forEach((variable) => {
                if (variableNames.has(variable.name)) {
                    throw new Error("The flowchart contains duplicate variable names in a shape.");
                }
                variableNames.add(variable.name);
                if (variable.type === "number" && variable.value !== undefined && typeof variable.value !== "number") {
                    throw new Error("The flowchart contains an invalid numeric initial value.");
                }
                if (variable.type === "string" && variable.value !== undefined && typeof variable.value !== "string") {
                    throw new Error("The flowchart contains an invalid string initial value.");
                }
                if (variable.type === "variable" && (
                    shape.type !== "initialization" ||
                    typeof variable.value !== "string" ||
                    !/^[A-Za-z_$][\w$]*$/.test(variable.value)
                )) {
                    throw new Error("The flowchart contains an invalid source variable.");
                }
            });
        }
        if (shape.type === "initialization" && (!shape.variables?.length || shape.variables.some((variable) =>
            variable.value === undefined || variable.value === ""
        ))) {
            throw new Error("An Initialization shape must define variables with initial values.");
        }
        ids.add(shape.id);
        return shape;
    });

    const connections = candidate.connections.map((value): SavedConnection => {
        if (!value || typeof value !== "object") {
            throw new Error("The flowchart contains an invalid connection.");
        }
        const link = value as SavedConnection;
        if (
            typeof link.from !== "string" || typeof link.to !== "string" ||
            !ids.has(link.from) || !ids.has(link.to) || link.from === link.to ||
            !directions.includes(link.direction) || !roles.includes(link.role) ||
            typeof link.label !== "string" ||
            (link.waypoints !== undefined && (!Array.isArray(link.waypoints) || link.waypoints.some((point) =>
                !point || !Number.isFinite(point.ox) || !Number.isFinite(point.oy) || !directions.includes(point.dir)
            )))
        ) {
            throw new Error("The flowchart contains an invalid connection.");
        }
        return link;
    });

    return { version: 1, settings: sanitizeSettings(candidate.settings), shapes, connections };
}

export function exportDiagramJson(): string {
    const shapeIds = new Map(Shape.all.map((shape) => [shape, shape.id]));
    const shapes: SavedShape[] = Shape.all.map((shape) => ({
        id: shape.id,
        type: shape instanceof Decision ? "decision" : shape instanceof InputOutput ? "input-output" : shape instanceof Initialization ? "initialization" : shape instanceof Terminator ? "terminator" : "process",
        x: shape.posX,
        y: shape.posY,
        width: shape.getSize().x,
        height: shape.getSize().y,
        text: shape.content.innerText.replace(/\r\n?/g, "\n"),
        programCode: shape.programCode,
        ...(shape.variables.length > 0 ? { variables: shape.variables.map((variable) => ({ ...variable })) } : {}),
        ...(shape instanceof Terminator ? { terminatorType: shape.terminatorType } : {}),
        ...(shape instanceof InputOutput ? { inputOutputType: shape.inputOutputType } : {}),
    }));
    const connections: SavedConnection[] = Shape.connections.map((link) => ({
        from: shapeIds.get(link.from)!,
        to: shapeIds.get(link.to)!,
        direction: link.direction,
        role: link.role,
        label: link.label,
        ...(link.waypoints ? { waypoints: link.waypoints.map((point) => ({ ...point })) } : {}),
    }));
    return JSON.stringify({
        version: 1,
        settings: snapshotSettings(),
        shapes,
        connections,
        preview: { mimeType: "image/svg+xml", ...createPreviewImage() },
    }, null, 2);
}

export function importDiagramJson(json: string, addShape: (shape: Shape) => Shape) {
    const diagram = parseDiagram(json);
    Shape.removeShapes([...Shape.all]);
    applySettings({ ...defaultSettings, inputs: {}, ...diagram.settings });

    const shapes = new Map<string, Shape>();
    diagram.shapes.forEach((saved) => {
        const shape = saved.type === "decision" ? new Decision()
            : saved.type === "input-output" ? new InputOutput(saved.inputOutputType)
            : saved.type === "initialization" ? new Initialization()
            : saved.type === "terminator" ? new Terminator(saved.terminatorType)
            : new Process();
        shape.programCode = saved.programCode;
        shape.variables = saved.variables?.map((variable) => ({ ...variable })) ?? [];
        shape.content.textContent = saved.text;
        if (saved.width !== undefined && saved.height !== undefined) {
            shape.restoreSize(saved.width, saved.height);
        }
        shape.setCenter(saved.x + shape.getSize().x / 2, saved.y + shape.getSize().y / 2, false);
        addShape(shape);
        shapes.set(saved.id, shape);
    });

    const connections: LinkRecord[] = diagram.connections.map((saved) => {
        const from = shapes.get(saved.from);
        const to = shapes.get(saved.to);
        if (!from || !to) {
            throw new Error("A connection refers to a missing shape.");
        }
        return {
            from,
            to,
            direction: saved.direction,
            role: saved.role,
            label: saved.label,
            ...(saved.waypoints ? { waypoints: saved.waypoints.map((point) => ({ ...point })) } : {}),
        };
    });
    Shape.replaceConnections(connections);
}

export function downloadDiagram() {
    const url = URL.createObjectURL(new Blob([exportDiagramJson()], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flowchart.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
