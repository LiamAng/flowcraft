import { Shape } from "./Shape";

export class Process extends Shape {
    protected override isProgrammable(): boolean {
        return true;
    }

    constructor() {
        super();
        this.content.classList.add("rectangle");
        this.width = 160;
        this.height = 80;
        this.minWidth = 160;
        this.minHeight = 80;
        this.ratio = this.minWidth / this.minHeight;
        this.apply();
    }
}
