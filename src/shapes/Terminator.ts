import { Shape } from "./Shape";

export type TerminatorType = "start" | "end";

export class Terminator extends Shape {
    public terminatorType: TerminatorType = "start";

    protected override getLinkLimit(): number {
        return this.terminatorType === "end" ? 0 : 1;
    }

    constructor(type: TerminatorType = "start") {
        super();
        this.content.classList.add("pill");
        this.width = 180;
        this.height = 80;
        this.minWidth = 180;
        this.minHeight = 80;
        this.ratio = this.minWidth / this.minHeight;
        this.setTerminatorType(type);
        this.apply();
    }

    setTerminatorType(type: TerminatorType) {
        this.terminatorType = type;
        const display = type === "start" ? "Start" : "End";

        this.element.dataset.tooltip = display;
        this.content.textContent = display;
    }
}
