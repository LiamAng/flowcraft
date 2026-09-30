import { Shape } from "./Shape";

export class Initialization extends Shape {
    protected override isProgrammable(): boolean {
        return true;
    }

    constructor() {
        super();
        this.content.classList.add("initialization");
        this.content.textContent = "Initialize";
        this.width = 180;
        this.height = 80;
        this.minWidth = 180;
        this.minHeight = 80;
        this.ratio = this.minWidth / this.minHeight;
        this.apply();
    }
}
