// A pen stroke's samples as the core stores them (pdf_marks.rs `Samples`): quantized deltas (0.01 pt places, 0.001
// pressure and tilt, 1 ms), zigzag varints, URL-safe base64 without padding. Both sides are tested on one string.
import type { Sample } from "./gen/Sample";

const PLACE = 100, FINE = 1000;
/** Rust's `f64::round`: halves away from zero. */
const round = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

export function encodeSamples(samples: readonly Sample[]): string {
  const bytes: number[] = [];
  let last = [0, 0, 0, 0, 0, 0];
  for (const s of samples) {
    const now = [round(s.x * PLACE), round(s.y * PLACE), round(s.pressure * FINE), round(s.tilt_x * FINE), round(s.tilt_y * FINE), Math.round(s.t)];
    for (let k = 0; k < 6; k++) {
      const d = now[k] - last[k];
      let z = d < 0 ? -2 * d - 1 : 2 * d; // zigzag
      do { const b = z % 128; z = Math.floor(z / 128); bytes.push(z ? b | 128 : b); } while (z);
    }
    last = now;
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 4096) bin += String.fromCharCode(...bytes.slice(i, i + 4096));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSamples(s: string): Sample[] {
  const bin = atob(s.trim().replace(/-/g, "+").replace(/_/g, "/"));
  const out: Sample[] = [], last = [0, 0, 0, 0, 0, 0];
  let at = 0;
  while (at < bin.length) {
    for (let k = 0; k < 6; k++) {
      let z = 0, mul = 1, b = 0;
      do { b = bin.charCodeAt(at++); z += (b & 127) * mul; mul *= 128; } while (b & 128 && at < bin.length);
      last[k] += z % 2 ? -(z + 1) / 2 : z / 2;
    }
    out.push({ x: last[0] / PLACE, y: last[1] / PLACE, pressure: last[2] / FINE, tilt_x: last[3] / FINE, tilt_y: last[4] / FINE, t: last[5] });
  }
  return out;
}

