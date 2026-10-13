/**
 * [MS-SHLLINK]: Shell Link (.LNK) Binary File Format Parser
 * Standard compliance: MS-SHLLINK specification
 * Zero external native dependencies: Pure TypeScript + Node.js Buffer
 * Cross-platform compatible (Windows, macOS, Linux)
 */

export interface LnkFileTime {
  /** 100-nanosecond intervals since Jan 1, 1601 UTC (Raw 64-bit uint as string) */
  raw: string;
  /** Converted standard JavaScript Date object (null if FILETIME is 0) */
  date: Date | null;
  /** ISO 8601 string representation (null if FILETIME is 0) */
  iso: string | null;
}

export interface LinkFlags {
  raw: number;
  hasLinkTargetIDList: boolean;
  hasLinkInfo: boolean;
  hasName: boolean;
  hasRelativePath: boolean;
  hasWorkingDir: boolean;
  hasArguments: boolean;
  hasIconLocation: boolean;
  isUnicode: boolean;
  forceNoLinkInfo: boolean;
  hasExpString: boolean;
  runInSeparateProcess: boolean;
  unused1: boolean;
  hasDarwinID: boolean;
  runAsUser: boolean;
  hasExpIcon: boolean;
  noPidlAlias: boolean;
  unused2: boolean;
  runWithShimLayer: boolean;
  forceNoLinkTrack: boolean;
  enableTargetMetadata: boolean;
  disableLinkPathTracking: boolean;
  disableKnownFolderTracking: boolean;
  disableKnownFolderAlias: boolean;
  allowLinkToLink: boolean;
  unaliasOnSave: boolean;
  preferEnvironmentPath: boolean;
  keepLocalIDListForUNCTarget: boolean;
  activeFlags: string[];
}

export interface FileAttributesFlags {
  raw: number;
  readOnly: boolean;
  hidden: boolean;
  system: boolean;
  directory: boolean;
  archive: boolean;
  normal: boolean;
  temporary: boolean;
  sparseFile: boolean;
  reparsePoint: boolean;
  compressed: boolean;
  offline: boolean;
  notContentIndexed: boolean;
  encrypted: boolean;
  activeAttributes: string[];
}

export interface HotKeyInfo {
  raw: number;
  key: string;
  modifiers: {
    shift: boolean;
    control: boolean;
    alt: boolean;
  };
  display: string;
}

export interface ShowCommandInfo {
  raw: number;
  name: string;
  description: string;
}

export interface ShellLinkHeader {
  headerSize: number;
  linkCLSID: string;
  linkFlags: LinkFlags;
  fileAttributes: FileAttributesFlags;
  creationTime: LnkFileTime;
  accessTime: LnkFileTime;
  writeTime: LnkFileTime;
  fileSize: number;
  iconIndex: number;
  showCommand: ShowCommandInfo;
  hotKey: HotKeyInfo;
}

export interface ItemID {
  size: number;
  type?: string;
  rawHex: string;
}

export interface LinkTargetIDList {
  size: number;
  items: ItemID[];
}

export interface VolumeIDInfo {
  driveType: {
    raw: number;
    name: string;
  };
  driveSerialNumber: string;
  volumeLabel: string;
}

export interface CommonNetworkRelativeLinkInfo {
  networkProviderType?: {
    raw: number;
    name: string;
  };
  netName: string;
  deviceName?: string;
}

export interface LinkInfo {
  flags: {
    raw: number;
    volumeIdAndLocalBasePath: boolean;
    commonNetworkRelativeLinkAndPathSuffix: boolean;
  };
  localBasePath?: string;
  commonPathSuffix?: string;
  volumeId?: VolumeIDInfo;
  commonNetworkRelativeLink?: CommonNetworkRelativeLinkInfo;
}

export interface StringData {
  name?: string;
  relativePath?: string;
  workingDir?: string;
  commandLineArguments?: string;
  iconLocation?: string;
}

export interface ExtraDataBlock {
  signature: string;
  signatureHex: string;
  blockSize: number;
  data: Record<string, any>;
}

export interface ParsedLnk {
  header: ShellLinkHeader;
  targetIdList?: LinkTargetIDList;
  linkInfo?: LinkInfo;
  stringData: StringData;
  extraDataBlocks: ExtraDataBlock[];
  summary: {
    targetPath?: string;
    arguments?: string;
    workingDir?: string;
    iconLocation?: string;
    description?: string;
  };
}

