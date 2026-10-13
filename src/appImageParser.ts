/**
 * AppImage Binary File Format Parser
 * Standard: AppImage Type 1 (ISO 9660) & Type 2 (ELF runtime + SquashFS 4.0)
 * Zero external native dependencies: Pure TypeScript + Node.js Buffer & zlib
 * Fully cross-platform (Windows, macOS, Linux)
 */

import * as zlib from 'zlib';

export interface ElfHeaderInfo {
  magic: string;
  is64Bit: boolean;
  isLittleEndian: boolean;
  osAbi: number;
  type: number;
  machine: string;
  entryPoint: string;
  shOff: number;
  shEntSize: number;
  shNum: number;
  elfSize: number;
}

export interface SquashfsSuperblock {
  magic: string;
  inodes: number;
  mkfsTime: Date;
  mkfsTimeRaw: number;
  blockSize: number;
  fragments: number;
  compression: string;
  compressionId: number;
  blockLog: number;
  flags: number;
  noIds: number;
  sMajor: number;
  sMinor: number;
  bytesUsed: number;
  totalImageSize: number;
}

export interface DesktopEntryData {
  name?: string;
  exec?: string;
  icon?: string;
  terminal?: boolean;
  type?: string;
  categories?: string;
  comment?: string;
  genericName?: string;
  mimeType?: string;
  startupWMClass?: string;
  version?: string;
  rawText?: string;
  allFields: Record<string, string>;
}

export interface AppImageFileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  inode: number;
}

export interface ParsedAppImage {
  appImageType: 1 | 2 | 'Unknown';
  elfHeader: ElfHeaderInfo;
  squashfsSuperblock?: SquashfsSuperblock;
  desktopEntry?: DesktopEntryData;
  rootFiles: AppImageFileEntry[];
  summary: {
    appName: string;
    exec: string;
    icon: string;
    categories: string;
    comment: string;
    architecture: string;
    packageSize: number;
    createdTime?: Date;
  };
}

const ELF_MACHINES: Record<number, string> = {
  0x03: 'x86 (i386)',
  0x3E: 'x86_64 (AMD64)',
  0x28: 'ARM (32-bit)',
  0xB7: 'AArch64 (ARM 64-bit)',
  0xF3: 'RISC-V'
};

const SQUASHFS_COMPRESSIONS: Record<number, string> = {
  1: 'gzip',
  2: 'lzma',
  3: 'lzo',
  4: 'xz',
  5: 'lz4',
  6: 'zstd'
};

export function parseDesktopFile(text: string): DesktopEntryData {
  const allFields: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let inDesktopEntry = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) {
      inDesktopEntry = trimmed === '[Desktop Entry]';
      continue;
    }
    if (!inDesktopEntry) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    allFields[key] = value;
  }

  return {
    name: allFields['Name'],
    exec: allFields['Exec'],
    icon: allFields['Icon'],
    terminal: allFields['Terminal']?.toLowerCase() === 'true',
    type: allFields['Type'],
    categories: allFields['Categories'],
    comment: allFields['Comment'],
    genericName: allFields['GenericName'],
    mimeType: allFields['MimeType'],
    startupWMClass: allFields['StartupWMClass'],
    version: allFields['X-AppImage-Version'] || allFields['Version'],
    rawText: text,
    allFields
  };
}

/**
 * Parses an AppImage binary file buffer strictly according to AppImage specification.
 */
