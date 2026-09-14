"use client";
import { useEffect, useRef, useState } from "react";
import {
  polygonCode,
  parseRows,
  sceneCode,
  solveLinear,
  linearCode,
  type Point,
  type Path,
  type LinearSolution,
} from "../lib/geometry";
import type { Program } from "../lib/ranok";
function saveCSV(text: string, name: string) {
  const u = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
type Props = {
  source: string;
  program: Program | null;
  point: Point;
  paths: Path[];
  onPath: (p: Path) => void;
  onClear: () => void;
  onCode: (s: string, name: string) => void;
  onPoint: (x: number, y: number) => void;
  disabled: boolean;
};
export default function TaskTools({
  source,
  program,
  point,
  paths,
  onPath,
  onClear,
  onCode,
  onPoint,
  disabled,
}: Props) {
  const [task, setTask] = useState("paths"),
    [vertices, setVertices] = useState("-2 0\n2 0\n0 2\n0 4"),
    [mode, setMode] = useState("down"),
    [radius, setRadius] = useState("1"),
    [steps, setSteps] = useState("2000"),
    [clockwise, setClockwise] = useState(false),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [scene, setScene] = useState<"rfm" | "potential">("potential"),
    [gx, setGx] = useState("8"),
    [gy, setGy] = useState("8"),
    [power, setPower] = useState("1000"),
    [obstacles, setObstacles] = useState("5 5 30\n5 8 60"),
    [constraints, setConstraints] = useState(
      "2 4 120\n1 8 280\n7 4 240\n4 6 360",
    ),
    [cx, setCx] = useState("10"),
    [cy, setCy] = useState("24"),
    [kind, setKind] = useState<"min" | "max">("max"),
    [solution, setSolution] = useState<LinearSolution | null>(null),
    [solvedInput, setSolvedInput] = useState("");
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const jobs = generation;
    const reset = setTimeout(() => setWorking(false), 0);
    return () => {
      clearTimeout(reset);
      worker.current?.terminate();
      jobs.current++;
    };
  }, [source]);
  function guarded(fn: () => void) {
    setError("");
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function analyse(type: "trace" | "extremum", direction = mode) {
    guarded(() => {
      if (!program || disabled)
        throw Error("Сначала постройте текущий код модели");
      if (working) return;
      const w = new Worker(
        new URL("../lib/analysis.worker.ts", import.meta.url),
      );
      worker.current = w;
      const job = ++generation.current;
      setWorking(true);
      w.onmessage = (e) => {
        if (job !== generation.current) return;
        setWorking(false);
        if (e.data.error) setError(e.data.error);
        else onPath(e.data.path);
        w.terminate();
      };
      w.onerror = () => {
        if (job !== generation.current) return;
        setWorking(false);
        setError("Ошибка расчёта траектории");
        w.terminate();
      };
      w.postMessage({
        source,
        kind: type,
        start: point,
        mode: direction,
        radius: Number(radius),
        steps: Number(steps),
        clockwise,
      });
    });
  }
  function stop() {
    generation.current++;
    worker.current?.terminate();
    setWorking(false);
  }
  const last = paths.at(-1),
    end = last?.points.at(-1),
    inputKey = JSON.stringify([constraints, cx, cy, kind]);
  return (
    <section className="task-tools panel">
      <div className="tool-tabs">
        {[
          ["paths", "Траектории · 3–4"],
          ["polygon", "Контур по точкам · 2"],
          ["scene", "Сцена · 3–4"],
          ["optimization", "Оптимизация · 5"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={task === id ? "active" : ""}
            onClick={() => {
              setTask(id);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {task === "paths" && (
        <div className="tool-content">
          <div className="tool-row">
            <label>
              Движение
              <select
                aria-label="Режим траектории"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="down">Градиентный спуск</option>
                <option value="up">Градиентный подъём</option>
                <option value="tangent">По касательной</option>
              </select>
            </label>
            <label>
              Шаг, пикселей
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </label>
            <label>
              Максимум шагов
              <input
                type="number"
                min="1"
                max="10000"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
            </label>
            {mode === "tangent" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={clockwise}
                  onChange={(e) => setClockwise(e.target.checked)}
                />
                Обратное направление
              </label>
            )}
            <button
              className="primary"
              disabled={disabled || !program || working}
              onClick={() => analyse("trace")}
            >
              Построить траекторию
            </button>
            {working && (
              <button className="secondary" onClick={stop}>
                Остановить
              </button>
            )}
          </div>
          <p className="muted">
            Начало: ({point.map((n) => Number(n.toFixed(5))).join("; ")}).
            Выберите точку на картинке или введите координаты в инспекторе.
            Новая траектория добавляется к существующим.
          </p>
          <div className="tool-row">
            <button
              className="secondary"
              disabled={!paths.length}
              onClick={onClear}
            >
              Очистить траектории
            </button>
            <button
              className="secondary"
              disabled={!paths.length}
              onClick={() =>
                saveCSV(
                  "path,step,x,y,W\n" +
                    paths
                      .flatMap((p, k) =>
                        p.points.map(
                          (q, i) =>
                            `${k + 1},${i},${q[0]},${q[1]},${p.values[i]}`,
                        ),
                      )
                      .join("\n"),
                  "trajectories.csv",
                )
              }
            >
              Траектории CSV
            </button>
          </div>
          {last && (
            <p role="status">
              {last.reason}. Шагов: {last.points.length - 1}. Конец: (
              {end?.map((n) => Number(n.toFixed(6))).join("; ")}), W ={" "}
              {last.values.at(-1)?.toPrecision(7)}.
            </p>
          )}
          <p className="muted">
            Спуск и подъём используют адаптивный шаг; касательная сохраняет
            начальный уровень W. Остановка в локальном минимуме не означает
            достижение цели.
          </p>
        </div>
      )}
      {task === "polygon" && (
        <div className="tool-content tool-columns">
          <div>
            <label>
              Вершины в порядке обхода, по одной паре X Y на строку
              <textarea
                aria-label="Вершины контура"
                value={vertices}
                onChange={(e) => setVertices(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="tool-row">
              <button
                className="secondary"
                onClick={() =>
                  setVertices(
                    (v) =>
                      v.trim() +
                      `\n${point[0].toFixed(5)} ${point[1].toFixed(5)}`,
                  )
                }
              >
                Добавить выбранную точку
              </button>
              <button
                className="primary"
                onClick={() =>
                  guarded(() =>
                    onCode(
                      polygonCode(parseRows(vertices, 2) as Point[]),
                      "Контур по точкам",
                    ),
                  )
                }
              >
                Построить по вершинам
              </button>
            </div>
          </div>
          <div>
            <p>
              Выпуклый или невыпуклый замкнутый контур: 3–40 вершин. Последняя
              вершина соединяется с первой автоматически.
            </p>
            <p className="muted">
              Порядок обхода определяется автоматически. Самопересечения и
              касания отклоняются. Полученный код можно редактировать и
              использовать в собственной сцене.
            </p>
            <button
              className="secondary"
              onClick={() =>
                setVertices(
                  "-3 -2\n-1 -2\n-1 -1\n1 -1\n1 -2\n3 -2\n3 2\n1 2\n1 1\n-1 1\n-1 2\n-3 2",
                )
              }
            >
              Пример с 12 вершинами
            </button>
          </div>
        </div>
      )}
      {task === "scene" && (
        <div className="tool-content">
          <div className="tool-row">
            <label>
              Метод
              <select
                value={scene}
                onChange={(e) => {
                  const v = e.target.value as "rfm" | "potential";
                  setScene(v);
                  setObstacles(v === "rfm" ? "5 5 1\n5 8 1" : "5 5 30\n5 8 60");
                }}
              >
                <option value="potential">Потенциалы · задание 4</option>
                <option value="rfm">RFM · задание 3</option>
              </select>
            </label>
            <label>
              Цель X<input value={gx} onChange={(e) => setGx(e.target.value)} />
            </label>
            <label>
              Цель Y<input value={gy} onChange={(e) => setGy(e.target.value)} />
            </label>
            <label>
              {scene === "potential" ? "Сила цели" : "Глубина цели"}
              <input value={power} onChange={(e) => setPower(e.target.value)} />
            </label>
          </div>
          <div className="tool-columns">
            <label>
              Препятствия: X Y {scene === "potential" ? "сила" : "радиус"}
              <textarea
                aria-label="Препятствия"
                value={obstacles}
                onChange={(e) => setObstacles(e.target.value)}
              />
            </label>
            <div>
              <p>
                Область сцены: 0…10 по обеим осям. После создания выберите
                начальную точку и постройте спуск во вкладке «Траектории».
              </p>
              <p className="muted">
                Для квадратов, треугольников и произвольных фигур выберите
                пример «Сложная сцена RFM» и измените уравнения в редакторе. Для
                потенциалов полезны образы ∂W/∂x и ∂W/∂y.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  setObstacles(
                    "2 2 20\n2 5 25\n2 8 30\n4 3 20\n4 6 30\n5 8 40\n6 2 25\n6 5 35\n8 3 20\n9 6 15",
                  )
                }
                disabled={scene !== "potential"}
              >
                10 потенциальных препятствий
              </button>
            </div>
          </div>
          <button
            className="primary"
            onClick={() =>
              guarded(() => {
                if (!gx.trim() || !gy.trim() || !power.trim())
                  throw Error("Заполните координаты и силу цели");
                const goal: Point = [Number(gx), Number(gy)];
                if (goal.some((n) => n < 0 || n > 10))
                  throw Error("Цель должна находиться в области 0…10");
                onCode(
                  sceneCode(
                    scene,
                    goal,
                    Number(power),
                    obstacles.trim() ? parseRows(obstacles, 3) : [],
                  ),
                  scene === "rfm" ? "Сцена RFM" : "Сцена потенциалов",
                );
              })
            }
          >
            Создать код сцены
          </button>
        </div>
      )}
      {task === "optimization" && (
        <div className="tool-content">
          <div className="tool-columns">
            <div>
              <h3>Задача производства</h3>
              <label>
                Ограничения a·x + b·y ≤ c: a b c на строку
                <textarea
                  aria-label="Ограничения производства"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                />
              </label>
              <p className="muted">
                x ≥ 0, y ≥ 0 добавляются автоматически. Неотрицательные
                коэффициенты, непрерывные количества изделий — как в пособии.
              </p>
              <div className="tool-row">
                <label>
                  Коэффициент при x
                  <input value={cx} onChange={(e) => setCx(e.target.value)} />
                </label>
                <label>
                  Коэффициент при y
                  <input value={cy} onChange={(e) => setCy(e.target.value)} />
                </label>
                <label>
                  Цель
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as "min" | "max")}
                  >
                    <option value="max">Максимум</option>
                    <option value="min">Минимум</option>
                  </select>
                </label>
              </div>
              <button
                className="primary"
                onClick={() =>
                  guarded(() => {
                    if (!cx.trim() || !cy.trim())
                      throw Error("Укажите коэффициенты целевой функции");
                    const rows = parseRows(constraints, 3),
                      objective: Point = [Number(cx), Number(cy)],
                      sol = solveLinear(rows, objective, kind);
                    const code = linearCode(rows, objective, kind);
                    onCode(code, "Оптимизация");
                    setSolution(sol);
                    setSolvedInput(inputKey);
                    onPoint(...sol.point);
                  })
                }
              >
                Решить и построить модель
              </button>
            </div>
            <div>
              <h3>Экстремум текущей функции RETURN</h3>
              <p>
                Поиск лучшего значения на всей сетке с последующим локальным
                уточнением. Это численная оценка, без гарантии глобального
                экстремума между узлами.
              </p>
              <div className="tool-row">
                <button
                  className="secondary"
                  disabled={disabled || !program || working}
                  onClick={() => analyse("extremum", "min")}
                >
                  Найти минимум
                </button>
                <button
                  className="secondary"
                  disabled={disabled || !program || working}
                  onClick={() => analyse("extremum", "max")}
                >
                  Найти максимум
                </button>
                {working && (
                  <button className="secondary" onClick={stop}>
                    Остановить
                  </button>
                )}
              </div>
              {last && (
                <p role="status">
                  Последний результат: (
                  {end?.map((n) => Number(n.toFixed(6))).join("; ")}), W ={" "}
                  {last.values.at(-1)?.toPrecision(7)}. {last.reason}.
                </p>
              )}
              <p className="muted">
                В модели задачи производства F — штрафная функция для спуска.
                Исходная прибыль выводится в таблице ниже; при максимизации её
                знак в f инвертирован.
              </p>
            </div>
          </div>
          {solution && (
            <div className="solution">
              <p role="status">
                {solvedInput !== inputKey
                  ? "Параметры изменены — решите задачу заново. Предыдущий результат: "
                  : ""}
                x = {solution.point[0].toPrecision(7)}, y ={" "}
                {solution.point[1].toPrecision(7)}; целевая функция ={" "}
                <strong>{solution.value.toPrecision(8)}</strong>
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Допустимая вершина X</th>
                    <th>Y</th>
                  </tr>
                </thead>
                <tbody>
                  {solution.vertices.map((p, i) => (
                    <tr key={i}>
                      <td>{Number(p[0].toFixed(6))}</td>
                      <td>{Number(p[1].toFixed(6))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                Решение перебором пересечений прямых ограничений, без округления
                количества изделий до целых.
              </p>
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="error tool-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
