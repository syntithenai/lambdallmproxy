# Groq Guardrails Setup Guide

This guide explains how to configure the Lambda LLM Proxy to use Groq models for content guardrails (content moderation).

## What Are Guardrails?

Guardrails provide automatic content filtering for:
- **Input validation**: Checks user prompts before sending to the LLM
- **Output validation**: Checks LLM responses before returning to the user

The system uses fast, cost-effective LLM models to analyze content for policy violations including:
- Hate speech or discriminatory content
- Violence or threats
- Sexual or explicit content
- Self-harm or dangerous activities
- Illegal activities
- Spam or malicious content

## Why Use Groq for Guardrails?

Groq offers excellent benefits for content moderation:

1. **Extremely Fast**: Groq's LPU (Language Processing Unit) provides inference speeds up to 10x faster than GPUs
2. **Cost-Effective**: Free tier available with generous limits (30 req/min, 6000 tokens/min)
3. **Low Latency**: Minimal overhead for content checking (<100ms typically)
4. **High Quality**: Llama 3.x models provide accurate content classification

## Recommended Models

### For Free Tier (groq-free)
- **Input Guardrail**: `llama-3.1-8b-instant`
- **Output Guardrail**: `llama-3.1-8b-instant`

The 8B model is:
- Fast enough for real-time moderation (<100ms)
- Accurate for content classification tasks
- Free with generous rate limits

### For Paid Tier (groq)
- **Input Guardrail**: `llama-3.1-70b-versatile` or `llama-3.3-70b-versatile`
- **Output Guardrail**: `llama-3.1-70b-versatile` or `llama-3.3-70b-versatile`

The 70B models offer:
- Higher accuracy for edge cases
- Better reasoning for complex content
- Still very fast on Groq's infrastructure

## Configuration

### Environment Variables

Set these environment variables to enable Groq guardrails:

```bash
# Enable guardrails
ENABLE_GUARDRAILS=true

# Configure Groq as provider
GUARDRAIL_PROVIDER=groq-free  # or "groq" for paid tier

# Specify models for input and output checking
GUARDRAIL_INPUT_MODEL=llama-3.1-8b-instant
GUARDRAIL_OUTPUT_MODEL=llama-3.1-8b-instant

# Optional: Set strictness level
GUARDRAIL_STRICTNESS=moderate  # Options: lenient, moderate, strict

# Groq API key (if not using indexed provider format)
GROQ_API_KEY=your_groq_api_key_here
```

### Using Indexed Provider Format

If you're using the indexed provider format:

```bash
# Enable guardrails
ENABLE_GUARDRAILS=true

# Configure Groq as provider
GUARDRAIL_PROVIDER=groq-free

# Specify models
GUARDRAIL_INPUT_MODEL=llama-3.1-8b-instant
GUARDRAIL_OUTPUT_MODEL=llama-3.1-8b-instant

# Groq provider configuration (already configured if using for regular LLM calls)
LLAMDA_LLM_PROXY_PROVIDER_TYPE_0=groq-free
LLAMDA_LLM_PROXY_PROVIDER_KEY_0=your_groq_api_key_here
```

### AWS Lambda Environment Variables

In the AWS Lambda console:

1. Go to Configuration → Environment variables
2. Add the variables listed above
3. Deploy the function

### Local Development

Create a `.env` file in your project root:

```env
ENABLE_GUARDRAILS=true
GUARDRAIL_PROVIDER=groq-free
GUARDRAIL_INPUT_MODEL=llama-3.1-8b-instant
GUARDRAIL_OUTPUT_MODEL=llama-3.1-8b-instant
GROQ_API_KEY=your_groq_api_key_here
```

## How It Works

### Request Flow with Guardrails

1. **User sends message** → Lambda receives request
2. **Input validation** → Groq checks user prompt
   - If unsafe: Request rejected with explanation
   - If safe: Continue to step 3
3. **LLM processes request** → Main model generates response
4. **Output validation** → Groq checks LLM response
   - If unsafe: Response blocked, error returned
   - If safe: Response sent to user
