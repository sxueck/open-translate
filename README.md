# Open Translate

A powerful Chrome browser extension for web page translation with OpenAI API compatibility.

## ScreenShot

Use Gemini-2.5-Flash Model

<img width="1592" height="229" alt="57ecc1e15822972779e0f205545fdecf" src="https://github.com/user-attachments/assets/ca3dbc68-2ea0-4637-b32f-73c7242f1fe3" />
<img width="1571" height="405" alt="28aa3b19b1d489b14a8044d148ccfb3b" src="https://github.com/user-attachments/assets/f3beaa2a-0b22-4a83-8f89-6b84e5862600" />


## Features

### Core Translation Capabilities
- **Full Page Translation**: Translate entire web pages while preserving layout and styling
- **OpenAI API Compatible**: Works with any OpenAI-compatible translation service
- **Advanced Model Management**:
  - Fetch available models from API endpoints
  - Support for custom model names
  - Dynamic model refresh functionality
- **Dual Translation Modes**:
  - **Replace Mode**: Replace original text with translations
  - **Bilingual Mode**: Display original and translated text side by side
- **Smart Text Extraction**: Intelligently identifies and extracts translatable content
- **Layout Preservation**: Maintains original HTML structure and CSS styling

### User Experience
- **Clean, Minimalist Interface**: Simplified design without unnecessary icons
- **Intuitive Popup Interface**: Easy-to-use translation controls
- **Context Menu Integration**: Right-click to translate pages or selections
- **Comprehensive Settings**: Advanced configuration options with model management
- **Real-time Status Updates**: Visual feedback during translation process
- **Responsive Design**: Works seamlessly across different screen sizes

### Technical Features
- **Modular Architecture**: Clean, maintainable code structure
- **Batch Translation**: Efficient processing of multiple text segments
- **Error Handling**: Robust error recovery and user feedback
- **Storage Management**: Secure configuration storage with Chrome sync
- **Performance Optimized**: Minimal impact on page loading and browsing

## Installation

### Development Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sxueck/open-translate.git
   cd open-translate
   ```

2. **Load the extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the project directory
   - The extension will be installed and ready to use

### Production Installation
- Install from Chrome Web Store (when published)

## Configuration

### API Setup

1. **Open Extension Settings**:
   - Click the extension icon in the toolbar
   - Click the settings gear icon or "Advanced Settings"

2. **Configure API Settings**:
   - **API Endpoint**: Enter your OpenAI-compatible API URL
   - **API Key**: Enter your API key (stored securely)
   - **Model Selection**: Choose from predefined models or fetch from API
   - **Custom Model**: Enter custom model name (overrides dropdown selection)
   - **Temperature**: Adjust translation creativity (0.0-1.0)
   - **Max Tokens**: Set maximum response length
   - **Timeout**: Configure request timeout

3. **Test Connection**:
   - Click "Test Connection" to verify your API configuration
   - Ensure the test passes before using the extension

### Translation Settings

- **Default Languages**: Set your preferred source and target languages
- **Translation Mode**: Choose between Replace or Bilingual mode
- **Auto-translate**: Enable automatic translation of new pages
- **Notifications**: Control status notifications
- **Formatting**: Preserve original text formatting

## Usage

### Basic Translation

1. **Navigate to any webpage** you want to translate
2. **Click the extension icon** in the toolbar
3. **Select languages** (source and target)
4. **Choose translation mode** (Replace or Bilingual)
5. **Click "Translate Page"** to start translation

### Context Menu

- **Right-click on any page** and select "Translate this page"
- **Select text** and right-click to translate selection
- **Access mode switching** from the context menu
