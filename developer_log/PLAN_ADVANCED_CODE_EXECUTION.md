# Plan: Advanced Code Execution

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: HIGH (User-requested feature)  
**Estimated Implementation Time**: 2-3 weeks

## Executive Summary

This plan outlines the implementation of advanced code execution capabilities, primarily focusing on **Python interpreter integration** with support for package management, file I/O, and secure sandboxing. The current system only supports basic JavaScript execution via the `execute_javascript` tool, which is limited and poses security risks.

## Current State Analysis

### Existing Code Execution (`execute_javascript`)

**Location**: `src/tools/execute_javascript.js`

**Capabilities**:
- Basic JavaScript execution in isolated VM context
- Timeout protection (5 seconds)
- Console output capture
- Return value extraction

**Limitations**:
- ❌ No Python support (most common data science language)
- ❌ No package installation (npm, pip)
- ❌ No file system access
- ❌ No persistent state between executions
- ❌ Limited to synchronous code
- ❌ Security concerns (VM escape possible)

**Current Usage**:
```javascript
{
  "tool": "execute_javascript",
  "code": "const result = 2 + 2; console.log(result); result;"
}
// Returns: { output: "4", result: 4 }
```

## Requirements

### Functional Requirements

1. **Python Execution**:
   - Execute arbitrary Python code snippets
   - Support Python 3.10+
   - Capture stdout, stderr, and return values
   - Handle async/await patterns

2. **Package Management**:
   - Install pip packages on-demand
   - Support requirements.txt format
   - Whitelist common packages (numpy, pandas, matplotlib, requests, etc.)
   - Cache installed packages between executions

3. **File System Access**:
   - Read/write files in isolated sandbox
   - Upload files from user
   - Download generated files (images, CSV, etc.)
   - Temporary storage with auto-cleanup

4. **Persistent State**:
   - Save execution context between runs
   - Share variables across multiple code cells
   - Session management (1-hour TTL)

5. **Security**:
   - Isolated execution environment
   - Network access restrictions
   - CPU/memory limits
   - Timeout enforcement (30 seconds default)

### Non-Functional Requirements

1. **Performance**:
   - Cold start < 3 seconds
   - Warm execution < 500ms
   - Package installation < 10 seconds

2. **Scalability**:
   - Support 100+ concurrent users
   - Auto-scaling based on demand
   - Cost-effective at scale

3. **Reliability**:
   - 99.5% uptime
   - Graceful degradation on errors
   - Comprehensive error messages

## Solution Comparison

### Option 1: E2B (Recommended)

**Website**: https://e2b.dev  
**Description**: Managed code execution sandboxes with first-class Python support

#### Pros
- ✅ **Fully managed** - No infrastructure to maintain
- ✅ **Pre-built Python environment** - NumPy, pandas, matplotlib included
- ✅ **Persistent sandboxes** - Keep state for 1 hour
- ✅ **File system access** - Upload/download files easily
- ✅ **WebSocket streaming** - Real-time output
- ✅ **Official SDK** - npm package `@e2b/sdk`
- ✅ **Security hardened** - Firecracker VM isolation
- ✅ **Fast cold starts** - ~2 seconds

#### Cons
- ❌ **Cost** - $0.10/minute (~$6/hour)
- ❌ **Vendor lock-in** - Proprietary platform
- ❌ **External dependency** - Requires API key

#### Pricing
- Free tier: 100 minutes/month
- Pro: $20/month (200 minutes) + $0.10/min overage
- Team: $100/month (1000 minutes) + $0.08/min overage

**Cost estimate** (100 users, avg 5 min/user/month):
- Monthly usage: 500 minutes
- Cost: $20 + (300 × $0.10) = $50/month

#### Implementation Complexity
- **Low** - SDK handles most complexity
- Integration time: 2-3 days
- Code example:
```javascript
const { Sandbox } = require('@e2b/sdk');

const sandbox = await Sandbox.create();
const result = await sandbox.runCode('python', 'print(2 + 2)');
console.log(result.stdout); // "4"
await sandbox.close();
```

