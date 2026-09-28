import { Shape } from "./Shape";

export class Process extends Shape {
    constructor() {
        super();
        this.content.classList.add("rectangle");
    }
}
