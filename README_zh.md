# 开放翻译

[English](README.md) | [中文](README_zh.md)

<img src="assets/icons/icon48.png" alt="Open Translate Icon" width="48" height="48">

一个 Chrome 浏览器扩展，支持 OpenAI API 兼容的网页翻译功能

> 你能读懂世界，也能让世界倾听你

## 截图

使用 Gemini-2.5-Flash 模型

<img width="1592" height="229" alt="57ecc1e15822972779e0f205545fdecf" src="https://github.com/user-attachments/assets/ca3dbc68-2ea0-4637-b32f-73c7242f1fe3" />
<img width="1571" height="405" alt="28aa3b19b1d489b14a8044d148ccfb3b" src="https://github.com/user-attachments/assets/f3beaa2a-0b22-4a83-8f89-6b84e5862600" />

## 功能特性

### 核心翻译功能
- **整页翻译**：翻译整个网页，同时保持布局和样式
- **OpenAI API兼容**：支持任何 OpenAI 兼容的翻译服务（也仅支持 LLM 翻译服务）
- **高级模型管理**：
  - 从 API 端点获取可用模型
  - 支持自定义模型名称
  - 动态模型刷新功能
- **双重翻译模式**：
  - **替换模式**：用翻译文本替换原文
  - **双语模式**：原文和译文并排显示
- **智能文本提取**：智能识别和提取可翻译内容
- **布局保持**：维护原始 HTML 结构和 CSS 样式

## 安装

[Chrome插件安装地址](https://chromewebstore.google.com/detail/open-translate/adjaaffapljffboblagfljfpgpbophon?authuser=0&hl=zh-CN)

### 开发安装

1. **克隆仓库**：
   ```bash
   git clone https://github.com/sxueck/open-translate.git
   cd open-translate
   ```

2. **在Chrome中加载扩展**：
   - 打开Chrome并导航到 `chrome://extensions/`
   - 在右上角启用"开发者模式"
   - 点击"加载已解压的扩展程序"并选择项目目录
   - 扩展将被安装并准备使用

## 配置

### API设置

1. **打开扩展设置**：
   - 点击工具栏中的扩展图标
   - 点击设置齿轮图标或"高级设置"

2. **配置API设置**：
   - **API端点**：输入您的 OpenAI 兼容 API URL
   - **API密钥**：输入您的 API 密钥（安全存储）
   - **模型选择**：从预定义模型中选择或从 API 获取
   - **自定义模型**：输入自定义模型名称（覆盖下拉选择）
   - **温度**：调整翻译创造性，可选
   - **最大令牌数**：设置最大响应长度，可选
   - **超时时间**：配置请求超时，可选

3. **测试连接**：
   - 点击"测试连接"验证您的API配置
   - 确保测试通过后再使用扩展

### 翻译设置

- **默认语言**：设置您偏好的源语言和目标语言
- **翻译模式**：在替换或双语模式之间选择
- **自动翻译**：启用新页面的自动翻译
- **通知**：控制状态通知
- **格式化**：保持原文格式

## 使用方法

### 基本翻译

1. **导航到任何网页**
2. **点击工具栏中的扩展图标**
3. **选择语言**（源语言和目标语言）
4. **选择翻译模式**（替换或双语）
5. **点击"翻译页面"**开始翻译

### 输入框翻译（实验性功能）

- **在任何文本输入框中按 F2 键**（或配置的快捷键）
- **输入要翻译的文本**
- **翻译结果将显示在输入框附近的弹窗中**

## 兼容的API服务

该扩展与任何 OpenAI 兼容的 API 服务配合使用：
- OpenAI GPT 模型
- Anthropic Claude
- Google Gemini
- 以及其他 OpenAI 兼容的 LLM 服务

## 许可证

本项目采用MIT许可证 - 详见[LICENSE](LICENSE)文件
