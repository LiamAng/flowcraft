import { Shape } from "./Shape";

export type TerminatorType = "start" | "end";

export class Terminator extends Shape {
    public terminatorType: TerminatorType = "start";

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

    /** Sets the saved start/end type and seeds the (still freely editable) label to match. */
    setTerminatorType(type: TerminatorType) {
        this.terminatorType = type;
        const display = type === "start" ? "Start" : "End";
        // Shown as a tooltip on hover — see the `.shape[data-terminator-type]:hover::after` rule.
        this.element.dataset.terminatorType = display;
        this.content.textContent = display;
    }
}
