/**
 * Local LLM Client for PCS AI
 * Supports Ollama, LM Studio, and other OpenAI-compatible APIs
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface LLMClientConfig {
  endpoint: string;
  model: string;
  timeout?: number;
  apiKey?: string;
}

class LocalLLMClient {
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Send a chat completion request to the local LLM
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      // Check if endpoint is Ollama format
      const isOllama = this.config.endpoint.includes('/api/generate');
      
      if (isOllama) {
        return await this.chatOllama(messages, controller.signal);
      } else {
        // OpenAI-compatible API (LM Studio, etc.)
        return await this.chatOpenAICompatible(messages, controller.signal);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('PCS AI request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Send training data to the LLM
   */
  async train(prompt: string): Promise<LLMResponse> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant that learns from examples to improve invoice parsing logic. When given examples of parsing errors and corrections, update your understanding to parse similar invoices correctly in the future.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    return this.chat(messages);
  }

  private async chatOllama(messages: LLMMessage[], signal: AbortSignal): Promise<LLMResponse> {
    // Convert messages to a single prompt for Ollama
    const prompt = messages
      .map(msg => {
        if (msg.role === 'system') {
          return `System: ${msg.content}\n\n`;
        } else if (msg.role === 'user') {
          return `User: ${msg.content}\n\n`;
        } else {
          return `Assistant: ${msg.content}\n\n`;
        }
      })
      .join('') + 'Assistant:';

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: prompt,
        stream: false,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PCS AI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.response || data.text || '',
      model: data.model || this.config.model,
    };
  }

  private async chatOpenAICompatible(messages: LLMMessage[], signal: AbortSignal): Promise<LLMResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PCS AI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || this.config.model,
      usage: data.usage,
    };
  }
}

/**
 * Create a LocalLLMClient instance from environment variables
 */
export function createLocalLLMClient(): LocalLLMClient | null {
  const endpoint = process.env.LOCAL_LLM_ENDPOINT;
  const model = process.env.LOCAL_LLM_MODEL;

  if (!endpoint || !model) {
    console.warn('[LLM] Local LLM not configured. Set LOCAL_LLM_ENDPOINT and LOCAL_LLM_MODEL environment variables.');
    return null;
  }

  return new LocalLLMClient({
    endpoint,
    model,
    timeout: parseInt(process.env.LOCAL_LLM_TIMEOUT || '30000', 10),
    apiKey: process.env.LOCAL_LLM_API_KEY,
  });
}

export default LocalLLMClient;

