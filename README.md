# LNK, AppImage & PDF Inspector for VS Code

跨平台 Windows 快捷方式（`.lnk`，对标 **[MS-SHLLINK]** 规范）、Linux 便携软件包（**`.AppImage`**）以及 **PDF 文档（`.pdf`）** 的二进制检视、编辑与离线原生预览扩展。

## ✨ 特性

### 1. PDF (`.pdf`) 离线高保真预览
- **纯原生零外部依赖**：基于 Mozilla PDF.js 引擎，100% 离线运行，无需安装任何系统阅读器或 native 动态库。
- **流畅连续滚动与高 DPI 渲染**：自动适配高分屏（Retina / 4K）`devicePixelRatio`，字迹边缘清晰锐利。
- **全套浏览控制**：
  - 📄 页面导航：上一页、下一页、输入页码直接跳转、当前页自动视窗跟踪。
  - 🔍 缩放调整：缩小、放大、适应页面、适应宽度（支持快捷键 `Ctrl + +` / `Ctrl + -`）。
  - ↻ 页面旋转：顺时针 90° 旋转。
  - ℹ️ 文档信息检视：提取 PDF 标题、作者、主题、制作工具 (Producer)、创建时间及 PDF 规范版本。

### 2. Windows `.lnk` (MS-SHLLINK) 检视与双向编辑
- **对标规范**：纯 TypeScript + Buffer 处理，保留 100ns 纳秒级时间戳、27 项 LinkFlags、13 项 FileAttributes 及 ExtraData 扩展块。
- **三模式编辑与直接保存**：
  - **📋 表单视图**：可视化修改目标路径、参数、起始位置、运行方式（常规/最大化/最小化）。
  - **📄 INI 视图**：类 Linux 快捷方式的纯文本编辑。
  - **`{ }` JSON 视图**：结构化 JSON 视图。
  - **💾 直接保存**：修改后直接按 `Ctrl+S` / `Cmd+S` 重新构建写回 `.lnk` 二进制文件。

### 3. Linux `.AppImage` (Type 1 & Type 2) 深度解析
- **免挂载解析**：在 Windows 上直接读取 64 位 ELF 运行时与内嵌 SquashFS 4.0 文件系统。
- **提取 `[Desktop Entry]`**：自动解包提取内部打包的应用名称、入口 Exec 启动指令、图标、分类与版本。
- **组件清单与一键导出**：提取根目录 27+ 核心文件列表，一键导出 `.desktop` 文件，一键复制 Linux 快速启动命令。

---

## 🚀 使用方法

1. **直接点击打开**：在 VS Code 左侧资源管理器中直接左键单击任意 `.pdf`、`.lnk` 或 `.AppImage` 文件即可自动调起专有面板。
2. **多模式/视图切换**：在顶部 Tab 自由切换表单、纯文本、JSON 与元数据检视。
