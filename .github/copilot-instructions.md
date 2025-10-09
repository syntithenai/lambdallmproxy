# GitHub Copilot Instructions 

This document provides comprehensive instructions for GitHub Copilot to effectively assist in the development of the project.



## 1. Core Project Directives & Workflow

### 1.1. Deployment and Build Process

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

#### Quick Reference

```bash
# Lambda Function
make deploy-lambda           # Full deployment with dependencies
make deploy-lambda-fast      # Fast deployment (code only)
make setup-layer             # Create dependencies layer (run once)

# UI/Documentation  
make build-ui                # Build React UI to docs/
make deploy-ui               # Build and push to GitHub Pages

# Combined
make all                     # Deploy both Lambda and UI
```
- **Testing**: When testing the Lambda function, ensure all required parameters, including the API key, are provided, unless a test specifically requires their omission.

### 1.2. Terminal Command Execution

- **Output Redirection**: When you run a terminal command, you MUST redirect its output to a file named `output.txt`. Overwrite the file for each new command to prevent it from growing too large.
    - Example: `ls -l > output.txt`
- **Reading Command Output**: You MUST read the `output.txt` file to see the results of your commands. This is a workaround for a known issue where direct command output is not reliably read.

### 1.3. Local Development Server

- **Port**: The local development server MUST run on port **8081**.
- **Commands**:
    - `cd docs && python3 -m http.server 8081`
- **Access**: The local application is available at `http://localhost:8081`.


### 1.4. Test-Driven Development (TDD)

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
