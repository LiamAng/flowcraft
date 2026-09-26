import Sandbox from "@nyariv/sandboxjs";


export class Simulator {
    private sandbox = new Sandbox();
    private scope = {};

    exec(code: string) {
        this.sandbox.compile(code)(this.scope).run();
    }

    reset() {
        this.sandbox = new Sandbox();
        this.scope = {};
    }

    getScope() {
        return this.scope;
    }

    constructor() {
        this.reset();
    }
}
