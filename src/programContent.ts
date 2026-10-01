import { Decision, Initialization, InputOutput, Shape } from "./shapes";
import { settings } from "./settings";

export function getShapeContentPrefix(shape: Shape): string {
    const fallback = shape instanceof InputOutput
        ? shape.inputOutputType === "input" ? "Input" : "Output"
        : shape instanceof Initialization ? "Initialize" : "Is";
    const content = shape.content.innerText.replace(/\r\n?/g, "\n").trim();
    if (shape instanceof Decision) {
        const expression = shape.programCode.trim();
        const suffix = expression ? ` (${expression})` : "";
        if (suffix && content.endsWith(suffix)) return content.slice(0, -suffix.length).trim() || fallback;
        return content.split("\n", 1)[0].trim() || fallback;
    }
    const prefix = shape.content.innerText.replace(/\r\n?/g, "\n").split("\n", 1)[0].trim();
    if (!prefix || (
        shape instanceof Initialization &&
        prefix !== "Initialize" &&
        /^[A-Za-z_$][\w$]*\s*=/.test(prefix)
    )) return fallback;
    return prefix;
}

export function isProgramGeneratedShape(shape: Shape): boolean {
    return shape instanceof InputOutput || shape instanceof Initialization || shape instanceof Decision;
}

export function updateShapeContentFromProgram(shape: Shape): void {
    const isProgramDerived = settings.setShapeContentBasedOnProgram && isProgramGeneratedShape(shape);
    shape.content.dataset.programDerived = String(isProgramDerived);
    shape.content.title = isProgramDerived
        ? "This content is generated from the program. Edit the program to change it."
        : "";
    shape.content.contentEditable = "false";
    if (!isProgramDerived) return;

    if (shape instanceof InputOutput) {
        const prefix = getShapeContentPrefix(shape);
        const details = shape.inputOutputType === "input"
            ? (shape.variables.length > 0
                ? shape.variables.map(({ name }) => name)
                : shape.programCode.split(",").map((name) => name.trim()).filter(Boolean)
            ).join(", ")
            : shape.programCode.trim();
        shape.content.textContent = details ? `${prefix}\n${details}` : prefix;
        return;
    }

    if (shape instanceof Initialization) {
        const prefix = getShapeContentPrefix(shape);
        const details = shape.variables
            .filter(({ name }) => Boolean(name))
            .map(({ name, value }) => `${name} = ${value === undefined ? "" : String(value)}`)
            .join("\n");
        shape.content.textContent = prefix === "Initialize"
            ? details
            : details ? `${prefix}\n${details}` : prefix;
        return;
    }

    if (shape instanceof Decision) {
        const prefix = getShapeContentPrefix(shape);
        const expression = shape.programCode.trim();
        shape.content.textContent = expression ? `${prefix} (${expression})` : prefix;
    }
}

export function updateAllShapeContentFromProgram(): void {
    Shape.all.forEach(updateShapeContentFromProgram);
}
