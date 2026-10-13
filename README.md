# Lens for VS Code

🔍 **Lens** 是一个专为 VS Code 设计的通用文件透视、编辑与离线原生预览扩展。

透视黑盒，化繁为简。致力于将原本在 VS Code 中打不开或仅显示乱码/二进制的文件格式，转化为直观、可交互的可视化面板与结构化数据。

---

## ✨ 核心能力

### 1. Windows `.lnk` 快捷方式（[MS-SHLLINK] 规范）
- **高标准规范支持**：纯 TypeScript + Node.js 原生 Buffer 解析，保留 100ns 纳秒级 FILETIME 时间戳、全套 LinkFlags (27项)、FileAttributes (13项)、卷信息及 ExtraData（分布式追踪 GUID、AppUserModelID 等）。
- **三模式编辑与安全保存**：
  - 📋 **表单视图 (GUI Form)**：可视化修改目标路径（带浏览文件选择器）、启动参数、起始位置与运行模式。
  - 📄 **INI 视图**：类 Linux 快捷方式的轻量纯文本编辑。
  - `{ }` **JSON 视图**：标准结构化配置。
  - 💾 **即时写回**：直接按下 `Ctrl+S` / `Cmd+S` 重新构建并保存为 Windows 原生 `.lnk` 二进制文件。

### 2. Linux `.AppImage` 便携软件包（Type 1 & Type 2）
- **跨平台免挂载深度解析**：无需 Linux 环境或 squashfs-tools，纯原生 Buffer + zlib 极速解析。
- **ELF 运行时分析**：识别 x86_64 / AArch64 指令集、Type 2 标识、运行时尺寸与入口点。
- **内嵌 `[Desktop Entry]` 提取**：自动读取 SquashFS 4.0 超级块与目录树，提取应用名称、执行指令、图标、分类与版本。
- **组件清单与快捷指令**：完整展示打包组件清单，一键导出 `.desktop`，一键复制 Linux 快速启动命令。

### 3. PDF 文档（`.pdf`）离线极速渲染
- **毫秒级开屏**：内置 Mozilla PDF.js 引擎，预载同源消息处理，彻底消除跨域 Worker 阻塞超时。
- **虚拟化与懒加载**：首屏秒开可见，配合 `IntersectionObserver` 按需绘制，翻阅顺畅不卡顿。
- **全套阅读交互**：高 DPI Canvas 渲染、页面缩放、顺时针 90° 旋转、连续滚动追踪与详细文档元数据检视。

---

## 🚀 使用方式

- **打开文件**：在 VS Code 资源管理器中直接左键单击任意支持的文件（`.lnk`、`.AppImage`、`.pdf`）。
- **右键选择**：亦可通过右键菜单选择 `Open With... -> LNK / AppImage / PDF Viewer`。
- **导出强类型代码**：支持在命令面板中一键导出结构化元数据为 TypeScript 代码，方便二次开发。
