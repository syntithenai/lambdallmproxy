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

1. after any changes to the llamda function, deploy the changes using scripts/deploy.sh
2. make all changes to the ui in ui/index_template.html and be sure to rebuild and deploy the docs using scripts/deploy_docs.sh
3. When sending a test to the llamda function, ensure all parameters are included including api key unless the test requires the exclusion of parameters 