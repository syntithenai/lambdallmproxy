

=========================
# NOTE: start a new conversation

take no action
create a plan for updating the routing/model selection, for rate limiting/routing system
read the planning documents about rate limiting
read the source code that currently implements these features

summarise the existing system which is supposed to take into account
- provider availability
- the type of request (summary, general, planning)
- the token budget allowing for the current message thread and the capacity of available models
- rate limiting and other errors

Pricing information is vital. We must have up to date pricing information for all the models that we use.
Context limit information is also vital in model determination.
Scraped Rate limits information is a good place to start for proactive model selection to avoid rate limits but live error messages and response headers with usage information are more informative.

where possible the system should handle rate limit errors by immediately using a different model and/or provider

Consider the following features and what implications they might have on the complexity of implementation.
Make a plan to implement them regardless

# UI OPTIMISE SETTING
add ui setting in provider settings at the top for "optimise for" cheap/balanced/powerful. balanced is default
default optimise for cheap during model selection if no selection or parameter sent

cheap means preferring free providers
model selection still needs to consider model capacities when selecting a free provider.
when selecting a free provider, choose the smallest model that will do the job and save premium free models for large context requests.
even in cheap mode, the system may choose to use paid providers if no other suitable models with sufficient capacity are available due to configured providers or rate limits.

powerful means preferring the best paid models for large requests and using lesser paid models for simple tasks like content summarisation if they have context capacity

balanced means choosing models that will reliably do the job without significantly compromising quality compared to the best models.



# CONTENT OPTIMISATION
adjust content out max tokens in response to available models. by default give long responses (much longer than current responses). where the available models are limited by max context or rate limits, restrict the size of the output.
adjust the amount of youtube and web search results and the length of page content, transcripts etc based on the capacity of availabile models.
when i say availability of models i mean from a list provided by the system that takes into account round robin behaviour, rate limits and cost optimisations and fallbacks.

# OTHER
capture response times in llm log
use this to optimise for fastest

the system should try to be proactive in rate limiting, using known rate limits and header usage messages and error messages to keep track of current restrictions and avoid them


=======================
test and fix

tidy documentation
- extract copilot instructions
unify the various copilot instructions files into .github/copilot-instructions.md
also draw from experience in deployments,
- remember that cors headers are handled by aws not sent by the server

- extract functional specification, detailing all the features of the software. read all the developer notes and all the software and ensure that any features described have actually been implemented correctly in code. some developer notes decribe requirements that are changed in subsequent notes, be aware

- update readme with 
  - features list
  - quickstart for lambda/github pages deploy (include google console and aws setup instructions)
  - architecture overview
  - feature details sections
  - prompting advice
  - packages relied on and licence terms implications
  - BSD licence

- ask for completeness in testing report
what is the state of testing across the application. what level of code coverage. what level of test successes.
make a plan for implementing comprehensive testing, prioritising the most valuable tests first 



# FINISHED STOP WORK FOR NOW

in the swag page, simplify adding tags to swag items by providing a text input that offers completions for existing tags and creates a new tag when clicking enter.
the list of tags for the snippet should include a cross in each listed tag button that deletes the tag
the list updates live so when a tag is removed, the snippet may no longer be visible in the list because of search filtering


===================================





 

# FUTURE
=======
add environment variables specifying guardrail provider and models for input and output.
if these variables exist, try to use the specified models to filter the user input and the final output
ensure costs for guardrail models are included in llm info and tallies and logging
if the env vars are set but the models are not available return an error describing the problem that censorship(is there a softer word) is required for this application but is not currently available

==============================================

api endpoint that functions like grok compound models integrating tools

assistants api endpoint??

pure proxy endpoint with optional auto model selection

buy credit and get best UI and api access	

============================================
youtube/media player

add a media player compound button to the header with
- a button to start/pause playback
- the name/artist of the current playlist item
- buttons for prev/next track in the playlist and
- another button which opens a dialog box which displays the complete playlist and allows deleting tracks and jumping to tracks for playback. 
the dialog also includes a video window at the top for the currently playing video if any
- below the video is a block containing extra meta data about the video
- keep the compound button as compact as possible

