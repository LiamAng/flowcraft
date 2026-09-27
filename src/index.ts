import { Shape, Process, Decision, InputOutput } from "./shape";
import { Simulator } from "./simulator";

const process: HTMLButtonElement = document.getElementById('process') as HTMLButtonElement;
const decision: HTMLButtonElement = document.getElementById('decision') as HTMLButtonElement;
const inputOutput: HTMLButtonElement = document.getElementById('input-output') as HTMLButtonElement;

export const chart: HTMLElement = document.querySelector('.chart') as HTMLElement;

const params: URLSearchParams = new URLSearchParams(window.location.search);
var shapes: Shape[] = [];
const sim = new Simulator();
process.addEventListener('click', () => {
    const newShape = new Process();
    chart.appendChild(newShape.element);
    shapes.push(newShape);
});

decision.addEventListener('click', () => {
    const newShape = new Decision();
    chart.appendChild(newShape.element);
    shapes.push(newShape);
});

inputOutput.addEventListener('click', () => {
    const newShape = new InputOutput();
    chart.appendChild(newShape.element);
    shapes.push(newShape);
});