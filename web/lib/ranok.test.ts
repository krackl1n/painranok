import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, sample, examples } from "./ranok.ts";
const at = (expr: string, x = 0, y = 0) => {
  const p = compile(
    `RECTANGLE(-3,-1,3,5)\nRECTBMP(10,10)\nARGUMENT x,y\nRETURN ${expr}`,
  );
  return p.result(p.evaluate(x, y));
};
test("Arithmetic, precedence and R operations", () => {
  assert.equal(at("-2^2"), -4);
  assert.equal(at("2^3^2"), 512);
  assert.equal(at("2^-2"), 0.25);
  assert.equal(at("abs(-3)+sqrt(4)"), 5);
  assert.ok(at("2&3") > 0);
  assert.ok(at("2&-3") < 0);
  assert.ok(at("2|-3") > 0);
  assert.equal(at("0&3"), 0);
});
test("All examples compile and have finite grids", () => {
  for (const e of examples) {
    const p = compile(e.code),
      g = sample(p);
    assert.equal(g.invalid, 0, e.name);
    assert.equal(g.values.length, p.width * p.height);
  }
});
test("Triangle vertices, inside and outside", () => {
  const p = compile(examples[0].code);
  for (const [x, y] of [
    [-2, 0],
    [2, 0],
    [0, 4],
  ])
    assert.ok(Math.abs(p.result(p.evaluate(x, y))) < 1e-10);
  assert.ok(p.result(p.evaluate(0, 1)) > 0);
  assert.ok(p.result(p.evaluate(2, 3)) < 0);
});
test("Constants, different variable case and assignments", () => {
  const p = compile(examples[5].code);
  assert.equal(p.result(p.evaluate(0, 30)), -720);
  assert.notEqual(p.names.indexOf("f"), p.names.indexOf("F"));
  const q = compile(examples[2].code);
  assert.equal(q.evaluate(0, 0)[q.names.indexOf("x1")], -2);
});
test("Invalid input reports errors and never runs JS", () => {
  for (const expr of ["window.alert(1)", "unknown", "1+", "abs(1,2)", "2 3"])
    assert.throws(() => at(expr), /Строка 4/);
  assert.throws(() => compile("RECTBMP(0,400)"), /Строка 1/);
  assert.throws(() => compile("RETURN 1"), /Нужны команды/);
  assert.throws(() => compile(examples[0].code + "\nRETURN 0"), /После RETURN/);
});
test("Grid orientation, endpoints and undefined points", () => {
  const p = compile(
    "RECTANGLE(-1,-1,1,1)\nRECTBMP(3,3)\nARGUMENT x,y\nRETURN y+x",
  );
  const g = sample(p);
  assert.equal(g.values[0], 0);
  assert.equal(g.values[2], 2);
  assert.equal(g.values[6], -2);
  const q = compile(
    "RECTANGLE(-1,-1,1,1)\nRECTBMP(3,3)\nARGUMENT x,y\nRETURN 1/x",
  );
  assert.equal(sample(q).invalid, 3);
});
