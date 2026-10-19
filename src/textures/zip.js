// PNGs are already compressed, so the export bundle stores them as-is.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }

  return value >>> 0;
});

function checksum(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const [name, contents] of Object.entries(files)) {
    if (!Buffer.isBuffer(contents)) {
      throw new TypeError('ZIP entries must contain Buffers');
    }

    const filename = Buffer.from(name, 'utf8');
    const crc = checksum(contents);
    const flags = 0x0800;

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(flags, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(contents.length, 18);
    header.writeUInt32LE(contents.length, 22);
    header.writeUInt16LE(filename.length, 26);

    local.push(header, filename, contents);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(flags, 8);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(contents.length, 20);
    record.writeUInt32LE(contents.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);

    central.push(record, filename);
    offset += header.length + filename.length + contents.length;
  }

  const directoryLength = central.reduce((sum, item) => sum + item.length, 0);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(Object.keys(files).length, 8);
  footer.writeUInt16LE(Object.keys(files).length, 10);
  footer.writeUInt32LE(directoryLength, 12);
  footer.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, ...central, footer]);
}
