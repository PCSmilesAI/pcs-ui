# Local LLM Setup Guide for Mac Mini M2 Pro

This guide explains how to set up a local LLM for parser training and chat functionality in the PCS AI system.

## Recommended LLM Options

### Option 1: Ollama (Recommended - Easiest Setup)

**Best for:** Quick setup, good performance on M2 Pro, easy API integration

1. **Install Ollama:**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull a recommended model:**
   ```bash
   # For coding/parsing logic (recommended):
   ollama pull codellama:13b-instruct-q4_K_M
   
   # Alternative options:
   ollama pull deepseek-coder:6.7b-q4_K_M
   ollama pull mistral:7b-instruct-q4_K_M
   ```

3. **Start Ollama server:**
   ```bash
   ollama serve
   ```
   The server will run on `http://localhost:11434` by default.

4. **Test the API:**
   ```bash
   curl http://localhost:11434/api/generate -d '{
     "model": "codellama:13b-instruct-q4_K_M",
     "prompt": "Hello, how are you?",
     "stream": false
   }'
   ```

### Option 2: LM Studio (User-Friendly GUI)

**Best for:** Easy model management, visual interface

1. **Download LM Studio:**
   - Visit https://lmstudio.ai/
   - Download for macOS (Apple Silicon)

2. **Download a model:**
   - Open LM Studio
   - Go to "Search" tab
   - Search for "CodeLlama" or "DeepSeek Coder"
   - Download a quantized version (4-bit or 8-bit recommended)

3. **Start the server:**
   - Go to "Local Server" tab
   - Click "Start Server"
   - Server runs on `http://localhost:1234` by default

4. **Configure in PCS AI:**
   - Set `LOCAL_LLM_ENDPOINT=http://localhost:1234/v1/chat/completions`
   - Set `LOCAL_LLM_MODEL=your-model-name`

### Option 3: llama.cpp (Most Control)

**Best for:** Maximum performance, fine-grained control

1. **Install llama.cpp:**
   ```bash
   git clone https://github.com/ggerganov/llama.cpp.git
   cd llama.cpp
   make -j
   ```

2. **Download a model:**
   - Download a quantized model (GGUF format) from HuggingFace
   - Recommended: CodeLlama-13B-Instruct Q4_K_M

3. **Run the server:**
   ```bash
   ./server -m /path/to/model.gguf --port 8080
   ```

## Configuration for PCS AI

Create a `.env.local` file in the project root:

```env
# Local LLM Configuration
LOCAL_LLM_ENDPOINT=http://localhost:11434/api/generate
LOCAL_LLM_MODEL=codellama:13b-instruct-q4_K_M
LOCAL_LLM_API_KEY=not-needed-for-local
LOCAL_LLM_TIMEOUT=30000
```

For Ollama, use:
- `LOCAL_LLM_ENDPOINT=http://localhost:11434/api/generate`
- `LOCAL_LLM_MODEL=codellama:13b-instruct-q4_K_M`

For LM Studio (OpenAI-compatible API), use:
- `LOCAL_LLM_ENDPOINT=http://localhost:1234/v1/chat/completions`
- `LOCAL_LLM_MODEL=your-model-name`

## Model Recommendations

### For Parsing Logic Training (Most Accurate):
1. **CodeLlama 13B Instruct** (Q4_K_M quantization)
   - Best balance of accuracy and speed
   - Excellent for code understanding and generation
   - ~8GB RAM usage

2. **DeepSeek Coder 6.7B** (Q4_K_M quantization)
   - Faster inference
   - Good code understanding
   - ~4GB RAM usage

3. **Mistral 7B Instruct** (Q4_K_M quantization)
   - General purpose, good for chat
   - ~4GB RAM usage

### Performance Tips for Mac Mini M2 Pro:
- Use 4-bit quantization (Q4_K_M) for best speed/quality balance
- Allocate 16-32GB RAM to the model
- Close other applications when training
- Use Metal acceleration (automatic with Ollama and LM Studio)

## Testing the Setup

Once configured, test the connection:

```bash
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "codellama:13b-instruct-q4_K_M",
    "prompt": "Extract invoice number from: Invoice #12345",
    "stream": false
  }'
```

## Troubleshooting

### Model won't load:
- Check available RAM (need at least 8GB free for 13B models)
- Try a smaller model (7B or 6.7B)
- Use lower quantization (Q4_K_M instead of Q8_0)

### Slow inference:
- Use Metal acceleration (should be automatic)
- Reduce model size
- Use higher quantization (Q4 instead of Q8)

### API connection errors:
- Verify the server is running
- Check the endpoint URL matches your setup
- Ensure firewall allows localhost connections

## Next Steps

After setup, the PCS AI system will:
1. Send training data when admins/AP managers update invoices
2. Allow chat interface for questions about parsing
3. Use the LLM to improve parsing accuracy over time

See `lib/ai/localLLMClient.ts` for implementation details.

