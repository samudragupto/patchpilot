/**
 * IBM watsonx AI Client
 * Production-grade client with retry logic, streaming, and error handling
 */

interface WatsonxConfig {
  apiKey: string;
  projectId: string;
  region?: string;
  model?: string;
}

interface GenerateOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  stream?: boolean;
}

interface WatsonxResponse {
  results: Array<{
    generated_text: string;
    generated_token_count: number;
    input_token_count: number;
    stop_reason: string;
  }>;
  model_id: string;
  created_at: string;
}

export class WatsonxClient {
  private apiKey: string;
  private projectId: string;
  private baseUrl: string;
  private model: string;
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor(config: WatsonxConfig) {
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.model = config.model || 'ibm/granite-13b-chat-v2';
    
    const region = config.region || 'us-south';
    this.baseUrl = `https://${region}.ml.cloud.ibm.com/ml/v1/text/generation`;
  }

  /**
   * Generate text with automatic retry logic
   */
  async generate(options: GenerateOptions): Promise<string> {
    const { prompt, maxTokens = 2048, temperature = 0.7, stopSequences = [] } = options;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}?version=2023-05-29`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model_id: this.model,
            input: prompt,
            parameters: {
              max_new_tokens: maxTokens,
              temperature,
              stop_sequences: stopSequences,
              repetition_penalty: 1.1,
              decoding_method: 'greedy',
            },
            project_id: this.projectId,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Watsonx API error: ${response.status} - ${error}`);
        }

        const data: WatsonxResponse = await response.json();
        return data.results[0]?.generated_text || '';
      } catch (error) {
        if (attempt === this.maxRetries - 1) throw error;
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt)));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Generate with streaming support for real-time updates
   */
  async *generateStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, maxTokens = 2048, temperature = 0.7, stopSequences = [] } = options;

    const response = await fetch(`${this.baseUrl}_stream?version=2023-05-29`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model_id: this.model,
        input: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          temperature,
          stop_sequences: stopSequences,
          repetition_penalty: 1.1,
          decoding_method: 'greedy',
        },
        project_id: this.projectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Watsonx streaming error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.results?.[0]?.generated_text) {
                yield parsed.results[0].generated_text;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Batch generate multiple prompts efficiently
   */
  async generateBatch(prompts: string[], options: Omit<GenerateOptions, 'prompt'> = {}): Promise<string[]> {
    const results = await Promise.all(
      prompts.map(prompt => this.generate({ ...options, prompt }))
    );
    return results;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.generate({ 
        prompt: 'Test', 
        maxTokens: 10,
        temperature: 0 
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance with environment configuration
 */
let watsonxInstance: WatsonxClient | null = null;

export function getWatsonxClient(): WatsonxClient {
  if (!watsonxInstance) {
    const apiKey = process.env.WATSONX_API_KEY;
    const projectId = process.env.WATSONX_PROJECT_ID;
    
    if (!apiKey || !projectId) {
      throw new Error('WATSONX_API_KEY and WATSONX_PROJECT_ID must be set');
    }

    watsonxInstance = new WatsonxClient({
      apiKey,
      projectId,
      region: process.env.WATSONX_REGION,
      model: process.env.WATSONX_MODEL,
    });
  }

  return watsonxInstance;
}

// Made with Bob
