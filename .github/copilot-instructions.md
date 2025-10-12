# GitHub Copilot Instructions 

This document provides comprehensive instructions for GitHub Copilot to effectively assist in the development of the project.

## 0. Documentation Organization

### 0.1. Developer Log

- **Location**: All development documentation, implementation logs, and technical notes MUST be created in the `developer_log/` directory.
- **Exception**: Only `README.md` should remain in the project root.
- **Naming Convention**: Use descriptive uppercase names with underscores, e.g., `FEATURE_MEMORY_TRACKING.md`, `FIX_ENDPOINT_SYNC.md`, `IMPLEMENTATION_PROVIDER_INTEGRATION.md`
- **Organization**: Group related documents by topic when creating new files:
  - Features: `FEATURE_*.md`
  - Fixes: `FIX_*.md`
  - Implementation: `IMPLEMENTATION_*.md`
  - Deployment: `DEPLOYMENT_*.md`
  - Architecture: `ARCHITECTURE_*.md`
- **Cross-References**: When referencing other documentation, use relative paths: `See developer_log/FEATURE_MEMORY_TRACKING.md`

## 1. Core Project Directives & Workflow

### 1.1. Security and Secret Management

- **⚠️ CRITICAL: Pre-Commit Secret Check**: Before committing ANY changes, you MUST check for exposed secrets:
    1.  **Manual Review**: Scan all modified files for API keys, tokens, passwords, or credentials
    2.  **Pattern Check**: Look for common secret patterns:
        - API keys starting with: `sk-`, `gsk_`, `AIza`, `AKIA`, `ya29.`
        - Bearer tokens, OAuth tokens, JWT tokens
        - Database connection strings with passwords
        - Private keys (RSA, SSH, PGP)
    3.  **File Review**: Pay special attention to:
        - Any `.js` or `.ts` files with "init", "setup", "config" in the name
        - `.env` files (should NEVER be committed)
        - Test files with hardcoded credentials
        - Documentation with example credentials (use placeholders like `YOUR_API_KEY_HERE`)
    4.  **Verification**: Run `git diff --cached` before committing to review exactly what will be committed
- **Never Commit**:
    - `.env` files (already in `.gitignore`)
    - Files matching patterns in `.gitignore` (e.g., `SETUP_UI_PROVIDERS.js`, `ui-client-init*.js`)
    - Any file containing real API keys or credentials
- **Safe Practices**:
    - Use environment variables for secrets (`.env` for local, Lambda environment for production)
    - Use placeholder values in example/template files (e.g., `.env.example`)
    - Redact secrets in logs and documentation with `[REDACTED]` or `***`
    - If a secret is accidentally committed, immediately rewrite git history and revoke the exposed credential

### 1.2. Deployment and Build Process

- **Mandatory**: After completing any code or documentation changes, run the appropriate deployment command before finishing the task (e.g., `make deploy-lambda-fast` for backend updates, `make deploy-ui` for UI changes).

#### Lambda Function Deployment

- **⚡ Fast Deployment** (RECOMMENDED): After modifying backend code in `src/`:
    1.  **First Time Setup**: Run `make setup-layer` once to create Lambda Layer with dependencies (~2 minutes, one-time)
    2.  **Code Changes**: Run `make deploy-lambda-fast` to deploy code only (~10 seconds)
    3.  **Dependency Changes**: If `package.json` changed, run `make deploy-lambda` for full deployment (~2-3 minutes)
- **Script Details**:
    - `scripts/deploy.sh` - Full Lambda deployment with dependencies (called by `make deploy-lambda`)
    - `scripts/deploy-fast.sh` - Fast Lambda deployment, code only (called by `make deploy-lambda-fast`)
    - `scripts/deploy-layer.sh` - Creates Lambda Layer with dependencies (called by `make setup-layer`)

#### UI/Documentation Deployment

- **Source of Truth**: All UI changes MUST be made in `ui-new/src/` - this is a React/TypeScript/Vite application
- **NEVER Edit `docs/` Directly**: The `docs/` directory is a build artifact generated from `ui-new/`
- **⚠️ CRITICAL: Always Build Before Deploy**: The `make deploy-ui` command automatically builds the UI before deploying. NEVER manually run `make build-ui` followed by `make deploy-ui` as this causes double builds.
- **Build and Deploy**:
    1.  **Deploy UI**: Run `make deploy-ui` to build React app and push to GitHub Pages (includes automatic build)
    2.  **Build Only** (rare): Run `make build-ui` to build React app into `docs/` directory without deploying
    3.  **Development Mode**: Use `cd ui-new && npm run dev` for hot reloading
- **Script Details**:
    - `scripts/build-docs.sh` - Builds React UI from `ui-new/` to `docs/` (called by `make build-ui` and `make deploy-ui`)
    - `scripts/deploy-docs.sh` - Commits and pushes `docs/` to GitHub (called by `make deploy-ui`, which calls build-docs.sh first)

#### Environment Variables Deployment

- **⚠️ CRITICAL**: Environment variables in `.env` are LOCAL ONLY and NOT automatically uploaded to Lambda
- **Required Action**: After modifying `.env` file, you MUST run `make deploy-env` to sync variables to Lambda
- **When to Deploy**:
    1.  **After changing any environment variable** in `.env` file
    2.  **After adding new environment variables** that the backend code uses
    3.  **When troubleshooting** issues related to configuration (e.g., API keys, feature flags)
