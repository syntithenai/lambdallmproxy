---
applyTo: '**'
---

1. Whenever you run a command in the terminal, pipe the output to a file, output.txt, that you can read from.
2. You should read the output.txt file to see the results of your commands.
3. Make sure to overwrite each time so that it doesn't grow too big.
4. There is a bug in the current version of Copilot that causes it to not read the output of commands correctly.
5. This workaround allows you to read the output from the temporary file instead.

---
applyTo: '**'
---

1. After any changes to the Lambda function code (src/), deploy using `scripts/deploy.sh`
2. **CRITICAL UI WORKFLOW**: 
   - Make ALL UI changes in files within the `ui/` subdirectory (ui/index_template.html, ui/index_template_modular.html, ui/styles.css)
   - NEVER edit files in docs/ directory directly - these are built/generated files
   - After UI changes, ALWAYS run `scripts/build-docs.sh` to build from ui/ to docs/
   - After building, ALWAYS run `scripts/deploy-docs.sh` to deploy the docs
   - Alternative: Use `make deploy-docs` which runs both build and deploy
3. When testing the Lambda function, ensure all parameters are included including API key unless the test requires the exclusion of parameters
4. **UI Development Process**:
   - Edit source files in ui/ directory
   - Run build script to update docs/
   - Deploy docs to make changes live
   - Test at https://lambdallmproxy.pages.dev 