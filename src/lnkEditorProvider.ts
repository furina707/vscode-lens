import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseLnkBuffer, ParsedLnk } from './lnkParser';
import { buildLnkBuffer, parsedToEditable, lnkToIni, iniToLnk, EditableLnkData } from './lnkWriter';

export class LnkEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'lnk.viewer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => {}
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true
    };

    const render = async () => {
      try {
        const buffer = await fs.promises.readFile(document.uri.fsPath);
        const parsed = parseLnkBuffer(buffer);
        const editable = parsedToEditable(parsed);
        const iniText = lnkToIni(editable);
        const jsonText = JSON.stringify(editable, null, 2);

        webviewPanel.webview.html = this.getHtmlForWebview(
          document.uri,
          parsed,
          editable,
          iniText,
          jsonText
        );
      } catch (err: any) {
        webviewPanel.webview.html = `
          <!DOCTYPE html>
          <html>
            <body style="font-family: var(--vscode-font-family); color: var(--vscode-errorForeground); padding: 24px;">
              <h2>解析快捷方式失败</h2>
              <p>${escapeHtml(err.message)}</p>
            </body>
          </html>
        `;
      }
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'save') {
        try {
          const editedData: EditableLnkData = message.data;
          const origBuf = await fs.promises.readFile(document.uri.fsPath);
          const newBuf = buildLnkBuffer(editedData, origBuf);
          await fs.promises.writeFile(document.uri.fsPath, newBuf);
          vscode.window.showInformationMessage(`已成功保存快捷方式: ${document.uri.fsPath.split(/[\\/]/).pop()}`);
          await render();
        } catch (err: any) {
          vscode.window.showErrorMessage(`保存快捷方式失败: ${err.message}`);
        }
      } else if (message.command === 'dumpToCode') {
        vscode.commands.executeCommand('lnkViewer.dumpToCode', document.uri);
      } else if (message.command === 'copyText') {
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage(`已复制到剪贴板: ${message.text}`);
      } else if (message.command === 'browseTarget') {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: '选择目标文件或文件夹'
        });
        if (selected && selected[0]) {
          webviewPanel.webview.postMessage({
            command: 'setTargetPath',
            path: selected[0].fsPath
          });
        }
      } else if (message.command === 'browseWorkingDir') {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: '选择工作目录'
        });
        if (selected && selected[0]) {
          webviewPanel.webview.postMessage({
            command: 'setWorkingDir',
            path: selected[0].fsPath
          });
        }
      }
    });

    await render();
  }

  private getHtmlForWebview(
    uri: vscode.Uri,
    parsed: ParsedLnk,
    editable: EditableLnkData,
    iniText: string,
    jsonText: string
  ): string {
    const fileName = uri.fsPath.split(/[\\/]/).pop() || 'Shortcut.lnk';
    const h = parsed.header;

    const activeFlagsHtml = h.linkFlags.activeFlags.map(f => `<span class="badge flag-badge">${f}</span>`).join(' ');
    const activeAttrsHtml = h.fileAttributes.activeAttributes.map(a => `<span class="badge attr-badge">${a}</span>`).join(' ');

    const formatTime = (time: typeof h.creationTime) => {
      if (!time.date) return '<span class="text-muted">未记录 / 0</span>';
      return `
        <div><strong>${new Date(time.date).toLocaleString()}</strong></div>
        <div class="text-sub">ISO: ${time.iso}</div>
        <div class="text-sub">100ns Raw: <code>${time.raw}</code></div>
      `;
    };

    const extraBlocksHtml = parsed.extraDataBlocks.length === 0
      ? '<div class="text-muted">无额外数据块</div>'
      : parsed.extraDataBlocks.map((b) => `
          <div class="block-card">
            <div class="block-header">
              <span class="block-name">${b.signature}</span>
              <span class="badge">${b.signatureHex} (${b.blockSize} 字节)</span>
            </div>
            <pre class="json-code">${escapeHtml(JSON.stringify(b.data, null, 2))}</pre>
          </div>
        `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} - LNK Multi-Mode Editor</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --card-bg: var(--vscode-sideBar-background, rgba(127,127,127,0.06));
      --border: var(--vscode-panel-border, rgba(127,127,127,0.2));
      --badge-bg: var(--vscode-badge-background, #007acc);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --button-bg: var(--vscode-button-background, #0e639c);
      --button-fg: var(--vscode-button-foreground, #ffffff);
      --button-hover: var(--vscode-button-hoverBackground, #1177bb);
      --input-bg: var(--vscode-input-background, #1e1e1e);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --code-bg: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.25));
      --tab-active-bg: var(--vscode-tab-activeBackground, var(--bg));
      --tab-active-border: var(--vscode-tab-activeBorder, #007acc);
    }
    * {
      box-sizing: border-box;
    }
    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      padding: 16px 20px;
      margin: 0;
      line-height: 1.5;
    }
    .header-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 16px;
      gap: 16px;
    }
    .title-group h1 {
      font-size: 1.35rem;
      font-weight: 600;
      margin: 0 0 4px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .file-path {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      word-break: break-all;
    }
    .header-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    button {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 6px 14px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    button:hover {
      background: var(--button-hover);
    }
    button.save-btn {
      background: #107c41;
      color: #ffffff;
      font-weight: 600;
    }
    button.save-btn:hover {
      background: #0b5a2f;
    }
    button.secondary {
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
    }
    button.secondary:hover {
      background: rgba(127,127,127,0.2);
    }

    /* 模式切换器 Tabs */
    .tabs-bar {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
      background: var(--card-bg);
      padding: 4px 6px 0 6px;
      border-radius: 6px 6px 0 0;
    }
    .tab-btn {
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-bottom: 2px solid transparent;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 4px 4px 0 0;
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.75;
    }
    .tab-btn:hover {
      opacity: 1;
      background: rgba(127,127,127,0.1);
    }
    .tab-btn.active {
      opacity: 1;
      background: var(--bg);
      border-bottom: 2px solid var(--tab-active-border);
      color: var(--vscode-editor-foreground);
      font-weight: 600;
    }

    /* 视图面板容器 */
    .tab-panel {
      display: none;
    }
    .tab-panel.active {
      display: block;
    }

    /* 表单视图样式 */
    .form-grid {
      display: grid;
      gap: 16px;
      max-width: 900px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-group label {
      font-weight: 600;
      font-size: 0.9em;
      display: flex;
      justify-content: space-between;
    }
    .form-group .hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      font-weight: normal;
    }
    .input-row {
      display: flex;
      gap: 8px;
    }
    input[type="text"], input[type="number"], select, textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      padding: 7px 10px;
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: 13px;
      outline: none;
      width: 100%;
    }
    input[type="text"]:focus, input[type="number"]:focus, select:focus, textarea:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }
    textarea.code-editor {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      line-height: 1.6;
      height: 380px;
      resize: vertical;
      white-space: pre;
    }

    /* 元数据检视网格 */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
    }
    .card.full-width {
      grid-column: 1 / -1;
    }
    .card-title {
      font-size: 1.05em;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .info-row {
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .info-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.85em;
      font-weight: 500;
      background: var(--badge-bg);
      color: var(--badge-fg);
      margin: 2px;
    }
    .flag-badge { background: #106ebe; color: #fff; }
    .attr-badge { background: #237b4b; color: #fff; }
    .badges-container {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }
    .text-sub {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }
    .text-muted { color: var(--vscode-disabledForeground, #888); }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--code-bg);
      padding: 1px 4px;
      border-radius: 3px;
    }
    pre.json-code {
      background: var(--code-bg);
      border: 1px solid var(--border);
      padding: 10px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      overflow-x: auto;
      max-height: 240px;
      margin: 6px 0 0 0;
    }
    .block-card {
      margin-bottom: 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
      background: rgba(0,0,0,0.1);
    }
    .block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .block-name {
      font-weight: 600;
      color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
    }
    .status-bar-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <!-- 顶部横幅 -->
  <div class="header-banner">
    <div class="title-group">
      <h1>
        <span>🔗</span>
        <span>${escapeHtml(fileName)}</span>
      </h1>
      <div class="file-path">${escapeHtml(uri.fsPath)}</div>
    </div>
    <div class="header-actions">
      <button class="save-btn" onclick="saveShortcut()">💾 保存修改 (Ctrl+S)</button>
      <button class="secondary" onclick="dumpCode()">导出 TS 代码</button>
    </div>
  </div>

  <!-- 模式切换 Tabs -->
  <div class="tabs-bar">
    <button class="tab-btn active" id="tabBtnForm" onclick="switchMode('form')">
      <span>📋</span> 表单视图 (GUI Form)
    </button>
    <button class="tab-btn" id="tabBtnIni" onclick="switchMode('ini')">
      <span>📄</span> INI / Desktop 视图
    </button>
    <button class="tab-btn" id="tabBtnJson" onclick="switchMode('json')">
      <span>{ }</span> JSON 视图
    </button>
    <button class="tab-btn" id="tabBtnInspector" onclick="switchMode('inspector')">
      <span>🔍</span> MS-SHLLINK 元数据检视
    </button>
  </div>

  <!-- 1. 表单视图 (GUI Form) -->
  <div class="tab-panel active" id="panelForm">
    <div class="form-grid">
      <div class="form-group">
        <label>
          <span>目标路径 (Target Path)</span>
          <span class="hint">快捷方式启动的程序或文件完整路径</span>
        </label>
        <div class="input-row">
          <input type="text" id="formTarget" value="${escapeHtml(editable.targetPath)}" placeholder="例如 C:\\Windows\\notepad.exe" oninput="markDirty()" />
          <button class="secondary" onclick="browseTarget()">浏览...</button>
        </div>
      </div>

      <div class="form-group">
        <label>
          <span>启动参数 (Arguments)</span>
          <span class="hint">传递给目标程序的命令行参数</span>
        </label>
        <input type="text" id="formArgs" value="${escapeHtml(editable.arguments)}" placeholder="例如 --disable-gpu /k" oninput="markDirty()" />
      </div>

      <div class="form-group">
        <label>
          <span>工作目录 (Working Directory / 起始位置)</span>
          <span class="hint">程序启动时的当前目录</span>
        </label>
        <div class="input-row">
          <input type="text" id="formWorkingDir" value="${escapeHtml(editable.workingDir)}" placeholder="例如 C:\\Program Files\\App" oninput="markDirty()" />
          <button class="secondary" onclick="browseWorkingDir()">浏览...</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label><span>运行方式 (Show Command)</span></label>
          <select id="formShowCommand" onchange="markDirty()">
            <option value="Normal" ${editable.showCommand === 'Normal' ? 'selected' : ''}>常规窗口 (Normal)</option>
            <option value="Maximized" ${editable.showCommand === 'Maximized' ? 'selected' : ''}>最大化 (Maximized)</option>
            <option value="Minimized" ${editable.showCommand === 'Minimized' ? 'selected' : ''}>最小化 (Minimized)</option>
          </select>
        </div>

        <div class="form-group">
          <label><span>快捷键 (HotKey)</span></label>
          <input type="text" id="formHotKey" value="${escapeHtml(editable.hotKey || '')}" placeholder="例如 Ctrl + Alt + C" oninput="markDirty()" />
        </div>
      </div>

      <div class="form-group">
        <label>
          <span>备注 / 描述 (Description)</span>
          <span class="hint">鼠标悬停快捷方式时显示的提示文本</span>
        </label>
        <input type="text" id="formDescription" value="${escapeHtml(editable.description)}" placeholder="例如 打开应用程序" oninput="markDirty()" />
      </div>

      <div style="display: grid; grid-template-columns: 3fr 1fr; gap: 16px;">
        <div class="form-group">
          <label><span>图标文件路径 (Icon Location)</span></label>
          <input type="text" id="formIconLocation" value="${escapeHtml(editable.iconLocation)}" placeholder="留空则使用目标程序自带图标" oninput="markDirty()" />
        </div>
        <div class="form-group">
          <label><span>图标索引 (Icon Index)</span></label>
          <input type="number" id="formIconIndex" value="${editable.iconIndex}" oninput="markDirty()" />
        </div>
      </div>
    </div>
  </div>

  <!-- 2. INI / Desktop 视图 -->
  <div class="tab-panel" id="panelIni">
    <div class="form-group">
      <label>
        <span>类 Linux 纯文本配置 (INI / .desktop 风格)</span>
        <span class="hint">可直接编辑键值对，切换视图自动同步</span>
      </label>
      <textarea class="code-editor" id="iniEditor" oninput="markDirty()">${escapeHtml(iniText)}</textarea>
    </div>
  </div>

  <!-- 3. JSON 视图 -->
  <div class="tab-panel" id="panelJson">
    <div class="form-group">
      <label>
        <span>JSON 结构化配置</span>
        <span class="hint">可直接编辑 JSON，切换视图自动同步</span>
      </label>
      <textarea class="code-editor" id="jsonEditor" oninput="markDirty()">${escapeHtml(jsonText)}</textarea>
    </div>
  </div>

  <!-- 4. MS-SHLLINK 元数据检视 -->
  <div class="tab-panel" id="panelInspector">
    <div class="grid">
      <!-- 时间戳卡片 (100ns精度保留) -->
      <div class="card">
        <div class="card-title">⏱️ 标准时间戳 (FILETIME / 100ns)</div>
        <div class="info-row">
          <span class="info-label">创建时间 (CreationTime)</span>
          <div class="info-value">${formatTime(h.creationTime)}</div>
        </div>
        <div class="info-row">
          <span class="info-label">最后访问时间 (AccessTime)</span>
          <div class="info-value">${formatTime(h.accessTime)}</div>
        </div>
        <div class="info-row">
          <span class="info-label">最后写入/修改时间 (WriteTime)</span>
          <div class="info-value">${formatTime(h.writeTime)}</div>
        </div>
      </div>

      <!-- 运行与视窗状态 -->
      <div class="card">
        <div class="card-title">🖥️ 窗口显示与执行环境</div>
        <div class="info-row">
          <span class="info-label">窗口显示命令 (ShowCommand)</span>
          <span class="info-value"><strong>${escapeHtml(h.showCommand.name)}</strong> (${h.showCommand.raw})</span>
          <div class="text-sub">${escapeHtml(h.showCommand.description)}</div>
        </div>
        <div class="info-row">
          <span class="info-label">目标文件大小 (Target File Size)</span>
          <span class="info-value">${h.fileSize.toLocaleString()} 字节 (${(h.fileSize / 1024 / 1024).toFixed(2)} MB)</span>
        </div>
        <div class="info-row">
          <span class="info-label">快捷键设置 (HotKey)</span>
          <span class="info-value">${escapeHtml(h.hotKey.display)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">LinkCLSID</span>
          <span class="info-value"><code>${escapeHtml(h.linkCLSID)}</code></span>
        </div>
      </div>

      <!-- 状态标志 LinkFlags -->
      <div class="card">
        <div class="card-title">🚩 状态标志 (LinkFlags: 0x${h.linkFlags.raw.toString(16).toUpperCase()})</div>
        <div class="info-row">
          <span class="info-label">已激活的标志 (${h.linkFlags.activeFlags.length})</span>
          <div class="badges-container">${activeFlagsHtml}</div>
        </div>
        <div class="info-row" style="margin-top: 8px;">
          <span class="info-label">编码格式</span>
          <span class="info-value">${h.linkFlags.isUnicode ? '🔤 Unicode (UTF-16LE)' : '🔤 ANSI / CodePage'}</span>
        </div>
      </div>

      <!-- 目标文件属性 FileAttributes -->
      <div class="card">
        <div class="card-title">📁 文件属性 (FileAttributes: 0x${h.fileAttributes.raw.toString(16).toUpperCase()})</div>
        <div class="info-row">
          <span class="info-label">已激活属性 (${h.fileAttributes.activeAttributes.length})</span>
          <div class="badges-container">${activeAttrsHtml.length > 0 ? activeAttrsHtml : '<span class="text-muted">无</span>'}</div>
        </div>
        ${parsed.linkInfo?.volumeId ? `
        <div class="info-row" style="margin-top: 12px;">
          <span class="info-label">卷标与驱动器 (Volume ID)</span>
          <span class="info-value">${parsed.linkInfo.volumeId.driveType.name} (序列号: ${parsed.linkInfo.volumeId.driveSerialNumber})</span>
        </div>` : ''}
      </div>

      <!-- 额外数据块 ExtraData -->
      <div class="card full-width">
        <div class="card-title">📦 [MS-SHLLINK] 额外数据块 (ExtraData Blocks: ${parsed.extraDataBlocks.length})</div>
        ${extraBlocksHtml}
      </div>
    </div>
  </div>

  <div class="status-bar-notice">
    <span>💡 提示：在任一视图修改后按 <strong>Ctrl+S</strong> 即可将修改直接写回 Windows <code>.lnk</code> 二进制文件。</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentMode = 'form';
    let isDirty = false;

    // 当前活跃的数据内存对象
    let state = ${JSON.stringify(editable)};

    function markDirty() {
      isDirty = true;
    }

    // 从当前模式提取数据更新到内存 state
    function syncStateFromCurrentMode() {
      if (currentMode === 'form') {
        state.targetPath = document.getElementById('formTarget').value.trim();
        state.arguments = document.getElementById('formArgs').value.trim();
        state.workingDir = document.getElementById('formWorkingDir').value.trim();
        state.showCommand = document.getElementById('formShowCommand').value;
        state.description = document.getElementById('formDescription').value.trim();
        state.iconLocation = document.getElementById('formIconLocation').value.trim();
        state.iconIndex = parseInt(document.getElementById('formIconIndex').value, 10) || 0;
        state.hotKey = document.getElementById('formHotKey').value.trim();
      } else if (currentMode === 'ini') {
        const text = document.getElementById('iniEditor').value;
        state = parseIniText(text);
      } else if (currentMode === 'json') {
        try {
          const text = document.getElementById('jsonEditor').value;
          const parsedJson = JSON.parse(text);
          state = { ...state, ...parsedJson };
        } catch (e) {
          console.error('Invalid JSON syntax');
        }
      }
    }

    // 将内存 state 同步刷新到目标视图的 UI 控件
    function syncStateToView(targetMode) {
      if (targetMode === 'form') {
        document.getElementById('formTarget').value = state.targetPath || '';
        document.getElementById('formArgs').value = state.arguments || '';
        document.getElementById('formWorkingDir').value = state.workingDir || '';
        document.getElementById('formShowCommand').value = state.showCommand || 'Normal';
        document.getElementById('formDescription').value = state.description || '';
        document.getElementById('formIconLocation').value = state.iconLocation || '';
        document.getElementById('formIconIndex').value = state.iconIndex || 0;
        document.getElementById('formHotKey').value = state.hotKey || '';
      } else if (targetMode === 'ini') {
        document.getElementById('iniEditor').value = formatToIni(state);
      } else if (targetMode === 'json') {
        document.getElementById('jsonEditor').value = JSON.stringify(state, null, 2);
      }
    }

    // 切换模式
    function switchMode(newMode) {
      if (currentMode === newMode) return;

      // 1. 同步当前视图的改动到 state
      syncStateFromCurrentMode();

      // 2. 将 state 填充到新视图
      syncStateToView(newMode);

      // 3. 切换选项卡外观
      ['form', 'ini', 'json', 'inspector'].forEach(m => {
        const btn = document.getElementById('tabBtn' + capitalize(m));
        const panel = document.getElementById('panel' + capitalize(m));
        if (btn) btn.classList.toggle('active', m === newMode);
        if (panel) panel.classList.toggle('active', m === newMode);
      });

      currentMode = newMode;
    }

    function capitalize(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function formatToIni(d) {
      return '[Shortcut]\\n' +
        '; Windows Shell Link (.lnk) Configuration\\n' +
        'Target = ' + (d.targetPath || '') + '\\n' +
        'Arguments = ' + (d.arguments || '') + '\\n' +
        'WorkingDirectory = ' + (d.workingDir || '') + '\\n' +
        'Description = ' + (d.description || '') + '\\n' +
        'ShowCommand = ' + (d.showCommand || 'Normal') + '\\n' +
        'IconLocation = ' + (d.iconLocation || '') + '\\n' +
        'IconIndex = ' + (d.iconIndex || 0) + '\\n' +
        'HotKey = ' + (d.hotKey || 'None') + '\\n';
    }

    function parseIniText(ini) {
      const res = { ...state };
      const lines = ini.split(/\\r?\\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq).trim().toLowerCase();
        const v = trimmed.slice(eq + 1).trim();
        if (k === 'target' || k === 'targetpath' || k === 'exec') res.targetPath = v;
        else if (k === 'arguments' || k === 'args') res.arguments = v;
        else if (k === 'workingdirectory' || k === 'workingdir' || k === 'path') res.workingDir = v;
        else if (k === 'description' || k === 'name' || k === 'comment') res.description = v;
        else if (k === 'showcommand' || k === 'run') res.showCommand = v;
        else if (k === 'iconlocation' || k === 'icon') res.iconLocation = v;
        else if (k === 'iconindex') res.iconIndex = parseInt(v, 10) || 0;
        else if (k === 'hotkey') res.hotKey = v;
      }
      return res;
    }

    function saveShortcut() {
      syncStateFromCurrentMode();
      vscode.postMessage({
        command: 'save',
        data: state
      });
      isDirty = false;
    }

    function dumpCode() {
      vscode.postMessage({ command: 'dumpToCode' });
    }

    function browseTarget() {
      vscode.postMessage({ command: 'browseTarget' });
    }

    function browseWorkingDir() {
      vscode.postMessage({ command: 'browseWorkingDir' });
    }

    // 监听键盘快捷键 Ctrl+S / Cmd+S
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveShortcut();
      }
    });

    // 接收宿主扩展回传消息
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'setTargetPath') {
        state.targetPath = msg.path;
        syncStateToView(currentMode);
        markDirty();
      } else if (msg.command === 'setWorkingDir') {
        state.workingDir = msg.path;
        syncStateToView(currentMode);
        markDirty();
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
