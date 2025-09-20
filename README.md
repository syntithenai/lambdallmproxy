# Quick LLM Proxy on AWS Lambda

- Create a new lambda function using the .js file
- Ensure the function has a function URL with CORS enabled and appropriate values (*?) set for origin and methods and ensure header content-type is allowed
- Edit the  test.json file to update your OpenAI api key and use inside the llambda UI test feature.
- Edit the test.html file to include your function URL and OpenAI api key then run ```npx serve```
- [optional] add an environment variable ACCESS_SECRET and edit the form in test.html to send a hidden form field access_secret.