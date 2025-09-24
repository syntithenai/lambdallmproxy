# Deployment Notes

## Repository Reorganization Summary

This repository has been cleaned up and reorganized for better maintainability and deployment consistency.

### Changes Made

1. **Script Organization**
   - Moved all deployment scripts from root to `scripts/` directory:
     - `deploy.sh` - Bash deployment script
     - `build-docs.sh` - Documentation build script  
     - `deploy-docs.sh` - Documentation deployment script
     - `test-lambda.sh` - Lambda testing script

2. **Code Modularization**
   - Created `src/` directory for organized source code
   - Split large `lambda_search_llm_handler.js` into focused modules:
     - `auth.js` - Authentication utilities
     - `providers.js` - LLM provider configuration
     - `memory-tracker.js` - Memory management classes
     - `html-parser.js` - HTML parsing utilities
     - `index.js` - Main Lambda handler

3. **Build System Updates**
   - Updated `Makefile` to reference scripts in new locations
   - All script paths changed from `./` to `./scripts/`
   - Maintained all existing functionality

4. **Repository Cleanup**
   - Removed unused files from repository root
   - Cleaned up development artifacts and temporary files
   - Maintained only essential files for deployment

### Deployment Workflow

**Always use the Makefile for deployments:**

```bash
# Deploy Lambda function
make deploy

# Build and deploy UI
make deploy_ui
```

This ensures:
- Consistent deployment process
- Proper script execution from correct locations  
- Environment variable handling
- Error handling and logging

### File Structure After Cleanup

```
lambdallmproxy/
├── src/                    # Source code modules
│   ├── auth.js            # Authentication utilities
│   ├── providers.js       # LLM provider config
│   ├── memory-tracker.js  # Memory management
│   ├── html-parser.js     # HTML parsing
│   └── index.js          # Main handler
├── scripts/               # Deployment scripts
│   ├── deploy.sh         # Lambda deployment
│   ├── build-docs.sh     # Documentation building
│   ├── deploy-docs.sh    # Documentation deployment
│   └── test-lambda.sh    # Testing script
├── Makefile              # Build automation
├── README.md             # Updated documentation
├── package.json          # Dependencies
└── lambda_search_llm_handler.js  # Original function (will be deprecated)
```

### Migration Notes

- The original `lambda_search_llm_handler.js` is still present for compatibility
- The `src/index.js` serves as the new entry point
- All deployment scripts work with the modular architecture
- No changes required to AWS Lambda configuration

### Best Practices Going Forward

1. **Use Makefile targets** for all build and deployment operations
2. **Modify code in `src/` modules** rather than the original monolithic file
3. **Test changes** using `make test` before deployment
4. **Deploy consistently** using `make deploy-bash`
5. **Update documentation** when adding new features or modules

### Troubleshooting

If deployments fail:
1. Check that all scripts in `scripts/` directory have execute permissions
2. Verify AWS CLI is configured properly
3. Ensure environment variables are set correctly
4. Use `make test` to validate function locally
5. Review script output for specific error messages

The reorganization improves maintainability while preserving all existing functionality and deployment capabilities.