// Polyfill DOMMatrix, ImageData, and Path2D for Node.js server environment
// Must be imported BEFORE pdfjs-dist
// These are browser APIs that don't exist in Node.js

if (typeof globalThis.DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;

        constructor(init?: string | number[]) {
            if (Array.isArray(init) && init.length >= 6) {
                this.a = this.m11 = init[0];
                this.b = this.m12 = init[1];
                this.c = this.m21 = init[2];
                this.d = this.m22 = init[3];
                this.e = this.m41 = init[4];
                this.f = this.m42 = init[5];
                this.isIdentity = false;
            }
        }

        multiply() { return new DOMMatrixPolyfill(); }
        inverse() { return new DOMMatrixPolyfill(); }
        translate() { return new DOMMatrixPolyfill(); }
        scale() { return new DOMMatrixPolyfill(); }
        rotate() { return new DOMMatrixPolyfill(); }
        transformPoint(point: { x: number; y: number }) { return point; }
        toFloat32Array() { return new Float32Array(16); }
        toFloat64Array() { return new Float64Array(16); }
    }

    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

if (typeof globalThis.ImageData === "undefined") {
    class ImageDataPolyfill {
        data: Uint8ClampedArray;
        width: number;
        height: number;
        colorSpace: string = "srgb";

        constructor(width: number, height: number);
        constructor(data: Uint8ClampedArray, width: number, height?: number);
        constructor(arg1: number | Uint8ClampedArray, arg2: number, arg3?: number) {
            if (typeof arg1 === "number") {
                this.width = arg1;
                this.height = arg2;
                this.data = new Uint8ClampedArray(arg1 * arg2 * 4);
            } else {
                this.data = arg1;
                this.width = arg2;
                this.height = arg3 ?? Math.floor(arg1.length / (arg2 * 4));
            }
        }
    }

    (globalThis as any).ImageData = ImageDataPolyfill;
}

if (typeof globalThis.Path2D === "undefined") {
    class Path2DPolyfill {
        private commands: string[] = [];

        constructor(path?: string | Path2DPolyfill) {
            if (typeof path === "string") {
                this.commands.push(path);
            }
        }

        addPath() { }
        arc() { }
        arcTo() { }
        bezierCurveTo() { }
        closePath() { }
        ellipse() { }
        lineTo() { }
        moveTo() { }
        quadraticCurveTo() { }
        rect() { }
        roundRect() { }
    }

    (globalThis as any).Path2D = Path2DPolyfill;
}

export { };
