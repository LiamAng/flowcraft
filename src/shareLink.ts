import { defaultSettings } from "./settings";

const SHARE_FORMAT_VERSION = 2;
const SPARSE_SHARE_FORMAT_VERSION = 3;
const READ_ONLY_SHARE_FORMAT_VERSION = 4;
const EDIT_ONLY_SETTINGS = new Set(["readOnly", "snap", "snapResizeToGrid", "gridSize", "guides"]);
const settingKeys = [
    "title", "description", "decisionBranchLabels", "readOnly", "snap", "snapResizeToGrid",
    "gridSize", "guides", "showGrid", "showSteps", "showStepNumbers", "showShapeContentInSteps",
    "processContentAsCode", "setShapeContentBasedOnProgram", "compressSimulationTable",
    "collapseConsecutiveConditions", "collapseOtherSteps", "autorun", "inputs", "simulationRatio",
    "simulationStepContentMaxWidth", "valueAccuracy", "simulationStepDelay",
] as const;
const shapeTypes = ["process", "decision", "input-output", "initialization", "terminator"] as const;
const directions = ["n", "e", "s", "w"] as const;
const roles = ["next", "altNext"] as const;
const variableTypes = ["number", "string", "variable"] as const;

type CompactShare = [number, unknown[] | Array<[number, unknown]>, unknown[][], unknown[][]];

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isShareUrl(hash: string): boolean {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    return ["d", "g", "fc4d", "fc4g", "fc3d", "fc3g", "fc2d", "fc2g", "fc1"]
        .some((key) => params.has(key));
}

function enumIndex(value: unknown, values: readonly string[], name: string): number {
    const index = values.indexOf(value as string);
    if (index < 0) throw new Error(`The shared flowchart contains an invalid ${name}.`);
    return index;
}

function compactDiagram(json: string): string {
    const diagram = JSON.parse(json) as {
        settings: Record<string, unknown>;
        shapes: Array<Record<string, unknown>>;
        connections: Array<Record<string, unknown>>;
    };
    const ids = new Map(diagram.shapes.map((shape, index) => [shape.id, index]));
    const compact: CompactShare = [
        READ_ONLY_SHARE_FORMAT_VERSION,
        settingKeys.flatMap((key, index) => {
            if (EDIT_ONLY_SETTINGS.has(key)) return [];
            const value = diagram.settings[key];
            if (JSON.stringify(value) === JSON.stringify(defaultSettings[key])) return [];
            const compactValue = key === "decisionBranchLabels"
                ? enumIndex(value, ["yes-no", "true-false"], "decision branch setting")
                : value;
            return [[index, compactValue]];
        }),
        diagram.shapes.map((shape) => [
            enumIndex(shape.type, shapeTypes, "shape type"),
            shape.x, shape.y, shape.width, shape.height, shape.text, shape.programCode,
            Array.isArray(shape.variables)
                ? shape.variables.map((variable) => [
                    variable.name,
                    enumIndex(variable.type, variableTypes, "variable type"),
                    variable.value ?? null,
                ])
                : null,
            shape.terminatorType === undefined ? null : enumIndex(shape.terminatorType, ["start", "end"], "terminator type"),
            shape.inputOutputType === undefined ? null : enumIndex(shape.inputOutputType, ["input", "output"], "Input / Output type"),
        ]),
        diagram.connections.map((connection) => {
            const from = ids.get(connection.from);
            const to = ids.get(connection.to);
            if (from === undefined || to === undefined) {
                throw new Error("A connection refers to a missing shape.");
            }
            return [
                from, to,
                enumIndex(connection.direction, directions, "flowline direction"),
                enumIndex(connection.role, roles, "flowline role"),
                connection.label,
                Array.isArray(connection.waypoints)
                    ? connection.waypoints.map((point) => [
                        point.ox, point.oy, enumIndex(point.dir, directions, "waypoint direction"),
                    ])
                    : null,
            ];
        }),
    ];
    return JSON.stringify(compact);
}

