import Sandbox from "@nyariv/sandboxjs";

const btn: HTMLButtonElement = document.getElementById('btn') as HTMLButtonElement;
const chart: HTMLElement = document.querySelector('.chart') as HTMLElement;

const params: URLSearchParams = new URLSearchParams(window.location.search);
class Simulator {
    private sandbox = new Sandbox();
    private scope = {};

    exec(code: string) {
        this.sandbox.compile(code)(this.scope).run();
    }

    reset() {
        this.sandbox = new Sandbox();
        this.scope = {};
    }

    constructor() {
        this.reset();
    }
}
class Shape {
    public element: HTMLTextAreaElement;
    public posX: number = 0;
    public posY: number = 0;
    private isDragging: boolean = false;
    private editMode: "code" | "pseudocode" = "pseudocode";
    private pseudoCode: string = "";
    private next: Shape | null = null;
    
    getSize(): {x: number, y: number} {
        return {
            x: parseInt(this.element.style.width),
            y: parseInt(this.element.style.height)
        };
    }

    onMouseDown(event: MouseEvent) {
        const size = this.getSize()
        if (event.clientX > size.x - 5 && event.clientY > size.y - 5) return;
        this.isDragging = true;
        this.posX = event.clientX - this.element.offsetLeft;
        this.posY = event.clientY - this.element.offsetTop;
    }

    onMouseMove(event: MouseEvent) {
        const size = this.getSize()
        if (this.isDragging) {
            const x = Math.max(0, Math.min(event.clientX - this.posX, chart.clientWidth - size.x));
            const y = Math.max(0, Math.min(event.clientY - this.posY, chart.clientHeight - size.y));
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
            this.element.style.cursor = 'grabbing';
        }
    }
    
    onMouseUp() {
        this.isDragging = false;
        this.element.style.cursor = 'default';
    }

    constructor(sizeX: number = 50, sizeY: number = 50) {
        this.element = document.createElement('textarea');
        this.element.style.width = `${sizeX}px`;
        this.element.style.height = `${sizeY}px`;
        this.element.classList.add('shape');
        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }
}

class Terminator extends Shape {
    private type: "start" | "end" = "start"
}

class Decision extends Shape {
    private altNext: Shape | null = null;
}

class Process extends Shape {
    private code: string = ""
}

class InputOutput extends Process {
    
}

var shapes: Shape[] = [];
btn.addEventListener('click', () => {
    const newShape = new Shape(50, 50);
    chart.appendChild(newShape.element);
    shapes.push(newShape);
});