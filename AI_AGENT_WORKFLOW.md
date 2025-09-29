# AI Agent Development Workflow

## Quick Commands for AI Agents

After making code changes, AI agents should use these commands:

### 🔥 RECOMMENDED: Quick Deploy
```bash
make dev
```
- Deploys Lambda function only
- Fastest option for code changes
- Optimized for development iteration

### 🚀 Full Deploy (when needed)
```bash
make full-deploy
```
- Builds docs, deploys Lambda, deploys docs
- Use when UI changes are made
- Complete deployment

## Alternative Commands

### Using npm scripts:
```bash
npm run deploy          # Deploy Lambda only
npm run full-deploy     # Deploy everything
npm run build-docs      # Build docs locally
```

### Using direct scripts (per instructions.md):
```bash
./scripts/deploy.sh        # Deploy Lambda function (REQUIRED after code changes)
./scripts/build-docs.sh    # Build documentation
./scripts/deploy-docs.sh   # Deploy documentation (REQUIRED after UI changes)
```

### Important Instructions.md Requirements:
1. **Always use `scripts/deploy.sh`** for Lambda function changes
2. **Always use `scripts/deploy-docs.sh`** for UI/documentation deployment  
3. **Make UI changes in `ui/index_template.html`** (not docs/index.html directly)
4. **All commands pipe output to `output.txt`** to work around Copilot output reading issues

## Development Tips for AI Agents (per instructions.md)

1. **Always deploy after Lambda code changes**: Use `make dev` (uses `scripts/deploy.sh`)
2. **🚨 CRITICAL UI WORKFLOW** (per user requirement):
   - **ALWAYS make UI changes in `ui/` subdirectory files** (ui/index_template.html, ui/index_template_modular.html, ui/styles.css)
   - **NEVER edit docs/index.html or docs/js/ files directly** - these are built/generated files
   - **ALWAYS run build script after UI changes**: Use `make deploy-docs` or `scripts/build-docs.sh`
   - **ALWAYS deploy after building**: Use `scripts/deploy-docs.sh` if not using make
3. **JavaScript files are managed separately**: docs/js/ files (auth.js, main.js, settings.js, samples.js, utils.js) are not built from ui/ - they exist independently
4. **Output is piped to `output.txt`**: All commands save output to this file for Copilot to read
5. **Test immediately**: Visit https://lambdallmproxy.pages.dev after deploy
6. **Check logs if issues**: `make logs` or check `output.txt` for command results

## Auto-deployment Setup (Optional)

For automatic deployment on file changes:

```bash
# Install nodemon globally
npm install -g nodemon

# Watch for changes and auto-deploy
make watch
```

This will automatically run `make dev` whenever files in `src/` change.

## Project Structure

```
lambdallmproxy/
├── src/                          # Lambda source code
│   ├── lambda_search_llm_handler.js  # Main Lambda handler
│   ├── tools.js                  # Tool definitions
│   └── ...
├── scripts/                      # Deployment scripts
│   ├── dev-deploy.sh            # Quick development deploy
│   ├── deploy.sh                # Full Lambda deploy
│   ├── build-docs.sh            # Build documentation
│   └── deploy-docs.sh           # Deploy documentation
├── ui/                          # UI templates
├── docs/                        # Built documentation (auto-generated)
├── Makefile                     # Easy commands
├── package.json                 # npm scripts
└── .env                         # Environment configuration
```

## Troubleshooting

- **Permission denied**: Run `chmod +x scripts/*.sh`
- **AWS CLI issues**: Check `aws sts get-caller-identity`
- **Environment issues**: Ensure `.env` file exists with proper values
- **Deployment failures**: Check `make logs` for Lambda function logs