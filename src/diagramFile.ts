import { Decision, InputOutput, Process, Shape, Terminator, type LinkDirection, type LinkRecord, type LinkRole, type Waypoint } from "./shapes";

type ShapeType = "process" | "decision" | "input-output" | "terminator";

type SavedShape = {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    text: string;
    programCode: string;
    terminatorType?: "start" | "end";
    inputOutputType?: "input" | "output";
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
    shapes: SavedShape[];
    connections: SavedConnection[];
};

const directions: LinkDirection[] = ["n", "s", "e", "w"];
const roles: LinkRole[] = ["next", "altNext"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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
            !["process", "decision", "input-output", "terminator"].includes(shape.type) ||
            !Number.isFinite(shape.x) || !Number.isFinite(shape.y) ||
            typeof shape.text !== "string" || typeof shape.programCode !== "string"
        ) {
            throw new Error("The flowchart contains an invalid or duplicate shape.");
        }
        if (shape.type === "terminator" && shape.terminatorType !== "start" && shape.terminatorType !== "end") {
            throw new Error("A terminator has an invalid type.");
        }
        if (shape.type === "input-output" && shape.inputOutputType !== "input" && shape.inputOutputType !== "output") {
            throw new Error("An Input / Output shape has an invalid type.");
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

    return { version: 1, shapes, connections };
}

export function exportDiagramJson(): string {
    const shapeIds = new Map(Shape.all.map((shape) => [shape, shape.id]));
    const shapes: SavedShape[] = Shape.all.map((shape) => ({
        id: shape.id,
        type: shape instanceof Decision ? "decision" : shape instanceof InputOutput ? "input-output" : shape instanceof Terminator ? "terminator" : "process",
        x: shape.posX,
        y: shape.posY,
        text: shape.content.textContent ?? "",
        programCode: shape.programCode,
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
    return JSON.stringify({ version: 1, shapes, connections }, null, 2);
}

export function importDiagramJson(json: string, addShape: (shape: Shape) => Shape) {
    const diagram = parseDiagram(json);
    Shape.removeShapes([...Shape.all]);

    const shapes = new Map<string, Shape>();
    diagram.shapes.forEach((saved) => {
        const shape = saved.type === "decision" ? new Decision()
            : saved.type === "input-output" ? new InputOutput(saved.inputOutputType)
            : saved.type === "terminator" ? new Terminator(saved.terminatorType)
            : new Process();
        shape.programCode = saved.programCode;
        shape.content.textContent = saved.text;
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
