import { Decision, InputOutput, Shape } from "./shapes";
import { settings } from "./settings";

let dialog: HTMLDialogElement | null = null;
let editor: HTMLTextAreaElement | null = null;
let activeShape: Shape | null = null;

function createDialog() {
    const element = document.createElement("dialog");
    element.className = "program-editor";

    const form = document.createElement("form");
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (activeShape && editor) {
            activeShape.programCode = editor.value;
            Shape.notifyDiagramChange();
        }
        element.close();
    });

    const title = document.createElement("h2");
    title.textContent = "Edit shape code";

    const label = document.createElement("label");
    label.textContent = "Code";

    editor = document.createElement("textarea");
    editor.spellcheck = false;
    editor.setAttribute("aria-label", "Shape code");
    label.appendChild(editor);

    const help = document.createElement("p");
    help.className = "program-editor-help";

    const actions = document.createElement("div");
    actions.className = "program-editor-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => element.close());

    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";

    actions.append(cancel, save);
    form.append(title, label, help, actions);
    element.appendChild(form);
    element.addEventListener("close", () => {
        activeShape = null;
    });
    document.body.appendChild(element);
    dialog = element;
}

export function openProgramEditor(shape: Shape) {
    if (!dialog || !editor) {
        createDialog();
    }
    if (!dialog || !editor) {
        throw new Error("Failed to initialize the shape code editor.");
    }

    activeShape = shape;
    editor.value = shape.programCode;
    const help = dialog.querySelector<HTMLElement>(".program-editor-help");
    let guidance: string;
    if (shape instanceof InputOutput) {
        guidance = shape.inputOutputType === "input"
            ? "Enter one or more variable names separated by commas, e.g. Name, LastName, PhoneNumber. Simulation asks for each value or reads it from the inputs URL parameter."
            : "Enter a JavaScript expression to display as the output.";
    } else if (shape instanceof Decision) {
        const [positive, negative] = settings.decisionBranchLabels === "true-false" ? ["True", "False"] : ["Yes", "No"];
        guidance = `Enter a JavaScript expression. A truthy result follows ${positive}; a false result follows ${negative}.`;
    } else {
        guidance = "Enter JavaScript statements. Variables are shared with later steps; declare new variables with let or var.";
    }
    if (help) help.textContent = guidance;
    dialog.showModal();
    editor.focus();
}
