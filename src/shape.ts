import { chart } from ".";

export class Shape {
    public element: HTMLElement;
    public content: HTMLElement;
    public posX: number = 0;
    public posY: number = 0;
    private isDragging: boolean = false;
    private draggable: boolean = true;

    getSize(): { x: number; y: number; } {
        return {
            x: (this.element.clientWidth),
            y: (this.element.clientHeight)
        };
    }
    
    setDraggable(draggable: boolean) {
        this.draggable = draggable;
    }

    onMouseDown(event: MouseEvent) {
        const size = this.getSize();
        console.log(size);
        if (!this.draggable) return;
        if (event.clientX >= (this.posX + size.x) && event.clientY >= (this.posY + size.y)) return;
        this.isDragging = true;
        this.posX = event.clientX - this.element.offsetLeft;
        this.posY = event.clientY - this.element.offsetTop;
    }

    onMouseMove(event: MouseEvent) {
        const size = this.getSize();
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
        this.posX = this.element.offsetLeft;
        this.posY = this.element.offsetTop;
    }

    constructor() {
        this.element = document.createElement('div');
        this.element.classList.add('shape');
        this.content = document.createElement('div');
        this.content.classList.add('content');
        this.content.innerHTML = "<br>";
        this.element.appendChild(this.content);
        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }
}

export class ProgrammableShape extends Shape {
    private editMode: "code" | "pseudocode" = "pseudocode";
    private pseudoCode: string = "";
    private next: Shape | null = null;

    onDoubleClick() {
        this.content.contentEditable = 'plaintext-only';
        this.content.focus();
        this.setDraggable(false);
    }

    onFocusOut() {
        this.content.contentEditable = 'false';
        this.setDraggable(true);
    }

    constructor() {
        super();
        this.element.addEventListener('dblclick', this.onDoubleClick.bind(this));
        this.element.addEventListener('focusout', this.onFocusOut.bind(this));
    }
}

export class Process extends ProgrammableShape {
    constructor() {
        super();
    }
}

export class InputOutput extends Process {
    constructor() {
        super();
        this.element.classList.add("parallelogram");
    }
}

export class Decision extends Process {
    private altNext: Shape | null = null;
    constructor() {
        super();
        this.element.classList.add("diamond");
    }
}



class Terminator extends Shape {
    private type: "start" | "end" = "start";

    constructor(type: "start" | "end") {
        super();
        this.type = type;
    }
}

