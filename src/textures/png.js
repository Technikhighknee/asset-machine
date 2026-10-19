import { deflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;

  for (let bit = 0; bit < 8; bit++) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }

  return crc >>> 0;
});

function chunk(type, data) {
  const label = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  let crc = 0xffffffff;

  for (const byte of label) {
    crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  for (const byte of data) {
    crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);

  return Buffer.concat([length, label, data, checksum]);
}

export function encodePng(width, height, rgba) {
  const rowLength = width * 4;
  const raw = Buffer.alloc(height * (rowLength + 1));

  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function encodeGray16Png(width, height, grayscale) {
  if (!(grayscale instanceof Uint16Array) || grayscale.length !== width * height) {
    throw new TypeError('16-bit height samples must match the image dimensions');
  }

  const rowLength = width * 2;
  const raw = Buffer.alloc(height * (rowLength + 1));

  for (let y = 0; y < height; y++) {
    const start = y * (rowLength + 1) + 1;

    for (let x = 0; x < width; x++) {
      raw.writeUInt16BE(grayscale[y * width + x], start + x * 2);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 16;
  header[9] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
