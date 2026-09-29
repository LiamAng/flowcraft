import type { TerminatorType } from "./shapes";

/**
 * Small popover asking whether a just-placed Terminator is a Start or an End.
 * Reuses the .link-picker card styling. Singleton: one menu element, reused
 * across calls; only one pick can be in flight at a time.
 */

let menu: HTMLDivElement | null = null;
let resolver: ((type: TerminatorType | null) => void) | null = null;

function finish(type: TerminatorType | null) {
    if (!menu || !resolver) {
        return;
    }
    menu.classList.remove("open");
    const resolve = resolver;
    resolver = null;
    resolve(type);
}

function ensureMenu(): HTMLDivElement {
    if (menu) {
        return menu;
    }

    const el = document.createElement("div");
    el.className = "link-picker terminator-picker";
    el.setAttribute("role", "menu");

    const title = document.createElement("div");
    title.className = "link-picker-title";
    title.textContent = "Terminator type";
    el.appendChild(title);

    (["start", "end"] as TerminatorType[]).forEach((type) => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "menuitem");
        button.innerHTML = `<span class="pick-icon terminator"></span><span>${type === "start" ? "Start" : "End"}</span>`;
        button.addEventListener("click", () => finish(type));
        el.appendChild(button);
    });

    const footer = document.createElement("div");
    footer.className = "link-picker-footer";
    footer.textContent = "Esc to cancel";
    el.appendChild(footer);

    document.body.appendChild(el);
    menu = el;

    document.addEventListener(
        "pointerdown",
        (event: PointerEvent) => {
            if (menu!.classList.contains("open") && !menu!.contains(event.target as Node)) {
                finish(null);
            }
        },
        true
    );

    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Escape" && menu!.classList.contains("open")) {
            finish(null);
        }
    });

    return el;
}

/** Opens the popover near (clientX, clientY) and resolves with the chosen type, or null if dismissed. */
export function pickTerminatorType(clientX: number, clientY: number): Promise<TerminatorType | null> {
    const el = ensureMenu();

    // Cancel any pick that's still hanging around (shouldn't normally happen).
    finish(null);

    return new Promise((resolve) => {
        resolver = resolve;
        el.classList.add("open");

        const left = Math.min(clientX + 14, window.innerWidth - el.offsetWidth - 8);
        const top = Math.min(clientY + 14, window.innerHeight - el.offsetHeight - 8);
        el.style.left = `${Math.max(8, left)}px`;
        el.style.top = `${Math.max(8, top)}px`;
        (el.querySelector("button") as HTMLElement | null)?.focus({ preventScroll: true });
    });
}