### Option 2: Modal.com

**Website**: https://modal.com  
**Description**: Serverless Python execution with container support

#### Pros
- ✅ **True serverless** - Pay per second
- ✅ **Container support** - Custom Docker images
- ✅ **GPU support** - For ML workloads
- ✅ **Generous free tier** - $30/month credits
- ✅ **Fast execution** - Hot containers
- ✅ **Python-native** - Built for Python

#### Cons
- ❌ **More complex setup** - Requires Modal function definitions
- ❌ **Limited state** - Functions are stateless
- ❌ **Learning curve** - New abstraction model
- ❌ **Cold starts** - ~5 seconds for containers

#### Pricing
- Free tier: $30/month credits
- Compute: $0.0003/second (~$1.08/hour)
- GPU: $0.0006-0.004/second

**Cost estimate** (100 users, avg 5 min/user/month):
- Monthly usage: 500 minutes = 30,000 seconds
- Cost: 30,000 × $0.0003 = $9/month

#### Implementation Complexity
- **Medium** - Requires Modal app setup
- Integration time: 5-7 days
- Code example:
```python
# modal_app.py
import modal
stub = modal.Stub("code-executor")

@stub.function()
def execute_python(code: str):
    exec_globals = {}
    exec(code, exec_globals)
    return exec_globals.get('result')

# backend.js
const result = await stub.execute_python.call(userCode);
```

### Option 3: AWS Lambda Layers (Python Runtime)

**Website**: https://docs.aws.amazon.com/lambda/latest/dg/python-layers.html  
**Description**: Run Python in AWS Lambda using custom layers

#### Pros
- ✅ **No additional cost** - Uses existing Lambda
- ✅ **Full control** - Custom layer packages
- ✅ **AWS native** - No external dependencies
- ✅ **Security** - AWS security model
- ✅ **Scalability** - Lambda auto-scaling

#### Cons
- ❌ **512MB package limit** - Limited Python packages
- ❌ **15-minute max execution** - Timeout restrictions
- ❌ **No persistent state** - Stateless execution
- ❌ **Complex setup** - Layer creation and management
- ❌ **Cold starts** - ~3 seconds for Python runtime

#### Pricing
- **Free** - Included in Lambda pricing
- Only pay for Lambda execution time

**Cost estimate**:
- Marginal cost: $0 (within free tier)

#### Implementation Complexity
- **High** - Complex layer management
- Integration time: 10-14 days
- Code example:
```javascript
// src/tools/execute_python.js
const { spawnSync } = require('child_process');

const result = spawnSync('python3', ['-c', code], {
  timeout: 30000,
  maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, PYTHONPATH: '/opt/python' }
});
```

### Comparison Matrix

| Feature | E2B | Modal.com | Lambda Layers |
|---------|-----|-----------|---------------|
| **Setup Complexity** | ⭐ Low | ⭐⭐ Medium | ⭐⭐⭐ High |
| **Cost (100 users)** | $50/mo | $9/mo | $0/mo |
| **Package Support** | ⭐⭐⭐ Excellent | ⭐⭐⭐ Excellent | ⭐ Limited (512MB) |
| **File I/O** | ⭐⭐⭐ Native | ⭐⭐ S3 required | ⭐⭐ S3 required |
| **Persistent State** | ⭐⭐⭐ 1-hour sessions | ⭐ None | ⭐ None |
| **Cold Start** | ⭐⭐⭐ 2s | ⭐⭐ 5s | ⭐⭐ 3s |
| **Security** | ⭐⭐⭐ Firecracker VMs | ⭐⭐⭐ gVisor | ⭐⭐ Lambda sandbox |
| **Vendor Lock-in** | ⭐ High | ⭐⭐ Medium | ⭐⭐⭐ Low (AWS) |
| **GPU Support** | ❌ No | ✅ Yes | ❌ No |
| **WebSocket Streaming** | ✅ Yes | ⭐⭐ Polling | ❌ No |

