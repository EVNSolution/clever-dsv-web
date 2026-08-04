const QR_SIZE = 37;
const DATA_CODEWORDS = 86;
const ERROR_CORRECTION_CODEWORDS = 24;
const BLOCK_COUNT = 2;
const MAX_BYTE_LENGTH = 84;

type QrMatrix = {
  functionModules: boolean[][];
  modules: boolean[][];
};

export function createQrCodeModules(value: string): boolean[][] {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > MAX_BYTE_LENGTH) throw new Error('QR 코드로 표시할 링크가 너무 깁니다.');

  const matrix = createMatrix();
  drawFunctionPatterns(matrix);
  const codewords = addErrorCorrection(encodeData(bytes));
  drawCodewords(matrix, codewords);
  drawFormatBits(matrix, 0);
  return matrix.modules;
}

function encodeData(bytes: Uint8Array): Uint8Array {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);

  const capacity = DATA_CODEWORDS * 8;
  for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) appendBits(bits, pad, 8);

  return Uint8Array.from({ length: DATA_CODEWORDS }, (_, byteIndex) => {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | (bits[byteIndex * 8 + bit] ?? 0);
    return value;
  });
}

function addErrorCorrection(data: Uint8Array): Uint8Array {
  const blockLength = DATA_CODEWORDS / BLOCK_COUNT;
  const divisor = reedSolomonDivisor(ERROR_CORRECTION_CODEWORDS);
  const blocks = Array.from({ length: BLOCK_COUNT }, (_, index) => data.slice(index * blockLength, (index + 1) * blockLength));
  const corrections = blocks.map((block) => reedSolomonRemainder(block, divisor));
  const result: number[] = [];
  for (let index = 0; index < blockLength; index += 1) {
    for (const block of blocks) result.push(block[index] ?? 0);
  }
  for (let index = 0; index < ERROR_CORRECTION_CODEWORDS; index += 1) {
    for (const correction of corrections) result.push(correction[index] ?? 0);
  }
  return Uint8Array.from(result);
}

function reedSolomonDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let term = 0; term < degree; term += 1) {
      result[term] = multiply(result[term] ?? 0, root);
      if (term + 1 < degree) result[term] ^= result[term + 1] ?? 0;
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (result[0] ?? 0);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let index = 0; index < result.length; index += 1) {
      result[index] ^= multiply(divisor[index] ?? 0, factor);
    }
  }
  return result;
}

function multiply(left: number, right: number): number {
  let result = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11D);
    result ^= ((right >>> bit) & 1) * left;
  }
  return result & 0xFF;
}

function createMatrix(): QrMatrix {
  const rows = () => Array.from({ length: QR_SIZE }, () => Array<boolean>(QR_SIZE).fill(false));
  return { functionModules: rows(), modules: rows() };
}

function drawFunctionPatterns(matrix: QrMatrix): void {
  for (let index = 0; index < QR_SIZE; index += 1) {
    setFunction(matrix, 6, index, index % 2 === 0);
    setFunction(matrix, index, 6, index % 2 === 0);
  }
  drawFinderPattern(matrix, 3, 3);
  drawFinderPattern(matrix, QR_SIZE - 4, 3);
  drawFinderPattern(matrix, 3, QR_SIZE - 4);
  drawAlignmentPattern(matrix, 30, 30);
  drawFormatBits(matrix, 0);
}

function drawFinderPattern(matrix: QrMatrix, centerX: number, centerY: number): void {
  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      if (x < 0 || y < 0 || x >= QR_SIZE || y >= QR_SIZE) continue;
      const distance = Math.max(Math.abs(offsetX), Math.abs(offsetY));
      setFunction(matrix, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(matrix: QrMatrix, centerX: number, centerY: number): void {
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      setFunction(matrix, centerX + offsetX, centerY + offsetY, Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== 1);
    }
  }
}

function drawCodewords(matrix: QrMatrix, codewords: Uint8Array): void {
  let bitIndex = 0;
  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < QR_SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? QR_SIZE - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (matrix.functionModules[y]?.[x]) continue;
        const byte = codewords[bitIndex >>> 3] ?? 0;
        const bit = ((byte >>> (7 - (bitIndex & 7))) & 1) !== 0;
        matrix.modules[y]![x] = bit !== ((x + y) % 2 === 0);
        bitIndex += 1;
      }
    }
  }
}

function drawFormatBits(matrix: QrMatrix, mask: number): void {
  const data = mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) !== 0;

  for (let index = 0; index <= 5; index += 1) setFunction(matrix, 8, index, bit(index));
  setFunction(matrix, 8, 7, bit(6));
  setFunction(matrix, 8, 8, bit(7));
  setFunction(matrix, 7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) setFunction(matrix, 14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1) setFunction(matrix, QR_SIZE - 1 - index, 8, bit(index));
  for (let index = 8; index < 15; index += 1) setFunction(matrix, 8, QR_SIZE - 15 + index, bit(index));
  setFunction(matrix, 8, QR_SIZE - 8, true);
}

function setFunction(matrix: QrMatrix, x: number, y: number, dark: boolean): void {
  matrix.modules[y]![x] = dark;
  matrix.functionModules[y]![x] = true;
}

function appendBits(target: number[], value: number, length: number): void {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((value >>> bit) & 1);
}
