# IBM watsonx AI Integration Guide

## Overview

PatchPilot now uses **IBM watsonx AI** for intelligent incident analysis, replacing the mock reasoning system with real AI-powered investigation.

## Features

✅ **Multi-Hypothesis Generation**: AI analyzes stack traces and generates 3-5 hypotheses  
✅ **Evidence-Based Elimination**: Systematically eliminates incorrect hypotheses  
✅ **Root Cause Analysis**: Identifies the exact cause with confidence scoring  
✅ **Surgical Fix Generation**: Creates minimal, production-ready patches  
✅ **Regression Test Generation**: Automatically generates test cases  
✅ **Defensive Improvements**: Suggests preventive measures  
✅ **Graceful Fallback**: Falls back to mock data if AI unavailable  

---

## Setup Instructions

### 1. Get IBM watsonx Credentials

1. Go to [IBM Cloud](https://cloud.ibm.com/)
2. Create an account or sign in
3. Navigate to **Catalog** → **AI / Machine Learning** → **watsonx.ai**
4. Create a new watsonx.ai instance
5. Create a new project in watsonx.ai
6. Get your credentials:
   - **API Key**: From IBM Cloud IAM (Manage → Access (IAM) → API keys)
   - **Project ID**: From your watsonx.ai project settings

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your credentials:

```env
WATSONX_API_KEY=your_actual_api_key_here
WATSONX_PROJECT_ID=your_actual_project_id_here
WATSONX_REGION=us-south
WATSONX_MODEL=ibm/granite-13b-chat-v2
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

```bash
npm run dev
```

The app will automatically use AI if credentials are configured, otherwise it falls back to mock data.

---

## Architecture

### AI Pipeline Flow

```
Stack Trace Input
      ↓
[1] Context Extraction
    - Parse error message
    - Extract file paths
    - Load dependency graph
      ↓
[2] Hypothesis Generation (AI)
    - Analyze error patterns
    - Consider graph structure
    - Generate 3-5 hypotheses
    - Assign confidence scores
      ↓
[3] Hypothesis Elimination (AI)
    - Evaluate each hypothesis
    - Find contradicting evidence
    - Eliminate incorrect ones
    - Keep highest confidence
      ↓
[4] Root Cause Analysis (AI)
    - Detailed explanation
    - Evidence collection
    - Affected files identification
      ↓
[5] Fix Generation (AI)
    - Surgical patch creation
    - Unified diff format
    - Risk assessment
      ↓
[6] Test Generation (AI)
    - Regression tests
    - Edge case coverage
    - Jest/TypeScript format
      ↓
[7] Defensive Improvements (AI)
    - Preventive measures
    - Best practices
    - Monitoring suggestions
      ↓
PR Package Ready
```

---

## API Reference

### WatsonxClient

```typescript
import { getWatsonxClient } from '@/lib/ai/watsonx-client';

const client = getWatsonxClient();

// Generate text
const response = await client.generate({
  prompt: 'Your prompt here',
  maxTokens: 2048,
  temperature: 0.7,
  stopSequences: ['###'],
});

// Stream generation
for await (const chunk of client.generateStream({ prompt: '...' })) {
  console.log(chunk);
}

// Batch generation
const results = await client.generateBatch([
  'Prompt 1',
  'Prompt 2',
  'Prompt 3',
]);

// Health check
const isHealthy = await client.healthCheck();
```

### AIReasoningEngine

```typescript
import { getReasoningEngine } from '@/lib/ai/reasoning-engine';

const engine = getReasoningEngine();

// Run full investigation
const result = await engine.investigate(
  stackTrace,
  (step) => {
    console.log('Step:', step.message);
  }
);

// Result contains:
// - hypotheses: Hypothesis[]
// - eliminations: Elimination[]
// - finalHypothesis: Hypothesis
// - rootCause: RootCause
// - defensiveImprovements: string[]
// - tests: string
// - steps: InvestigationStep[]
```

---

## Prompt Engineering

### System Prompt

The AI is instructed to:
- Be systematic (generate → eliminate → conclude)
- Be evidence-based (every claim needs proof)
- Be precise (reference specific files/lines)
- Be explainable (clear reasoning at each step)
- Be practical (production-ready fixes)

### Prompt Templates

Located in [`lib/ai/prompts.ts`](../lib/ai/prompts.ts):

1. **`buildHypothesisPrompt`**: Generates hypotheses from stack trace
2. **`buildEliminationPrompt`**: Eliminates incorrect hypotheses
3. **`buildRootCausePrompt`**: Analyzes root cause and generates fix
4. **`buildDefensivePrompt`**: Suggests preventive improvements
5. **`buildTestGenerationPrompt`**: Creates regression tests

### Customizing Prompts

Edit the prompt templates in `lib/ai/prompts.ts` to:
- Add domain-specific knowledge
- Include company coding standards
- Adjust output format
- Add additional validation rules

---

## Performance Optimization

### Low Latency Strategies

1. **Parallel Processing**: Hypotheses generated in parallel where possible
2. **Streaming**: Real-time updates via SSE
3. **Caching**: Graph data cached to avoid recomputation
4. **Retry Logic**: Automatic retry with exponential backoff
5. **Fallback**: Instant fallback to mock data if AI fails

### Token Budget Management

```typescript
// Hypothesis generation: ~1500 tokens
// Elimination: ~1500 tokens
// Root cause: ~2048 tokens
// Tests: ~2048 tokens
// Total: ~7000 tokens per investigation
```

### Response Times

- **With AI**: 8-15 seconds (depends on model)
- **Fallback**: <1 second (mock data)
- **Streaming**: First token in ~2 seconds

---

## Error Handling

### Graceful Degradation

```typescript
try {
  // Try AI-powered investigation
  const result = await engine.investigate(input);
} catch (error) {
  console.warn('AI failed, using fallback:', error);
  // Automatically falls back to mock data
  const result = generateMockInvestigation(input);
}
```

### Common Issues

**Issue**: `WATSONX_API_KEY not set`  
**Solution**: Add credentials to `.env.local`

**Issue**: `401 Unauthorized`  
**Solution**: Verify API key is correct and not expired

**Issue**: `429 Rate Limit`  
**Solution**: Implement request throttling or upgrade plan

**Issue**: `Timeout`  
**Solution**: Increase timeout or use streaming

---

## Testing

### Unit Tests

```bash
npm test lib/ai/
```

### Integration Tests

```bash
# Test with real AI
WATSONX_API_KEY=xxx npm test -- --integration

# Test fallback behavior
npm test -- --no-ai
```

### Manual Testing

```bash
# Force AI mode
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"incident": "TypeError: ...", "useAI": true}'