- **Script Details**:
    - `scripts/deploy-env.sh` - Reads `.env` and updates Lambda environment variables via AWS CLI
    - Variables are parsed, validated, and uploaded to AWS Lambda Console programmatically
    - Sensitive values (API keys, secrets) are displayed as `[REDACTED]` during deployment
- **Environment Files**:
    - `.env` - Your actual configuration (NEVER commit to git, already in .gitignore)
    - `.env.example` - Template with empty/demo values (safe to commit)
    - `.env.backup.*` - Automatic backups created when updating `.env`

#### Quick Reference

```bash
# Lambda Function
make deploy-lambda           # Full deployment with dependencies
make deploy-lambda-fast      # Fast deployment (code only)
make setup-layer             # Create dependencies layer (run once)
make deploy-env              # Deploy environment variables from .env to Lambda

# UI/Documentation  
make build-ui                # Build React UI to docs/
make deploy-ui               # Build and push to GitHub Pages

# Debugging
make logs                    # View recent CloudWatch logs (last 5 minutes)
make logs-tail               # Tail CloudWatch logs in real-time

# Combined
make all                     # Deploy both Lambda and UI
```
- **Testing**: When testing the Lambda function, ensure all required parameters, including the API key, are provided, unless a test specifically requires their omission.
- **Debugging**: Always check CloudWatch logs using `make logs` after deployment to verify function behavior and catch errors.

### 1.3. Terminal Command Execution

- **Output Redirection**: When you run a terminal command, you MUST redirect its output to a file named `output.txt`. Overwrite the file for each new command to prevent it from growing too large.
    - Example: `ls -l > output.txt`
- **Reading Command Output**: You MUST read the `output.txt` file to see the results of your commands. This is a workaround for a known issue where direct command output is not reliably read.

### 1.4. Local Development Server

- **Port**: The local development server MUST run on port **8081**.
- **Commands**:
    - `cd docs && python3 -m http.server 8081`
- **Access**: The local application is available at `http://localhost:8081`.


### 1.5. Test-Driven Development (TDD)

- **New Features**: When a new feature is requested, you MUST first create a test for that feature.
- **Iteration**: You MUST iterate on the implementation until the test passes. This ensures that all new functionality is covered by tests and helps prevent regressions.
- **Existing Features**: When modifying existing features, you MUST first run the existing tests to ensure that your changes do not break existing functionality. If the changes are significant, you should create new tests to cover the new functionality.
- **Test Location**: All tests are located in the `tests/` directory. Unit tests are in `tests/unit/` and integration tests are in `tests/integration/`.
- **Running Tests**: Use the `npm test` command to run all tests. You can also run specific tests by providing the path to the test file, e.g., `npm test tests/unit/auth.test.js`.
- **Test-First Workflow**:
    1.  **Write a failing test**: Before writing any implementation code, write a test that asserts the desired behavior of the new feature.
    2.  **Run the test**: Confirm that the test fails as expected.
    3.  **Write the implementation**: Write the minimum amount of code required to make the test pass.
    4.  **Run the test again**: Confirm that the test now passes.
    5.  **Refactor**: Refactor the code as needed, ensuring that the test continues to pass.

## 2. Code and Architecture

### 2.1. Project Overview

This is a serverless AWS Lambda function that acts as an LLM proxy. It features web search capabilities, streaming responses, and a continuation mechanism to handle API rate limits. It integrates multiple LLM providers (Groq, OpenAI) with DuckDuckGo search and provides tools for JavaScript execution and web scraping.

### 2.2. Key Architectural Components

- **Entry Point**: `src/index.js` (Lambda handler with streaming support)
- **Frontend**: `docs/` (Generated static files for the user interface)

### 2.3. Important Implementation Details

- **Memory Management**: A `TokenAwareMemoryTracker` is used to monitor and control token usage. Content is aggressively truncated to prevent memory overflow.
- **Security**: All tool parameters are validated against schemas. HTML from web scraping is sanitized. Google OAuth tokens are verified for all authenticated requests.

## 3. Testing

### 3.1. Running Tests

- **All Tests**: `npm test`
- **Coverage**: `npm test:coverage`
- **Watch Mode**: `npm test:watch`
- **Debug Mode**: `DEBUG_TESTS=1 npm test`

### 3.2. Test Structure

- **Unit**: `tests/unit/` (Isolate individual modules)
- **Integration**: `tests/integration/` (Test the Lambda handler end-to-end)
- **Fixtures**: `tests/fixtures/` (Mock data)
- **Helpers**: `tests/helpers/` (Test utilities)

### 3.3. Test Authoring Guidelines

- **Mock Dependencies**: Always mock external APIs (LLMs, Search), AWS services, and file system operations.
- **Focus Areas**:
    - **Authentication**: Token verification and email validation.
    - **Rate Limiting**: Correct state preservation and recovery on continuation.
    - **Tool Execution**: Parameter validation and error handling.
    - **Search**: Query processing and result parsing.
    - **Memory Safety**: No memory leaks or overflow conditions.

---
