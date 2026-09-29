



export function initTooltip() {
    const tip = document.createElement("div");
    tip.className = "cursor-tooltip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);

    const hide = () => tip.classList.remove("show");

    document.addEventListener("pointermove", (event: PointerEvent) => {
        const owner = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tooltip]") : null;
        const text = owner?.dataset.tooltip;
        if (!owner || !text) {
            hide();
            return;
        }

        if (tip.textContent !== text) {
            tip.textContent = text;
        }
        tip.classList.add("show");

        const offset = 14;
        let x = event.clientX + offset;
        let y = event.clientY + offset + 4;
        if (x + tip.offsetWidth > window.innerWidth - 4) {
            x = event.clientX - offset - tip.offsetWidth;
        }
        if (y + tip.offsetHeight > window.innerHeight - 4) {
            y = event.clientY - offset - tip.offsetHeight;
        }
        tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
    });

    document.addEventListener("pointerleave", hide);
    document.documentElement.addEventListener("mouseleave", hide);
    window.addEventListener("blur", hide);
}