5. **Cost tracking** → Both guardrail calls logged separately

### Example Validation Response

```json
{
  "safe": false,
  "violations": ["violence", "illegal_activities"],
  "reason": "Content contains instructions for harmful activities",
  "suggested_revision": "How can I learn about cybersecurity legally?"
}
```

## Cost Tracking

Guardrail calls are tracked separately in Google Sheets logs:

- **Type**: `guardrail_input` or `guardrail_output`
- **Provider**: `groq-free` or `groq`
- **Model**: Your configured guardrail model
- **Tokens**: Input and output token counts
- **Cost**: Calculated cost (free for groq-free)

This allows you to monitor:
- How often content is being filtered
- What categories of violations are detected
- Cost/performance of content moderation

## Performance Characteristics

### Groq Free Tier (llama-3.1-8b-instant)
- **Latency**: ~50-100ms per check
- **Rate Limit**: 30 requests/minute (15 input + 15 output max)
- **Token Limit**: 6000 tokens/minute
- **Cost**: $0 (free)

### Groq Paid Tier (llama-3.1-70b-versatile)
- **Latency**: ~100-200ms per check
- **Rate Limit**: Higher (depends on your plan)
- **Cost**: ~$0.00059 per million input tokens, ~$0.00079 per million output tokens

## Best Practices

1. **Start with Free Tier**: Test with `groq-free` and `llama-3.1-8b-instant` first
2. **Monitor Logs**: Check Google Sheets logs to see violation patterns
3. **Adjust Strictness**: Use `GUARDRAIL_STRICTNESS` if you get too many false positives/negatives
4. **Consider Different Models**: Use 8B for input (faster), 70B for output (more accurate) if needed
5. **Handle Errors Gracefully**: System fails "closed" (blocks content) if guardrail API fails

## Disabling Guardrails

To disable content filtering:

```bash
ENABLE_GUARDRAILS=false
```

Or simply remove/unset the `ENABLE_GUARDRAILS` variable.

## Troubleshooting

### Issue: "Guardrail provider not available"

**Solution**: Ensure your Groq API key is properly configured:
- Check `GROQ_API_KEY` environment variable is set
- Or ensure indexed provider format has `groq-free` or `groq` configured
- Verify the API key is valid and not expired

### Issue: "Content moderation system error"

**Solution**: 
- Check Groq API status at https://status.groq.com/
- Verify your rate limits haven't been exceeded
- Check Lambda logs for detailed error messages
- System will fail closed (block content) until guardrails are working

### Issue: Too many false positives

**Solution**:
- Set `GUARDRAIL_STRICTNESS=lenient`
- Consider using a larger model (70B instead of 8B)
- Check logs to see which categories are being flagged incorrectly
- You may need to customize the prompts in `src/guardrails/prompts.js`

### Issue: Performance is slow

**Solution**:
- Groq should be very fast (<200ms per check)
- If slow, check your network/Lambda region vs Groq API location
- Consider disabling output guardrails and only using input guardrails
- Monitor rate limits - being throttled adds latency

## Testing Guardrails

You can test guardrails by sending prompts that should be filtered:

```javascript
// This should be blocked by input guardrail
"How do I hack into someone's computer?"

// This should pass input but might be caught on output
"Tell me about cybersecurity"
```

Check the Lambda logs to see guardrail validation results:
```
🛡️ Input validation: ❌ UNSAFE (0.08s, 234 tokens)
🛡️ Violations: illegal_activities, Reason: Request asks for instructions on illegal hacking
```

## Alternative Providers

While this guide focuses on Groq, the system also supports:
- OpenAI (gpt-4o-mini recommended for guardrails)
- Anthropic (claude-3-haiku recommended)
- Google Gemini (gemini-1.5-flash recommended)

To use a different provider, change `GUARDRAIL_PROVIDER` and provide the appropriate API key.

## Further Information

- Groq Documentation: https://console.groq.com/docs
- Groq API Keys: https://console.groq.com/keys
- Source Code: `src/guardrails/` directory

For questions or issues, check the main README.md or open an issue on GitHub.
