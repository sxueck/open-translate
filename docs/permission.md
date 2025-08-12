# Open Translate Extension Permission Justification

## Permission Request Explanations

### 1. activeTab Permission

**Justification:**
- **Functional Requirement**: The extension needs access to the current active tab's content to perform webpage translation functionality
- **Specific Uses**:
  - Read webpage text content for translation processing
  - Inject translation results and styles into webpages
  - Communicate with content scripts to control translation status
  - Obtain page URL to determine if translation functionality is supported
- **Security**: Only accesses the current tab when users actively click the extension icon or use translation features, does not monitor or access other tabs in the background

### 2. storage Permission

**Justification:**
- **Functional Requirement**: The extension needs to persistently store user configurations and preference settings
- **Specific Uses**:
  - Store API configuration information (API URL, model selection, temperature parameters, etc.)
  - Save user language preferences (source language, target language)
  - Store translation mode settings (replace mode, bilingual mode)
  - Save advanced settings (batch size, retry attempts, text merging options, etc.)
  - Store user interface preferences (auto-translate toggle, format preservation options, etc.)
- **Data Types**: Only stores configuration parameters and user preferences, does not store translation content or sensitive information
- **Storage Scope**: Uses Chrome sync storage, supports cross-device synchronization of user settings

### 3. scripting Permission

**Justification:**
- **Functional Requirement**: The extension needs to inject content scripts into webpages to implement translation functionality
- **Specific Uses**:
  - Inject text extraction scripts to identify and extract translatable text from webpages
  - Inject translation rendering scripts to display translation results in webpages
  - Inject style files to ensure proper display of translation interface
  - Dynamically execute translation-related JavaScript code
- **Injection Scope**: Only injects into webpages that support translation, excludes extension pages, Chrome internal pages, etc.
- **Security**: Injected scripts are only used for translation functionality, do not collect user data or perform malicious operations

### 4. contextMenus Permission

**Justification:**
- **Functional Requirement**: Provide users with convenient right-click menu translation options
- **Specific Uses**:
  - Add "Translate this page" right-click menu option
  - Add "Translate selected text" option (when users select text)
  - Add "Restore original text" option
  - Add translation mode switching options (replace mode/bilingual mode)
- **User Experience**: Provides quick access to translation functionality without needing to open the extension popup

### 5. Host Permissions (http://*/*, https://*/*)

**Justification:**
- **Functional Requirement**: The extension needs access to all websites to provide universal webpage translation services
- **Specific Uses**:
  - Execute translation functionality on any HTTP/HTTPS website
  - Send requests to translation API servers (such as OpenAI API)
  - Support access to user-customized API endpoints
  - Ensure translation functionality compatibility across various websites
- **Necessity Explanation**:
  - Webpage translation is the core functionality of the extension, needs to work on any website users visit
  - Different websites have varying structures and content types, requiring universal access permissions to ensure proper functionality
  - Users may use different translation API services, requiring support for accessing various API endpoints
- **Security Assurance**:
  - Only accesses webpage content when users actively trigger translation
  - Does not automatically access or monitor websites in the background
  - All network requests are solely for translation functionality, not for data collection
