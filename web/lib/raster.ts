import type { Grid, Program } from "./ranok";
import { derivedGrid, type FieldMode } from "./geometry.ts";
export function pixels(
  p: Program,
  original: Grid,
  mode: FieldMode,
): Uint8ClampedArray {
  const g = derivedGrid(p, original, mode),
    data = new Uint8ClampedArray(p.width * p.height * 4),
    derived = !["field", "shape", "contour"].includes(mode);
  for (let j = 0; j < p.height; j++)
    for (let i = 0; i < p.width; i++) {
      const k = j * p.width + i,
        v = g.values[k];
      let rgb: number[];
      if (!Number.isFinite(v)) rgb = [227, 97, 149];
      else if (derived) {
        const t = g.max === g.min ? 0.5 : (v - g.min) / (g.max - g.min),
          c = 20 + 235 * t;
        rgb = [c, c, c];
      } else if (mode === "shape")
        rgb = v >= 0 ? [147, 197, 253] : [21, 31, 51];
      else if (mode === "contour") rgb = [22, 32, 51];
      else {
        const t =
          v >= 0
            ? Math.sqrt(v / (g.max || 1))
            : Math.sqrt(Math.abs(v / (g.min || 1)));
        rgb =
          v >= 0
            ? [157 + 91 * t, 195 + 55 * t, 239 + 16 * t]
            : [30 - 15 * t, 68 - 45 * t, 119 - 72 * t];
      }
      if (
        !derived &&
        Number.isFinite(v) &&
        ((i < p.width - 1 &&
          Number.isFinite(g.values[k + 1]) &&
          v >= 0 !== g.values[k + 1] >= 0) ||
          (j < p.height - 1 &&
            Number.isFinite(g.values[k + p.width]) &&
            v >= 0 !== g.values[k + p.width] >= 0) ||
          v === 0)
      )
        rgb = [120, 203, 255];
      data.set([...rgb, 255], k * 4);
    }
  return data;
}
export function bitmap(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const stride = Math.ceil((width * 3) / 4) * 4,
    bytes = new Uint8Array(54 + stride * height),
    v = new DataView(bytes.buffer);
  v.setUint16(0, 0x4d42, true);
  v.setUint32(2, bytes.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, stride * height, true);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const src = (j * width + i) * 4,
        dst = 54 + (height - 1 - j) * stride + i * 3;
      bytes[dst] = rgba[src + 2];
      bytes[dst + 1] = rgba[src + 1];
      bytes[dst + 2] = rgba[src];
    }
  return bytes;
}
// Uncompressed ZIP with CRC-32. No external library is needed for seven small BMPs.
export function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    let crc = 0xffffffff;
    for (const b of f.data) {
      crc ^= b;
      for (let i = 0; i < 8; i++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.data.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    const entry = new Uint8Array(46 + name.length),
      d = new DataView(entry.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, f.data.length, true);
    d.setUint32(24, f.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    entry.set(name, 46);
    directory.push(entry);
    chunks.push(header, f.data);
    offset += header.length + f.data.length;
  }
  const directorySize = directory.reduce((n, b) => n + b.length, 0),
    end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, directorySize, true);
  v.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + 22);
  let index = 0;
  for (const b of [...chunks, ...directory, end]) {
    result.set(b, index);
    index += b.length;
  }
  return result;
}
export const imageModes: [FieldMode, string, string][] = [
  ["field", "W · поле", "volume.bmp"],
  ["dx", "∂W/∂x", "dzxp.bmp"],
  ["dy", "∂W/∂y", "dzyp.bmp"],
  ["nx", "Nx · нормаль", "AuAll.bmp"],
  ["ny", "Ny · нормаль", "BuAll.bmp"],
  ["nz", "Nz · нормаль", "CuAll.bmp"],
  ["d", "D · касательная плоскость", "DuAll.bmp"],
];
