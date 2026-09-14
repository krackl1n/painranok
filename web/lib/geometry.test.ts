import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, sample, examples } from "./ranok.ts";
import {
  trace,
  gradient,
  findExtremum,
  polygonCode,
  solveLinear,
  linearCode,
  sceneCode,
  derivedGrid,
  valueAt,
  type Point,
} from "./geometry.ts";
import { pixels, bitmap, zip } from "./raster.ts";
const model = (expr: string) =>
  compile(
    `RECTANGLE(-3,-3,3,3)\nRECTBMP(101,101)\nARGUMENT x,y\nRETURN ${expr}`,
  );
test("Arithmetic subtraction differs from difference of regions", () => {
  const p = model("diff(2,3)");
  assert.equal(valueAt(model("2-3"), [0, 0]), -1);
  assert.ok(valueAt(p, [0, 0]) < 0);
  assert.equal(valueAt(model("diff(2,3)-(2&(-3))"), [0, 0]), 0);
  assert.ok(valueAt(model("diff(1-x^2-y^2,0.25-x^2-y^2)"), [0.75, 0]) > 0);
  assert.ok(valueAt(model("diff(1-x^2-y^2,0.25-x^2-y^2)"), [0, 0]) < 0);
});
test("Gradient, descent and ascent converge and are monotonic", () => {
  const p = model("(x-0.5)^2+(y+0.25)^2"),
    g = gradient(p, [1, 1]);
  assert.ok(Math.abs(g[0] - 1) < 1e-6);
  assert.ok(Math.abs(g[1] - 2.5) < 1e-6);
  const path = trace(p, [2, 2], "down", 1, 1000);
  assert.ok(
    Math.hypot(path.points.at(-1)![0] - 0.5, path.points.at(-1)![1] + 0.25) <
      1e-4,
  );
  assert.ok(path.values.every((v, i) => i === 0 || v <= path.values[i - 1]));
  const up = trace(model("-(x-0.5)^2-(y+0.25)^2"), [2, 2], "up");
  assert.ok(up.values.at(-1)! > -1e-8);
  assert.throws(() => trace(p, [4, 0], "down"), /RECTANGLE/);
});
test("Tangent follows a circle and closes without changing level", () => {
  const p = model("x^2+y^2"),
    path = trace(p, [1, 0], "tangent", 1, 1000);
  assert.ok(path.points.length > 50);
  assert.ok(path.values.every((v) => Math.abs(v - 1) < 1e-6));
  assert.match(path.reason, /Замкнутая/);
  const reverse = trace(p, [1, 0], "tangent", 1, 10, true);
  assert.ok(path.points[1][1] > 0);
  assert.ok(reverse.points[1][1] < 0);
});
test("Grid extrema refine a minimum between nodes", () => {
  const path = findExtremum(model("(x-0.1234)^2+(y+0.4567)^2"), "min");
  assert.ok(path.values.at(-1)! < 1e-9);
});
test("Polygon preserves interior across triangulation edges", () => {
  for (const pts of [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
    [
      [0, 2],
      [2, 2],
      [2, 0],
      [0, 0],
    ],
  ] as Point[][]) {
    const p = compile(polygonCode(pts));
    for (const q of [
      [1, 1],
      [0.5, 0.5],
      [1.5, 1.5],
      [1.5, 0.5],
    ] as Point[])
      assert.ok(valueAt(p, q) > 0, JSON.stringify(q));
    assert.equal(valueAt(p, [0, 1]), 0);
    assert.ok(valueAt(p, [3, 1]) < 0);
  }
  const p = compile(
    polygonCode([
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ]),
  );
  assert.ok(valueAt(p, [0.5, 2]) > 0);
  assert.ok(valueAt(p, [2, 2]) < 0);
  assert.throws(
    () =>
      polygonCode([
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ]),
    /пересекать/,
  );
});
test("Production example yields (0,30), profit 720", () => {
  const rows = [
      [2, 4, 120],
      [1, 8, 280],
      [7, 4, 240],
      [4, 6, 360],
    ],
    sol = solveLinear(rows, [10, 24], "max");
  assert.deepEqual(sol.point, [0, 30]);
  assert.equal(sol.value, 720);
  const p = compile(linearCode(rows, [10, 24], "max"));
  assert.equal(valueAt(p, sol.point), -720);
  assert.equal(solveLinear(rows, [10, 24], "min").value, 0);
  assert.throws(
    () => solveLinear([[1, 0, 5]], [1, 1], "max"),
    /обе переменные/,
  );
});
test("Scene builders reproduce the guide and support 10 obstacles", () => {
  const p = compile(
      sceneCode("potential", [8, 8], 1000, [
        [5, 5, 30],
        [5, 8, 60],
      ]),
    ),
    original = compile(examples[4].code);
  assert.equal(valueAt(p, [1, 2]), valueAt(original, [1, 2]));
  const rfm = compile(
    sceneCode("rfm", [8, 8], 1000, [
      [5, 5, 1],
      [5, 8, 1],
    ]),
  );
  const path = trace(rfm, [1, 1], "down", 1, 4000);
  assert.ok(
    path.points.every(
      ([x, y]) =>
        Math.hypot(x - 5, y - 5) >= 0.99 && Math.hypot(x - 5, y - 8) >= 0.99,
    ),
  );
  assert.ok(
    Math.hypot(path.points.at(-1)![0] - 8, path.points.at(-1)![1] - 8) < 0.05,
    path.reason,
  );
  assert.doesNotThrow(() =>
    compile(
      sceneCode(
        "potential",
        [8, 8],
        1000,
        Array.from({ length: 10 }, (_, i) => [i % 5, Math.floor(i / 5), 30]),
      ),
    ),
  );
});
test("Derivative images use Cartesian Y and normalized surface normal", () => {
  const p = model("2*x+3*y+5"),
    g = sample(p);
  for (const [mode, expected] of [
    ["dx", 2],
    ["dy", 3],
    ["nx", -2 / Math.sqrt(14)],
    ["ny", -3 / Math.sqrt(14)],
    ["nz", 1 / Math.sqrt(14)],
    ["d", -5 / Math.sqrt(14)],
  ] as const) {
    const derived = derivedGrid(p, g, mode);
    assert.ok(Math.abs(derived.values[5000] - expected) < 1e-10, mode);
  }
});
test("BMP headers, padding and ZIP directory are valid", () => {
  const p = model("x"),
    g = sample(p),
    data = bitmap(p.width, p.height, pixels(p, g, "dx"));
  assert.equal(String.fromCharCode(data[0], data[1]), "BM");
  const v = new DataView(data.buffer);
  assert.equal(v.getUint32(2, true), data.length);
  assert.equal(v.getUint32(18, true), 101);
  assert.equal(data.length, 54 + 304 * 101);
  const archive = zip([{ name: "test.bmp", data }]),
    z = new DataView(archive.buffer);
  assert.equal(z.getUint32(0, true), 0x04034b50);
  assert.equal(z.getUint32(archive.length - 22, true), 0x06054b50);
  assert.equal(z.getUint16(archive.length - 12, true), 1);
});

test("Descent follows a nonsmooth production boundary to the optimum", () => {
  const path = trace(compile(examples[5].code), [10, 10], "down", 1, 2000);
  assert.ok(
    Math.hypot(path.points.at(-1)![0], path.points.at(-1)![1] - 30) < 1e-4,
  );
  assert.ok(Math.abs(path.values.at(-1)! + 720) < 1e-3);
});
