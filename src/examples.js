export const LEGACY_EXAMPLE = String.raw`# 让想法，自然成页。

每一个值得记录的想法，都值得一份清晰的表达。
在左侧写下 Markdown，在右侧看见它的模样。

> 写作，是把思考的过程留在纸上。

## 01 / 从文字开始

用 **粗体** 标记重点，用 *斜体* 留下一点语气。
无论是学习笔记、技术文档，还是一份认真准备的报告，
墨页都可以陪你从第一行写到最后一页。

- 实时预览，让排版与思考同步
- 自定义页宽，让长文找到合适的尺度
- 一页长文或多页文档，按需导出 PDF

## 02 / 让公式也优雅

爱因斯坦用一个简洁的公式，连接了质量与能量：$E = mc^2$。
而一条高斯曲线，描绘了随机世界里的秩序：

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}
       e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

也支持矩阵、积分和多行推导：

$$
\begin{aligned}
\int_0^1 x^2\,dx
&= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$

## 03 / 有条理，也有细节

| 内容 | 写法 | 呈现 |
| :--- | :--- | :--- |
| 行内公式 | \`$E = mc^2$\` | 与文字自然衔接 |
| 独立公式 | \`$$ ... $$\` | 居中展示，清晰易读 |
| 代码片段 | 三个反引号 + 语言 | 保留缩进，自动高亮 |

\`\`\`python
from math import sqrt, pi, exp

def gaussian(x, mu=0, sigma=1):
    """在复杂的世界里，发现简单的规律。"""
    return exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * sqrt(2 * pi))
\`\`\`

### 一份小小的写作清单

- [x] 记录一个想法
- [x] 为它找到清晰的表达
- [ ] 点击右上角，将它保存为 PDF

---

*留一点空白，给下一个想法。*
`.replaceAll('\\`', '`');

export const EXAMPLE = String.raw`# Markdown 示例

在左侧编辑源码，右侧查看排版结果。

## 基本文本

支持 **粗体**、*斜体*、~~删除线~~、列表和引用。

> 引用内容使用大于号开头。

- 打开或拖入 Markdown 文件
- 使用工具栏插入图片、表格和公式
- 保存源码，或导出 PDF

## 数学公式

行内公式：$E = mc^2$。

独立公式：

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}
       e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

多行推导：

$$
\begin{aligned}
\int_0^1 x^2\,dx
&= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$

## 表格与代码

| 功能 | 语法 | 说明 |
| :--- | :--- | :--- |
| 行内公式 | \`$...$\` | 与正文同行 |
| 独立公式 | \`$$...$$\` | 单独居中 |
| 代码块 | 三个反引号 + 语言 | 自动高亮 |

\`\`\`python
from math import sqrt, pi, exp

def gaussian(x, mu=0, sigma=1):
    return exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * sqrt(2 * pi))
\`\`\`

## 导出设置

- [x] 选择页面宽度、边距和字号
- [x] 单页模式按内容计算高度
- [ ] 分页模式按指定页高自动分页

导出前请检查预览中的公式、图片和表格。
`.replaceAll('\\`', '`');

export const ENGLISH_EXAMPLE = String.raw`# Markdown example

Edit the source on the left and preview the document on the right.

## Basic text

Use **bold**, *italic*, ~~strikethrough~~, lists, and blockquotes.

> Start a blockquote with a greater-than sign.

- Open or drop a Markdown file
- Insert images, tables, and formulas from the toolbar
- Save the source or export a PDF

## Math

Inline math: $E = mc^2$.

Display math:

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}
       e^{-\frac{(x-\mu)^2}{2\sigma^2}}
$$

Multi-line derivation:

$$
\begin{aligned}
\int_0^1 x^2\,dx
&= \left[\frac{x^3}{3}\right]_0^1 \\
&= \frac{1}{3}
\end{aligned}
$$

## Tables and code

| Feature | Syntax | Result |
| :--- | :--- | :--- |
| Inline math | \`$...$\` | Within a paragraph |
| Display math | \`$$...$$\` | Centered on its own line |
| Code block | Three backticks + language | Syntax highlighting |

\`\`\`python
from math import sqrt, pi, exp

def gaussian(x, mu=0, sigma=1):
    return exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * sqrt(2 * pi))
\`\`\`

## Export settings

- [x] Set page width, margins, and font size
- [x] Fit the content onto a single long page
- [ ] Split the document at the chosen page height

Check formulas, images, and tables before exporting.
`.replaceAll('\\`', '`');

export const exampleFor = locale => locale === 'zh-CN' ? EXAMPLE : ENGLISH_EXAMPLE;
