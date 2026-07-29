// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import QRCode from "qrcode";

const options = {
  errorCorrectionLevel: "M" as const,
};

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...options, type: "svg" });
}

export async function qrPng(text: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(text, options);
  return Uint8Array.from(buffer);
}
