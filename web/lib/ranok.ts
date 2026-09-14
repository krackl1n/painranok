export type Eval = (values: number[]) => number;
export type Program = {
  bounds: number[];
  width: number;
  height: number;
  names: string[];
  evaluate: (x: number, y: number) => number[];
  result: Eval;
};
const builtins: Record<
  string,
  { n: number; fn: (...args: number[]) => number }
> = Object.fromEntries(
  [
    ["abs", 1, Math.abs],
    ["sqrt", 1, Math.sqrt],
    ["sin", 1, Math.sin],
    ["cos", 1, Math.cos],
    ["tan", 1, Math.tan],
    ["exp", 1, Math.exp],
    ["ln", 1, Math.log],
    ["log", 1, Math.log],
    ["min", 2, Math.min],
    ["max", 2, Math.max],
    ["pow", 2, Math.pow],
    ["diff", 2, (a: number, b: number) => a - b - Math.hypot(a, b)],
    ["intersect", 2, (a: number, b: number) => a + b - Math.hypot(a, b)],
    ["union", 2, (a: number, b: number) => a + b + Math.hypot(a, b)],
    ["neg", 1, (a: number) => -a],
  ].map(([name, n, fn]) => [name, { n, fn }]),
) as Record<string, { n: number; fn: (...args: number[]) => number }>;
function expression(source: string, symbols: Map<string, number>): Eval {
  const tokens: string[] = [];
  let rest = source.trim();
  while (rest) {
    const m =
      /^(?:(\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[a-zA-Z_][\w]*|[+\-*/^&|(),])/.exec(
        rest,
      );
    if (!m) throw Error(`Недопустимый символ: ${rest[0]}`);
    tokens.push(m[0]);
    rest = rest.slice(m[0].length).trimStart();
  }
  if (tokens.length > 512)
    throw Error("Слишком длинное выражение (максимум 512 элементов)");
  let pos = 0;
  const take = (s: string) => {
    if (tokens[pos++] !== s) throw Error(`Ожидается «${s}»`);
  };
  const priority: Record<string, number> = {
    "|": 1,
    "&": 2,
    "+": 3,
    "-": 3,
    "*": 4,
    "/": 4,
    "^": 6,
  };
  function parse(min = 0): Eval {
    const t = tokens[pos++];
    let left: Eval;
    if (t === "-" || t === "+") {
      const a = parse(5);
      left = (v) => (t === "-" ? -a(v) : a(v));
    } else if (t === "(") {
      left = parse();
      take(")");
    } else if (t && /^\d|^\./.test(t)) {
      const n = Number(t);
      left = () => n;
    } else if (t && /^[a-zA-Z_]/.test(t)) {
      if (tokens[pos] === "(") {
        pos++;
        const args: Eval[] = [];
        if (tokens[pos] !== ")") {
          do {
            args.push(parse());
            if (tokens[pos] !== ",") break;
            pos++;
          } while (true);
        }
        take(")");
        const f = builtins[t.toLowerCase()];
        if (!Object.hasOwn(builtins, t.toLowerCase()))
          throw Error(`Неизвестная функция «${t}»`);
        if (args.length !== f.n) throw Error(`${t}: нужно аргументов: ${f.n}`);
        left = (v) => f.fn(...args.map((a) => a(v)));
      } else {
        const slot = symbols.get(t);
        if (slot !== undefined) left = (v) => v[slot];
        else if (t === "pi") left = () => Math.PI;
        else if (t === "e") left = () => Math.E;
        else throw Error(`Неизвестная переменная «${t}»`);
      }
    } else throw Error(`Ожидается выражение${t ? `, получено «${t}»` : ""}`);
    while (pos < tokens.length && (priority[tokens[pos]] ?? -1) >= min) {
      const op = tokens[pos++],
        a = left,
        b = parse(priority[op] + (op === "^" ? 0 : 1));
      left = (v) => {
        const x = a(v),
          y = b(v);
        switch (op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return x / y;
          case "^":
            return x ** y;
          case "&":
            return x + y - Math.hypot(x, y);
          default:
            return x + y + Math.hypot(x, y);
        }
      };
    }
    return left;
  }
  const result = parse();
  if (pos !== tokens.length) throw Error(`Лишний символ «${tokens[pos]}»`);
  return result;
}
function split(source: string) {
  let depth = 0,
    start = 0;
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") depth--;
    if (source[i] === "," && depth === 0) {
      out.push(source.slice(start, i));
      start = i + 1;
    }
  }
  out.push(source.slice(start));
  return out;
}
export function compile(source: string): Program {
  if (source.length > 50000)
    throw Error("Максимальный размер программы — 50 000 символов");
  const symbols = new Map<string, number>();
  const names: string[] = [];
  const definitions: { slot: number; fn: Eval }[] = [];
  const constants: number[] = [];
  const constantSymbols = new Map<string, number>();
  let bounds: number[] | undefined,
    size: number[] | undefined,
    args: string[] | undefined,
    result: Eval | undefined;
  source
    .replace(/−/g, "-")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw
        .replace(/\/\/.*$|#.*$/, "")
        .trim()
        .replace(/;$/, "");
      if (!line) return;
      try {
        if (result) throw Error("После RETURN команды не допускаются");
        const match = /^([a-z]+)\b\s*(.*)$/i.exec(line);
        if (!match) throw Error("Ожидается команда");
        const [, cmd, body] = match;
        switch (cmd.toUpperCase()) {
          case "RECTANGLE":
          case "RECTBMP": {
            if (!body.startsWith("(") || !body.endsWith(")"))
              throw Error("Параметры нужно заключить в скобки");
            const v = split(body.slice(1, -1)).map((s) =>
              expression(s, constantSymbols)(constants),
            );
            if (!v.every(Number.isFinite))
              throw Error("Параметры должны быть конечными числами");
            if (cmd.toUpperCase() === "RECTANGLE") {
              if (bounds) throw Error("RECTANGLE уже задан");
              if (
                v.length !== 4 ||
                v[0] >= v[2] ||
                v[1] >= v[3] ||
                !Number.isFinite(v[2] - v[0]) ||
                !Number.isFinite(v[3] - v[1])
              )
                throw Error(
                  "Нужны Xmin, Ymin, Xmax, Ymax с возрастающими границами",
                );
              bounds = v;
            } else {
              if (size) throw Error("RECTBMP уже задан");
              if (
                v.length !== 2 ||
                !v.every((n) => Number.isInteger(n) && n >= 2 && n <= 1000)
              )
                throw Error("Ширина и высота: целые числа от 2 до 1000");
              size = v;
            }
            break;
          }
          case "ARGUMENT": {
            if (args) throw Error("ARGUMENT уже задан");
            args = body.split(",").map((s) => s.trim());
            if (
              args.length !== 2 ||
              args[0] === args[1] ||
              !args.every((s) => /^[a-zA-Z_]\w*$/.test(s))
            )
              throw Error("Нужны два разных имени аргументов");
            for (const name of args) {
              if (symbols.has(name)) throw Error(`Имя «${name}» уже занято`);
              symbols.set(name, names.length);
              names.push(name);
            }
            break;
          }
          case "CONSTANT":
          case "FUNCTION": {
            if (definitions.length >= 200)
              throw Error("Максимум 200 определений");
            for (const assignment of split(body)) {
              const m = /^\s*([a-zA-Z_]\w*)\s*=\s*(.+)$/.exec(assignment);
              if (!m) throw Error("Ожидается имя = выражение");
              const [, name, src] = m;
              if (symbols.has(name))
                throw Error(`Переменная «${name}» уже определена`);
              let fn = expression(
                src,
                cmd.toUpperCase() === "CONSTANT" ? constantSymbols : symbols,
              );
              const slot = names.length;
              if (cmd.toUpperCase() === "CONSTANT") {
                const value = fn(constants);
                if (!Number.isFinite(value))
                  throw Error(`Некорректная константа «${name}»`);
                constants[slot] = value;
                constantSymbols.set(name, slot);
                fn = () => value;
              }
              symbols.set(name, slot);
              names.push(name);
              definitions.push({ slot, fn });
            }
            break;
          }
          case "RETURN":
            result = expression(body, symbols);
            break;
          default:
            throw Error(`Неизвестная команда «${cmd}»`);
        }
      } catch (e) {
        throw Error(`Строка ${i + 1}: ${(e as Error).message}`);
      }
    });
  if (!bounds || !size || !args || !result)
    throw Error("Нужны команды RECTANGLE, RECTBMP, ARGUMENT и RETURN");
  const xSlot = symbols.get(args[0])!,
    ySlot = symbols.get(args[1])!;
  return {
    bounds,
    width: size[0],
    height: size[1],
    names,
    result,
    evaluate(x, y) {
      const v: number[] = [];
      v[xSlot] = x;
      v[ySlot] = y;
      for (const d of definitions) v[d.slot] = d.fn(v);
      return v;
    },
  };
}
export type Grid = {
  values: Float64Array;
  min: number;
  max: number;
  invalid: number;
  positive: number;
  ms: number;
};
export function sample(p: Program): Grid {
  const start = performance.now(),
    values = new Float64Array(p.width * p.height);
  let min = Infinity,
    max = -Infinity,
    invalid = 0,
    positive = 0;
  for (let j = 0; j < p.height; j++)
    for (let i = 0; i < p.width; i++) {
      const x = p.bounds[0] + (i / (p.width - 1)) * (p.bounds[2] - p.bounds[0]),
        y = p.bounds[3] - (j / (p.height - 1)) * (p.bounds[3] - p.bounds[1]);
      const w = p.result(p.evaluate(x, y));
      values[j * p.width + i] = w;
      if (Number.isFinite(w)) {
        min = Math.min(min, w);
        max = Math.max(max, w);
        if (w >= 0) positive++;
      } else invalid++;
    }
  return { values, min, max, invalid, positive, ms: performance.now() - start };
}
export const examples = [
  {
    name: "Треугольник",
    detail: "Пересечение трёх полуплоскостей",
    code: `RECTANGLE(-3,-1,3,5)\nRECTBMP(400,400)\nARGUMENT x,y\n\n// Три стороны треугольника\nFUNCTION W1=1-x/2-y/4\nFUNCTION W2=1+x/2-y/4\nFUNCTION W3=y\n\n// Пересечение положительных областей\nFUNCTION W=W1&W2&W3\nRETURN W`,
  },
  {
    name: "Окружность",
    detail: "Первая модель из методички",
    code: `RECTANGLE(-1.5,-1.5,1.5,1.5)\nRECTBMP(400,400)\nARGUMENT x,y\nCONSTANT R=1\nFUNCTION W=R^2-x^2-y^2\nRETURN W`,
  },
  {
    name: "Невыпуклый контур",
    detail: "Фигура по четырём узловым точкам",
    code: `RECTANGLE(-3,-1,3,5)\nRECTBMP(400,400)\nARGUMENT x,y\nCONSTANT x1=-2,y1=0,x2=2,y2=0,x3=0,y3=2,x4=0,y4=4\nFUNCTION W1=(y1-y2)*x-(x1-x2)*y+(y2*x1-y1*x2)\nFUNCTION W2=(y2-y3)*x-(x2-x3)*y+(y3*x2-y2*x3)\nFUNCTION W3=(y3-y4)*x-(x3-x4)*y+(y4*x3-y3*x4)\nFUNCTION W4=(y4-y1)*x-(x4-x1)*y+(y1*x4-y4*x1)\nFUNCTION W=W1&(W2|W3)&W4\nRETURN W`,
  },
  {
    name: "Объединение",
    detail: "Две пересекающиеся окружности",
    code: `RECTANGLE(-2,-1.5,2,1.5)\nRECTBMP(600,450)\nARGUMENT x,y\nFUNCTION A=1-(x+0.6)^2-y^2\nFUNCTION B=1-(x-0.6)^2-y^2\nFUNCTION W=A|B\nRETURN W`,
  },
  {
    name: "Метод потенциалов",
    detail: "Цель и два препятствия · задание 4",
    code: `RECTANGLE(0,0,10,10)\nRECTBMP(400,400)\nARGUMENT x,y\nFUNCTION W1=-1000/(1+(x-8)^2+(y-8)^2)\nFUNCTION W2=30/(1+(x-5)^2+(y-5)^2)\nFUNCTION W3=60/(1+(x-5)^2+(y-8)^2)\nFUNCTION W=W1+W2+W3\nRETURN W`,
  },
  {
    name: "Оптимизация",
    detail: "Область ограничений · задание 5",
    code: `RECTANGLE(-10,-10,40,40)\nRECTBMP(400,400)\nARGUMENT x,y\nFUNCTION w1=120-2*x-4*y\nFUNCTION w2=280-x-8*y\nFUNCTION w3=240-7*x-4*y\nFUNCTION w4=360-4*x-6*y\nFUNCTION w5=x\nFUNCTION w6=y\nFUNCTION f=-10*x-24*y\nFUNCTION w=w1&w2&w3&w4&w5&w6\nFUNCTION w0=w-abs(w)\nFUNCTION F=f+abs(w0*(1+abs(f)))\nRETURN F`,
  },
];