// Shell Link CLSID: 00021401-0000-0000-C000-000000000046
const EXPECTED_CLSID_HEX = '0114020000000000c000000000000046';

/**
 * Converts a 64-bit Windows FILETIME (100ns units since 1601-01-01 UTC)
 * to a standard JavaScript Date object.
 */
export function filetimeToDate(filetime: bigint): LnkFileTime {
  const rawStr = filetime.toString();
  if (filetime === 0n) {
    return { raw: rawStr, date: null, iso: null };
  }

  // 116,444,736,000,000,000 * 100ns between 1601-01-01 and 1970-01-01
  const FILETIME_EPOCH_DIFF = 116444736000000000n;
  // 1 millisecond = 10,000 * 100ns
  const ms = Number((filetime - FILETIME_EPOCH_DIFF) / 10000n);
  const date = new Date(ms);
  const iso = !isNaN(date.getTime()) ? date.toISOString() : null;

  return {
    raw: rawStr,
    date: !isNaN(date.getTime()) ? date : null,
    iso
  };
}

/**
 * Format GUID from buffer at offset
 */
export function readGuid(buffer: Buffer, offset: number): string {
  const p1 = buffer.readUInt32LE(offset).toString(16).padStart(8, '0');
  const p2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, '0');
  const p3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, '0');
  const p4 = buffer.subarray(offset + 8, offset + 10).toString('hex');
  const p5 = buffer.subarray(offset + 10, offset + 16).toString('hex');
  return `{${p1}-${p2}-${p3}-${p4}-${p5}}`;
}

function parseLinkFlags(flags: number): LinkFlags {
  const map: [keyof Omit<LinkFlags, 'raw' | 'activeFlags'>, number, string][] = [
    ['hasLinkTargetIDList', 1 << 0, 'HasLinkTargetIDList'],
    ['hasLinkInfo', 1 << 1, 'HasLinkInfo'],
    ['hasName', 1 << 2, 'HasName'],
    ['hasRelativePath', 1 << 3, 'HasRelativePath'],
    ['hasWorkingDir', 1 << 4, 'HasWorkingDir'],
    ['hasArguments', 1 << 5, 'HasArguments'],
    ['hasIconLocation', 1 << 6, 'HasIconLocation'],
    ['isUnicode', 1 << 7, 'IsUnicode'],
    ['forceNoLinkInfo', 1 << 8, 'ForceNoLinkInfo'],
    ['hasExpString', 1 << 9, 'HasExpString'],
    ['runInSeparateProcess', 1 << 10, 'RunInSeparateProcess'],
    ['unused1', 1 << 11, 'Unused1'],
    ['hasDarwinID', 1 << 12, 'HasDarwinID'],
    ['runAsUser', 1 << 13, 'RunAsUser'],
    ['hasExpIcon', 1 << 14, 'HasExpIcon'],
    ['noPidlAlias', 1 << 15, 'NoPidlAlias'],
    ['unused2', 1 << 16, 'Unused2'],
    ['runWithShimLayer', 1 << 17, 'RunWithShimLayer'],
    ['forceNoLinkTrack', 1 << 18, 'ForceNoLinkTrack'],
    ['enableTargetMetadata', 1 << 19, 'EnableTargetMetadata'],
    ['disableLinkPathTracking', 1 << 20, 'DisableLinkPathTracking'],
    ['disableKnownFolderTracking', 1 << 21, 'DisableKnownFolderTracking'],
    ['disableKnownFolderAlias', 1 << 22, 'DisableKnownFolderAlias'],
    ['allowLinkToLink', 1 << 23, 'AllowLinkToLink'],
    ['unaliasOnSave', 1 << 24, 'UnaliasOnSave'],
    ['preferEnvironmentPath', 1 << 25, 'PreferEnvironmentPath'],
    ['keepLocalIDListForUNCTarget', 1 << 26, 'KeepLocalIDListForUNCTarget']
  ];

  const result: any = { raw: flags, activeFlags: [] };
  for (const [key, mask, name] of map) {
    const isSet = (flags & mask) !== 0;
    result[key] = isSet;
    if (isSet) {
      result.activeFlags.push(name);
    }
  }
  return result as LinkFlags;
}

