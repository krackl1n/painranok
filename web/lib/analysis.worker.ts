import { compile } from "./ranok";
import { trace, findExtremum } from "./geometry";
self.onmessage = (event) => {
  try {
    const { source, kind, start, mode, radius, steps, clockwise } = event.data,
      p = compile(source);
    const path =
      kind === "extremum"
        ? findExtremum(p, mode)
        : trace(p, start, mode, radius, steps, clockwise);
    self.postMessage({ path });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
