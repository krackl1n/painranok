import type { Program, Grid } from "./ranok";
export type Point = [number, number];
export type Path = {
  points: Point[];
  values: number[];
  reason: string;
  mode: string;
};
export const valueAt = (p: Program, q: Point) => p.result(p.evaluate(...q));
export function gradient(p: Program, q: Point): Point {
  const h = [
    Math.max((p.bounds[2] - p.bounds[0]) * 1e-5, 1e-9),
    Math.max((p.bounds[3] - p.bounds[1]) * 1e-5, 1e-9),
  ];
  return [
    (valueAt(p, [q[0] + h[0], q[1]]) - valueAt(p, [q[0] - h[0], q[1]])) /
      (2 * h[0]),
    (valueAt(p, [q[0], q[1] + h[1]]) - valueAt(p, [q[0], q[1] - h[1]])) /
      (2 * h[1]),
  ];
}
const inside = (p: Program, q: Point) =>
  q.every(Number.isFinite) &&
  q[0] >= p.bounds[0] &&
  q[0] <= p.bounds[2] &&
  q[1] >= p.bounds[1] &&
  q[1] <= p.bounds[3];
export function trace(
  p: Program,
  start: Point,
  mode: "down" | "up" | "tangent",
  radius = 1,
  steps = 2000,
  clockwise = false,
): Path {
  if (!inside(p, start))
    throw Error("Начальная точка должна находиться внутри RECTANGLE");
  if (
    !Number.isFinite(radius) ||
    radius < 0.1 ||
    radius > 10 ||
    !Number.isInteger(steps) ||
    steps < 1 ||
    steps > 10000
  )
    throw Error("Шаг: 0.1–10 пикселей; число шагов: 1–10000");
  const first = valueAt(p, start);
  if (!Number.isFinite(first))
    throw Error("Функция не определена в начальной точке");
  const points: Point[] = [[...start]],
    values = [first];
  let reason = "Достигнут лимит шагов";
  const base =
    radius *
    Math.min(
      (p.bounds[2] - p.bounds[0]) / (p.width - 1),
      (p.bounds[3] - p.bounds[1]) / (p.height - 1),
    );
  for (let i = 0; i < steps; i++) {
    const q = points.at(-1)!,
      v = values.at(-1)!,
      grad = gradient(p, q);
    let next: Point | undefined,
      nv = v,
      step = base;
    if (mode === "tangent") {
      const tangent = (z: Point): Point => {
        const g = gradient(p, z),
          n = Math.hypot(...g),
          s = clockwise ? -1 : 1;
        return [(-s * g[1]) / n, (s * g[0]) / n];
      };
      for (let attempt = 0; attempt < 14 && !next; attempt++, step /= 2) {
        const t = tangent(q),
          mid: Point = [q[0] + (step * t[0]) / 2, q[1] + (step * t[1]) / 2],
          u = tangent(mid);
        let c: Point = [q[0] + step * u[0], q[1] + step * u[1]];
        for (let k = 0; k < 8; k++) {
          const d = gradient(p, c),
            n = d[0] ** 2 + d[1] ** 2,
            delta = valueAt(p, c) - first;
          if (!Number.isFinite(n) || n < 1e-24) break;
          c = [c[0] - (delta * d[0]) / n, c[1] - (delta * d[1]) / n];
        }
        const cv = valueAt(p, c),
          dist = Math.hypot(c[0] - q[0], c[1] - q[1]);
        if (
          inside(p, c) &&
          Number.isFinite(cv) &&
          Math.abs(cv - first) < 1e-6 * Math.max(1, Math.abs(first)) &&
          dist > base * 1e-5 &&
          dist < 2 * step
        ) {
          next = c;
          nv = cv;
        }
      }
      if (!next) {
        reason = "Касательная не определена или достигнута граница";
        break;
      }
    } else {
      const sign = mode === "down" ? 1 : -1;
      const directions: Point[] = Array.from(
        { length: Math.max(128, Math.ceil(radius) * 32) },
        (_, j) => {
          const a = (j * 2 * Math.PI) / Math.max(128, Math.ceil(radius) * 32);
          return [Math.cos(a), Math.sin(a)];
        },
      );
      const n = Math.hypot(...grad);
      if (Number.isFinite(n) && n > 1e-20)
        directions.unshift([(-sign * grad[0]) / n, (-sign * grad[1]) / n]);
      for (let attempt = 0; attempt < 18 && !next; attempt++, step /= 2) {
        let best = v * sign;
        for (const d of directions) {
          const c: Point = [q[0] + step * d[0], q[1] + step * d[1]];
          if (!inside(p, c)) continue;
          const cv = valueAt(p, c);
          if (
            !Number.isFinite(cv) ||
            cv * sign >= best - 1e-12 * Math.max(1, Math.abs(v))
          )
            continue;
          // Avoid stepping across a narrow uphill barrier between endpoints.
          let safe = true;
          for (let s = 1; s < 4; s++) {
            const z = valueAt(p, [
              q[0] + ((c[0] - q[0]) * s) / 4,
              q[1] + ((c[1] - q[1]) * s) / 4,
            ]);
            if (
              !Number.isFinite(z) ||
              z * sign > v * sign + 1e-9 * Math.max(1, Math.abs(v))
            ) {
              safe = false;
              break;
            }
          }
          if (safe) {
            next = c;
            nv = cv;
            best = cv * sign;
          }
        }
      }
      if (!next) {
        reason = "Нет улучшения: локальный экстремум или граница";
        break;
      }
    }
    points.push(next);
    values.push(nv);
    if (
      mode === "tangent" &&
      i > 20 &&
      Math.hypot(next[0] - start[0], next[1] - start[1]) < base * 0.75
    ) {
      reason = "Замкнутая траектория";
      break;
    }
  }
  return { points, values, reason, mode };
}
export function findExtremum(p: Program, kind: "min" | "max"): Path {
  let best: Point | undefined,
    v = kind === "min" ? Infinity : -Infinity;
  for (let j = 0; j < p.height; j++)
    for (let i = 0; i < p.width; i++) {
      const q: Point = [
          p.bounds[0] + (i / (p.width - 1)) * (p.bounds[2] - p.bounds[0]),
          p.bounds[1] + (j / (p.height - 1)) * (p.bounds[3] - p.bounds[1]),
        ],
        w = valueAt(p, q);
      if (Number.isFinite(w) && (kind === "min" ? w < v : w > v)) {
        v = w;
        best = q;
      }
    }
  if (!best) throw Error("На сетке нет конечных значений");
  const path = trace(p, best, kind === "min" ? "down" : "up", 1, 2000);
  path.reason = "Лучший узел сетки + локальное уточнение. " + path.reason;
  return path;
}
export type FieldMode =
  "field" | "shape" | "contour" | "dx" | "dy" | "nx" | "ny" | "nz" | "d";