function parseFileAttributes(attrs: number): FileAttributesFlags {
  const map: [keyof Omit<FileAttributesFlags, 'raw' | 'activeAttributes'>, number, string][] = [
    ['readOnly', 0x00000001, 'FILE_ATTRIBUTE_READONLY'],
    ['hidden', 0x00000002, 'FILE_ATTRIBUTE_HIDDEN'],
    ['system', 0x00000004, 'FILE_ATTRIBUTE_SYSTEM'],
    ['directory', 0x00000010, 'FILE_ATTRIBUTE_DIRECTORY'],
    ['archive', 0x00000020, 'FILE_ATTRIBUTE_ARCHIVE'],
    ['normal', 0x00000080, 'FILE_ATTRIBUTE_NORMAL'],
    ['temporary', 0x00000100, 'FILE_ATTRIBUTE_TEMPORARY'],
    ['sparseFile', 0x00000200, 'FILE_ATTRIBUTE_SPARSE_FILE'],
    ['reparsePoint', 0x00000400, 'FILE_ATTRIBUTE_REPARSE_POINT'],
    ['compressed', 0x00000800, 'FILE_ATTRIBUTE_COMPRESSED'],
    ['offline', 0x00001000, 'FILE_ATTRIBUTE_OFFLINE'],
    ['notContentIndexed', 0x00002000, 'FILE_ATTRIBUTE_NOT_CONTENT_INDEXED'],
    ['encrypted', 0x00004000, 'FILE_ATTRIBUTE_ENCRYPTED']
  ];

  const result: any = { raw: attrs, activeAttributes: [] };
  for (const [key, mask, name] of map) {
    const isSet = (attrs & mask) !== 0;
    result[key] = isSet;
    if (isSet) {
      result.activeAttributes.push(name);
    }
  }
  return result as FileAttributesFlags;
}

function parseShowCommand(cmd: number): ShowCommandInfo {
  switch (cmd) {
    case 0x00000001:
      return { raw: cmd, name: 'SW_SHOWNORMAL', description: 'Activates and displays a window in normal size and position.' };
    case 0x00000003:
      return { raw: cmd, name: 'SW_SHOWMAXIMIZED', description: 'Activates the window and displays it as a maximized window.' };
    case 0x00000007:
      return { raw: cmd, name: 'SW_SHOWMINNOACTIVE', description: 'Displays the window as a minimized window without activating it.' };
    default:
      return { raw: cmd, name: `SW_UNKNOWN (${cmd})`, description: 'Custom or unspecified show command.' };
  }
}

const VK_KEY_NAMES: Record<number, string> = {
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D', 0x45: 'E',
  0x46: 'F', 0x47: 'G', 0x48: 'H', 0x49: 'I', 0x4A: 'J',
  0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N', 0x4F: 'O',
  0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S', 0x54: 'T',
  0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X', 0x59: 'Y', 0x5A: 'Z',
  0x70: 'F1', 0x71: 'F2', 0x72: 'F3', 0x73: 'F4', 0x74: 'F5',
  0x75: 'F6', 0x76: 'F7', 0x77: 'F8', 0x78: 'F9', 0x79: 'F10',
  0x7A: 'F11', 0x7B: 'F12', 0x90: 'NUM_LOCK', 0x91: 'SCROLL_LOCK'
};

function parseHotKey(hotKey: number): HotKeyInfo {
  const lowByte = hotKey & 0xFF;
  const highByte = (hotKey >> 8) & 0xFF;
  const shift = (highByte & 0x01) !== 0;
  const control = (highByte & 0x02) !== 0;
  const alt = (highByte & 0x04) !== 0;

  const keyName = VK_KEY_NAMES[lowByte] || (lowByte > 0 ? `0x${lowByte.toString(16)}` : 'None');
  const parts: string[] = [];
  if (control) parts.push('Ctrl');
  if (alt) parts.push('Alt');
  if (shift) parts.push('Shift');
  if (lowByte > 0) parts.push(keyName);

  return {
    raw: hotKey,
    key: keyName,
    modifiers: { shift, control, alt },
    display: parts.length > 0 ? parts.join(' + ') : 'None'
  };
}

