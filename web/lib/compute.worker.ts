import { compile, sample } from "./ranok";
self.onmessage = (event: MessageEvent<string>) => {
  try {
    const grid = sample(compile(event.data));
    self.postMessage({ grid }, { transfer: [grid.values.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
