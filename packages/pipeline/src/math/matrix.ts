/**
 * 4x4 matrix helpers for the convention used by .x files: 16 numbers in row-major order,
 * applied to row vectors (`p' = p * M`), so translation sits in elements 12..14.
 *
 * The same 16 numbers read as a column-major array describe the same transform for column
 * vectors, which is what glTF expects, so no conversion is needed when writing them out.
 */

export type Mat4 = number[];
export type Vec3 = [number, number, number];
/** Quaternion as x, y, z, w. */
export type Quat = [number, number, number, number];

export const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Returns `a * b`, so that `p * (a * b)` applies `a` first and `b` second. */
export function multiply(a: readonly number[], b: readonly number[]): Mat4 {
  const out = new Array<number>(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (a[row * 4 + k] as number) * (b[k * 4 + col] as number);
      }
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

export function transpose(m: readonly number[]): Mat4 {
  const out = new Array<number>(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] = m[row * 4 + col] as number;
    }
  }
  return out;
}

/** General 4x4 inverse; throws when the matrix is singular. */
export function invert(m: readonly number[]): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) {
    throw new Error('matrix is singular');
  }
  const inv = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * inv,
    (a02 * b10 - a01 * b11 - a03 * b09) * inv,
    (a31 * b05 - a32 * b04 + a33 * b03) * inv,
    (a22 * b04 - a21 * b05 - a23 * b03) * inv,
    (a12 * b08 - a10 * b11 - a13 * b07) * inv,
    (a00 * b11 - a02 * b08 + a03 * b07) * inv,
    (a32 * b02 - a30 * b05 - a33 * b01) * inv,
    (a20 * b05 - a22 * b02 + a23 * b01) * inv,
    (a10 * b10 - a11 * b08 + a13 * b06) * inv,
    (a01 * b08 - a00 * b10 - a03 * b06) * inv,
    (a30 * b04 - a31 * b02 + a33 * b00) * inv,
    (a21 * b02 - a20 * b04 - a23 * b00) * inv,
    (a11 * b07 - a10 * b09 - a12 * b06) * inv,
    (a00 * b09 - a01 * b07 + a02 * b06) * inv,
    (a31 * b01 - a30 * b03 - a32 * b00) * inv,
    (a20 * b03 - a21 * b01 + a22 * b00) * inv,
  ];
}

export interface Trs {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

/**
 * Splits a row-vector matrix into scale, rotation, and translation, in the order glTF composes
 * them (`T * R * S` for column vectors, which is `S * R * T` for row vectors).
 */
export function decompose(m: readonly number[]): Trs {
  const rows: Vec3[] = [0, 1, 2].map((r) => [
    m[r * 4] as number,
    m[r * 4 + 1] as number,
    m[r * 4 + 2] as number,
  ]);
  const scale = rows.map((row) => Math.hypot(row[0], row[1], row[2])) as Vec3;
  // A negative determinant means one axis is mirrored; fold the mirror into the first scale.
  const det =
    (rows[0] as Vec3)[0] *
      ((rows[1] as Vec3)[1] * (rows[2] as Vec3)[2] - (rows[1] as Vec3)[2] * (rows[2] as Vec3)[1]) -
    (rows[0] as Vec3)[1] *
      ((rows[1] as Vec3)[0] * (rows[2] as Vec3)[2] - (rows[1] as Vec3)[2] * (rows[2] as Vec3)[0]) +
    (rows[0] as Vec3)[2] *
      ((rows[1] as Vec3)[0] * (rows[2] as Vec3)[1] - (rows[1] as Vec3)[1] * (rows[2] as Vec3)[0]);
  if (det < 0) scale[0] = -scale[0];
  const rotationRows = rows.map((row, i) => {
    const s = scale[i] as number;
    return s === 0 ? row : ([row[0] / s, row[1] / s, row[2] / s] as Vec3);
  }) as [Vec3, Vec3, Vec3];
  return {
    translation: [m[12] as number, m[13] as number, m[14] as number],
    rotation: quaternionFromRows(rotationRows),
    scale,
  };
}

/**
 * Quaternion (x, y, z, w) of a rotation given as the three rows of a row-vector rotation
 * matrix. Row `i` is the image of the `i`-th axis.
 */
export function quaternionFromRows(rows: [Vec3, Vec3, Vec3]): Quat {
  // For row vectors the matrix is the transpose of the column-vector form, so index [i][j]
  // of the column form is rows[j][i].
  const c = (i: number, j: number): number => (rows[j] as Vec3)[i] as number;
  const trace = c(0, 0) + c(1, 1) + c(2, 2);
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s;
    x = (c(2, 1) - c(1, 2)) / s;
    y = (c(0, 2) - c(2, 0)) / s;
    z = (c(1, 0) - c(0, 1)) / s;
  } else if (c(0, 0) > c(1, 1) && c(0, 0) > c(2, 2)) {
    const s = Math.sqrt(1 + c(0, 0) - c(1, 1) - c(2, 2)) * 2;
    w = (c(2, 1) - c(1, 2)) / s;
    x = 0.25 * s;
    y = (c(0, 1) + c(1, 0)) / s;
    z = (c(0, 2) + c(2, 0)) / s;
  } else if (c(1, 1) > c(2, 2)) {
    const s = Math.sqrt(1 + c(1, 1) - c(0, 0) - c(2, 2)) * 2;
    w = (c(0, 2) - c(2, 0)) / s;
    x = (c(0, 1) + c(1, 0)) / s;
    y = 0.25 * s;
    z = (c(1, 2) + c(2, 1)) / s;
  } else {
    const s = Math.sqrt(1 + c(2, 2) - c(0, 0) - c(1, 1)) * 2;
    w = (c(1, 0) - c(0, 1)) / s;
    x = (c(0, 2) + c(2, 0)) / s;
    y = (c(1, 2) + c(2, 1)) / s;
    z = 0.25 * s;
  }
  return normalizeQuat([x, y, z, w]);
}

/** Scales a quaternion to unit length; zero components come out as +0, never -0. */
export function normalizeQuat(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length === 0) return [0, 0, 0, 1];
  return [q[0] / length || 0, q[1] / length || 0, q[2] / length || 0, q[3] / length || 0];
}

/** Builds a row-vector matrix from glTF-style translation, rotation, and scale. */
export function compose(trs: Trs): Mat4 {
  const [x, y, z, w] = trs.rotation;
  const [sx, sy, sz] = trs.scale;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  // Rows of the row-vector rotation matrix are the columns of the column-vector one.
  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    trs.translation[0],
    trs.translation[1],
    trs.translation[2],
    1,
  ];
}

export function approxEqual(a: readonly number[], b: readonly number[], epsilon = 1e-5): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs((a[i] as number) - (b[i] as number)) > epsilon) return false;
  }
  return true;
}