const DRIVE_TYPES: Record<number, string> = {
  0: 'DRIVE_UNKNOWN',
  1: 'DRIVE_NO_ROOT_DIR',
  2: 'DRIVE_REMOVABLE',
  3: 'DRIVE_FIXED',
  4: 'DRIVE_REMOTE',
  5: 'DRIVE_CDROM',
  6: 'DRIVE_RAMDISK'
};

const NETWORK_PROVIDER_TYPES: Record<number, string> = {
  0x001A0000: 'WNNC_NET_AVID',
  0x001B0000: 'WNNC_NET_DOCUSPACE',
  0x001C0000: 'WNNC_NET_MANGOSOFT',
  0x001D0000: 'WNNC_NET_SERNET',
  0x001E0000: 'WNNC_NET_RIVERFRONT1',
  0x001F0000: 'WNNC_NET_RIVERFRONT2',
  0x00200000: 'WNNC_NET_DECORB',
  0x00210000: 'WNNC_NET_PROTSTOR',
  0x00220000: 'WNNC_NET_FJ_REDIR',
  0x00230000: 'WNNC_NET_DISTF',
  0x00240000: 'WNNC_NET_NDFS',
  0x00250000: 'WNNC_NET_DAV',
  0x00020000: 'WNNC_NET_LANMAN (SMB)'
};

function readNullTerminatedString(buffer: Buffer, offset: number, isUnicode: boolean): string {
  if (offset >= buffer.length) return '';
  if (isUnicode) {
    let end = offset;
    while (end + 1 < buffer.length) {
      if (buffer.readUInt16LE(end) === 0) {
        break;
      }
      end += 2;
    }
    return buffer.toString('utf16le', offset, end);
  } else {
    let end = offset;
    while (end < buffer.length) {
      if (buffer[end] === 0) {
        break;
      }
      end += 1;
    }
    return buffer.toString('utf8', offset, end);
  }
}

/**
 * Parses a Shell Link (.LNK) binary buffer strictly according to [MS-SHLLINK].
 */
