/**
 * [MS-SHLLINK]: Shell Link Binary File Writer / Builder
 * Pure TypeScript + Node.js Buffer, zero native dependencies, fully cross-platform.
 */

import { parseLnkBuffer, ParsedLnk } from './lnkParser';

export interface EditableLnkData {
  targetPath: string;
  arguments: string;
  workingDir: string;
  description: string;
  showCommand: 'Normal' | 'Maximized' | 'Minimized' | 'SW_SHOWNORMAL' | 'SW_SHOWMAXIMIZED' | 'SW_SHOWMINNOACTIVE' | number;
  iconLocation: string;
  iconIndex: number;
  hotKey?: string;
}

export function lnkToIni(data: EditableLnkData): string {
  let showCmd = 'Normal';
  if (data.showCommand === 3 || data.showCommand === 'Maximized' || data.showCommand === 'SW_SHOWMAXIMIZED') {
    showCmd = 'Maximized';
  } else if (data.showCommand === 7 || data.showCommand === 'Minimized' || data.showCommand === 'SW_SHOWMINNOACTIVE') {
    showCmd = 'Minimized';
  }

  return `[Shortcut]
; Windows Shell Link (.lnk) Configuration
Target = ${data.targetPath || ''}
Arguments = ${data.arguments || ''}
WorkingDirectory = ${data.workingDir || ''}
Description = ${data.description || ''}
ShowCommand = ${showCmd}
IconLocation = ${data.iconLocation || ''}
IconIndex = ${data.iconIndex || 0}
HotKey = ${data.hotKey || 'None'}
`;
}

export function iniToLnk(iniText: string): EditableLnkData {
  const result: EditableLnkData = {
    targetPath: '',
    arguments: '',
    workingDir: '',
    description: '',
    showCommand: 'Normal',
    iconLocation: '',
    iconIndex: 0,
    hotKey: 'None'
  };

  const lines = iniText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const value = trimmed.slice(eqIdx + 1).trim();

    switch (key) {
      case 'target':
      case 'targetpath':
      case 'exec':
        result.targetPath = value;
        break;
      case 'arguments':
      case 'args':
        result.arguments = value;
        break;
      case 'workingdirectory':
      case 'workingdir':
      case 'path':
        result.workingDir = value;
        break;
      case 'description':
      case 'name':
      case 'comment':
        result.description = value;
        break;
      case 'showcommand':
      case 'run':
        if (value.toLowerCase().includes('max')) {
          result.showCommand = 'Maximized';
        } else if (value.toLowerCase().includes('min')) {
          result.showCommand = 'Minimized';
        } else {
          result.showCommand = 'Normal';
        }
        break;
      case 'iconlocation':
      case 'icon':
        result.iconLocation = value;
        break;
      case 'iconindex':
        result.iconIndex = parseInt(value, 10) || 0;
        break;
      case 'hotkey':
        result.hotKey = value;
        break;
    }
  }

  return result;
}

export function parsedToEditable(parsed: ParsedLnk): EditableLnkData {
  let showCmd: 'Normal' | 'Maximized' | 'Minimized' = 'Normal';
  if (parsed.header.showCommand.raw === 3) showCmd = 'Maximized';
  else if (parsed.header.showCommand.raw === 7) showCmd = 'Minimized';

  return {
    targetPath: parsed.summary.targetPath || '',
    arguments: parsed.summary.arguments || '',
    workingDir: parsed.summary.workingDir || '',
    description: parsed.summary.description || '',
    showCommand: showCmd,
    iconLocation: parsed.summary.iconLocation || '',
    iconIndex: parsed.header.iconIndex || 0,
    hotKey: parsed.header.hotKey.display !== 'None' ? parsed.header.hotKey.display : ''
  };
}

/**
 * Builds a valid [MS-SHLLINK] binary buffer from editable data.
 * If originalBuffer is provided, preserves existing timestamps, VolumeID serial, IDList, and ExtraData blocks.
 */