- below the video show a list of all the current playlist items, clicking on a playlist item starts playback at that item. a delete button removes playlists items (with confirmation)
- add the capacity to save and load playlists to indexed db

- only show the player button when there are currently items in the playlist
- all web and youtube searches that return youtube links to actual playable videos are automatically added at the start of a playlist. the playlist should show and group playlist items by the date they were added.
- the playlist continues playing the current track uninterrupted when new tracks are added.
- add a button to clear the playlist
- in the youtube block of a response, add play buttons to each of videos that starts playlist playback at that track




================================================

todos, long scale planning and document building
====================================================
Revisit planning
- ensure that all planning requests show an info button with llm transparency information
- the planning prompt should be considerably more expansive it it's

add a share link one click link to query from qrcode for plan
===================
create a help button and associated full screen dialog that contains the following help topics in vertical tabs
- overview/features
- prompting
- tool prompting
- plans
- todos, snippets and document building
- own keys and load balancing
- sponsor page with project goals, paypal button customised to say buy me a beer and visit the paypal public payment page for syntithenai
	- mention significant time and costs in copilot premium model fees to build.
	- github and github support forum links


================================
text to speech
- read button on response, snippet
- use llm to generate speakable summary response

-----------------
user groq compound model with their tools
=======================
script to setup google

migrate to Vercel? what is google lamda alternative
add scripts to remove deployment
add scripts to deploy to vercel
what other serverless providers (azure?, ....)

instructions for creating identities that can be used for full deployment
deployment wizaard
- customise prompts
- add documents to built vector store

---------
use embed js to implement a vector database using libsql prepopulated with a knowledge base into the deployed lambda.
the built database is deployed into the lambda layer and ...
https://github.com/llm-tools/embedjs

the web search tool is enhanced by using semantic search on the built database to provide additional results
not linked but tied to source doc?
https://llm-tools.mintlify.app/use-cases/semantic-search

------------------
refine voice recognition by deploying and endpoint with websockets for bidirection voice streaming
implement streaming of locally recorded voice to the transcription endpoint to reduce the latency on transcription
allow for different serverless providers and update their deploy scripts as needed


====================================
implement client side tools
the llm is instructed to output client side tool requests first
event stream is scanned for client tool requests and as soon as one is found, the stream is dropped and the tool is run on the client which injects the tool results into the messages array and resubmits the request
- client side tools include run javascript, wait and retry, local search (indexed db based vector database) using https://github.com/llm-tools/embedjs

create a make file command to ingest a document, list documents and delete documents from the store


-----------
take no action
make a business plan to commercialise the software based on prepayments using stripe or paypal
$1 credit to start
charge double llm provider rates
charge for search, transcribe, proxy and all other tools

implement registration, payment and user billing systems
may need to disable the dodgy approach to youtube subtitles to avoid stepping on google license terms in visible commercial operation

do i need to close the source?  can i partially release source.

-----------------------------
audio output mode
- generate short responses alongside main response intended for speech with an understanding that nothing more can be shown but actions can be taken.
for example a request for changes to a google document would result in a very short speakable summary of the changes or a failure message in a dedicated response key alongside the main response.

---------------------------------
python raspi client
--------------------------------

structured profile data in google sheets
make a plan take no action
extract facts about the user and save profile facts in google sheets in a knowledge graph
maintain an embeddings database similar to snippets if possible
query the embddings database for matches and inject as tool results before sending to the upstream llm



----------------------
facebook style push content UI - news
- generate short cards around topics that have been searched before and around the user structured data

- add a tool that generates midi and/or abc


==============
create a new tab called songs.
inside it is possible to add/edit/delete songs from a searchable list.
when adding a song, generate a system prompt that
- queries for the artists who have performed it and who is the composer
- searches youtube(using login token for auth) to find versions of the song
- finds quotes and other information about the song and artists who performed it
- finds lyrics to the song
- creates a comprehensive song record from all that information and saves it to the list
==================
- parameter to lamda so it just delivers final results, no event messages 
- React Library for handling final events or results messages to build message list and for showing message list with all details (tool results), uploaded user prompt files, llm transparency, token and price info
- New TuneBook
- ai based but simple UI to support the basics
- still offline first so needs to function without AI 
- adding a new tune is significantly degrated without ai assistance
- all other ai features are optional?