export function derivedGrid(p: Program, g: Grid, mode: FieldMode): Grid {
  if (["field", "shape", "contour"].includes(mode)) return g;
  const values = new Float64Array(g.values.length),
    sx = (p.bounds[2] - p.bounds[0]) / (p.width - 1),
    sy = (p.bounds[3] - p.bounds[1]) / (p.height - 1);
  let min = Infinity,
    max = -Infinity,
    invalid = 0,
    positive = 0;
  for (let j = 0; j < p.height; j++)
    for (let i = 0; i < p.width; i++) {
      const l = Math.max(0, i - 1),
        r = Math.min(p.width - 1, i + 1),
        t = Math.max(0, j - 1),
        b = Math.min(p.height - 1, j + 1);
      const dx =
          (g.values[j * p.width + r] - g.values[j * p.width + l]) /
          ((r - l) * sx),
        dy =
          (g.values[t * p.width + i] - g.values[b * p.width + i]) /
          ((b - t) * sy),
        n = Math.hypot(dx, dy, 1),
        x = p.bounds[0] + i * sx,
        y = p.bounds[3] - j * sy;
      const v =
        mode === "dx"
          ? dx
          : mode === "dy"
            ? dy
            : mode === "nx"
              ? -dx / n
              : mode === "ny"
                ? -dy / n
                : mode === "nz"
                  ? 1 / n
                  : (dx * x + dy * y - g.values[j * p.width + i]) / n;
      values[j * p.width + i] = v;
      if (Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
        if (v >= 0) positive++;
      } else invalid++;
    }
  return { ...g, values, min, max, invalid, positive };
}
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function parseRows(text: string, columns: number): number[][] {
  const rows = text
    .trim()
    .split(/\n/)
    .filter((s) => s.trim())
    .map((s, i) => {
      const row = s
        .trim()
        .split(/[\s;,]+/)
        .map(Number);
      if (row.length !== columns || !row.every(Number.isFinite))
        throw Error(`Строка ${i + 1}: нужно ${columns} чисел через пробел`);
      return row;
    });
  if (!rows.length) throw Error("Введите хотя бы одну строку");
  if (rows.length > 100) throw Error("Максимум 100 строк");
  return rows;
}
export function polygonCode(input: Point[]): string {
  const pts = input.map((p) => [...p] as Point);
  if (
    pts.length > 3 &&
    pts[0][0] === pts.at(-1)![0] &&
    pts[0][1] === pts.at(-1)![1]
  )
    pts.pop();
  if (
    pts.length < 3 ||
    pts.length > 40 ||
    !pts.every((p) => p.every(Number.isFinite))
  )
    throw Error("Нужно от 3 до 40 конечных вершин");
  const scale = Math.max(1, ...pts.flat().map(Math.abs)),
    eps = 1e-10 * scale * scale;
  const on = (a: Point, b: Point, c: Point) =>
    Math.abs(cross(a, b, c)) <= eps &&
    c[0] >= Math.min(a[0], b[0]) - 1e-10 &&
    c[0] <= Math.max(a[0], b[0]) + 1e-10 &&
    c[1] >= Math.min(a[1], b[1]) - 1e-10 &&
    c[1] <= Math.max(a[1], b[1]) + 1e-10;
  for (let i = 0; i < pts.length; i++) {
    if (
      Math.hypot(
        pts[i][0] - pts[(i + 1) % pts.length][0],
        pts[i][1] - pts[(i + 1) % pts.length][1],
      ) < 1e-10
    )
      throw Error("Соседние вершины совпадают");
    for (let j = i + 1; j < pts.length; j++) {
      if (j === i + 1 || (i === 0 && j === pts.length - 1)) continue;
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        c = pts[j],
        d = pts[(j + 1) % pts.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        on(a, b, c) ||
        on(a, b, d) ||
        on(c, d, a) ||
        on(c, d, b)
      )
        throw Error("Контур не должен пересекать или касаться самого себя");
    }
  }
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      if (
        Math.abs(
          cross(
            pts[(i + pts.length - 1) % pts.length],
            pts[i],
            pts[(i + 1) % pts.length],
          ),
        ) < eps
      ) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const area = pts.reduce(
    (s, p, i) =>
      s +
      p[0] * pts[(i + 1) % pts.length][1] -
      p[1] * pts[(i + 1) % pts.length][0],
    0,
  );
  if (Math.abs(area) < eps) throw Error("Площадь контура равна нулю");
  if (area < 0) pts.reverse();
  const triangles: Point[][] = [],
    remaining = pts.map((_, i) => i);
  while (remaining.length > 3) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = pts[remaining[(i + remaining.length - 1) % remaining.length]],
        b = pts[remaining[i]],
        c = pts[remaining[(i + 1) % remaining.length]];
      if (cross(a, b, c) <= eps) continue;
      const occupied = remaining.some((k) => {
        const p = pts[k];
        return (
          p !== a &&
          p !== b &&
          p !== c &&
          cross(a, b, p) >= -eps &&
          cross(b, c, p) >= -eps &&
          cross(c, a, p) >= -eps
        );
      });
      if (!occupied) {
        triangles.push([a, b, c]);
        remaining.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) throw Error("Не удалось разбить контур. Проверьте вершины");
  }
  triangles.push(remaining.map((i) => pts[i]));
  // Cover shared triangulation edges with interior diamonds: a plain R-union
  // of touching triangles would leave spurious zero seams inside the polygon.
  const pieces = triangles.slice();
  for (let i = 0; i < triangles.length; i++)
    for (let j = i + 1; j < triangles.length; j++) {
      const shared = triangles[i].filter((p) => triangles[j].includes(p));
      if (shared.length === 2) {
        const center = (t: Point[]): Point => [
          t.reduce((s, p) => s + p[0], 0) / 3,
          t.reduce((s, p) => s + p[1], 0) / 3,
        ];
        let bridge = [
          shared[0],
          center(triangles[i]),
          shared[1],
          center(triangles[j]),
        ];
        if (cross(bridge[0], bridge[1], bridge[2]) < 0)
          bridge = bridge.reverse();
        pieces.push(bridge);
      }
    }
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]),
    margin =
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ) * 0.15;
  const lines = [
    `RECTANGLE(${Math.min(...xs) - margin},${Math.min(...ys) - margin},${Math.max(...xs) + margin},${Math.max(...ys) + margin})`,
    "RECTBMP(500,500)",
    "ARGUMENT x,y",
    "// Объединение треугольников невыпуклого контура",
  ];
  pieces.forEach((t, i) => {
    const sides = t.map((a, j) => {
      const b = t[(j + 1) % t.length];
      return `((${a[1] - b[1]})*x+(${b[0] - a[0]})*y+(${b[1] * a[0] - a[1] * b[0]}))`;
    });
    lines.push(`FUNCTION T${i + 1}=${sides.join("&")}`);
  });
  lines.push(
    "FUNCTION W=" + pieces.map((_, i) => `T${i + 1}`).join("|"),
    "RETURN W",
  );
  return lines.join("\n");
}
export type LinearSolution = { point: Point; value: number; vertices: Point[] };
export function solveLinear(
  rows: number[][],
  objective: Point,
  kind: "min" | "max",
): LinearSolution {
  if (
    !rows.length ||
    rows.length > 30 ||
    !rows.every(
      (r) =>
        r.length === 3 && r.every(Number.isFinite) && r.every((n) => n >= 0),
    ) ||
    !objective.every(Number.isFinite)
  )
    throw Error(
      "Для задачи производства нужны неотрицательные a, b, c в ограничениях a·x+b·y ≤ c",
    );
  if (!rows.some((r) => r[0] > 0) || !rows.some((r) => r[1] > 0))
    throw Error("Нужны ограничения, ограничивающие обе переменные сверху");
  const all = [...rows, [1, 0, 0], [0, 1, 0]],
    vertices: Point[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const [a, b, c] = all[i],
        [d, e, f] = all[j],
        det = a * e - b * d;
      if (Math.abs(det) < 1e-12) continue;
      const q: Point = [(c * e - b * f) / det || 0, (a * f - c * d) / det || 0];
      if (
        q[0] >= -1e-9 &&
        q[1] >= -1e-9 &&
        rows.every(
          ([a, b, c]) => a * q[0] + b * q[1] <= c + 1e-8 * Math.max(1, c),
        ) &&
        !vertices.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-8)
      )
        vertices.push(q);
    }
  if (!vertices.length) throw Error("Нет допустимых вершин");
  vertices.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  const sign = kind === "max" ? 1 : -1;
  vertices.sort(
    (a, b) =>
      sign *
      (b[0] * objective[0] +
        b[1] * objective[1] -
        (a[0] * objective[0] + a[1] * objective[1])),
  );
  const point = vertices[0];
  return {
    point,
    value: point[0] * objective[0] + point[1] * objective[1],
    vertices,
  };
}
export function linearCode(
  rows: number[][],
  objective: Point,
  kind: "min" | "max",
): string {
  const sol = solveLinear(rows, objective, kind),
    size = Math.max(1, ...sol.vertices.flat()),
    s = kind === "max" ? -1 : 1;
  return [
    `RECTANGLE(${-size * 0.15},${-size * 0.15},${size * 1.15},${size * 1.15})`,
    "RECTBMP(500,500)",
    "ARGUMENT x,y",
    ...rows.map(
      ([a, b, c], i) => `FUNCTION w${i + 1}=(${c})-(${a})*x-(${b})*y`,
    ),
    `FUNCTION w=${rows.map((_, i) => `w${i + 1}`).join("&")}&x&y`,
    `FUNCTION f=(${s})*((${objective[0]})*x+(${objective[1]})*y)`,
    "FUNCTION w0=w-abs(w)",
    "FUNCTION F=f+abs(w0*(1+abs(f)))",
    "RETURN F",
  ].join("\n");
}
export function sceneCode(
  kind: "rfm" | "potential",
  goal: Point,
  power: number,
  rows: number[][],
): string {
  if (
    !goal.every(Number.isFinite) ||
    !Number.isFinite(power) ||
    power <= 0 ||
    rows.length > 30 ||
    !rows.every((r) => r.length === 3 && r.every(Number.isFinite) && r[2] > 0)
  )
    throw Error(
      "Укажите конечные координаты, положительные радиусы/силы; максимум 30 препятствий",
    );
  const lines = ["RECTANGLE(0,0,10,10)", "RECTBMP(500,500)", "ARGUMENT x,y"];
  lines.push(
    `FUNCTION Goal=${kind === "potential" ? `-(${power})/(1+(x-(${goal[0]}))^2+(y-(${goal[1]}))^2)` : `-(${power})+(x-(${goal[0]}))^2+(y-(${goal[1]}))^2`}`,
  );
  rows.forEach(([x, y, r], i) =>
    lines.push(
      `FUNCTION O${i + 1}=${kind === "potential" ? `(${r})/(1+(x-(${x}))^2+(y-(${y}))^2)` : `((${r})^2-(x-(${x}))^2-(y-(${y}))^2)*1000000`}`,
    ),
  );
  lines.push(
    `FUNCTION W=${["Goal", ...rows.map((_, i) => `O${i + 1}`)].join(kind === "potential" ? "+" : "|")}`,
    "RETURN W",
  );
  return lines.join("\n");
}
