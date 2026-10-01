import { Decision, Initialization, InputOutput, Shape } from "./shapes";
import { settings } from "./settings";

function currentPrefix(shape: Shape, fallback: string): string {
    const prefix = shape.content.innerText.replace(/\r\n?/g, "\n").split("\n", 1)[0].trim();
    if (!prefix || (shape instanceof Initialization && prefix === "Initialize")) return fallback;
    return prefix;
}

export function updateShapeContentFromProgram(shape: Shape): void {
    const isDerivedShape = shape instanceof InputOutput || shape instanceof Initialization || shape instanceof Decision;
    const isProgramDerived = settings.setShapeContentBasedOnProgram && isDerivedShape;
    shape.content.dataset.programDerived = String(isProgramDerived);
    shape.content.title = isProgramDerived
        ? "This content is generated from the program. Edit the program to change it."
        : "";
    shape.content.contentEditable = "false";
    if (!isProgramDerived) return;

    if (shape instanceof InputOutput) {
        const defaultPrefix = shape.inputOutputType === "input" ? "Input" : "Output";
        const prefix = currentPrefix(shape, defaultPrefix);
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
        shape.content.textContent = shape.variables
            .filter(({ name }) => Boolean(name))
            .map(({ name, value }) => `${name} = ${value === undefined ? "" : String(value)}`)
            .join("\n");
        return;
    }

    if (shape instanceof Decision) {
        const expression = shape.programCode.trim();
        shape.content.textContent = expression ? `Is (${expression})` : "Is";
    }
}

export function updateAllShapeContentFromProgram(): void {
    Shape.all.forEach(updateShapeContentFromProgram);
}
