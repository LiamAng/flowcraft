import { Shape } from "./shape";
import { Simulator } from "./simulator";

const btn: HTMLButtonElement = document.getElementById('btn') as HTMLButtonElement;
export const chart: HTMLElement = document.querySelector('.chart') as HTMLElement;

const params: URLSearchParams = new URLSearchParams(window.location.search);
var shapes: Shape[] = [];
const sim = new Simulator();
btn.addEventListener('click', () => {
    const newShape = new Shape(50, 50);
    chart.appendChild(newShape.element);
    shapes.push(newShape);
});