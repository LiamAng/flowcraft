import { Shape, ResizeDirection } from "./Shape";

export class Decision extends Shape {
    protected override isProgrammable(): boolean {
        return true;
    }

    protected override getResizeDirections(): ResizeDirection[] {
        return ["n", "s", "e", "w"];
    }

    protected override getVerticalPadding(): number {
        return this.height * 0.25;
    }

    protected override shouldKeepWidthFixedOnVerticalResize(): boolean {
        return true;
    }

    protected override getLinkLimit(): number {
        return 2;
    }

    protected override getBranchLabel(role: "next" | "altNext"): string {
        return role === "next" ? "Yes" : "No";
    }

    get altNext(): Shape | null {
        return this.outgoingLinks.find((link) => link.role === "altNext")?.to ?? null;
    }

    protected override syncLinkData() {
        super.syncLinkData();
        const alt = this.altNext;
        if (alt) {
            this.element.dataset.altNext = alt.id;
        } else {
            delete this.element.dataset.altNext;
        }
    }

    protected override constrainResize(nextWidth: number, nextHeight: number, startHeight: number, startWidth: number): { width: number; height: number } {
        nextWidth = Math.max(Shape.MIN_DRAG, Math.min(nextWidth, Shape.MAX_SIZE));
        nextWidth = Math.max(nextWidth, this.minWidthForHeight(nextHeight, nextWidth));

        if (this.contentHeightFor(nextWidth) > nextHeight) {
            nextHeight = Math.max(nextHeight, this.contentHeightFor(nextWidth));
        }

        return { width: nextWidth, height: nextHeight };
    }

    constructor() {
        super();
        this.content.classList.add("diamond");
        this.width = 100;
        this.height = 100;
        this.minWidth = 100;
        this.minHeight = 100;
        this.apply();
        this.updateResizeHandles();
    }
}