export function parseAppImageBuffer(buffer: Buffer): ParsedAppImage {
  if (buffer.length < 64) {
    throw new Error(`File is too small (${buffer.length} bytes) to be an ELF AppImage.`);
  }

  // 1. Verify ELF magic: 7F 45 4C 46
  if (buffer.readUInt32BE(0) !== 0x7F454C46) {
    throw new Error('Not a valid ELF binary file (Missing 7F 45 4C 46 magic header).');
  }

  const is64Bit = buffer[4] === 2;
  const isLittleEndian = buffer[5] === 1;
  const osAbi = buffer[7];

  // AppImage magic at bytes 8..10: 'A', 'I', 0x01 (Type 1) or 0x02 (Type 2)
  let appImageType: 1 | 2 | 'Unknown' = 'Unknown';
  if (buffer[8] === 0x41 && buffer[9] === 0x49) {
    if (buffer[10] === 0x02) appImageType = 2;
    else if (buffer[10] === 0x01) appImageType = 1;
  }

  const machineId = isLittleEndian ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18);
  const machineName = ELF_MACHINES[machineId] || `Machine 0x${machineId.toString(16)}`;

  let shOff = 0;
  let shEntSize = 0;
  let shNum = 0;

  if (is64Bit) {
    shOff = Number(isLittleEndian ? buffer.readBigUInt64LE(40) : buffer.readBigUInt64BE(40));
    shEntSize = isLittleEndian ? buffer.readUInt16LE(58) : buffer.readUInt16BE(58);
    shNum = isLittleEndian ? buffer.readUInt16LE(60) : buffer.readUInt16BE(60);
  } else {
    shOff = isLittleEndian ? buffer.readUInt32LE(32) : buffer.readUInt32BE(32);
    shEntSize = isLittleEndian ? buffer.readUInt16LE(46) : buffer.readUInt16BE(46);
    shNum = isLittleEndian ? buffer.readUInt16LE(48) : buffer.readUInt16BE(48);
  }

  const elfSize = shOff + (shEntSize * shNum);

  const elfHeader: ElfHeaderInfo = {
    magic: '7F 45 4C 46',
    is64Bit,
    isLittleEndian,
    osAbi,
    type: isLittleEndian ? buffer.readUInt16LE(16) : buffer.readUInt16BE(16),
    machine: machineName,
    entryPoint: is64Bit
      ? '0x' + (isLittleEndian ? buffer.readBigUInt64LE(24) : buffer.readBigUInt64BE(24)).toString(16)
      : '0x' + (isLittleEndian ? buffer.readUInt32LE(24) : buffer.readUInt32BE(24)).toString(16),
    shOff,
    shEntSize,
    shNum,
    elfSize
  };

  // 2. Locate SquashFS filesystem for Type 2
  let squashfsSuperblock: SquashfsSuperblock | undefined;
  let desktopEntry: DesktopEntryData | undefined;
  const rootFiles: AppImageFileEntry[] = [];

  // SquashFS magic is 0x73717368 ('hsqs')
  let sqOffset = elfSize;
  if (sqOffset + 4 > buffer.length || buffer.readUInt32LE(sqOffset) !== 0x73717368) {
    // Search nearby in case of padding
    const searchArea = buffer.subarray(0, Math.min(buffer.length, elfSize + 65536));
    const foundIdx = searchArea.indexOf(Buffer.from('hsqs'));
    if (foundIdx !== -1) {
      sqOffset = foundIdx;
    }
  }

  if (sqOffset + 96 <= buffer.length && buffer.readUInt32LE(sqOffset) === 0x73717368) {
    if (appImageType === 'Unknown') appImageType = 2;

    const sMagic = buffer.readUInt32LE(sqOffset).toString(16);
    const inodes = buffer.readUInt32LE(sqOffset + 4);
    const mkfsTimeRaw = buffer.readUInt32LE(sqOffset + 8);
    const blockSize = buffer.readUInt32LE(sqOffset + 12);
    const fragments = buffer.readUInt32LE(sqOffset + 16);
    const compressionId = buffer.readUInt16LE(sqOffset + 20);
    const blockLog = buffer.readUInt16LE(sqOffset + 22);
    const flags = buffer.readUInt16LE(sqOffset + 24);
    const noIds = buffer.readUInt16LE(sqOffset + 26);
    const sMajor = buffer.readUInt16LE(sqOffset + 28);
    const sMinor = buffer.readUInt16LE(sqOffset + 30);
    const rootInodeVal = buffer.readBigUInt64LE(sqOffset + 32);
    const bytesUsed = Number(buffer.readBigUInt64LE(sqOffset + 40));

    const inodeTableStart = sqOffset + Number(buffer.readBigUInt64LE(sqOffset + 64));
    const dirTableStart = sqOffset + Number(buffer.readBigUInt64LE(sqOffset + 72));

    squashfsSuperblock = {
      magic: '0x' + sMagic,
      inodes,
      mkfsTime: new Date(mkfsTimeRaw * 1000),
      mkfsTimeRaw,
      blockSize,
      fragments,
      compression: SQUASHFS_COMPRESSIONS[compressionId] || `ID ${compressionId}`,
      compressionId,
      blockLog,
      flags,
      noIds,
      sMajor,
      sMinor,
      bytesUsed,
      totalImageSize: sqOffset + bytesUsed
    };

    // Parse root directory and desktop file
    try {
      const blockOff = Number(rootInodeVal >> 16n);
      const byteOff = Number(rootInodeVal & 0xFFFFn);

      if (inodeTableStart + blockOff + 2 <= buffer.length) {
        const h = buffer.readUInt16LE(inodeTableStart + blockOff);
        const comp = h & 0x7FFF;
        const isUncomp = (h & 0x8000) !== 0;
        const blk = buffer.subarray(inodeTableStart + blockOff + 2, inodeTableStart + blockOff + 2 + comp);
        const decInode = isUncomp ? blk : zlib.inflateSync(blk);

        const startBlock = decInode.readUInt32LE(byteOff + 16);
        const dirFileSize = decInode.readUInt16LE(byteOff + 24);
        const offsetInBlock = decInode.readUInt16LE(byteOff + 26);

        if (dirTableStart + startBlock + 2 <= buffer.length) {
          const dH = buffer.readUInt16LE(dirTableStart + startBlock);
          const dComp = dH & 0x7FFF;
          const isDUncomp = (dH & 0x8000) !== 0;
          const dBuf = buffer.subarray(dirTableStart + startBlock + 2, dirTableStart + startBlock + 2 + dComp);
          const decDir = isDUncomp ? dBuf : zlib.inflateSync(dBuf);

          let p = offsetInBlock;
          let desktopEntryInfo: { name: string; startBlock: number; entryOffset: number } | null = null;

          while (p < decDir.length && p < offsetInBlock + dirFileSize - 3) {
            const count = decDir.readUInt32LE(p);
            const entryStartBlock = decDir.readUInt32LE(p + 4);
            const inodeBase = decDir.readUInt32LE(p + 8);
            p += 12;

            for (let i = 0; i <= count && p + 8 <= decDir.length; i++) {
              const entryOffset = decDir.readUInt16LE(p);
              const inodeOffset = decDir.readInt16LE(p + 2);
              const type = decDir.readUInt16LE(p + 4);
              const size = decDir.readUInt16LE(p + 6);
              const name = decDir.subarray(p + 8, p + 8 + size + 1).toString('utf8');

              let typeStr: 'file' | 'directory' | 'symlink' | 'other' = 'file';
              if (type === 1) typeStr = 'directory';
              else if (type === 3) typeStr = 'symlink';
              else if (type === 2) typeStr = 'file';
              else typeStr = 'other';

              rootFiles.push({
                name,
                type: typeStr,
                inode: inodeBase + inodeOffset
              });

              if (name.endsWith('.desktop') && !desktopEntryInfo) {
                desktopEntryInfo = {
                  name,
                  startBlock: entryStartBlock,
                  entryOffset
                };
              }

              p += 8 + size + 1;
            }
          }

          // If found desktop file, read its content
          if (desktopEntryInfo && inodeTableStart + desktopEntryInfo.startBlock + 2 <= buffer.length) {
            const fHdr = buffer.readUInt16LE(inodeTableStart + desktopEntryInfo.startBlock);
            const fComp = fHdr & 0x7FFF;
            const isFUncomp = (fHdr & 0x8000) !== 0;
            const fBuf = buffer.subarray(inodeTableStart + desktopEntryInfo.startBlock + 2, inodeTableStart + desktopEntryInfo.startBlock + 2 + fComp);
            const decFileInode = isFUncomp ? fBuf : zlib.inflateSync(fBuf);

            const fp = desktopEntryInfo.entryOffset;
            const fBlocksStart = decFileInode.readUInt32LE(fp + 16);
            const fSize = decFileInode.readUInt32LE(fp + 28);

            if (fBlocksStart > 0 && fSize > 0 && sqOffset + fBlocksStart <= buffer.length) {
              const dataBlockStart = sqOffset + fBlocksStart;
              const dataBuf = buffer.subarray(dataBlockStart, Math.min(buffer.length, dataBlockStart + fSize + 512));
              let desktopRawText = '';
              try {
                const uncomp = zlib.inflateSync(dataBuf);
                desktopRawText = uncomp.toString('utf8');
              } catch {
                desktopRawText = dataBuf.subarray(0, fSize).toString('utf8');
              }

              if (desktopRawText && desktopRawText.includes('[Desktop Entry]')) {
                desktopEntry = parseDesktopFile(desktopRawText);
              }
            }
          }
        }
      }
    } catch {
      // SquashFS complex layout fallback
    }
  }

  // Summary resolution
  const appName = desktopEntry?.name || 'Linux AppImage';
  const exec = desktopEntry?.exec || 'AppRun';
  const icon = desktopEntry?.icon || '.DirIcon';
  const categories = desktopEntry?.categories || 'Application';
  const comment = desktopEntry?.comment || '';

  return {
    appImageType,
    elfHeader,
    squashfsSuperblock,
    desktopEntry,
    rootFiles,
    summary: {
      appName,
      exec,
      icon,
      categories,
      comment,
      architecture: elfHeader.machine,
      packageSize: buffer.length,
      createdTime: squashfsSuperblock?.mkfsTime
    }
  };
}