examples.push(
  {
    name: "Разность областей",
    detail: "Задание 1 · круг с отверстием",
    code: `RECTANGLE(-2,-2,2,2)
RECTBMP(500,500)
ARGUMENT x,y
FUNCTION A=2.25-x^2-y^2
FUNCTION B=0.49-(x-0.5)^2-y^2
// diff(A,B) эквивалентно A&(-B)
FUNCTION W=diff(A,B)
RETURN W`,
  },
  {
    name: "Обход препятствий RFM",
    detail: "Задание 3 · цель (8,8), две окружности",
    code: `RECTANGLE(0,0,10,10)
RECTBMP(400,400)
ARGUMENT x,y
FUNCTION W1=-(1000-(x-8)^2-(y-8)^2)
FUNCTION W2=(1-(x-5)^2-(y-5)^2)*1000000
FUNCTION W3=(1-(x-5)^2-(y-8)^2)*1000000
FUNCTION W=W1|W2|W3
RETURN W`,
  },
  {
    name: "Сложная сцена RFM",
    detail: "Задание 3 · круг, квадрат и треугольник",
    code: `RECTANGLE(0,0,10,10)
RECTBMP(500,500)
ARGUMENT x,y
FUNCTION Goal=-1000+(x-8)^2+(y-8)^2
FUNCTION Circle=0.6^2-(x-3)^2-(y-4)^2
FUNCTION Square=(x-4)&(6-x)&(y-6)&(7-y)
FUNCTION Triangle=(y-2)&(x-y-3)&(9-x-y)
FUNCTION W=Goal|(1000000*Circle)|(1000000*Square)|(1000000*Triangle)
RETURN W`,
  },
  {
    name: "Животное",
    detail: "Задание 1 · объединение фигур и вычитание глаз",
    code: `RECTANGLE(-3,-2,3,4)
RECTBMP(500,500)
ARGUMENT x,y
FUNCTION Body=1-x^2/1.2-(y+0.2)^2/2
FUNCTION Head=1-x^2-(y-1.8)^2
FUNCTION Ear1=(y-2)&(3.7-y)&(x+1)&(-0.2-x)
FUNCTION Ear2=(y-2)&(3.7-y)&(x-0.2)&(1-x)
FUNCTION Eyes=(0.025-(x-0.4)^2-(y-2)^2)|(0.025-(x+0.4)^2-(y-2)^2)
FUNCTION W=diff(Body|Head|Ear1|Ear2,Eyes)
RETURN W`,
  },
);