### Recommendation

**Primary**: **E2B** for MVP and initial launch
- Best developer experience
- Fastest time to market
- Excellent for user-facing features
- Acceptable cost at current scale

**Future Migration**: **Modal.com** when scale increases
- 5x cheaper than E2B
- Better for background processing
- GPU support for ML workloads
- More control over environment

**Fallback**: **Lambda Layers** for basic Python only
- Zero additional cost
- Good for simple calculations
- Limited package support
- No persistent state

## Implementation Plan

### Phase 1: MVP with E2B (Week 1-2)

#### Step 1: Setup E2B Account
1. Sign up at https://e2b.dev
2. Create API key
3. Add to `.env`: `E2B_API_KEY=your_key_here`
4. Install SDK: `npm install @e2b/sdk`

#### Step 2: Create `execute_python` Tool
**File**: `src/tools/execute_python.js`

```javascript
const { Sandbox } = require('@e2b/sdk');

async function executePython({ code, packages = [], timeout = 30000 }) {
  let sandbox;
  try {
    // Create sandbox with Python 3.10
    sandbox = await Sandbox.create({
      template: 'base', // or custom template with pre-installed packages
      timeout: timeout / 1000, // Convert to seconds
    });

    // Install packages if requested
    if (packages.length > 0) {
      const installCmd = `pip install ${packages.join(' ')}`;
      await sandbox.commands.run(installCmd);
    }

    // Execute Python code
    const result = await sandbox.runCode('python', code);

    return {
      success: !result.error,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      error: result.error || null,
      exitCode: result.exitCode || 0,
    };
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error.message,
      error: error.message,
      exitCode: 1,
    };
  } finally {
    if (sandbox) {
      await sandbox.close();
    }
  }
}

module.exports = { executePython };
```

#### Step 3: Register Tool in Chat Endpoint
**File**: `src/endpoints/chat.js`

Add to tool definitions:
```javascript
{
  type: 'function',
  function: {
    name: 'execute_python',
    description: 'Execute Python code in a secure sandbox. Supports numpy, pandas, matplotlib, and other common packages.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The Python code to execute',
        },
        packages: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of pip packages to install (e.g., ["numpy", "matplotlib"])',
        },
        timeout: {
          type: 'number',
          description: 'Maximum execution time in milliseconds (default: 30000)',
          default: 30000,
        },
      },
      required: ['code'],
    },
  },
}
```

#### Step 4: Add File Upload Support
**Enhancement**: Support file uploads in Python execution

```javascript
async function executePythonWithFiles({ code, packages, files = [], timeout }) {
  const sandbox = await Sandbox.create();

  // Upload files to sandbox
  for (const file of files) {
    await sandbox.files.write(file.name, file.content);
  }

  // Execute code
  const result = await sandbox.runCode('python', code);

  // Download generated files (optional)
  const outputFiles = await sandbox.files.list('/output');
  const downloads = await Promise.all(
    outputFiles.map(f => sandbox.files.read(f.path))
  );

  await sandbox.close();

  return {
    ...result,
    files: downloads,
  };
}
```

### Phase 2: Package Whitelisting & Caching (Week 2)

#### Security: Whitelist Common Packages
**File**: `src/utils/python-packages.js`

```javascript
const ALLOWED_PACKAGES = [
  // Data Science
  'numpy', 'pandas', 'scipy', 'scikit-learn', 'statsmodels',
  // Visualization
  'matplotlib', 'seaborn', 'plotly', 'bokeh',
  // Web & API
  'requests', 'beautifulsoup4', 'httpx', 'fastapi',
  // Utilities
  'python-dateutil', 'pytz', 'pydantic', 'typing-extensions',
  // NLP
  'nltk', 'spacy', 'transformers',
  // Math
  'sympy', 'mpmath',
];

function validatePackages(packages) {
  const invalid = packages.filter(p => !ALLOWED_PACKAGES.includes(p));
  if (invalid.length > 0) {
    throw new Error(`Packages not allowed: ${invalid.join(', ')}`);
  }
  return true;
}
```