function expandDiagram(json: string): string {
    const compact = JSON.parse(json) as CompactShare;
    if (!Array.isArray(compact) || compact.length !== 4 ||
        (compact[0] !== SHARE_FORMAT_VERSION &&
            compact[0] !== SPARSE_SHARE_FORMAT_VERSION &&
            compact[0] !== READ_ONLY_SHARE_FORMAT_VERSION) ||
        !Array.isArray(compact[1]) || !Array.isArray(compact[2]) || !Array.isArray(compact[3])) {
        throw new Error("The share link contains an unsupported flowchart format.");
    }
    let settingValues: unknown[];
    if (compact[0] === SPARSE_SHARE_FORMAT_VERSION || compact[0] === READ_ONLY_SHARE_FORMAT_VERSION) {
        const sparseSettings = new Map<number, unknown>();
        for (const entry of compact[1]) {
            if (!Array.isArray(entry) || entry.length !== 2 ||
                !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= settingKeys.length ||
                sparseSettings.has(entry[0])) {
                throw new Error("The share link contains invalid settings.");
            }
            sparseSettings.set(entry[0], entry[1]);
        }
        settingValues = settingKeys.map((key, index) =>
            sparseSettings.has(index) ? sparseSettings.get(index) : defaultSettings[key]);
    } else {
        settingValues = compact[1] as unknown[];
    }
    const settings = Object.fromEntries(settingKeys.map((key, index) => [
        key,
        compact[0] === READ_ONLY_SHARE_FORMAT_VERSION && key === "readOnly"
            ? true
            : key === "decisionBranchLabels" && typeof settingValues[index] !== "string"
            ? ["yes-no", "true-false"][Number(settingValues[index])]
            : settingValues[index],
    ]));
    if (settings.decisionBranchLabels !== "yes-no" && settings.decisionBranchLabels !== "true-false") {
        throw new Error("The share link contains an invalid decision branch setting.");
    }
    const shapes = compact[2].map((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 10) {
            throw new Error("The share link contains an invalid shape.");
        }
        const [type, x, y, width, height, text, programCode, rawVariables, terminatorType, inputOutputType] = entry;
        const shapeType = shapeTypes[Number(type)];
        if (!shapeType) throw new Error("The share link contains an invalid shape type.");
        const variables = rawVariables === null ? undefined : (rawVariables as unknown[][]).map((variable) => {
            if (!Array.isArray(variable) || variable.length !== 3) throw new Error("The share link contains invalid variables.");
            const variableType = variableTypes[Number(variable[1])];
            if (!variableType) throw new Error("The share link contains an invalid variable type.");
            return { name: variable[0], type: variableType, ...(variable[2] === null ? {} : { value: variable[2] }) };
        });
        const terminator = terminatorType === null
            ? {}
            : { terminatorType: ["start", "end"][Number(terminatorType)] };
        const ioType = inputOutputType === null
            ? {}
            : { inputOutputType: ["input", "output"][Number(inputOutputType)] };
        return {
            id: `s${index}`,
            type: shapeType,
            x, y, width, height, text, programCode,
            ...(variables ? { variables } : {}),
            ...terminator,
            ...ioType,
        };
    });
    const connections = compact[3].map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 6) {
            throw new Error("The share link contains an invalid flowline.");
        }
        const [from, to, direction, role, label, rawWaypoints] = entry;
        const fromShape = shapes[Number(from)];
        const toShape = shapes[Number(to)];
        const dir = directions[Number(direction)];
        const linkRole = roles[Number(role)];
        if (!fromShape || !toShape || !dir || !linkRole) {
            throw new Error("The share link contains an invalid flowline reference.");
        }
        const waypoints = rawWaypoints === null
            ? undefined
            : (rawWaypoints as unknown[][]).map((point) => {
                if (!Array.isArray(point) || point.length !== 3) throw new Error("The share link contains an invalid flowline corner.");
                const waypointDirection = directions[Number(point[2])];
                if (!waypointDirection) throw new Error("The share link contains an invalid flowline corner.");
                return { ox: point[0], oy: point[1], dir: waypointDirection };
            });
        return {
            from: fromShape.id,
            to: toShape.id,
            direction: dir,
            role: linkRole,
            label,
            ...(waypoints ? { waypoints } : {}),
        };
    });
    return JSON.stringify({ version: 1, settings, shapes, connections });
}

async function transformStream(bytes: Uint8Array, format: "deflate-raw" | "gzip", mode: "compress" | "decompress"): Promise<Uint8Array> {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new Blob([buffer]);
    const stream = mode === "compress"
        ? blob.stream().pipeThrough(new CompressionStream(format))
        : blob.stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createShareUrl(json: string): Promise<string> {
    const compact = compactDiagram(json);
    if (typeof CompressionStream === "undefined") {
        throw new Error("Compressed share links are not supported in this browser. Export the flowchart as a JSON file instead.");
    }
    const bytes = new TextEncoder().encode(compact);
    let format: "deflate-raw" | "gzip" = "deflate-raw";
    let compression: CompressionStream;
    try {
        compression = new CompressionStream(format);
    } catch {
        format = "gzip";
        compression = new CompressionStream(format);
    }
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const compressed = new Uint8Array(await new Response(new Blob([buffer]).stream().pipeThrough(compression)).arrayBuffer());
    const url = new URL(window.location.href);
    url.hash = `${format === "deflate-raw" ? "d" : "g"}=${encodeBase64Url(compressed)}`;
    return url.href;
}

export async function readShareUrl(hash: string): Promise<string | null> {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const rawPayload = params.get("d") ?? params.get("fc4d") ?? params.get("fc3d") ?? params.get("fc2d");
    const gzipPayload = params.get("g") ?? params.get("fc4g") ?? params.get("fc3g") ?? params.get("fc2g");
    const compactPayload = rawPayload ?? gzipPayload;
    if (compactPayload !== null) {
        if (typeof DecompressionStream === "undefined") {
            throw new Error("Compressed share links are not supported in this browser. Open the link in a modern browser or import a JSON file.");
        }
        const format = rawPayload !== null ? "deflate-raw" : "gzip";
        const compressed = decodeBase64Url(compactPayload);
        const bytes = await transformStream(compressed, format, "decompress");
        return expandDiagram(new TextDecoder().decode(bytes));
    }
    const legacyPayload = params.get("fc1");
    if (legacyPayload === null) return null;
    if (typeof DecompressionStream === "undefined") {
        throw new Error("Compressed share links are not supported in this browser. Open the link in a modern browser or import a JSON file.");
    }
    const compressed = decodeBase64Url(legacyPayload);
    const bytes = await transformStream(compressed, "gzip", "decompress");
    return new TextDecoder().decode(bytes);
}
