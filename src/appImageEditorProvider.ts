import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseAppImageBuffer, ParsedAppImage } from './appImageParser';

export class AppImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'appimage.viewer';

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
        const parsed = parseAppImageBuffer(buffer);
        webviewPanel.webview.html = this.getHtmlForWebview(document.uri, parsed);
      } catch (err: any) {
        webviewPanel.webview.html = `
          <!DOCTYPE html>
          <html>
            <body style="font-family: var(--vscode-font-family); color: var(--vscode-errorForeground); padding: 24px;">
              <h2>解析 AppImage 失败</h2>
              <p>${escapeHtml(err.message)}</p>
            </body>
          </html>
        `;
      }
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'dumpToCode') {
        vscode.commands.executeCommand('appimageViewer.dumpToCode', document.uri);
      } else if (message.command === 'copyText') {
        await vscode.env.clipboard.writeText(message.text);
        vscode.window.showInformationMessage(`已复制到剪贴板: ${message.text}`);
      } else if (message.command === 'exportDesktop') {
        try {
          const defaultName = (message.name || 'app').toLowerCase().replace(/\s+/g, '_') + '.desktop';
          const targetUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultName),
            filters: { 'Linux Desktop Entry (*.desktop)': ['desktop'] }
          });
          if (targetUri) {
            await fs.promises.writeFile(targetUri.fsPath, message.content, 'utf8');
            vscode.window.showInformationMessage(`已成功导出 .desktop 文件: ${targetUri.fsPath}`);
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`导出失败: ${e.message}`);
        }
      }
    });

    await render();
  }

  private getHtmlForWebview(uri: vscode.Uri, data: ParsedAppImage): string {
    const fileName = uri.fsPath.split(/[\\/]/).pop() || 'application.AppImage';
    const sum = data.summary;
    const elf = data.elfHeader;
    const sq = data.squashfsSuperblock;
    const desktop = data.desktopEntry;

    const desktopRawText = desktop?.rawText || `[Desktop Entry]
Name=${sum.appName}
Exec=${sum.exec}
Icon=${sum.icon}
Type=Application
Categories=${sum.categories}
Comment=${sum.comment}
`;

    const jsonText = JSON.stringify({
      appName: sum.appName,
      exec: sum.exec,
      icon: sum.icon,
      categories: sum.categories,
      comment: sum.comment,
      architecture: sum.architecture,
      packageSize: sum.packageSize,
      appImageType: data.appImageType,
      desktopEntry: desktop?.allFields || {}
    }, null, 2);

    const rootFilesHtml = data.rootFiles.length === 0
      ? '<div class="text-muted">未扫描到根目录文件</div>'
      : `
        <table class="file-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>Inode</th>
            </tr>
          </thead>
          <tbody>
            ${data.rootFiles.map(f => `
              <tr>
                <td><code>${escapeHtml(f.name)}</code></td>
                <td><span class="badge ${f.type === 'directory' ? 'flag-badge' : (f.type === 'symlink' ? 'link-badge' : 'attr-badge')}">${f.type}</span></td>
                <td>${f.inode}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

    const sizeMb = (sum.packageSize / 1024 / 1024).toFixed(2);
    const createdStr = sum.createdTime ? new Date(sum.createdTime).toLocaleString() : '未知';
    const linuxRunCmd = `chmod +x "${fileName}" && ./"${fileName}"`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} - AppImage Inspector</title>
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
      --tab-active-border: var(--vscode-tab-activeBorder, #007acc);
    }
    * { box-sizing: border-box; }
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
    button:hover { background: var(--button-hover); }
    button.secondary {
      background: var(--card-bg);
      color: var(--fg);
      border: 1px solid var(--border);
    }
    button.secondary:hover { background: rgba(127,127,127,0.2); }

    /* Tabs */
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
    .tab-btn:hover { opacity: 1; background: rgba(127,127,127,0.1); }
    .tab-btn.active {
      opacity: 1;
      background: var(--bg);
      border-bottom: 2px solid var(--tab-active-border);
      color: var(--vscode-editor-foreground);
      font-weight: 600;
    }

    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

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
    input[type="text"], textarea {
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
    textarea.code-editor {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 13px;
      line-height: 1.6;
      height: 380px;
      resize: vertical;
      white-space: pre;
    }

    /* 卡片与网格 */
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
    .card.full-width { grid-column: 1 / -1; }
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
    }
    .flag-badge { background: #106ebe; color: #fff; }
    .attr-badge { background: #237b4b; color: #fff; }
    .link-badge { background: #8855bb; color: #fff; }

    code {
      font-family: var(--vscode-editor-font-family, monospace);
      background: var(--code-bg);
      padding: 1px 4px;
      border-radius: 3px;
    }
    .cmd-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--code-bg);
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid var(--border);
      margin-top: 4px;
    }

    table.file-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
      margin-top: 8px;
    }
    table.file-table th, table.file-table td {
      border: 1px solid var(--border);
      padding: 6px 10px;
      text-align: left;
    }
    table.file-table th {
      background: rgba(127,127,127,0.1);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header-banner">
    <div class="title-group">
      <h1>
        <span>📦</span>
        <span>${escapeHtml(sum.appName)}</span>
        <span class="badge flag-badge">AppImage Type ${data.appImageType}</span>
        <span class="badge attr-badge">${escapeHtml(sum.architecture)}</span>
      </h1>
      <div class="file-path">${escapeHtml(uri.fsPath)} (${sizeMb} MB)</div>
    </div>
    <div class="header-actions">
      <button onclick="exportDesktop()">💾 导出 .desktop 文件</button>
      <button class="secondary" onclick="dumpCode()">导出 TS 代码</button>
    </div>
  </div>

  <div class="tabs-bar">
    <button class="tab-btn active" id="tabBtnForm" onclick="switchMode('form')">
      <span>📋</span> 应用配置 (Desktop Form)
    </button>
    <button class="tab-btn" id="tabBtnDesktop" onclick="switchMode('desktop')">
      <span>📄</span> .desktop 纯文本 (Desktop Entry)
    </button>
    <button class="tab-btn" id="tabBtnJson" onclick="switchMode('json')">
      <span>{ }</span> JSON 视图
    </button>
    <button class="tab-btn" id="tabBtnInspector" onclick="switchMode('inspector')">
      <span>🔍</span> ELF / SquashFS 元数据检视
    </button>
  </div>

  <!-- 1. 表单视图 -->
  <div class="tab-panel active" id="panelForm">
    <div class="form-grid">
      <div class="form-group">
        <label><span>应用名称 (Name)</span></label>
        <input type="text" readonly value="${escapeHtml(sum.appName)}" />
      </div>

      <div class="form-group">
        <label>
          <span>执行命令 (Exec)</span>
          <span class="hint">AppImage 内部的入口运行指令</span>
        </label>
        <input type="text" readonly value="${escapeHtml(sum.exec)}" />
      </div>

      <div class="form-group">
        <label>
          <span>Linux 终端运行指令 (Quick Launch Command)</span>
        </label>
        <div class="cmd-box">
          <code>${escapeHtml(linuxRunCmd)}</code>
          <button class="secondary" style="padding: 3px 8px;" onclick="copyCmd('${escapeHtml(linuxRunCmd)}')">复制</button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="form-group">
          <label><span>图标配置 (Icon)</span></label>
          <input type="text" readonly value="${escapeHtml(sum.icon)}" />
        </div>
        <div class="form-group">
          <label><span>版本号 (Version)</span></label>
          <input type="text" readonly value="${escapeHtml(desktop?.version || '未指定')}" />
        </div>
      </div>

      <div class="form-group">
        <label><span>应用分类 (Categories)</span></label>
        <input type="text" readonly value="${escapeHtml(sum.categories)}" />
      </div>

      <div class="form-group">
        <label><span>应用描述 (Comment)</span></label>
        <input type="text" readonly value="${escapeHtml(sum.comment || '无')}" />
      </div>

      ${desktop?.startupWMClass ? `
      <div class="form-group">
        <label><span>窗口类标识 (StartupWMClass)</span></label>
        <input type="text" readonly value="${escapeHtml(desktop.startupWMClass)}" />
      </div>` : ''}
    </div>
  </div>

  <!-- 2. .desktop 纯文本视图 -->
  <div class="tab-panel" id="panelDesktop">
    <div class="form-group">
      <label>
        <span>内嵌 [Desktop Entry] 规格源码</span>
        <span class="hint">从 AppImage SquashFS 文件系统中直接解析提取</span>
      </label>
      <textarea class="code-editor" readonly>${escapeHtml(desktopRawText)}</textarea>
    </div>
  </div>

  <!-- 3. JSON 视图 -->
  <div class="tab-panel" id="panelJson">
    <div class="form-group">
      <label><span>结构化 JSON 元数据</span></label>
      <textarea class="code-editor" readonly>${escapeHtml(jsonText)}</textarea>
    </div>
  </div>

  <!-- 4. 底层元数据与根目录文件检视 -->
  <div class="tab-panel" id="panelInspector">
    <div class="grid">
      <!-- ELF 运行时信息 -->
      <div class="card">
        <div class="card-title">⚙️ ELF 引导运行时 (AppImage Runtime)</div>
        <div class="info-row">
          <span class="info-label">架构 (Machine Architecture)</span>
          <span class="info-value"><strong>${escapeHtml(elf.machine)}</strong> (${elf.is64Bit ? '64-bit' : '32-bit'}, ${elf.isLittleEndian ? 'Little-Endian' : 'Big-Endian'})</span>
        </div>
        <div class="info-row">
          <span class="info-label">AppImage 规范类型</span>
          <span class="info-value">Type ${data.appImageType} (${data.appImageType === 2 ? 'SquashFS 内嵌文件系统' : 'ISO 9660'})</span>
        </div>
        <div class="info-row">
          <span class="info-label">ELF Runtime 大小</span>
          <span class="info-value">${(elf.elfSize / 1024).toFixed(2)} KB (0x${elf.elfSize.toString(16)})</span>
        </div>
        <div class="info-row">
          <span class="info-label">程序入口点 (Entry Point)</span>
          <span class="info-value"><code>${elf.entryPoint}</code></span>
        </div>
      </div>

      <!-- SquashFS 超级块信息 -->
      <div class="card">
        <div class="card-title">🗜️ SquashFS 4.0 文件系统</div>
        ${sq ? `
        <div class="info-row">
          <span class="info-label">压缩算法 (Compression)</span>
          <span class="info-value"><strong>${sq.compression.toUpperCase()}</strong> (Block Size: ${sq.blockSize / 1024} KB)</span>
        </div>
        <div class="info-row">
          <span class="info-label">打包制作时间 (mkfs_time)</span>
          <span class="info-value">${createdStr}</span>
        </div>
        <div class="info-row">
          <span class="info-label">文件系统节点数 (Inodes)</span>
          <span class="info-value">${sq.inodes.toLocaleString()} 个文件/目录</span>
        </div>
        <div class="info-row">
          <span class="info-label">文件系统压缩数据大小</span>
          <span class="info-value">${(sq.bytesUsed / 1024 / 1024).toFixed(2)} MB</span>
        </div>` : '<div class="text-muted">未检测到 SquashFS 超级块</div>'}
      </div>

      <!-- 根目录文件清单 -->
      <div class="card full-width">
        <div class="card-title">📂 AppImage 根目录文件清单 (Root Files: ${data.rootFiles.length})</div>
        ${rootFilesHtml}
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function switchMode(newMode) {
      ['form', 'desktop', 'json', 'inspector'].forEach(m => {
        const btn = document.getElementById('tabBtn' + capitalize(m));
        const panel = document.getElementById('panel' + capitalize(m));
        if (btn) btn.classList.toggle('active', m === newMode);
        if (panel) panel.classList.toggle('active', m === newMode);
      });
    }

    function capitalize(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function copyCmd(cmd) {
      vscode.postMessage({ command: 'copyText', text: cmd });
    }

    function dumpCode() {
      vscode.postMessage({ command: 'dumpToCode' });
    }

    function exportDesktop() {
      vscode.postMessage({
        command: 'exportDesktop',
        name: ${JSON.stringify(sum.appName)},
        content: ${JSON.stringify(desktopRawText)}
      });
    }
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

