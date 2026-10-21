# MDRenderGoodForHomework

为提交作业而设计的 Markdown 编辑器。左侧编辑、右侧实时预览，支持代码高亮、LaTeX 数学公式和图片，可导出文字可选择的 PDF。

界面采用黑白灰、清晰网格和简洁排版。支持自定义页面宽度，将全文导出为一张长页，或按指定纸张尺寸分页。

## 从源码运行

需要 **Python 3.10+** 和 **Node.js 22+**。首次运行先安装依赖并构建前端：

```bash
git clone https://github.com/1942ILSX/MDRenderGoodForHomework.git
cd MDRenderGoodForHomework

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

npm ci
npm run build

python -m playwright install chromium
python main.py
```

Windows 下可使用 `python -m venv .venv`，在 PowerShell 中用 `.venv\Scripts\Activate.ps1` 激活环境，其余命令相同。

启动后自动打开 `http://127.0.0.1:8765`。在 PyCharm 中选择项目的 `.venv` 解释器，完成首次构建后直接运行 `main.py` 即可。

已安装 Google Chrome 时，可以跳过 Chromium 下载。也支持用环境变量 `MD_RENDER_BROWSER` 指定兼容 Chromium 的可执行文件路径。仅监听本机地址。

后续启动只需激活虚拟环境并运行 `python main.py`；修改 `src/` 后重新执行 `npm run build`。仓库保存源码，前端打包文件和字体由构建生成。

## 使用

UI 支持简体中文和 English，可在顶部的 language selector 随时切换。首次打开跟随 browser language，之后保存 language preference；切换时保留 Markdown、filename 和 PDF settings。菜单、tooltips、syntax guide、status 和 API errors 均支持 i18n。

- 支持标题、表格、任务列表、引用、链接、代码高亮和数学公式。
- 「打开文件」或拖入 `.md`、`.markdown`、`.txt` 文件；「保存 MD」下载源码。
- 图片按钮或粘贴操作可嵌入本地图片，图片随 Markdown 文件一起保存。
- 草稿自动保存在当前浏览器；重要文档请另存为文件。
- 「导出 PDF」可选择单页长文或分页文档，调整页宽、页高、边距、字号和行距。
- 提供 A4、A5、US Letter 预设，以及标准、衬线、简约三种排版。
- `⌘/Ctrl+S` 保存，`⌘/Ctrl+Shift+E` 导出，`⌘/Ctrl+B` 加粗。

## LaTeX 数学公式

支持 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`，以及矩阵、积分、求和、多行推导等 KaTeX 支持的语法：

```latex
行内公式：$E = mc^2$

$$
\begin{aligned}
\int_0^1 x^2\,dx &= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$
```

这里支持 LaTeX 数学公式，不编译完整 `.tex` 文档或任意宏包。代码块内的美元符号不会作为公式处理，Markdown 中的 HTML 按普通文字显示。

## PDF 与图片

PDF 由 Chromium 原生打印生成，保留文字、公式和代码高亮。预览与 PDF 共用 Markdown 解析、KaTeX 字体和文档样式；构建完成后无需从 CDN 加载前端依赖。

页宽范围为 80–420 mm，分页高度为 100–600 mm；单页长文高度按内容自动计算，最高 5080 mm。超宽公式或表格会提示调整设置。预览为连续排版，实际分页以导出的 PDF 为准。

本地图片请通过图片按钮或粘贴插入；导入 Markdown 时不会自动读取相对图片路径。公网图片需要联网，加载失败会提示错误。单张插入图片最大 5 MB，文档与内嵌图片总计最大 16 MB。

## 开发与验证

```bash
pip install -r requirements-dev.txt
python -m unittest discover -s tests
npm run test:i18n

# 在一个终端启动本地服务：
python main.py --no-browser

# 在另一个激活了相同虚拟环境的终端运行浏览器测试：
python tests/smoke.py
python tests/i18n-browser.py
```

浏览器测试检查预览、公式、代码、草稿保存、PDF 下载、单页与分页、自定义宽度、中文文字、图片和手机布局。测试产物保存在已忽略的 `tests/results/` 中。

i18n tests 额外检查 language detection、language preference、旧 draft 保留、translation catalogs、API errors、mobile layout 和 storage unavailable；两种 UI language 下均实际执行 PDF export。

用 `python main.py --port 8766` 更换端口，或用 `--no-browser` 关闭自动打开浏览器。

| 路径 | 内容 |
| --- | --- |
| `src/app.js` | 编辑器交互、文件与图片导入、草稿保存 |
| `src/i18n.js`、`locales/` | UI 与 local API 共用的 i18n helpers 和 translation catalogs |
| `src/examples.js` | 中文与 English example documents |
| `src/renderer.js` | Markdown / LaTeX 渲染及打印排版 |
| `static/` | HTML 模板和手写 CSS |
| `main.py` | 本机 HTTP 服务和 PDF 导出 |
| `build.mjs` | 前端构建及第三方许可证复制 |
| `tests/` | 参数校验和真实浏览器测试 |

## 许可证

本项目使用仓库中的 [MIT License](LICENSE)。依赖各自的许可证随 npm 包提供，构建时复制到 `static/vendor/`。