#### Optimization: Template-Based Sandboxes
Create custom E2B templates with pre-installed packages:

```bash
# e2b.toml
[template]
name = "research-agent-python"
base = "python-3.10"

[template.packages]
pip = [
  "numpy==1.24.0",
  "pandas==2.0.0",
  "matplotlib==3.7.0",
  "requests==2.31.0",
]
```

Build template:
```bash
e2b template build
```

Use in code:
```javascript
const sandbox = await Sandbox.create({
  template: 'research-agent-python', // Pre-installed packages
});
```

### Phase 3: Persistent Sessions (Week 3)

#### Session Management
**File**: `src/utils/python-sessions.js`

```javascript
const sessions = new Map();

class PythonSession {
  constructor(userId) {
    this.userId = userId;
    this.sandbox = null;
    this.variables = {};
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
  }

  async init() {
    this.sandbox = await Sandbox.create({
      template: 'research-agent-python',
    });
  }

  async execute(code) {
    this.lastUsed = Date.now();
    return await this.sandbox.runCode('python', code);
  }

  async close() {
    if (this.sandbox) {
      await this.sandbox.close();
      this.sandbox = null;
    }
  }

  isExpired() {
    const TTL = 60 * 60 * 1000; // 1 hour
    return Date.now() - this.lastUsed > TTL;
  }
}

async function getSession(userId) {
  if (!sessions.has(userId)) {
    const session = new PythonSession(userId);
    await session.init();
    sessions.set(userId, session);
  }

  const session = sessions.get(userId);
  if (session.isExpired()) {
    await session.close();
    sessions.delete(userId);
    return getSession(userId); // Create new session
  }

  return session;
}

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  for (const [userId, session] of sessions.entries()) {
    if (session.isExpired()) {
      session.close();
      sessions.delete(userId);
    }
  }
}, 10 * 60 * 1000);
```

## UI Integration

### ChatTab Changes

Add Python code execution UI:

```tsx
// In tool result rendering
{toolCall.name === 'execute_python' && (
  <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
    {result.stdout && (
      <div className="text-green-400 whitespace-pre-wrap">
        {result.stdout}
      </div>
    )}
    {result.stderr && (
      <div className="text-red-400 whitespace-pre-wrap">
        {result.stderr}
      </div>
    )}
    {result.files && result.files.length > 0 && (
      <div className="mt-4">
        <p className="text-gray-400 mb-2">Generated files:</p>
        {result.files.map((file, idx) => (
          <a
            key={idx}
            href={`data:${file.mime};base64,${file.content}`}
            download={file.name}
            className="text-blue-400 hover:underline block"
          >
            📄 {file.name}
          </a>
        ))}
      </div>
    )}
  </div>
)}
```

### Example Prompts

**Data Analysis**:
```
"Analyze this CSV data and create a visualization:
[paste CSV or upload file]
Show distribution of ages and income correlation"
```

**Web Scraping**:
```
"Use Python to scrape the top headlines from example.com
and summarize them"
```

**Mathematical Computation**:
```
"Use numpy to calculate eigenvalues of this matrix:
[[1, 2], [3, 4]]"
```

## Security Considerations

### Input Validation
- Sanitize code inputs (escape shell characters)
- Validate package names against whitelist
- Limit code length (max 10KB)
- Rate limit executions (10/minute per user)

### Sandbox Isolation
- E2B uses Firecracker VMs (kernel-level isolation)
- No network access by default
- Filesystem is ephemeral (deleted after session)
- CPU limits: 1 vCPU
- Memory limits: 512MB

### Error Handling
- Never expose E2B API keys in errors
- Sanitize error messages (remove paths, IPs)
- Log suspicious activity (attempts to escape sandbox)

## Cost Optimization

