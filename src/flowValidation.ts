import { Shape } from "./shapes";
import { Decision } from "./shapes/Decision";
import { Terminator } from "./shapes/Terminator";

export function validateFlowchart(): string[] {
    const issues: string[] = [];
    const starts = Shape.all.filter((shape) => shape instanceof Terminator && shape.terminatorType === "start");
    const ends = Shape.all.filter((shape) => shape instanceof Terminator && shape.terminatorType === "end");

    if (starts.length !== 1) {
        issues.push(starts.length === 0 ? "Add one Start terminator." : "Only one Start terminator is allowed.");
    }
    if (ends.length !== 1) {
        issues.push(ends.length === 0 ? "Add one End terminator." : "Only one End terminator is allowed.");
    }

    Shape.all.forEach((shape) => {
        const outgoing = Shape.connections.filter((link) => link.from === shape);
        if (outgoing.length !== shape.getRequiredOutlinkCount()) {
            issues.push(`${shapeLabel(shape)} needs ${shape.getRequiredOutlinkCount()} outgoing flowline${shape.getRequiredOutlinkCount() === 1 ? "" : "s"}; it has ${outgoing.length}.`);
        }
        if (shape instanceof Decision) {
            const yesCount = outgoing.filter((link) => link.role === "next").length;
            const noCount = outgoing.filter((link) => link.role === "altNext").length;
            if (yesCount !== 1 || noCount !== 1) {
                issues.push(`${shapeLabel(shape)} needs one Yes and one No flowline.`);
            }
        }
    });

    if (starts.length === 1 && ends.length === 1) {
        const start = starts[0];
        const end = ends[0];
        if (Shape.connections.some((link) => link.to === start)) {
            issues.push("The Start terminator must not have an incoming flowline.");
        }

        const reachableFromStart = walk(start, false);
        const canReachEnd = walk(end, true);
        Shape.all.forEach((shape) => {
            if (!reachableFromStart.has(shape)) {
                issues.push(`${shapeLabel(shape)} is not reachable from Start.`);
            }
            if (!canReachEnd.has(shape)) {
                issues.push(`${shapeLabel(shape)} has no path to End.`);
            }
        });
    }

    return issues;
}

function shapeLabel(shape: Shape): string {
    const kind = shape instanceof Decision ? "Decision" : shape instanceof Terminator ? `${shape.terminatorType === "start" ? "Start" : "End"} terminator` : shape.content.textContent?.trim() || "Shape";
    return `${kind} (${shape.id})`;
}

function walk(origin: Shape, reverse: boolean): Set<Shape> {
    const visited = new Set<Shape>([origin]);
    const pending = [origin];
    while (pending.length > 0) {
        const current = pending.pop()!;
        Shape.connections.forEach((link) => {
            const from = reverse ? link.to : link.from;
            const to = reverse ? link.from : link.to;
            if (from === current && !visited.has(to)) {
                visited.add(to);
                pending.push(to);
            }
        });
    }
    return visited;
}

export function initFlowValidation() {
    const container = document.createElement("div");
    container.className = "flow-validation";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "flow-validation-button";
    button.setAttribute("aria-label", "Show flowchart warnings");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01"/></svg>';

    const count = document.createElement("span");
    count.className = "flow-validation-count";
    count.hidden = true;
    button.appendChild(count);

    const panel = document.createElement("div");
    panel.className = "flow-validation-panel";
    panel.hidden = true;
    panel.setAttribute("role", "status");

    button.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.addEventListener("pointerdown", (event) => {
        if (!container.contains(event.target as Node)) {
            panel.hidden = true;
            button.setAttribute("aria-expanded", "false");
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            panel.hidden = true;
            button.setAttribute("aria-expanded", "false");
        }
    });

    container.append(button, panel);
    document.body.appendChild(container);

    const update = () => {
        const issues = validateFlowchart();
        count.hidden = issues.length === 0;
        count.textContent = String(issues.length);
        button.classList.toggle("has-issues", issues.length > 0);
        button.setAttribute("aria-label", issues.length ? `Show ${issues.length} flowchart warning${issues.length === 1 ? "" : "s"}` : "No flowchart warnings");
        panel.replaceChildren();

        if (issues.length === 0) {
            const message = document.createElement("p");
            message.textContent = "No flowchart warnings.";
            panel.appendChild(message);
        } else {
            const list = document.createElement("ul");
            issues.forEach((issue) => {
                const item = document.createElement("li");
                item.textContent = issue;
                list.appendChild(item);
            });
            panel.appendChild(list);
        }
    };

    document.addEventListener("flowcraft:diagramchange", update);
    update();
}
