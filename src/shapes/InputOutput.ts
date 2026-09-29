import { Shape, LinkDirection } from "./Shape";

export class InputOutput extends Shape {
    protected override isProgrammable(): boolean {
        return true;
    }

    protected override getEdgePoint(direction: LinkDirection): { x: number; y: number } {
        const point = super.getEdgePoint(direction);
        if (direction === "w") {
            return { x: this.posX + this.width * 0.06, y: point.y };
        }
        if (direction === "e") {
            return { x: this.posX + this.width * 0.94, y: point.y };
        }
        return point;
    }

    constructor() {
        super();
        this.content.classList.add("parallelogram");
        this.width = 180;
        this.height = 80;
        this.minWidth = 180;
        this.minHeight = 80;
        this.ratio = this.minWidth / this.minHeight;
        this.apply();
    }
}