### Strategies
1. **Template caching** - Pre-install common packages
2. **Session reuse** - Keep sandboxes alive for 1 hour
3. **Lazy initialization** - Only create sandbox when needed
4. **Package bundling** - Install multiple packages in one command
5. **Timeout tuning** - Use shorter timeouts for simple code

### Budget Monitoring
```javascript
let monthlyUsage = 0;

function trackUsage(duration) {
  monthlyUsage += duration;
  if (monthlyUsage > 500 * 60 * 1000) { // 500 minutes
    console.warn('⚠️ E2B usage exceeds budget!');
    // Alert admin, switch to fallback, etc.
  }
}
```

## Testing Strategy

### Unit Tests
```javascript
// tests/unit/execute-python.test.js
describe('execute_python', () => {
  it('executes simple Python code', async () => {
    const result = await executePython({ code: 'print(2 + 2)' });
    expect(result.stdout).toBe('4\n');
    expect(result.success).toBe(true);
  });

  it('handles syntax errors', async () => {
    const result = await executePython({ code: 'print(2 +' });
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('SyntaxError');
  });

  it('respects timeout', async () => {
    const result = await executePython({
      code: 'import time; time.sleep(100)',
      timeout: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
});
```

### Integration Tests
```javascript
// tests/integration/python-tool.test.js
describe('Python tool in chat', () => {
  it('LLM can execute Python code', async () => {
    const response = await chatEndpoint({
      messages: [{ role: 'user', content: 'Calculate 5! using Python' }],
      tools: [executePythonTool],
    });

    expect(response.toolCalls).toContainEqual(
      expect.objectContaining({ name: 'execute_python' })
    );
  });
});
```

## Migration Path (E2B → Modal)

### When to Migrate
- Monthly usage > 1000 minutes (~$100/month on E2B)
- Need GPU support for ML workloads
- Require custom environments (specific Python versions)

### Migration Steps
1. Create Modal app with Python function
2. Implement adapter layer (same interface as E2B)
3. A/B test with 10% of traffic
4. Monitor performance and errors
5. Gradual rollout to 100%

## Success Metrics

### Adoption
- **Target**: 20% of users try Python execution in first month
- **Metric**: Unique users calling `execute_python` tool

### Performance
- **Target**: 95th percentile execution time < 3 seconds
- **Metric**: P95 latency from tool call to result

### Reliability
- **Target**: 99% success rate (excluding user code errors)
- **Metric**: Successful executions / total attempts

### Cost Efficiency
- **Target**: < $0.10 per execution (E2B)
- **Metric**: Monthly E2B cost / total executions

## Future Enhancements

### Phase 4: Advanced Features
- [ ] Jupyter notebook integration (`.ipynb` upload/download)
- [ ] Multi-language support (R, Julia, Go)
- [ ] Collaborative sessions (share sandbox between users)
- [ ] Version control for code snippets
- [ ] Package search and autocomplete

### Phase 5: ML/AI Features
- [ ] GPU support via Modal.com
- [ ] Pre-trained model hosting (Hugging Face)
- [ ] Dataset management (upload large datasets)
- [ ] Model training UI (progress tracking)

## Appendix

### E2B SDK Reference
- Docs: https://e2b.dev/docs
- SDK: https://www.npmjs.com/package/@e2b/sdk
- Templates: https://e2b.dev/docs/templates

### Modal.com Reference
- Docs: https://modal.com/docs
- Pricing: https://modal.com/pricing
- Examples: https://github.com/modal-labs/modal-examples

### Alternative Solutions (Not Recommended)
- **RunPod** - GPU-focused, expensive for CPU workloads
- **Replit** - Limited API, designed for interactive use
- **CodeSandbox** - Frontend-focused, no Python support
- **AWS Fargate** - Too slow for code execution (cold starts)

---

**Status**: Ready for implementation  
**Next Step**: Create E2B account and begin Phase 1 MVP  
**Estimated Launch**: 2-3 weeks from start