# Force mock mode
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"incident": "TypeError: ...", "useAI": false}'
```

---

## Cost Estimation

### IBM watsonx Pricing

- **Granite 13B**: ~$0.0005 per 1K tokens
- **Average investigation**: ~7K tokens
- **Cost per investigation**: ~$0.0035

### Monthly Estimates

| Investigations/Month | Cost |
|---------------------|------|
| 100 | $0.35 |
| 1,000 | $3.50 |
| 10,000 | $35.00 |
| 100,000 | $350.00 |

---

## Production Deployment

### Environment Variables (Vercel)

```bash
vercel env add WATSONX_API_KEY
vercel env add WATSONX_PROJECT_ID
vercel env add WATSONX_REGION
vercel env add WATSONX_MODEL
```

### Monitoring

Add monitoring for:
- AI request latency
- Token usage
- Error rates
- Fallback frequency
- Cost tracking

### Rate Limiting

Implement rate limiting to control costs:

```typescript
// Example: 100 requests per hour per user
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
});
```

---

## Troubleshooting

### Debug Mode

Enable debug logging:

```typescript
// In watsonx-client.ts
console.log('Request:', { prompt, parameters });
console.log('Response:', response);
```

### Health Check Endpoint

```bash
curl http://localhost:3000/api/health
```

### Logs

Check application logs for AI errors:

```bash
vercel logs
# or
npm run dev
```

---

## Future Enhancements

- [ ] Fine-tune models on company-specific incidents
- [ ] Add support for multiple LLM providers (OpenAI, Anthropic)
- [ ] Implement feedback loop for continuous improvement
- [ ] Add A/B testing for prompt variations
- [ ] Create custom models for specific tech stacks
- [ ] Add multi-language support
- [ ] Implement semantic code search with embeddings

---

## Support

- **Documentation**: [IBM watsonx Docs](https://www.ibm.com/docs/en/watsonx-as-a-service)
- **Community**: [IBM Developer Community](https://community.ibm.com/)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)

---

## License

MIT License - See LICENSE file for details