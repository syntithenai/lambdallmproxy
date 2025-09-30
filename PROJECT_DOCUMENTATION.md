# Project Documentation for Lambda LLM Proxy

This document is a compilation of various notes, summaries, and workflow descriptions related to the Lambda LLM Proxy project.

---

## 1. README

The Lambda LLM Proxy is a serverless application designed to provide a unified interface to multiple Large Language Models (LLMs). It includes features like web search, response streaming, and robust error handling.

### Core Features:
- **Multi-Provider Support**: Integrates with various LLM providers.
- **Web Search**: Augments LLM responses with real-time web search results.
- **Streaming**: Streams responses to the client for a real-time experience.
- **Continuation**: Handles API rate limits by allowing requests to be continued.
- **Authentication**: Secures the endpoint with Google OAuth.

---

## 2. AI Agent Workflow

This section outlines the workflow for the AI agent, focusing on how it handles complex queries that require web searches and tool execution.

### Key Principles:
- **Iterative Refinement**: The agent starts with a broad plan and refines it based on search results.
- **Tool-First Approach**: When a user query implies a need for external information, the agent defaults to using the `search_web` tool.
- **Structured Responses**: The agent is designed to provide clear, well-structured responses, often using Markdown for formatting.

### Example Workflow:
1.  **Initial Query**: User asks a question requiring current information.
2.  **Tool Selection**: The agent selects the `search_web` tool.
3.  **Search & Analysis**: The agent performs a web search, analyzes the results, and synthesizes the information.
4.  **Response Generation**: The agent generates a response based on the synthesized information, citing sources where appropriate.

---

## 3. Comprehensive Search Enhancements

This document details the evolution of the search functionality, moving from a simple search to a more sophisticated, multi-step process.

### Initial Implementation:
- A single call to the `search_web` tool.
- Limited to the top few results.

### Enhanced Workflow:
- **Multi-Query Generation**: The agent generates multiple search queries to cover different aspects of the user's request.
- **Result Scoring**: Search results are scored for relevance and quality.
- **Content Scraping**: The agent can scrape the content of promising links for more detailed information.
- **Iterative Search**: The agent can perform additional searches based on the information it has gathered.

---

## 4. Copilot UI Workflow

This section describes the process for making changes to the user interface.

### Golden Rule:
- **NEVER edit the `docs/` directory directly.** The `docs/` directory is a build artifact.

### UI Development Process:
1.  **Edit Source Files**: Make all changes to UI files in the `ui/` directory (e.g., `ui/index_template.html`, `ui/styles.css`).
2.  **Build Documentation**: Run `scripts/build-docs.sh` to compile the changes from `ui/` into `docs/`.
3.  **Deploy Documentation**: Run `scripts/deploy-docs.sh` to publish the changes.
4.  **Verify**: Check the live URL to ensure the changes have been deployed correctly.

---

## 5. Deployment Notes

This document contains important information about deploying the Lambda function and the associated documentation.

### Lambda Deployment:
- **Script**: Use `scripts/deploy.sh` to deploy the Lambda function.
- **Environment Variables**: Ensure that all necessary environment variables are set in the Lambda configuration.
- **Permissions**: The Lambda function needs appropriate IAM permissions to access other AWS services.

### Documentation Deployment:
- **Service**: The documentation is hosted on Cloudflare Pages.
- **Deployment**: The `scripts/deploy-docs.sh` script handles the deployment to Cloudflare.

---

## 6. Dynamic Token Allocation

This document describes the system for dynamically allocating tokens to the LLM based on the complexity of the user's query.

### Allocation Levels:
- **Low**: For simple, straightforward queries.
- **Medium**: For queries that may require a single web search.
- **High**: For complex queries that require multiple tool calls and significant analysis.

### Implementation:
- The system uses a set of heuristics to estimate the complexity of a query.
- The token allocation is adjusted on the fly based on the agent's progress.

---

## 7. Google Auth Implementation

This section provides an overview of the Google OAuth implementation used to secure the Lambda function.

### Workflow:
1.  **Frontend**: The user signs in with their Google account on the frontend.
2.  **Token**: The frontend receives a Google ID token.
3.  **Backend**: The frontend sends the ID token to the backend with each request.
4.  **Verification**: The backend verifies the token using Google's public keys.
5.  **Authorization**: The backend checks if the user's email is in the list of authorized users.

### Key Files:
- `src/auth.js`: Contains the token verification logic.
- `docs/js/auth.js`: Handles the frontend authentication flow.

---

## 8. Instructions Compliance

This document tracks the agent's compliance with its operating instructions. It serves as a log of successful and failed attempts to follow the defined workflows.

*This section appears to be a log for internal tracking and may not be directly relevant for general project documentation.*

---

## 9. Refactoring Summary

This document summarizes a major refactoring effort aimed at improving the structure and maintainability of the codebase.

### Key Changes:
- **Modularization**: The core logic was broken down into smaller, more manageable modules.
- **Tool Abstraction**: A clear interface for tools was defined, making it easier to add new tools.
- **Configuration**: All configuration values were moved to environment variables.
- **Testing**: The test suite was expanded to provide better coverage.

---

## 10. Completion Summary

This document provides a high-level summary of the project's completion status and future goals.

*This document appears to be a snapshot in time and may be outdated. It is included here for historical context.*

---

## 11. TODO

This is a list of pending tasks and future improvements for the project.

- **Improve Continuation**: Refine the continuation logic to be more robust.
- **Add More Tools**: Integrate additional tools, such as a calculator or a code interpreter.
- **Enhance UI**: Improve the user interface to provide a more intuitive experience.
- **Cost Tracking**: Implement a system for tracking the cost of LLM API calls.

---
*This document was compiled from `AI_AGENT_WORKFLOW.md`, `COMPLETION_SUMMARY.md`, `COMPREHENSIVE_SEARCH_ENHANCEMENTS.md`, `COPILOT_UI_WORKFLOW.md`, `DEPLOYMENT_NOTES.md`, `DYNAMIC_TOKEN_ALLOCATION.md`, `GOOGLE_AUTH_IMPLEMENTATION.md`, `INSTRUCTIONS_COMPLIANCE.md`, `REFACTORING_SUMMARY.md`, `README.md`, and `TODO.md`.*
