# Model Configuration Guide

This guide explains how to configure and use the enhanced model selection features in Open Translate.

## Overview

Open Translate now supports:
- Fetching available models from your API endpoint
- Using custom model names
- Dynamic model refresh functionality

## Configuration Steps

### 1. Basic API Setup

1. Open the extension settings page
2. Enter your API endpoint URL (e.g., `https://api.openai.com/v1/chat/completions`)
3. Enter your API key
4. Click "Test Connection" to verify your setup

### 2. Model Selection Options

You have three ways to specify which model to use:

#### Option A: Use Predefined Models
- Select from the dropdown list of common models
- Includes GPT-3.5 Turbo, GPT-4, Claude models, etc.

#### Option B: Fetch Available Models
1. Click the "Refresh Models" button
2. The extension will call your API's `/v1/models` endpoint
3. Available models will be added to the dropdown
4. Models show format: "Model Name (owner)"

#### Option C: Custom Model Name
1. Enter any model name in the "Custom Model Name" field
2. This will override any dropdown selection
3. Useful for:
   - Local models not in the API list
   - Newly released models
   - Custom fine-tuned models

### 3. Model Priority

The extension uses models in this priority order:
1. **Custom Model Name** (if provided)
2. **Selected Dropdown Model** (if no custom name)
3. **Default Model** (gpt-3.5-turbo as fallback)

## API Compatibility

### Supported Endpoints

Your API must support these endpoints:
- `POST /v1/chat/completions` - For translations
- `GET /v1/models` - For model listing (optional)

### Models Endpoint Response

The `/v1/models` endpoint should return:
```json
{
  "data": [
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "owned_by": "openai"
    },
    {
      "id": "gpt-4",
      "object": "model", 
      "owned_by": "openai"
    }
  ]
}
```

### Error Handling

If the models endpoint fails:
- Extension falls back to predefined models
- Error message is displayed to user
- Translation functionality remains available

## Examples

### OpenAI API
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Models: gpt-3.5-turbo, gpt-4, gpt-4-turbo
- Custom models: Fine-tuned models with your custom names

### Local LLM (Ollama)
- Endpoint: `http://localhost:11434/v1/chat/completions`
- Custom model: `llama2`, `codellama`, `mistral`
- Use custom model name field for local model names

### Azure OpenAI
- Endpoint: `https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-12-01-preview`
- Custom model: Your deployment name
- Use custom model name field

## Troubleshooting

### Models Not Loading
1. Verify API endpoint and key are correct
2. Check if your API supports the `/v1/models` endpoint
3. Look for error messages in the extension settings
4. Try using custom model name instead

### Custom Model Not Working
1. Ensure the model name is exactly as expected by your API
2. Test the model name directly with your API
3. Check API documentation for correct model identifiers

### Translation Fails
1. Verify the model exists and is accessible
2. Check API key permissions
3. Try with a different model
4. Review error messages in browser console

## Best Practices

### Model Selection
- Use "Refresh Models" after changing API endpoints
- Keep custom model names up to date
- Test with different models to find optimal performance

### Performance
- Some models are faster but less accurate
- Larger models provide better translations but are slower
- Consider cost implications of different models

### Security
- API keys are stored securely in Chrome sync storage
- Never share API keys or include them in screenshots
- Regularly rotate API keys for security

## Advanced Usage

### Multiple API Providers
- Switch between different API endpoints as needed
- Each endpoint may have different available models
- Use custom model names for provider-specific models

### Model Testing
1. Configure your API settings
2. Use "Test Connection" to verify basic functionality
3. Try translating a simple phrase to test the selected model
4. Compare results with different models if needed
