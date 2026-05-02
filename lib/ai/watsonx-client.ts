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

  // IAM Token caching
  private iamToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: WatsonxConfig) {
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
    this.model = config.model || 'meta-llama/llama-3-3-70b-instruct';

    const region = config.region || 'eu-de';
    this.baseUrl = `https://${region}.ml.cloud.ibm.com/ml/v1/text/generation`;
  }

  /**
   * Get IBM IAM Access Token
   * Exchanges the API key for a bearer token
   */
  private async getIAMToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.iamToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.iamToken;
    }

    try {
      const response = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
          apikey: this.apiKey,
        }).toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`IAM Token exchange failed: ${response.status} - ${error}`);
      }

      const data = await response.json();
      this.iamToken = data.access_token;
      // expires_in is in seconds, convert to absolute timestamp
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);

      return this.iamToken!;
    } catch (error) {
      console.error('Error fetching IAM token:', error);
      throw error;
    }
  }

  /**
   * Generate text with automatic retry logic and IAM auth
   */
  async generate(options: GenerateOptions): Promise<string> {
    const { prompt, maxTokens = 2048, temperature = 0.7, stopSequences = [] } = options;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const token = await this.getIAMToken();
        const response = await fetch(`${this.baseUrl}?version=2023-05-29`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
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

        if (response.status === 401) {
          // Token might have expired unexpectedly, clear cache and retry
          this.iamToken = null;
          this.tokenExpiresAt = 0;
          continue;
        }

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
   * Generate with streaming support and IAM auth
   */
  async *generateStream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, maxTokens = 2048, temperature = 0.7, stopSequences = [] } = options;

    const token = await this.getIAMToken();
    const response = await fetch(`${this.baseUrl}_stream?version=2023-05-29`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
      if (response.status === 401) {
        this.iamToken = null;
        this.tokenExpiresAt = 0;
      }
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
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;

  if (!watsonxInstance) {
    if (!apiKey || !projectId) {
      console.warn('WATSONX_API_KEY or WATSONX_PROJECT_ID missing. AI features will use mock fallbacks.');
      // Return a client that always fails so fallbacks trigger, or we could implement a NullClient
    }

    watsonxInstance = new WatsonxClient({
      apiKey: apiKey || 'mock',
      projectId: projectId || 'mock',
      region: process.env.WATSONX_REGION,
      model: process.env.WATSONX_MODEL,
    });
  }

  return watsonxInstance;
}

// Made with Bob
