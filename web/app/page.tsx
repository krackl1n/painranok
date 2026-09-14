"use client";

import TaskTools from "./task-tools";
import { type Path, type FieldMode, gradient } from "../lib/geometry";
import { pixels, bitmap, zip, imageModes } from "../lib/raster";
import { useEffect, useRef, useState } from "react";
import { compile, examples, type Program, type Grid } from "../lib/ranok";

const fmt = (n: number) =>
  Number.isFinite(n)
    ? Number(n.toPrecision(7)).toLocaleString("ru-RU", {
        maximumFractionDigits: 6,
      })
    : "не определено";
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Icon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="icon">
      {(
        {
          code: "⌘",
          play: "▶",
          download: "↓",
          file: "↥",
          help: "?",
          grid: "⊞",
          point: "⊙",
        } as Record<string, string>
      )[name] || name}
    </span>
  );
}
export default function Home() {
  const [code, setCode] = useState(examples[0].code),
    [title, setTitle] = useState(examples[0].name),
    [tab, setTab] = useState("editor"),
    [mode, setMode] = useState<FieldMode>("field"),
    [paths, setPaths] = useState<Path[]>([]),
    [axes, setAxes] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [result, setResult] = useState<{
      program: Program;
      grid: Grid;
      source: string;
    } | null>(null),
    [point, setPoint] = useState<[number, number]>([0, 1]),
    [px, setPx] = useState("0"),
    [py, setPy] = useState("1"),
    [notice, setNotice] = useState(""),
    [pointError, setPointError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    numbers = useRef<HTMLDivElement>(null);
  function run(source = code) {
    worker.current?.terminate();
    setError("");
    setBusy(true);
    try {
      const program = compile(source);
      const w = new Worker(
        new URL("../lib/compute.worker.ts", import.meta.url),
      );
      worker.current = w;
      w.onmessage = (e) => {
        if (e.data.error) setError(e.data.error);
        else {
          setResult({ program, grid: e.data.grid, source });
          setPaths([]);
        }
        setBusy(false);
        w.terminate();
      };
      w.onerror = () => {
        setError("Не удалось выполнить расчёт. Попробуйте ещё раз.");
        setBusy(false);
        w.terminate();
      };
      w.postMessage(source);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  useEffect(() => {
    const init = setTimeout(() => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("ranok-code");
      } catch {}
      const source = saved ?? examples[0].code;
      if (saved) {
        setCode(saved);
        setTitle("Моя модель");
      }
      run(source);
    }, 0);
    return () => {
      clearTimeout(init);
      worker.current?.terminate();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("ranok-code", code);
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [code]);
  useEffect(() => {
    if (!result || !canvas.current) return;
    const { program: p, grid: g } = result,
      c = canvas.current;
    c.width = p.width;
    c.height = p.height;
    const ctx = c.getContext("2d")!;
    const im = ctx.createImageData(p.width, p.height);
    im.data.set(pixels(p, g, mode));
    ctx.putImageData(im, 0, 0);
    if (axes) {
      ctx.lineWidth = Math.max(1, p.width / 700);
      ctx.strokeStyle = "rgba(206,221,242,0.12)";
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo((i * p.width) / 6, 0);
        ctx.lineTo((i * p.width) / 6, p.height);
        ctx.moveTo(0, (i * p.height) / 6);
        ctx.lineTo(p.width, (i * p.height) / 6);
        ctx.stroke();
      }
      const x = (-p.bounds[0] / (p.bounds[2] - p.bounds[0])) * p.width,
        y = (p.bounds[3] / (p.bounds[3] - p.bounds[1])) * p.height;
      ctx.strokeStyle = "rgba(219,232,255,.5)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, p.height);
      ctx.moveTo(0, y);
      ctx.lineTo(p.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    paths.forEach((path, index) => {
      ctx.strokeStyle = ["#ffce73", "#ff88ae", "#7bf0ba", "#ce9bff"][index % 4];
      ctx.lineWidth = Math.max(1.5, p.width / 300);
      ctx.beginPath();
      path.points.forEach(([x, y], i) => {
        const u =
            ((x - p.bounds[0]) / (p.bounds[2] - p.bounds[0])) * (p.width - 1),
          v =
            ((p.bounds[3] - y) / (p.bounds[3] - p.bounds[1])) * (p.height - 1);
        if (i === 0) ctx.moveTo(u, v);
        else ctx.lineTo(u, v);
      });
      ctx.stroke();
      const end = path.points.at(-1);
      if (end) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(
          ((end[0] - p.bounds[0]) / (p.bounds[2] - p.bounds[0])) *
            (p.width - 1),
          ((p.bounds[3] - end[1]) / (p.bounds[3] - p.bounds[1])) *
            (p.height - 1),
          3,
          0,
          2 * Math.PI,
        );
        ctx.fill();
      }
    });
  }, [result, mode, axes, paths]);
  const p = result?.program,
    g = result?.grid,
    values = p?.evaluate(...point),
    w = p && values ? p.result(values) : NaN,
    dirty = result?.source !== code;
  const grad = p ? gradient(p, point) : [NaN, NaN];
  const [xmin, ymin, xmax, ymax] = p?.bounds ?? [-3, -1, 3, 5];
  function choosePoint(x: number, y: number) {
    setPoint([x, y]);
    setPx(String(Number(x.toFixed(6))));
    setPy(String(Number(y.toFixed(6))));
    setPointError("");
  }
  function csv() {
    if (!p || !g) return;
    const rows = ["x,y,W"];
    for (let j = 0; j < p.height; j++)
      for (let i = 0; i < p.width; i++) {
        const v = g.values[j * p.width + i];
        rows.push(
          `${xmin + (i / (p.width - 1)) * (xmax - xmin)},${ymax - (j / (p.height - 1)) * (ymax - ymin)},${Number.isFinite(v) ? v : ""}`,
        );
      }
    download(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
      "ranok-points.csv",
    );
  }
  return (
    <div className="app-shell">
      <main>
        <div className="workspace">
          <section className="editor-panel panel">
            <div className="panel-top">
              <div className="tabs">
                <button
                  className={tab === "editor" ? "active" : ""}
                  onClick={() => setTab("editor")}
                >
                  <Icon name="code" /> Редактор
                </button>
                <button
                  className={tab === "examples" ? "active" : ""}
                  onClick={() => setTab("examples")}
                >
                  Примеры <span className="count">{examples.length}</span>
                </button>
              </div>
              <button
                className="quiet"
                onClick={() => setTab(tab === "help" ? "editor" : "help")}
              >
                Справка
              </button>
            </div>
            {tab === "help" ? (
              <div className="help-content">
                <h2>Операторы</h2>
                <p>
                  Вставьте программу из методички. Каждая команда — с новой
                  строки.
                </p>
                {[
                  ["RECTANGLE(a,b,c,d)", "Границы Xmin, Ymin, Xmax, Ymax."],
                  ["RECTBMP(w,h)", "Сетка: от 2 до 1000 точек по каждой оси."],
                  [
                    "ARGUMENT x,y",
                    "Два аргумента: горизонтальная и вертикальная координаты.",
                  ],
                  [
                    "CONSTANT R=1, a=2",
                    "Константы и выражения из ранее заданных констант.",
                  ],
                  [
                    "FUNCTION W=R^2-x^2-y^2",
                    "Вычисляемая переменная. Ссылки на предыдущие определения.",
                  ],
                  ["RETURN W", "Выражение для построения. Последняя команда."],
                  [
                    "A & B · A | B · -A",
                    "Пересечение, объединение и дополнение.",
                  ],
                  ["A-B", "Арифметическая разность значений функций."],
                  [
                    "diff(A,B) или A&(-B)",
                    "Вычитание области B из A. diff — сокращение, добавленное в веб-версию.",
                  ],
                  [
                    "intersect(A,B), union(A,B), neg(A)",
                    "Сокращения для A&B, A|B и -A.",
                  ],
                  [
                    "abs sqrt sin cos tan exp ln log",
                    "Функции одного аргумента; min, max, pow — двух.",
                  ],
                ].map(([a, b]) => (
                  <div className="help-row" key={a}>
                    <code>{a}</code>
                    <p>{b}</p>
                  </div>
                ))}
                <p>
                  Регистр имён важен: f и F различаются. Команды нечувствительны
                  к регистру. Комментарии: // или #. Степень ^ выполняется до
                  унарного минуса, затем *, /, +, −, &, |.
                </p>
                <p>
                  Используется семейство R₀: A & B = A + B − √(A² + B²), A | B =
                  A + B + √(A² + B²). Параметр семейства в методичке не указан;
                  точное совпадение численных значений с настольным РАНОК не
                  гарантируется.
                </p>
                <p>
                  Нулевой контур и производные вычисляются по сетке. Для заданий
                  2–5 используйте инструменты под холстом. Траектории строятся
                  по функции RETURN независимо от выбранного образа.
                </p>
                <p>
                  ∂W/∂x и ∂W/∂y — конечные разности. Нормаль к z=W:
                  (−Wx,−Wy,1)/√(1+Wx²+Wy²). D задаёт плоскость
                  Nx·x+Ny·y+Nz·z+D=0. ZIP содержит семь численных образов с
                  именами из пособия; точное соответствие кодированию настольной
                  программы не проверено.
                </p>
                <a
                  href="https://userpages.umbc.edu/~rostamia/cbook/rvachev-functions.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Математика R-функций ↗
                </a>
              </div>
            ) : tab === "examples" ? (
              <div className="examples-content">
                {examples.map((ex, i) => (
                  <button
                    className="example"
                    key={ex.name}
                    onClick={() => {
                      setCode(ex.code);
                      setTitle(ex.name);
                      setTab("editor");
                      run(ex.code);
                    }}
                  >
                    <span className="example-symbol">
                      {["△", "○", "⌁", "◉", "◎", "∠"][i % 6]}
                    </span>
                    <span>
                      <strong>{ex.name}</strong>
                      <small>{ex.detail}</small>
                    </span>
                    <span>↗</span>
                  </button>
                ))}
                <p className="muted">
                  Примеры по методическим указаниям МГТУ «СТАНКИН», 2019.
                </p>
              </div>
            ) : (
              <>
                <div className="filebar">
                  <span>
                    <span className="blue-dot" /> {title}.dat
                  </span>
                  <span className="muted">{code.split("\n").length} строк</span>
                </div>
                <div className="code-editor">
                  <div className="line-numbers" ref={numbers}>
                    {code.split("\n").map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    aria-label="Код модели"
                    value={code}
                    spellCheck={false}
                    onScroll={(e) => {
                      if (numbers.current)
                        numbers.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        run();
                      }
                      if (e.key === "Tab") {
                        e.preventDefault();
                        const t = e.currentTarget,
                          a = t.selectionStart,
                          b = t.selectionEnd;
                        setCode(code.slice(0, a) + "  " + code.slice(b));
                        requestAnimationFrame(() => {
                          t.selectionStart = t.selectionEnd = a + 2;
                        });
                      }
                    }}
                  />
                </div>
                <div className="editor-hint">
                  <span>Вставьте код или выберите пример</span>
                  <kbd>⌘ / Ctrl + Enter</kbd>
                </div>
              </>
            )}
            <div className="editor-actions">
              <button className="primary" onClick={() => run()} disabled={busy}>
                <Icon name="play" />
                {busy ? "Вычисляем…" : "Построить модель"}
              </button>
              <button
                className="square"
                title="Открыть .dat или .txt"
                aria-label="Открыть файл"
                onClick={() => file.current?.click()}
              >
                <Icon name="file" />
              </button>
              <button
                className="square"
                title="Сохранить код .dat"
                aria-label="Сохранить код"
                onClick={() =>
                  download(
                    new Blob([code], { type: "text/plain;charset=utf-8" }),
                    "model.dat",
                  )
                }
              >
                <Icon name="download" />
              </button>
              <input
                hidden
                type="file"
                accept=".dat,.txt"
                ref={file}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 100000) {
                      setError("Файл слишком большой: максимум 100 КБ");
                      return;
                    }
                    setCode(await f.text());
                    setTitle(f.name.replace(/\.[^.]+$/, ""));
                    setTab("editor");
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </section>
          <section className="plot-panel panel">
            <div className="panel-top">
              <h2>
                <Icon name="grid" /> Визуализация
              </h2>
              <span className="resolution">
                {p ? `${p.width} × ${p.height}` : "—"} px
              </span>
            </div>
            <div className="plot-toolbar">
              <div className="segmented">
                {[
                  ["field", "Поле"],
                  ["shape", "Область"],
                  ["contour", "Контур"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={mode === id ? "selected" : ""}
                    onClick={() => setMode(id as FieldMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                aria-label="Образ функции"
                value={
                  ["field", "shape", "contour"].includes(mode) ? "field" : mode
                }
                onChange={(e) => setMode(e.target.value as FieldMode)}
              >
                {imageModes.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={axes}
                  onChange={(e) => setAxes(e.target.checked)}
                />{" "}
                Сетка и оси
              </label>
              <button
                className="quiet export"
                disabled={!result || busy}
                onClick={() =>
                  canvas.current?.toBlob((b) => {
                    if (b) download(b, "ranok-model.png");
                  })
                }
              >
                <Icon name="download" /> PNG
              </button>
              <button
                className="quiet"
                disabled={!result || busy}
                onClick={() => {
                  if (!p || !g) return;
                  const bytes = zip(
                    imageModes.map(([id, , name]) => ({
                      name,
                      data: bitmap(p.width, p.height, pixels(p, g, id)),
                    })),
                  );
                  download(
                    new Blob([bytes as BlobPart], { type: "application/zip" }),
                    "model-images.zip",
                  );
                }}
              >
                7 BMP · ZIP
              </button>
            </div>
            <div className="plot-area">
              <div
                className="plot-frame"
                style={{
                  aspectRatio: p ? `${p.width}/${p.height}` : "1",
                  maxWidth: p ? Math.min(410, (420 * p.width) / p.height) : 410,
                }}
              >
                <canvas
                  ref={canvas}
                  aria-label="Поле значений функции. Нажмите для выбора точки."
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    choosePoint(
                      xmin + ((e.clientX - r.left) / r.width) * (xmax - xmin),
                      ymax - ((e.clientY - r.top) / r.height) * (ymax - ymin),
                    );
                  }}
                />
                {point[0] >= xmin &&
                  point[0] <= xmax &&
                  point[1] >= ymin &&
                  point[1] <= ymax && (
                    <span
                      className="point-marker"
                      style={{
                        left: `${((point[0] - xmin) / (xmax - xmin)) * 100}%`,
                        top: `${((ymax - point[1]) / (ymax - ymin)) * 100}%`,
                      }}
                    />
                  )}
                <span className="axis y-top">{fmt(ymax)}</span>
                <span className="axis y-bottom">{fmt(ymin)}</span>
                <span className="axis x-left">{fmt(xmin)}</span>
                <span className="axis x-right">{fmt(xmax)}</span>
                <span className="axis x-label">x</span>
                <span className="axis y-label">y</span>
                {busy && <div className="plot-loading">Вычисление сетки…</div>}
              </div>
            </div>
            <div className="legend">
              {!["field", "shape", "contour"].includes(mode) ? (
                <span>
                  Чёрный → белый: от минимума к максимуму выбранного образа
                </span>
              ) : (
                <>
                  <span>
                    <i className="negative" /> W &lt; 0{" "}
                    <span className="muted">снаружи</span>
                  </span>
                  <span>
                    <i className="zero" /> W = 0{" "}
                    <span className="muted">контур</span>
                  </span>
                  <span>
                    <i className="positive" /> W &gt; 0{" "}
                    <span className="muted">внутри</span>
                  </span>
                </>
              )}
            </div>
          </section>
        </div>
        <div className={`status-line ${error ? "error" : ""}`} role="status">
          {error ? (
            <>
              <span>⚠ {error}</span>
              {result && <span>Показана предыдущая модель</span>}
            </>
          ) : (
            <>
              <span>
                <i className={busy ? "blue-dot" : "green-dot"} />
                {busy
                  ? "Расчёт модели…"
                  : dirty
                    ? "Код изменён — постройте модель заново"
                    : "Модель построена"}
                {g && !busy && (
                  <span className="muted">
                    {" "}
                    · {Math.round(g.ms)} мс ·{" "}
                    {g.values.length.toLocaleString("ru-RU")} точек
                  </span>
                )}
              </span>
              <span className="muted">
                {g?.invalid
                  ? `Не определено в ${g.invalid} точках (розовый цвет)`
                  : "Значения рассчитаны на равномерной сетке"}
              </span>
            </>
          )}
        </div>
        <section className="inspector panel">
          <div className="inspector-main">
            <div className="inspector-title">
              <h2>Значение в точке</h2>
            </div>
            <form
              className="point-form"
              onSubmit={(e) => {
                e.preventDefault();
                const x = Number(px.replace(",", ".")),
                  y = Number(py.replace(",", "."));
                if (
                  px.trim() &&
                  py.trim() &&
                  Number.isFinite(x) &&
                  Number.isFinite(y)
                )
                  choosePoint(x, y);
                else setPointError("Введите конечные числа X и Y");
              }}
            >
              <label>
                X
                <input
                  aria-label="Координата X"
                  value={px}
                  onChange={(e) => setPx(e.target.value)}
                />
              </label>
              <label>
                Y
                <input
                  aria-label="Координата Y"
                  value={py}
                  onChange={(e) => setPy(e.target.value)}
                />
              </label>
              <button
                className="square"
                title="Вычислить точку"
                aria-label="Вычислить точку"
                disabled={!p}
              >
                ↗
              </button>
            </form>
            <div className="point-value">
              <span className="muted">W(x, y)</span>
              <strong>{fmt(w)}</strong>
              <small>
                {!Number.isFinite(w)
                  ? "Вне области определения"
                  : Math.abs(w) < 1e-10
                    ? "На границе"
                    : w > 0
                      ? "Внутри области"
                      : "Снаружи области"}
              </small>
            </div>
            <button
              className="secondary"
              disabled={!result || busy}
              onClick={() => {
                csv();
                setNotice("CSV содержит все узлы сетки: x, y, W.");
              }}
            >
              <Icon name="download" /> Все точки · CSV
            </button>
          </div>
          {pointError && (
            <p role="alert" className="error point-error">
              {pointError}
            </p>
          )}
          <div className="variable-list">
            <span>
              ∂W/∂x <code>{fmt(grad[0])}</code>
            </span>
            <span>
              ∂W/∂y <code>{fmt(grad[1])}</code>
            </span>
            {p?.names.map((n, i) => (
              <span key={n}>
                <span>{n}</span>
                <code>{fmt(values?.[i] ?? NaN)}</code>
              </span>
            ))}
          </div>
          {notice && (
            <p role="status" className="download-notice">
              {notice}
            </p>
          )}
        </section>
        <TaskTools
          source={result?.source ?? ""}
          program={p ?? null}
          point={point}
          paths={paths}
          onPath={(path) => setPaths((old) => [...old, path])}
          onClear={() => setPaths([])}
          onCode={(source, name) => {
            setCode(source);
            setTitle(name);
            setTab("editor");
            run(source);
          }}
          onPoint={choosePoint}
          disabled={busy || dirty}
        />
      </main>
    </div>
  );
}