export function parseLnkBuffer(buffer: Buffer): ParsedLnk {
  if (buffer.length < 76) {
    throw new Error(`Invalid LNK file size (${buffer.length} bytes): Header must be at least 76 bytes.`);
  }

  // 1. ShellLinkHeader (0x00 - 0x4C)
  const headerSize = buffer.readUInt32LE(0);
  if (headerSize !== 0x0000004C) {
    throw new Error(`Invalid ShellLinkHeader size: expected 0x0000004C (76 bytes), got 0x${headerSize.toString(16)}.`);
  }

  const clsidBytes = buffer.subarray(4, 20).toString('hex');
  if (clsidBytes.toLowerCase() !== EXPECTED_CLSID_HEX) {
    throw new Error(`Invalid LinkCLSID: expected {00021401-0000-0000-C000-000000000046}, got ${readGuid(buffer, 4)}`);
  }
  const linkCLSID = readGuid(buffer, 4);

  const rawLinkFlags = buffer.readUInt32LE(20);
  const linkFlags = parseLinkFlags(rawLinkFlags);

  const rawFileAttrs = buffer.readUInt32LE(24);
  const fileAttributes = parseFileAttributes(rawFileAttrs);

  const creationTime = filetimeToDate(buffer.readBigUInt64LE(28));
  const accessTime = filetimeToDate(buffer.readBigUInt64LE(36));
  const writeTime = filetimeToDate(buffer.readBigUInt64LE(44));

  const fileSize = buffer.readUInt32LE(52);
  const iconIndex = buffer.readInt32LE(56);
  const showCommand = parseShowCommand(buffer.readUInt32LE(60));
  const hotKey = parseHotKey(buffer.readUInt16LE(64));

  const header: ShellLinkHeader = {
    headerSize,
    linkCLSID,
    linkFlags,
    fileAttributes,
    creationTime,
    accessTime,
    writeTime,
    fileSize,
    iconIndex,
    showCommand,
    hotKey
  };

  let offset = 76;

  // 2. LinkTargetIDList (optional, if HasLinkTargetIDList is set)
  let targetIdList: LinkTargetIDList | undefined;
  if (linkFlags.hasLinkTargetIDList) {
    if (offset + 2 > buffer.length) {
      throw new Error('Unexpected EOF while reading LinkTargetIDList size.');
    }
    const idListSize = buffer.readUInt16LE(offset);
    const idListEnd = offset + 2 + idListSize;
    if (idListEnd > buffer.length) {
      throw new Error('LinkTargetIDList length exceeds buffer size.');
    }

    const items: ItemID[] = [];
    let itemOffset = offset + 2;
    while (itemOffset + 2 <= idListEnd) {
      const itemSize = buffer.readUInt16LE(itemOffset);
      if (itemSize === 0) {
        // Terminal ItemID
        break;
      }
      if (itemOffset + itemSize > idListEnd) {
        break;
      }
      const itemData = buffer.subarray(itemOffset + 2, itemOffset + itemSize);
      items.push({
        size: itemSize,
        rawHex: itemData.toString('hex')
      });
      itemOffset += itemSize;
    }

    targetIdList = {
      size: idListSize,
      items
    };
    offset = idListEnd;
  }

  // 3. LinkInfo (optional, if HasLinkInfo is set and ForceNoLinkInfo is not set)
  let linkInfo: LinkInfo | undefined;
  if (linkFlags.hasLinkInfo && !linkFlags.forceNoLinkInfo && offset + 4 <= buffer.length) {
    const linkInfoSize = buffer.readUInt32LE(offset);
    if (linkInfoSize >= 28 && offset + linkInfoSize <= buffer.length) {
      const linkInfoStart = offset;
      const linkInfoHeaderSize = buffer.readUInt32LE(linkInfoStart + 4);
      const linkInfoFlags = buffer.readUInt32LE(linkInfoStart + 8);
      const volumeIdOffset = buffer.readUInt32LE(linkInfoStart + 12);
      const localBasePathOffset = buffer.readUInt32LE(linkInfoStart + 16);
      const commonNetworkRelativeLinkOffset = buffer.readUInt32LE(linkInfoStart + 20);
      const commonPathSuffixOffset = buffer.readUInt32LE(linkInfoStart + 24);

      let localBasePathOffsetUnicode: number | undefined;
      let commonPathSuffixOffsetUnicode: number | undefined;
      if (linkInfoHeaderSize >= 0x00000024 && linkInfoSize >= 36) {
        localBasePathOffsetUnicode = buffer.readUInt32LE(linkInfoStart + 28);
        commonPathSuffixOffsetUnicode = buffer.readUInt32LE(linkInfoStart + 32);
      }

      const hasVolumeIdAndLocalBasePath = (linkInfoFlags & 0x01) !== 0;
      const hasNetLinkAndPathSuffix = (linkInfoFlags & 0x02) !== 0;

      let volumeId: VolumeIDInfo | undefined;
      if (hasVolumeIdAndLocalBasePath && volumeIdOffset > 0 && volumeIdOffset < linkInfoSize) {
        const vStart = linkInfoStart + volumeIdOffset;
        const vSize = buffer.readUInt32LE(vStart);
        if (vSize >= 16) {
          const driveTypeVal = buffer.readUInt32LE(vStart + 4);
          const driveSerial = buffer.readUInt32LE(vStart + 8).toString(16).toUpperCase().padStart(8, '0');
          const driveSerialFormatted = `${driveSerial.slice(0, 4)}-${driveSerial.slice(4)}`;
          const volLabelOffset = buffer.readUInt32LE(vStart + 12);

          let volLabel = '';
          if (volLabelOffset === 0x00000010 && vSize >= 20) {
            const volLabelOffsetUnicode = buffer.readUInt32LE(vStart + 16);
            volLabel = readNullTerminatedString(buffer, vStart + volLabelOffsetUnicode, true);
          } else if (volLabelOffset > 0) {
            volLabel = readNullTerminatedString(buffer, vStart + volLabelOffset, false);
          }

          volumeId = {
            driveType: {
              raw: driveTypeVal,
              name: DRIVE_TYPES[driveTypeVal] || 'DRIVE_UNKNOWN'
            },
            driveSerialNumber: driveSerialFormatted,
            volumeLabel: volLabel
          };
        }
      }

      let commonNetLink: CommonNetworkRelativeLinkInfo | undefined;
      if (hasNetLinkAndPathSuffix && commonNetworkRelativeLinkOffset > 0 && commonNetworkRelativeLinkOffset < linkInfoSize) {
        const nStart = linkInfoStart + commonNetworkRelativeLinkOffset;
        const nSize = buffer.readUInt32LE(nStart);
        if (nSize >= 20) {
          const netFlags = buffer.readUInt32LE(nStart + 4);
          const netNameOffset = buffer.readUInt32LE(nStart + 8);
          const deviceNameOffset = buffer.readUInt32LE(nStart + 12);
          const netProviderType = buffer.readUInt32LE(nStart + 16);

          let netNameOffsetUnicode: number | undefined;
          let deviceNameOffsetUnicode: number | undefined;
          if (netNameOffset > 0x00000014 && nSize >= 28) {
            netNameOffsetUnicode = buffer.readUInt32LE(nStart + 20);
            deviceNameOffsetUnicode = buffer.readUInt32LE(nStart + 24);
          }

          const netName = (netNameOffsetUnicode && netNameOffsetUnicode > 0)
            ? readNullTerminatedString(buffer, nStart + netNameOffsetUnicode, true)
            : readNullTerminatedString(buffer, nStart + netNameOffset, false);

          const hasValidDevice = (netFlags & 0x01) !== 0;
          let deviceName: string | undefined;
          if (hasValidDevice && deviceNameOffset > 0) {
            deviceName = (deviceNameOffsetUnicode && deviceNameOffsetUnicode > 0)
              ? readNullTerminatedString(buffer, nStart + deviceNameOffsetUnicode, true)
              : readNullTerminatedString(buffer, nStart + deviceNameOffset, false);
          }

          commonNetLink = {
            netName,
            deviceName,
            networkProviderType: (netFlags & 0x02) !== 0 ? {
              raw: netProviderType,
              name: NETWORK_PROVIDER_TYPES[netProviderType] || `0x${netProviderType.toString(16)}`
            } : undefined
          };
        }
      }

      let localBasePath: string | undefined;
      if (hasVolumeIdAndLocalBasePath && localBasePathOffset > 0) {
        if (localBasePathOffsetUnicode && localBasePathOffsetUnicode > 0) {
          localBasePath = readNullTerminatedString(buffer, linkInfoStart + localBasePathOffsetUnicode, true);
        } else {
          localBasePath = readNullTerminatedString(buffer, linkInfoStart + localBasePathOffset, false);
        }
      }

      let commonPathSuffix: string | undefined;
      if (commonPathSuffixOffset > 0) {
        if (commonPathSuffixOffsetUnicode && commonPathSuffixOffsetUnicode > 0) {
          commonPathSuffix = readNullTerminatedString(buffer, linkInfoStart + commonPathSuffixOffsetUnicode, true);
        } else {
          commonPathSuffix = readNullTerminatedString(buffer, linkInfoStart + commonPathSuffixOffset, false);
        }
      }

      linkInfo = {
        flags: {
          raw: linkInfoFlags,
          volumeIdAndLocalBasePath: hasVolumeIdAndLocalBasePath,
          commonNetworkRelativeLinkAndPathSuffix: hasNetLinkAndPathSuffix
        },
        localBasePath,
        commonPathSuffix,
        volumeId,
        commonNetworkRelativeLink: commonNetLink
      };

      offset = linkInfoStart + linkInfoSize;
    }
  }

  // 4. StringData (Section 2.4)
  // Variable length Unicode or ANSI strings based on LinkFlags.IsUnicode
  const readStringDataField = (): string => {
    if (offset + 2 > buffer.length) return '';
    const charCount = buffer.readUInt16LE(offset);
    offset += 2;
    if (charCount === 0) return '';

    const byteLength = linkFlags.isUnicode ? charCount * 2 : charCount;
    if (offset + byteLength > buffer.length) {
      const available = buffer.length - offset;
      const str = linkFlags.isUnicode
        ? buffer.toString('utf16le', offset, offset + available - (available % 2))
        : buffer.toString('utf8', offset, offset + available);
      offset = buffer.length;
      return str;
    }

    const str = linkFlags.isUnicode
      ? buffer.toString('utf16le', offset, offset + byteLength)
      : buffer.toString('utf8', offset, offset + byteLength);
    offset += byteLength;
    return str;
  };

  const stringData: StringData = {};
  if (linkFlags.hasName) {
    stringData.name = readStringDataField();
  }
  if (linkFlags.hasRelativePath) {
    stringData.relativePath = readStringDataField();
  }
  if (linkFlags.hasWorkingDir) {
    stringData.workingDir = readStringDataField();
  }
  if (linkFlags.hasArguments) {
    stringData.commandLineArguments = readStringDataField();
  }
  if (linkFlags.hasIconLocation) {
    stringData.iconLocation = readStringDataField();
  }

  // 5. ExtraData (Section 2.5)
  const extraDataBlocks: ExtraDataBlock[] = [];
  while (offset + 4 <= buffer.length) {
    const blockSize = buffer.readUInt32LE(offset);
    if (blockSize < 4) {
      // Terminal block
      break;
    }
    if (offset + blockSize > buffer.length) {
      break;
    }

    const signature = buffer.readUInt32LE(offset + 4);
    const signatureHex = `0x${signature.toString(16).toUpperCase()}`;
    const blockDataBuf = buffer.subarray(offset + 8, offset + blockSize);

    let parsedBlockData: Record<string, any> = {};
    let sigName = 'UNKNOWN_EXTRA_DATA_BLOCK';

    switch (signature) {
      case 0xA0000001: {
        sigName = 'ENVIRONMENT_VARIABLE_DATA_BLOCK';
        const targetAnsi = readNullTerminatedString(blockDataBuf, 0, false);
        const targetUnicode = blockDataBuf.length >= 260 + 520
          ? readNullTerminatedString(blockDataBuf, 260, true)
          : '';
        parsedBlockData = {
          targetAnsi,
          targetUnicode: targetUnicode || targetAnsi
        };
        break;
      }
      case 0xA0000002: {
        sigName = 'CONSOLE_DATA_BLOCK';
        if (blockDataBuf.length >= 196) {
          parsedBlockData = {
            fillAttributes: blockDataBuf.readUInt16LE(0),
            popupFillAttributes: blockDataBuf.readUInt16LE(2),
            screenBufferSize: {
              x: blockDataBuf.readInt16LE(4),
              y: blockDataBuf.readInt16LE(6)
            },
            windowSize: {
              x: blockDataBuf.readInt16LE(8),
              y: blockDataBuf.readInt16LE(10)
            },
            windowOrigin: {
              x: blockDataBuf.readInt16LE(12),
              y: blockDataBuf.readInt16LE(14)
            },
            fontSize: blockDataBuf.readUInt32LE(16),
            fontFamily: blockDataBuf.readUInt32LE(20),
            fontWeight: blockDataBuf.readUInt32LE(24),
            faceName: readNullTerminatedString(blockDataBuf, 28, true),
            cursorSize: blockDataBuf.readUInt32LE(92),
            fullScreen: blockDataBuf.readUInt32LE(96) !== 0,
            quickEdit: blockDataBuf.readUInt32LE(100) !== 0,
            insertMode: blockDataBuf.readUInt32LE(104) !== 0,
            autoPosition: blockDataBuf.readUInt32LE(108) !== 0,
            historyBufferSize: blockDataBuf.readUInt32LE(112),
            numberOfHistoryBuffers: blockDataBuf.readUInt32LE(116),
            historyNoDup: blockDataBuf.readUInt32LE(120) !== 0
          };
        }
        break;
      }
      case 0xA0000003: {
        sigName = 'TRACKER_DATA_BLOCK';
        if (blockDataBuf.length >= 80) {
          const machineId = readNullTerminatedString(blockDataBuf, 8, false);
          const droidVolume = readGuid(blockDataBuf, 24);
          const droidFile = readGuid(blockDataBuf, 40);
          const droidBirthVolume = readGuid(blockDataBuf, 56);
          const droidBirthFile = readGuid(blockDataBuf, 72);
          parsedBlockData = {
            machineId,
            droid: [droidVolume, droidFile],
            droidBirth: [droidBirthVolume, droidBirthFile]
          };
        }
        break;
      }
      case 0xA0000004: {
        sigName = 'CONSOLE_FE_DATA_BLOCK';
        if (blockDataBuf.length >= 4) {
          parsedBlockData = {
            codePage: blockDataBuf.readUInt32LE(0)
          };
        }
        break;
      }
      case 0xA0000005: {
        sigName = 'SPECIAL_FOLDER_DATA_BLOCK';
        if (blockDataBuf.length >= 8) {
          parsedBlockData = {
            specialFolderId: blockDataBuf.readUInt32LE(0),
            offset: blockDataBuf.readUInt32LE(4)
          };
        }
        break;
      }
      case 0xA0000006: {
        sigName = 'DARWIN_DATA_BLOCK';
        const ansi = readNullTerminatedString(blockDataBuf, 0, false);
        const unicode = blockDataBuf.length >= 260 + 520
          ? readNullTerminatedString(blockDataBuf, 260, true)
          : '';
        parsedBlockData = {
          applicationIdentifierAnsi: ansi,
          applicationIdentifierUnicode: unicode || ansi
        };
        break;
      }
      case 0xA0000007: {
        sigName = 'ICON_ENVIRONMENT_DATA_BLOCK';
        const iconAnsi = readNullTerminatedString(blockDataBuf, 0, false);
        const iconUnicode = blockDataBuf.length >= 260 + 520
          ? readNullTerminatedString(blockDataBuf, 260, true)
          : '';
        parsedBlockData = {
          targetAnsi: iconAnsi,
          targetUnicode: iconUnicode || iconAnsi
        };
        break;
      }
      case 0xA0000008: {
        sigName = 'SHIM_DATA_BLOCK';
        parsedBlockData = {
          layerName: readNullTerminatedString(blockDataBuf, 0, true)
        };
        break;
      }
      case 0xA0000009: {
        sigName = 'PROPERTY_STORE_DATA_BLOCK';
        // Extract readable unicode/ansi strings from serialized property store
        const strings: string[] = [];
        let p = 0;
        while (p < blockDataBuf.length) {
          // Look for UTF-16LE strings of length >= 3
          let strStart = p;
          let strChars = 0;
          while (strStart + 1 < blockDataBuf.length) {
            const charCode = blockDataBuf.readUInt16LE(strStart);
            if (charCode >= 32 && charCode <= 126) {
              strChars++;
              strStart += 2;
            } else {
              break;
            }
          }
          if (strChars >= 3) {
            const extracted = blockDataBuf.toString('utf16le', p, strStart);
            if (!strings.includes(extracted)) {
              strings.push(extracted);
            }
            p = strStart;
          } else {
            p += 2;
          }
        }
        parsedBlockData = {
          extractedProperties: strings,
          rawHex: blockDataBuf.toString('hex')
        };
        break;
      }
      case 0xA000000B: {
        sigName = 'KNOWN_FOLDER_DATA_BLOCK';
        if (blockDataBuf.length >= 20) {
          parsedBlockData = {
            knownFolderId: readGuid(blockDataBuf, 0),
            offset: blockDataBuf.readUInt32LE(16)
          };
        }
        break;
      }
      case 0xA000000C: {
        sigName = 'VISTA_AND_ABOVE_IDLIST_DATA_BLOCK';
        parsedBlockData = {
          rawHex: blockDataBuf.toString('hex')
        };
        break;
      }
      default: {
        parsedBlockData = {
          rawHex: blockDataBuf.toString('hex')
        };
        break;
      }
    }

    extraDataBlocks.push({
      signature: sigName,
      signatureHex,
      blockSize,
      data: parsedBlockData
    });

    offset += blockSize;
  }

  // Summary resolution
  let resolvedTarget = linkInfo?.localBasePath;
  if (!resolvedTarget && linkInfo?.commonNetworkRelativeLink?.netName) {
    resolvedTarget = linkInfo.commonNetworkRelativeLink.netName;
    if (linkInfo.commonPathSuffix) {
      resolvedTarget += (resolvedTarget.endsWith('\\') ? '' : '\\') + linkInfo.commonPathSuffix;
    }
  }
  if (!resolvedTarget && stringData.relativePath) {
    resolvedTarget = stringData.relativePath;
  }
  const envBlock = extraDataBlocks.find(b => b.signature === 'ENVIRONMENT_VARIABLE_DATA_BLOCK');
  if (envBlock?.data?.targetUnicode || envBlock?.data?.targetAnsi) {
    resolvedTarget = envBlock.data.targetUnicode || envBlock.data.targetAnsi;
  }

  return {
    header,
    targetIdList,
    linkInfo,
    stringData,
    extraDataBlocks,
    summary: {
      targetPath: resolvedTarget,
      arguments: stringData.commandLineArguments,
      workingDir: stringData.workingDir,
      iconLocation: stringData.iconLocation,
      description: stringData.name
    }
  };
}
