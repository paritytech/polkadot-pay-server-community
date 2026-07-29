// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
class Reader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  take(length: number): Uint8Array {
    const value = this.bytes.slice(this.offset, this.offset + length);
    if (value.length !== length) {
      throw new Error("unexpected end of SCALE buffer");
    }
    this.offset += length;
    return value;
  }

  u8(): number {
    return this.take(1)[0] ?? 0;
  }

  u64(): bigint {
    return this.take(8).reduceRight((value, byte) => (value << 8n) | BigInt(byte), 0n);
  }

  compact(): number {
    const b0 = this.u8();
    const mode = b0 & 0b11;
    if (mode === 0) return b0 >> 2;
    if (mode === 1) return (b0 >> 2) | (this.u8() << 6);
    if (mode === 2) {
      const rest = this.take(3);
      const value = b0 | ((rest[0] ?? 0) << 8) | ((rest[1] ?? 0) << 16) | ((rest[2] ?? 0) << 24);
      return value >> 2;
    }
    const byteLength = (b0 >> 2) + 4;
    const wide = this.take(byteLength);
    let value = 0n;
    for (let index = wide.length - 1; index >= 0; index -= 1) {
      value = (value << 8n) | BigInt(wide[index] ?? 0);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("compact integer exceeds safe JS range");
    }
    return Number(value);
  }

  bytesVec(): Uint8Array {
    return this.take(this.compact());
  }
}

function hexToBytes(statementHex: string): Uint8Array {
  const clean = statementHex.startsWith("0x") ? statementHex.slice(2) : statementHex;
  if (clean.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const parsed = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(parsed)) {
      throw new Error(`invalid hex byte at ${index}`);
    }
    bytes[index] = parsed;
  }
  return bytes;
}

export function extractStatementData(statementHex: string): Uint8Array | null {
  try {
    const reader = new Reader(hexToBytes(statementHex));
    const fieldCount = reader.compact();
    let data: Uint8Array | null = null;

    for (let index = 0; index < fieldCount; index += 1) {
      const fieldIndex = reader.u8();
      if (fieldIndex === 0) {
        if (reader.u8() !== 0) {
          throw new Error("unexpected proof variant");
        }
        reader.take(64);
        reader.take(32);
        continue;
      }
      if (fieldIndex === 2) {
        reader.u64();
        continue;
      }
      if (fieldIndex === 3 || fieldIndex === 4 || fieldIndex === 5 || fieldIndex === 6 || fieldIndex === 7) {
        reader.take(32);
        continue;
      }
      if (fieldIndex === 8) {
        data = reader.bytesVec();
        continue;
      }
      throw new Error(`unknown statement field index ${fieldIndex}`);
    }

    return data;
  } catch {
    return null;
  }
}
