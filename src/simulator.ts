import Sandbox from "@nyariv/sandboxjs";


export class Simulator {
    private sandbox = new Sandbox();
    private scope: Record<string, unknown> = {};

    exec(code: string): unknown {
        return this.sandbox.compile(code)(this.scope).run();
    }

    evaluate(expression: string): unknown {
        const resultKey = "__flowcraft_result__";
        this.scope[resultKey] = undefined;
        this.exec(`${resultKey} = (${expression});`);
        const result = this.scope[resultKey];
        delete this.scope[resultKey];
        return result;
    }

    reset() {
        this.sandbox = new Sandbox();
        this.scope = {};
    }

    getScope(): Record<string, unknown> {
        return this.scope;
    }

    constructor() {
        this.reset();
    }
}
