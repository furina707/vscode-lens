import * as vscode from 'vscode';
import * as fs from 'fs';

export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'pdf.viewer';

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
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };

    const pdfJsUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'pdfjs', 'pdf.min.js')
    );
    const workerUri = webviewPanel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'pdfjs', 'pdf.worker.min.js')
    );

    const render = async () => {
      try {
        const buffer = await fs.promises.readFile(document.uri.fsPath);
        const base64Data = buffer.toString('base64');
        const fileName = document.uri.fsPath.split(/[\\/]/).pop() || 'document.pdf';
        const fileSizeBytes = buffer.length;

        webviewPanel.webview.html = this.getHtmlForWebview(
          fileName,
          fileSizeBytes,
          base64Data,
          pdfJsUri,
          workerUri
        );
      } catch (err: any) {
        webviewPanel.webview.html = `
          <!DOCTYPE html>
          <html>
            <body style="font-family: var(--vscode-font-family); color: var(--vscode-errorForeground); padding: 24px;">
              <h2>无法打开 PDF 文件</h2>
              <p>${escapeHtml(err.message)}</p>
            </body>
          </html>
        `;
      }
    };

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'showError') {
        vscode.window.showErrorMessage(`PDF 渲染错误: ${message.text}`);
      }
    });

    await render();
  }

  private getHtmlForWebview(
    fileName: string,
    fileSizeBytes: number,
    base64Data: string,
    pdfJsUri: vscode.Uri,
    workerUri: vscode.Uri
  ): string {
    const sizeMb = (fileSizeBytes / 1024 / 1024).toFixed(2);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)} - PDF 预览</title>
  <script src="${workerUri}"></script>
  <script src="${pdfJsUri}"></script>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #d4d4d4);
      --toolbar-bg: var(--vscode-sideBar-background, #252526);
      --border: var(--vscode-panel-border, rgba(127,127,127,0.25));
      --btn-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --primary-btn-bg: var(--vscode-button-background, #0e639c);
      --primary-btn-fg: var(--vscode-button-foreground, #ffffff);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #555);
      --viewer-bg: #525659;
    }
    * { box-sizing: border-box; }
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--viewer-bg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--fg);
      display: flex;
      flex-direction: column;
    }

    /* 顶部工具栏 */
    .toolbar {
      height: 44px;
      background: var(--toolbar-bg);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      gap: 12px;
      flex-shrink: 0;
      user-select: none;
      z-index: 10;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .doc-title {
      font-weight: 600;
      max-width: 260px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: 1px solid var(--border);
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      outline: none;
    }
    button:hover:not(:disabled) {
      background: var(--btn-hover);
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .page-input {
      width: 48px;
      text-align: center;
      padding: 4px;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      border-radius: 3px;
      font-size: 12px;
    }
    .scale-text {
      font-size: 12px;
      min-width: 46px;
      text-align: center;
    }
    .load-time-badge {
      font-size: 11px;
      color: #388a34;
      background: rgba(56, 138, 52, 0.15);
      border: 1px solid rgba(56, 138, 52, 0.35);
      padding: 3px 8px;
      border-radius: 12px;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 500;
    }

    /* PDF 主视窗容器 */
    #viewerContainer {
      flex: 1;
      overflow: auto;
      position: relative;
      background: var(--viewer-bg);
      padding: 20px 0;
    }
    #pagesContainer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .pdf-page-wrapper {
      position: relative;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      background: #ffffff;
      transition: transform 0.15s ease;
    }
    .pdf-page-canvas {
      display: block;
    }

    /* 加载中提示 */
    #loadingOverlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 20;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 4px solid rgba(255, 255, 255, 0.2);
      border-top-color: #007acc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* 元数据抽屉弹窗 */
    #metadataModal {
      display: none;
      position: fixed;
      top: 50px;
      right: 20px;
      width: 320px;
      background: var(--toolbar-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      padding: 16px;
      z-index: 100;
    }
    #metadataModal.active {
      display: block;
    }
    .modal-title {
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .meta-row {
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
    }
    .meta-label {
      color: var(--vscode-descriptionForeground, #888);
      font-size: 11px;
      text-transform: uppercase;
    }
    .meta-val {
      word-break: break-all;
    }
  </style>
</head>
<body>
  <!-- 顶部工具栏 -->
  <div class="toolbar">
    <div class="toolbar-group">
      <span class="doc-title" title="${escapeHtml(fileName)}">
        <span>📄</span>
        <span>${escapeHtml(fileName)}</span>
      </span>
      <span style="font-size: 11px; color: #888;">(${sizeMb} MB)</span>
    </div>

    <!-- 页面导航 -->
    <div class="toolbar-group">
      <button id="prevBtn" onclick="changePage(-1)" title="上一页 (PageUp)">◀</button>
      <span>
        <input type="number" id="pageNumberInput" class="page-input" value="1" min="1" onchange="jumpToPage(this.value)" />
        / <span id="numPagesText">1</span>
      </span>
      <button id="nextBtn" onclick="changePage(1)" title="下一页 (PageDown)">▶</button>
    </div>

    <!-- 缩放与视图控制 -->
    <div class="toolbar-group">
      <button onclick="zoomOut()" title="缩小 (Ctrl+-)">➖</button>
      <span class="scale-text" id="scalePercentText">100%</span>
      <button onclick="zoomIn()" title="放大 (Ctrl+=)">➕</button>
      <button onclick="zoomFitWidth()" title="适应宽度">↔ 适应宽度</button>
      <button onclick="zoomFitPage()" title="适应整页">↕ 适应整页</button>
      <button onclick="rotatePage()" title="顺时针旋转 90 度">↻ 旋转</button>
    </div>

    <!-- 元数据信息与耗时徽章 -->
    <div class="toolbar-group">
      <span class="load-time-badge" id="toolbarLoadTime" title="PDF 载入与首屏渲染耗时 (已记忆保存)">
        ⚡ 耗时: <strong id="toolbarLoadTimeVal">--</strong>
      </span>
      <button onclick="toggleMetadata()" title="查看 PDF 元数据与属性">ℹ️ 文档信息</button>
    </div>
  </div>

  <!-- PDF 渲染视窗 -->
  <div id="viewerContainer">
    <div id="pagesContainer"></div>
    <div id="loadingOverlay">
      <div class="spinner"></div>
      <div id="loadingText" style="font-weight: 600; font-size: 14px;">正在载入并解析 PDF...</div>
      <div id="loadingTimeInfo" style="font-size: 12px; color: #b8b8b8; margin-top: 4px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
        <span id="elapsedLiveText">已耗时: <strong id="elapsedVal" style="color: #4fc1ff;">0.0</strong> 秒</span>
        <span id="lastTimeNotice" style="font-size: 11px; color: #9cdcfe; display: none;">⏳ 上次解析记忆时间: <strong id="lastTimeVal"></strong></span>
      </div>
    </div>
  </div>

  <!-- 文档元数据卡片 -->
  <div id="metadataModal">
    <div class="modal-title">
      <span>📄 PDF 文档信息</span>
      <button style="padding: 2px 6px;" onclick="toggleMetadata()">✕</button>
    </div>
    <div class="meta-row">
      <span class="meta-label">文件名称</span>
      <span class="meta-val">${escapeHtml(fileName)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">文件大小</span>
      <span class="meta-val">${(fileSizeBytes / 1024).toFixed(1)} KB (${sizeMb} MB)</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">总页数</span>
      <span class="meta-val" id="metaTotalPages">-</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">载入解析耗时</span>
      <span class="meta-val" id="metaLoadTime" style="color: #4ec9b0; font-weight: 600;">-</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">PDF 标题</span>
      <span class="meta-val" id="metaTitle">未指定</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">作者</span>
      <span class="meta-val" id="metaAuthor">未指定</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">主题</span>
      <span class="meta-val" id="metaSubject">未指定</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">生成工具 (Producer)</span>
      <span class="meta-val" id="metaProducer">未指定</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">创建时间</span>
      <span class="meta-val" id="metaCreationDate">未指定</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">PDF 规范版本</span>
      <span class="meta-val" id="metaPdfVersion">1.4+</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    // PDF.js 会自动使用已通过 script 标签预加载的 globalThis.pdfjsWorker，避免 Webview 跨域 Worker 阻塞超时
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 1;
    let currentScale = 1.25;
    let currentRotation = 0;
    const base64Data = "${base64Data}";

    // Base64 转换为 Uint8Array
    function base64ToUint8Array(base64) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }

    async function initPdf() {
      const storageKey = 'pdf_memory_time_' + encodeURIComponent('${escapeHtml(fileName)}');
      let lastMemoryTime = null;
      try {
        lastMemoryTime = localStorage.getItem(storageKey);
      } catch (e) {}

      if (lastMemoryTime) {
        const lastNotice = document.getElementById('lastTimeNotice');
        const lastVal = document.getElementById('lastTimeVal');
        if (lastNotice && lastVal) {
          lastNotice.style.display = 'block';
          lastVal.innerText = lastMemoryTime;
        }
      }

      const startTime = performance.now();
      const timerInterval = setInterval(() => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        const el = document.getElementById('elapsedVal');
        if (el) el.innerText = elapsed;
      }, 100);

      try {
        const rawData = base64ToUint8Array(base64Data);
        pdfDoc = await pdfjsLib.getDocument({ data: rawData }).promise;
        totalPages = pdfDoc.numPages;
        document.getElementById('numPagesText').innerText = totalPages;
        document.getElementById('metaTotalPages').innerText = totalPages + ' 页';

        // 提取元数据
        try {
          const meta = await pdfDoc.getMetadata();
          if (meta?.info) {
            const info = meta.info;
            if (info.Title) document.getElementById('metaTitle').innerText = info.Title;
            if (info.Author) document.getElementById('metaAuthor').innerText = info.Author;
            if (info.Subject) document.getElementById('metaSubject').innerText = info.Subject;
            if (info.Producer) document.getElementById('metaProducer').innerText = info.Producer;
            if (info.CreationDate) document.getElementById('metaCreationDate').innerText = info.CreationDate;
            if (info.PDFFormatVersion) document.getElementById('metaPdfVersion').innerText = 'PDF ' + info.PDFFormatVersion;
          }
        } catch (e) {
          console.warn('Metadata extract error:', e);
        }

        // 快速创建全部页面占位符，仅优先渲染首屏页面，其余按需懒加载
        await setupVirtualPages();

        clearInterval(timerInterval);
        const durationMs = Math.round(performance.now() - startTime);
        const durationText = durationMs < 1000 ? (durationMs + ' ms') : ((durationMs / 1000).toFixed(2) + ' s');
        try {
          localStorage.setItem(storageKey, durationText);
        } catch(e) {}

        const tbVal = document.getElementById('toolbarLoadTimeVal');
        if (tbVal) tbVal.innerText = durationText;
        const metaVal = document.getElementById('metaLoadTime');
        if (metaVal) metaVal.innerText = durationText + (lastMemoryTime ? (' (上次记忆: ' + lastMemoryTime + ')') : ' (首次记录)');

        document.getElementById('loadingOverlay').style.display = 'none';
      } catch (err) {
        clearInterval(timerInterval);
        document.getElementById('loadingOverlay').innerHTML =
          '<div style="color: var(--vscode-errorForeground); padding: 20px; text-align: center;">' +
          '<h3>PDF 载入失败</h3><p>' + err.message + '</p></div>';
        vscode.postMessage({ command: 'showError', text: err.message });
      }
    }

    let pageObserver = null;
    const renderingPages = new Set();
    const renderedPages = new Set();
    const pageViewports = new Map();

    async function setupVirtualPages() {
      const container = document.getElementById('pagesContainer');
      container.innerHTML = '';
      renderedPages.clear();
      renderingPages.clear();

      if (pageObserver) {
        pageObserver.disconnect();
      }

      // 获取第 1 页作为默认参考尺寸
      const firstPage = await pdfDoc.getPage(1);
      const defaultVp = firstPage.getViewport({ scale: currentScale, rotation: currentRotation });
      pageViewports.set(1, defaultVp);

      const defaultW = Math.floor(defaultVp.width);
      const defaultH = Math.floor(defaultVp.height);

      // 创建虚拟占位 DOM 骨架
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.id = 'pageWrapper_' + pageNum;
        pageWrapper.setAttribute('data-page-num', pageNum);
        pageWrapper.style.width = defaultW + 'px';
        pageWrapper.style.height = defaultH + 'px';
        container.appendChild(pageWrapper);
      }

      // 视口相交观察器：滚动到视口附近 300px 时才懒加载渲染具体页面
      pageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-num'), 10);
            if (!renderedPages.has(pageNum) && !renderingPages.has(pageNum)) {
              renderSinglePage(pageNum, entry.target);
            }
          }
        });
      }, {
        root: document.getElementById('viewerContainer'),
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01
      });

      // 观察所有页面
      const allWrappers = container.getElementsByClassName('pdf-page-wrapper');
      for (let i = 0; i < allWrappers.length; i++) {
        pageObserver.observe(allWrappers[i]);
      }

      // 首屏关键路径：必须等待第 1 页渲染完毕后才结束 loading
      await renderSinglePage(1, allWrappers[0]);

      updateButtonsState();
      updateScaleDisplay();
    }

    async function renderSinglePage(pageNum, wrapper) {
      if (renderingPages.has(pageNum)) return;
      renderingPages.add(pageNum);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale, rotation: currentRotation });
        pageViewports.set(pageNum, viewport);

        let canvas = wrapper.querySelector('canvas');
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          wrapper.appendChild(canvas);
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        wrapper.style.width = Math.floor(viewport.width) + 'px';
        wrapper.style.height = Math.floor(viewport.height) + 'px';

        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        await page.render(renderContext).promise;

        renderedPages.add(pageNum);
      } catch (e) {
        console.warn('Page render canceled or error:', pageNum, e);
      } finally {
        renderingPages.delete(pageNum);
      }
    }

    async function rerenderAll() {
      // 缩放或旋转时重置观察器与渲染状态
      renderedPages.clear();
      renderingPages.clear();

      const container = document.getElementById('pagesContainer');
      const wrappers = container.getElementsByClassName('pdf-page-wrapper');

      // 更新所有占位框的尺寸
      const firstPage = await pdfDoc.getPage(1);
      const defaultVp = firstPage.getViewport({ scale: currentScale, rotation: currentRotation });
      const defaultW = Math.floor(defaultVp.width);
      const defaultH = Math.floor(defaultVp.height);

      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        w.style.width = defaultW + 'px';
        w.style.height = defaultH + 'px';
        const canvas = w.querySelector('canvas');
        if (canvas) {
          canvas.style.width = defaultW + 'px';
          canvas.style.height = defaultH + 'px';
        }
      }

      // 重新渲染当前可见页面
      const visibleNum = currentPage || 1;
      const targetWrapper = document.getElementById('pageWrapper_' + visibleNum);
      if (targetWrapper) {
        await renderSinglePage(visibleNum, targetWrapper);
      }

      updateScaleDisplay();
    }

    function changePage(delta) {
      const target = currentPage + delta;
      if (target >= 1 && target <= totalPages) {
        jumpToPage(target);
      }
    }

    function jumpToPage(page) {
      const pageNum = parseInt(page, 10);
      if (pageNum >= 1 && pageNum <= totalPages) {
        currentPage = pageNum;
        document.getElementById('pageNumberInput').value = pageNum;
        const targetEl = document.getElementById('pageWrapper_' + pageNum);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateButtonsState();
      }
    }

    function updateButtonsState() {
      document.getElementById('prevBtn').disabled = currentPage <= 1;
      document.getElementById('nextBtn').disabled = currentPage >= totalPages;
    }

    function updateScaleDisplay() {
      document.getElementById('scalePercentText').innerText = Math.round(currentScale * 100) + '%';
    }

    function zoomIn() {
      if (currentScale < 4.0) {
        currentScale = Math.min(4.0, currentScale + 0.25);
        rerenderAll();
      }
    }

    function zoomOut() {
      if (currentScale > 0.4) {
        currentScale = Math.max(0.4, currentScale - 0.25);
        rerenderAll();
      }
    }

    async function zoomFitWidth() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(1);
      const vp = page.getViewport({ scale: 1.0, rotation: currentRotation });
      const containerWidth = document.getElementById('viewerContainer').clientWidth - 60;
      currentScale = Math.max(0.4, Math.min(4.0, containerWidth / vp.width));
      await rerenderAll();
    }

    async function zoomFitPage() {
      if (!pdfDoc) return;
      const page = await pdfDoc.getPage(1);
      const vp = page.getViewport({ scale: 1.0, rotation: currentRotation });
      const containerHeight = document.getElementById('viewerContainer').clientHeight - 60;
      currentScale = Math.max(0.4, Math.min(4.0, containerHeight / vp.height));
      await rerenderAll();
    }

    function rotatePage() {
      currentRotation = (currentRotation + 90) % 360;
      rerenderAll();
    }

    function toggleMetadata() {
      const modal = document.getElementById('metadataModal');
      modal.classList.toggle('active');
    }

    // 监听视窗滚动自动跟踪当前页码
    const viewerContainer = document.getElementById('viewerContainer');
    viewerContainer.addEventListener('scroll', () => {
      const wrappers = document.getElementsByClassName('pdf-page-wrapper');
      const scrollTop = viewerContainer.scrollTop;
      const containerMiddle = scrollTop + viewerContainer.clientHeight / 3;

      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        if (w.offsetTop <= containerMiddle && (w.offsetTop + w.clientHeight) > containerMiddle) {
          const num = parseInt(w.getAttribute('data-page-num'), 10);
          if (num !== currentPage) {
            currentPage = num;
            document.getElementById('pageNumberInput').value = num;
            updateButtonsState();
          }
          break;
        }
      }
    });

    // 键盘快捷键监听
    window.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown' || (e.key === 'ArrowDown' && e.altKey)) {
        changePage(1);
      } else if (e.key === 'PageUp' || (e.key === 'ArrowUp' && e.altKey)) {
        changePage(-1);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
    });

    // 启动 PDF 解析
    initPdf();
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

