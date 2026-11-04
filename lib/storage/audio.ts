// mp3 的 ID3 头或帧同步
export function isMp3Header(buffer: Buffer): boolean {
  if (buffer.length < 3) {
    return false;
  }
  const hasId3 = buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33;
  const hasFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}
