import type { InputOutputType } from "./shapes";

let menu: HTMLDivElement | null = null;
let resolver: ((type: InputOutputType | null) => void) | null = null;

function finish(type: InputOutputType | null) {
    if (!menu || !resolver) {
        return;
    }
    menu.classList.remove("open");
    const resolve = resolver;
    resolver = null;
    resolve(type);
}

function ensureMenu() {
    if (menu) {
        return menu;
    }

    const el = document.createElement("div");
    el.className = "link-picker";
    el.setAttribute("role", "menu");

    const title = document.createElement("div");
    title.className = "link-picker-title";
    title.textContent = "Input / Output type";
    el.appendChild(title);

    (["input", "output"] as InputOutputType[]).forEach((type) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.innerHTML = `<span class="pick-icon io"></span><span>${type === "input" ? "Input" : "Output"}</span>`;
        button.addEventListener("click", () => finish(type));
        el.appendChild(button);
    });

    const footer = document.createElement("div");
    footer.className = "link-picker-footer";
    footer.textContent = "Esc to cancel";
    el.appendChild(footer);

    document.body.appendChild(el);
    menu = el;

    document.addEventListener("pointerdown", (event: PointerEvent) => {
        if (menu?.classList.contains("open") && !menu.contains(event.target as Node)) {
            finish(null);
        }
    }, true);
    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape" && menu?.classList.contains("open")) {
            finish(null);
        }
    });

    return el;
}

export function pickInputOutputType(clientX: number, clientY: number): Promise<InputOutputType | null> {
    const el = ensureMenu();
    finish(null);

    return new Promise((resolve) => {
        resolver = resolve;
        el.classList.add("open");
        el.style.left = `${Math.max(8, Math.min(clientX + 14, window.innerWidth - el.offsetWidth - 8))}px`;
        el.style.top = `${Math.max(8, Math.min(clientY + 14, window.innerHeight - el.offsetHeight - 8))}px`;
        el.querySelector("button")?.focus({ preventScroll: true });
    });
}
