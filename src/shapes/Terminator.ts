import { Shape } from "./Shape";

export class Terminator extends Shape {
    constructor() {
        super();
        this.content.classList.add("pill");
        this.width = 180;
        this.height = 80;
        this.minWidth = 180;
        this.minHeight = 80;
        this.ratio = this.minWidth / this.minHeight;
        this.apply();
    }
}
