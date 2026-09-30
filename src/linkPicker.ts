import { Shape, Process, Decision, InputOutput, Terminator } from "./shapes";
import { pickInputOutputType } from "./inputOutputPicker";

type Option = { label: string; icon: string; create: () => Shape; pick?: (x: number, y: number) => Promise<Shape | null> };

const OPTIONS: Option[] = [
    { label: "Process", icon: "process", create: () => new Process() },
    { label: "Decision", icon: "decision", create: () => new Decision() },
    {
        label: "Input / Output",
        icon: "io",
        create: () => new InputOutput(),
        pick: (x, y) => pickInputOutputType(x, y).then((type) => type ? new InputOutput(type) : null),
    },

    { label: "Terminator (End)", icon: "terminator", create: () => new Terminator("end") },
];

export function initLinkPicker(chart: HTMLElement, addShape: (shape: Shape) => Shape) {
    const menu = document.createElement("div");
    menu.className = "link-picker";
    menu.setAttribute("role", "menu");

    const title = document.createElement("div");
    title.className = "link-picker-title";
    title.textContent = "Connect to new…";
    menu.appendChild(title);

    let anchor = { x: 0, y: 0 };
    let canvasAnchor = { x: 0, y: 0 };

    OPTIONS.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.innerHTML = `<span class="pick-icon ${option.icon}"></span><span>${option.label}</span>`;
        button.addEventListener("click", async () => {
            if (!Shape.pendingLink) {
                return;
            }
            const shape = option.pick ? await option.pick(anchor.x, anchor.y) : option.create();
            if (!shape || !Shape.pendingLink) {
                return;
            }
            addShape(shape);
            shape.setCenter(canvasAnchor.x, canvasAnchor.y);
            Shape.completeLink(shape);
        });
        menu.appendChild(button);
    });

    const footer = document.createElement("div");
    footer.className = "link-picker-footer";
    footer.textContent = "Esc to cancel";
    menu.appendChild(footer);

    const hint = document.createElement("div");
    hint.className = "link-hint";
    hint.textContent = "Click a shape to connect it, or click empty space to add a new one · Esc to cancel";

    document.body.append(menu, hint);

    const open = (x: number, y: number) => {
        anchor = { x, y };
        canvasAnchor = Shape.clientToCanvas(x, y);
        Shape.freezeGhostAt(x, y);
        menu.classList.add("open");

        const left = Math.min(x + 14, window.innerWidth - menu.offsetWidth - 8);
        const top = Math.min(y + 14, window.innerHeight - menu.offsetHeight - 8);
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${Math.max(8, top)}px`;
        menu.querySelector("button")?.focus({ preventScroll: true });
    };

    const close = () => {
        if (menu.classList.contains("open")) {
            menu.classList.remove("open");
            Shape.unfreezeGhost();
        }
    };

    chart.addEventListener("pointerdown", (event: PointerEvent) => {
        if (!Shape.pendingLink || !(event.target === chart || event.target === Shape.canvas)) {
            return;
        }
        event.preventDefault();
        open(event.clientX, event.clientY);
    });

    document.addEventListener(
        "pointerdown",
        (event: PointerEvent) => {
            if (menu.classList.contains("open") && !menu.contains(event.target as Node)) {
                close();
            }
        },
        true
    );

    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            Shape.cancelLink();
        }
    });

    document.addEventListener("flowcraft:linkstate", (event) => {
        const active = (event as CustomEvent<{ active: boolean }>).detail.active;
        hint.classList.toggle("show", active);
        if (!active) {
            menu.classList.remove("open");
        }
    });
}
