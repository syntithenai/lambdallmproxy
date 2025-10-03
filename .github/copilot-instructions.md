# GitHub Copilot Instructions 

This document provides comprehensive instructions for GitHub Copilot to effectively assist in the development of the project.



## 1. Core Project Directives & Workflow

### 1.1. Deployment and Build Process

- **Lambda Deployment**: After any modification to the backend source code in `src/`, you MUST deploy the Lambda function using the `scripts/deploy.sh` script.
- **UI/Documentation Workflow**:
    1.  **Source of Truth**: All UI and documentation changes MUST be made in the `ui/` directory (e.g., `ui/index_template.html`, `ui/styles.css`).
    2.  **NEVER Edit `docs/` Directly**: The `docs/` directory is a build artifact and should not be edited manually. Its contents are generated from the `ui/` directory.
    3.  **Build Step**: After making changes in `ui/`, you MUST run `scripts/build-docs.sh` to compile the changes into the `docs/` directory.
    4.  **Deploy Docs**: After a successful build, you MUST run `scripts/deploy-docs.sh` to publish the documentation and UI changes.
    5.  **Combined Command**: The `make deploy-docs` command conveniently runs both the build and deploy steps.
- **Build After Code Changes**: After ANY code modification to files in `src/`, `ui/`, or configuration files, you MUST execute the appropriate build process:
    - **Backend Changes** (`src/`): Run `scripts/deploy.sh` to deploy the Lambda function
    - **Frontend Changes** (`ui/`): Run `scripts/build-docs.sh` to build the UI into `docs/`
    - **Test Changes** (`tests/`): Run `npm test` to verify tests pass
    - This ensures that changes are properly compiled, validated, and ready for deployment
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
