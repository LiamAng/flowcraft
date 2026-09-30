import { applySettings, defaultSettings, sanitizeSettings, snapshotSettings, type Settings } from "./settings";
import { Decision, Initialization, InputOutput, Process, Shape, Terminator, type LinkDirection, type LinkRecord, type LinkRole, type VariableDefinition, type Waypoint } from "./shapes";

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
    return JSON.stringify({ version: 1, settings: snapshotSettings(), shapes, connections }, null, 2);
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