export function buildLnkBuffer(data: EditableLnkData, originalBuffer?: Buffer): Buffer {
  let parsedOrig: ParsedLnk | undefined;
  if (originalBuffer && originalBuffer.length >= 76) {
    try {
      parsedOrig = parseLnkBuffer(originalBuffer);
    } catch {
      // Ignore parse failure on corrupted original
    }
  }

  // 1. LinkFlags
  let linkFlags = 0x00000080; // IsUnicode
  if (data.description && data.description.trim()) linkFlags |= 0x00000004; // HasName
  if (data.workingDir && data.workingDir.trim()) linkFlags |= 0x00000010; // HasWorkingDir
  if (data.arguments && data.arguments.trim()) linkFlags |= 0x00000020; // HasArguments
  if (data.iconLocation && data.iconLocation.trim()) linkFlags |= 0x00000040; // HasIconLocation

  // Check if target is a path
  const target = (data.targetPath || '').trim();
  const hasLocalPath = target.length > 0 && /^[a-zA-Z]:\\/.test(target);
  const hasUncPath = target.length > 0 && /^\\\\[^\\]+/.test(target);

  if (hasLocalPath || hasUncPath) {
    linkFlags |= 0x00000002; // HasLinkInfo
  }

  // Preserve IDList if target didn't change and original had it
  let idListBuf: Buffer | undefined;
  if (parsedOrig?.targetIdList && parsedOrig.summary.targetPath === target && originalBuffer) {
    linkFlags |= 0x00000001; // HasLinkTargetIDList
    const idListStart = 76;
    const idListLen = originalBuffer.readUInt16LE(idListStart);
    idListBuf = Buffer.from(originalBuffer.subarray(idListStart, idListStart + 2 + idListLen));
  }

  // 2. Header
  const headerBuf = Buffer.alloc(76);
  headerBuf.writeUInt32LE(0x0000004C, 0); // HeaderSize = 76
  // CLSID: {00021401-0000-0000-C000-000000000046}
  Buffer.from('0114020000000000c000000000000046', 'hex').copy(headerBuf, 4);

  headerBuf.writeUInt32LE(linkFlags, 20); // LinkFlags
  headerBuf.writeUInt32LE(parsedOrig?.header.fileAttributes.raw || 0x00000020, 24); // FileAttributes

  // Timestamps
  const nowFiletime = BigInt(Date.now()) * 10000n + 116444736000000000n;
  const createFt = parsedOrig?.header.creationTime.raw ? BigInt(parsedOrig.header.creationTime.raw) : nowFiletime;
  const accessFt = nowFiletime;
  const writeFt = nowFiletime;

  headerBuf.writeBigUInt64LE(createFt, 28);
  headerBuf.writeBigUInt64LE(accessFt, 36);
  headerBuf.writeBigUInt64LE(writeFt, 44);

  headerBuf.writeUInt32LE(parsedOrig?.header.fileSize || 0, 52); // FileSize
  headerBuf.writeInt32LE(data.iconIndex || 0, 56); // IconIndex

  // ShowCommand
  let showCmdVal = 1; // SW_SHOWNORMAL
  if (data.showCommand === 3 || data.showCommand === 'Maximized' || data.showCommand === 'SW_SHOWMAXIMIZED') {
    showCmdVal = 3;
  } else if (data.showCommand === 7 || data.showCommand === 'Minimized' || data.showCommand === 'SW_SHOWMINNOACTIVE') {
    showCmdVal = 7;
  } else if (typeof data.showCommand === 'number') {
    showCmdVal = data.showCommand;
  }
  headerBuf.writeUInt32LE(showCmdVal, 60);

  // HotKey
  headerBuf.writeUInt16LE(parsedOrig?.header.hotKey.raw || 0, 64);

  // 3. LinkInfo Buffer
  let linkInfoBuf = Buffer.alloc(0);
  if ((linkFlags & 0x00000002) !== 0) {
    if (hasLocalPath) {
      // VolumeID structure
      const volLabelBuf = Buffer.from('\0', 'utf8');
      const volSize = 16 + volLabelBuf.length;
      const volBuf = Buffer.alloc(volSize);
      volBuf.writeUInt32LE(volSize, 0); // VolumeIDSize
      volBuf.writeUInt32LE(parsedOrig?.linkInfo?.volumeId?.driveType.raw || 3, 4); // DRIVE_FIXED
      const driveSerial = parsedOrig?.linkInfo?.volumeId?.driveSerialNumber
        ? parseInt(parsedOrig.linkInfo.volumeId.driveSerialNumber.replace('-', ''), 16) || 0x12345678
        : 0x12345678;
      volBuf.writeUInt32LE(driveSerial, 8); // DriveSerialNumber
      volBuf.writeUInt32LE(16, 12); // VolumeLabelOffset
      volLabelBuf.copy(volBuf, 16);

      // LocalBasePath strings
      const localAnsi = Buffer.from(target + '\0', 'utf8');
      const localUnicode = Buffer.from(target + '\0', 'utf16le');
      const emptySuffixAnsi = Buffer.from('\0', 'utf8');
      const emptySuffixUnicode = Buffer.from('\0', 'utf16le');

      const headerSize = 0x24; // 36 bytes with Unicode offsets
      const volOffset = headerSize;
      const localAnsiOffset = volOffset + volSize;
      const emptySuffixAnsiOffset = localAnsiOffset + localAnsi.length;
      const localUnicodeOffset = emptySuffixAnsiOffset + emptySuffixAnsi.length;
      const emptySuffixUnicodeOffset = localUnicodeOffset + localUnicode.length;

      const totalLinkInfoSize = emptySuffixUnicodeOffset + emptySuffixUnicode.length;

      linkInfoBuf = Buffer.alloc(totalLinkInfoSize);
      linkInfoBuf.writeUInt32LE(totalLinkInfoSize, 0);
      linkInfoBuf.writeUInt32LE(headerSize, 4);
      linkInfoBuf.writeUInt32LE(0x00000001, 8); // VolumeIDAndLocalBasePath
      linkInfoBuf.writeUInt32LE(volOffset, 12);
      linkInfoBuf.writeUInt32LE(localAnsiOffset, 16);
      linkInfoBuf.writeUInt32LE(0, 20); // CommonNetworkRelativeLinkOffset
      linkInfoBuf.writeUInt32LE(emptySuffixAnsiOffset, 24);
      linkInfoBuf.writeUInt32LE(localUnicodeOffset, 28);
      linkInfoBuf.writeUInt32LE(emptySuffixUnicodeOffset, 32);

      volBuf.copy(linkInfoBuf, volOffset);
      localAnsi.copy(linkInfoBuf, localAnsiOffset);
      emptySuffixAnsi.copy(linkInfoBuf, emptySuffixAnsiOffset);
      localUnicode.copy(linkInfoBuf, localUnicodeOffset);
      emptySuffixUnicode.copy(linkInfoBuf, emptySuffixUnicodeOffset);
    }
  }

  // 4. StringData Buffer
  const stringDataParts: Buffer[] = [];
  const appendStringData = (str: string) => {
    const chars = str.length;
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(chars, 0);
    const textBuf = Buffer.from(str, 'utf16le');
    stringDataParts.push(lenBuf, textBuf);
  };

  if ((linkFlags & 0x00000004) !== 0) appendStringData(data.description.trim());
  if ((linkFlags & 0x00000010) !== 0) appendStringData(data.workingDir.trim());
  if ((linkFlags & 0x00000020) !== 0) appendStringData(data.arguments.trim());
  if ((linkFlags & 0x00000040) !== 0) appendStringData(data.iconLocation.trim());

  const stringDataBuf = Buffer.concat(stringDataParts);

  // 5. ExtraData Blocks
  const extraParts: Buffer[] = [];
  if (originalBuffer && parsedOrig && parsedOrig.extraDataBlocks.length > 0) {
    // Re-pack original extra blocks
    let offset = 76;
    if (parsedOrig.targetIdList) {
      offset += 2 + originalBuffer.readUInt16LE(offset);
    }
    if (parsedOrig.linkInfo) {
      offset += originalBuffer.readUInt32LE(offset);
    }
    // Skip string data
    const origFlags = parsedOrig.header.linkFlags;
    const skipString = () => {
      if (offset + 2 <= originalBuffer.length) {
        const c = originalBuffer.readUInt16LE(offset);
        offset += 2 + (origFlags.isUnicode ? c * 2 : c);
      }
    };
    if (origFlags.hasName) skipString();
    if (origFlags.hasRelativePath) skipString();
    if (origFlags.hasWorkingDir) skipString();
    if (origFlags.hasArguments) skipString();
    if (origFlags.hasIconLocation) skipString();

    if (offset < originalBuffer.length) {
      const remaining = Buffer.from(originalBuffer.subarray(offset));
      extraParts.push(remaining);
    }
  }

  if (extraParts.length === 0) {
    // Terminal block
    extraParts.push(Buffer.alloc(4)); // 0x00000000
  }

  const extraBuf = Buffer.concat(extraParts);

  // Combine all parts
  const allParts: Uint8Array[] = [headerBuf];
  if (idListBuf) allParts.push(idListBuf);
  if (linkInfoBuf.length > 0) allParts.push(linkInfoBuf);
  if (stringDataBuf.length > 0) allParts.push(stringDataBuf);
  allParts.push(extraBuf);

  return Buffer.from(Buffer.concat(allParts));
}
