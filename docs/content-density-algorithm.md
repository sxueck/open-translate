# 基于内容密度的网页翻译优先级算法原理

## 算法概述

### 核心思想

基于内容密度的网页翻译优先级算法通过分析网页元素的文本长度、结构特征和语义信息，计算出每个区域的内容密度分数，从而智能识别主要内容区域并确定翻译优先级。该算法的主要目标是：

1. **智能识别主要内容区域**：优先翻译用户最关注的内容（如文章正文、标题等）
2. **优化翻译效率**：通过优先级排序减少不必要的翻译任务
3. **提升用户体验**：确保重要内容优先呈现给用户

### 算法流程

算法主要包含以下四个步骤：

1. **主要内容区域识别**：使用预定义选择器和启发式方法识别主要内容区域
2. **内容密度分数计算**：基于多维度特征计算每个区域的内容密度分数
3. **段落优先级排序**：根据元素类型和文档顺序确定翻译优先级
4. **翻译任务调度**：采用批处理策略和并发控制优化翻译性能

## 算法模型

### 优化后的内容密度分数计算

内容密度分数 $S(e)$ 通过优化后的多维度评估公式计算：

$$S(e) = W_{\text{text}} \cdot f_{\text{text}}(|T(e)|) + W_{\text{para}} \cdot f_{\text{para}}(|P(e)|) + W_{\text{head}} \cdot f_{\text{head}}(|H(e)|) + W_{\text{list}} \cdot f_{\text{list}}(|L_i(e)|) + W_{\text{img}} \cdot f_{\text{img}}(|I(e)|) - W_{\text{link}} \cdot f_{\text{link}}(|L(e)|, |T(e)|) - W_{\text{btn}} \cdot f_{\text{btn}}(|B(e)|)$$

其中新增参数：
- $H(e)$ 表示元素 $e$ 中的标题元素集合
- $L_i(e)$ 表示元素 $e$ 中的列表元素集合
- $I(e)$ 表示元素 $e$ 中的图片元素集合
- $W_{\text{head}}, W_{\text{list}}, W_{\text{img}}$ 为新增权重系数

### 优化后的文本长度权重函数

文本长度权重函数 $f_{\text{text}}$ 采用更精细的分级：

$$f_{\text{text}}(textLength) = \begin{cases}
5 & \text{if } textLength > 1000 \\
3 & \text{if } 500 < textLength \leq 1000 \\
2 & \text{if } 200 < textLength \leq 500 \\
1 & \text{if } 50 < textLength \leq 200 \\
0 & \text{otherwise}
\end{cases}$$

### 段落数量评分函数

段落数量评分函数 $f_{\text{para}}$ 定义为：

$$f_{\text{para}}(paraCount) = \begin{cases}
2 & \text{if } paraCount > 5 \\
1 & \text{if } paraCount > 2 \\
0 & \text{otherwise}
\end{cases}$$

### 链接密度惩罚机制

链接密度惩罚函数 $f_{\text{link}}$ 定义为：

$$f_{\text{link}}(linkCount, textLength) = \begin{cases}
1 & \text{if } linkCount > \frac{textLength}{100} \\
0 & \text{otherwise}
\end{cases}$$

### 按钮密度惩罚机制

按钮密度惩罚函数 $f_{\text{btn}}$ 定义为：

$$f_{\text{btn}}(btnCount) = \begin{cases}
1 & \text{if } btnCount > 5 \\
0 & \text{otherwise}
\end{cases}$$

## 算法流程

### 主要内容区域识别

#### 选择器优先级匹配

算法首先尝试使用预定义的选择器来识别主要内容区域：

$$\text{MainContent} = \arg\max_{s \in S} \{\text{Priority}(s) \mid \text{Match}(s) \land \text{HasSignificantContent}(s)\}$$

其中 $S$ 是预定义选择器集合，包括：
- `main`, `article`
- `.content`, `.main-content`, `.post-content`
- `#content`, `#main`, `#main-content`
- `[role="main"]`, `[role="article"]`

#### 启发式内容发现 - 伪代码实现

```
输入：根元素 rootElement
输出：主要内容元素 mainContent

1. candidates ← ∅
2. containers ← 查找所有 div, section, article 元素
3. for each container in containers do
4.     if ¬IsNonContentArea(container) then
5.         textLength ← |container.textContent|
6.         childElements ← |container.children|
7.         score ← CalculateContentScore(container, textLength, childElements)
8.         if score > 0 then
9.             candidates ← candidates ∪ {(container, score, textLength)}
10.        end if
11.    end if
12. end for
13. 按 score 降序排序 candidates
14. return candidates[0].element 如果 candidates ≠ ∅，否则返回 null
```

### 段落优先级排序策略

#### 优先级分配

算法为不同类型的段落元素分配不同的优先级值（数值越小优先级越高）：

$$\text{Priority}(e) = \begin{cases}
i & \text{if } e.tagName = \text{"h"} + i, \quad i \in \{1,2,3,4,5,6\} \\
10 & \text{if } e.tagName \in \{\text{"p"}, \text{"blockquote"}\} \\
15 & \text{if } e.tagName \in \{\text{"li"}, \text{"td"}, \text{"th"}\} \\
20 & \text{otherwise}
\end{cases}$$

#### 排序算法 - 伪代码实现

```
输入：段落组集合 Groups
输出：排序后的段落组 SortedGroups

1. for each group g in Groups do
2.     g.priority ← GetParagraphPriority(g.container)
3.     g.documentOrder ← GetDocumentOrder(g.container)
4. end for
5. 按以下规则排序：
   - 主要排序键：priority (升序)
   - 次要排序键：documentOrder (升序)
6. return SortedGroups
```
