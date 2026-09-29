import type { Shape } from "./shapes";

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
    form.append(title, label, actions);
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
    dialog.showModal();
    editor.focus();
}
