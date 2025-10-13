

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
-----------------------------\make a plan. take no action

RAG in Google docs

https://github.com/llm-tools/embedjs

Structured User Data in Google Docs

I want to implement a RAG system where anything saved as a snippet is processed into chunks and embeddings.
Use an embedding scheme that is available on as many providers as possible. Load balance and use the available providers to create chunk embeddings.
If no embeddings models are available or rag is disabled, don't generate the embeddings.
If rag is enabled and suitable embedding models are available, the swag ui should show a warning if there are snippets without embeddings
add a bulk operation to generate embeddings (don't generate if they already exist)

Chunks and embeddings are stored in a Google Sheet owned by the current google login user

Only seek embeddings for text based content

A copy of the sheet is kept in local indexed DB.
Locally generated changes to embeddings also cause the local db to be updated.
The local db polls the online version for changes and integrates them into the local db when the user logs in.
Deleting snippets deletes all embeddings associated with that snippet in the local DB and the online Sheet
When RAG is enabled and a user submits a prompt, after the prompt is embedded online, the local db is used for queries which are inserted into the payload of the request to the lamda function as tool call results.

Add a tick box to the tools settings to enable/disable RAG embedding and RAG search.

Allow for uploading image and text based (text,pdf,markdown,html,...csv) documents in the swag page as snippets.
Convert content to markdown and base64 images before storing as a snippet.

You will need to collect data about embedding models for each of the providers and try to use a model that is most widely available.
Once selected, the embedding system should always use the same model (although it is possible to switch providers)
You also want to collect pricing information for llm info calculation of price

================
i want to be able to reference the source documents when including them in search results
search results should be compacted similarly to web search results in markdown with a link to the source material and then the content
where the source material is an uploaded file, create a link to a new endpoint that returns the full unconverted file contents.
when uploading a file, add the option to paste a url, if this approach is taken to uploading files, use the pasted url as the original resource link.


use embed js for tokenization https://github.com/llm-tools/embedjs and handling a wider range of file formats

implement a vector database using libsql prepopulated with a knowledge base into the deployed lambda.
the built database is deployed into the lambda layer and integrated with rag results

create a make file command to ingest documents, list documents and delete documents from the store

implement a snippet tool that the llm can use to create, get, search and delete snippets.
snippets must be saved online into the existing system as soon as they are created
search uses the vector database for implementation
snippets have a name, tags and content which can include text in markdown format and base64 images
this tool is intended to allow the llm to generate workflows that build partial documents in stages before reviewing and merging for a final result

when files are uploaded as snippets they are converted to a markdown with base64 images format. this conversion can be lossy.



=====================
# ✅ COMPLETED - October 13, 2025
# See UI_BUG_FIXES_COMPLETE.md for full details

✅ click outside any dialog or press escape to close the dialog. this applies to all dialogs
   - Status: Already properly implemented in all dialogs using useDialogClose hook

✅ when scraping links and images, if they are a relative url, convert to full url
   - Fixed: Updated html-parser.js extractLinks() and extractImages() methods
   - All relative URLs now converted to absolute using new URL(href, baseUrl).href
   - Added 8 unit tests, all passing

✅ on mobile display, the logout, cast buttons are pushed off the edge of the screen
   - Fixed: Made GoogleLoginButton.tsx responsive with Tailwind breakpoints
   - Buttons now compact on mobile with icon fallbacks (📡 for Cast, 🚪 for Sign Out)
   - Responsive sizing: smaller profile pic, padding, text on mobile screens

✅ the selected images (subset of the full collection) are showing up as black blocks. the image links work if opened in a new window. they also display fine in the expandable complete list of images
   - Fixed: Updated ImageGallery.tsx with loading states and eager loading
   - Added loading spinner, smooth fade-in transition, gray background
   - Changed from lazy to eager loading for priority images
   - Proper error handling and visual feedback
=====================================
✅ COMPLETED - October 13, 2025
# See PRICING_DISPLAY_COMPLETE.md for full details

✅ Pricing information now prominently displayed in chat UI at 3 locations:
   - Fixed: Info buttons show "💰 $0.0042 • 3 calls ℹ️" with cost prominently displayed
   - Fixed: Content blocks show "🤖 Assistant Response • 💰 $0.0156 (8 LLM calls)" badge
   - Fixed: Session summary sticky footer shows total cost with expandable breakdown
   - All 23 unit tests passing
   - Mobile-responsive design with sm: breakpoints
   - Free vs Paid model tracking with "worth" calculations
   - Works for assistant messages and tool messages
=============================
# ✅ COMPLETED - October 13, 2025
# See FIX_GEMINI_EVALUATION_PARSING.md for full details

✅ Gemini evaluation response parsing fixed:
   - Fixed: Keyword matching order (check "not comprehensive" before "comprehensive")
   - Fixed: Word boundary regex for "no" and "false" to avoid false matches in "know", etc.
   - Enhanced: Added 14+ negative patterns and 7+ positive patterns
   - Testing: Created 38 comprehensive unit tests, all passing ✅
   - Confirmed: Gemini fully supports tool calls via OpenAI-compatible API
   - No breaking changes, maintains fail-safe behavior

==============================
===================================
✅ COMPLETE - SWAG Tag Enhancement (Oct 14, 2025)
   - Created TagAutocomplete component with fuzzy matching & keyboard navigation
   - Created ConfirmDialog component for tag deletion confirmation
   - Created useClickOutside hook for dropdown management
   - Updated edit dialog with autocomplete & confirmation
   - Updated bulk tag dialog with autocomplete
   - Added live filter notification when snippet is hidden
   - All 1037 tests passing, no regressions
   - Documentation: developer_log/SWAG_TAG_ENHANCEMENT_COMPLETE.md

============================================
📋 PLANNED - YouTube Media Player (Oct 14, 2025)
   - Comprehensive 7-phase implementation plan created
   - Compact header player button with play/pause/next/prev controls
   - Enhanced playlist dialog with embedded video player
   - Video metadata display (title, channel, duration, description)
   - IndexedDB persistence for current & saved playlists
   - Date-based playlist grouping (Today, Yesterday, This Week, etc.)
   - Play buttons in YouTube search results
   - Auto-add videos to playlist start from searches
   - Chromecast integration for fullscreen video on TV
   - Save/load named playlists
   - Delete tracks with confirmation
   - Clear playlist with confirmation
   - Mobile responsive & dark mode support
   - Estimated: 20-25 hours (3-4 days)
   - Documentation: developer_log/YOUTUBE_MEDIA_PLAYER_PLAN.md

=======
make a plan
add environment variables specifying guardrail provider and models for input and output.
if these variables exist, try to use the specified models to filter the user input and the final output
ensure costs for guardrail models are included in llm info and tallies and logging
if the env vars are set but the models are not available return an error describing the problem that censorship(is there a softer word) is required for this application but is not currently available and refusing to return a final response.
if there is an change required to the user prompt. show an error message, clear the previous user prompt and put an updated prompt into the user text input for query.

================================
make a plan
text to speech
- read button on response and snippet blocks
- extract text content clean for speech
- use llm to generate speakable summary response
- fallback to local speech generationg using speak.js https://github.com/kripken/speak.js/
- while reading add a stop button to the fixed header

add a ui configuration tickbox in a seperate tab to enable text to speech
when enabled, the llm is asked to provide a short form speakable response which is used to generate and play speech in the ui

====================================
make a plan
implement client side tools
the llm is instructed to output client side tool requests first
event stream is scanned for client tool requests and as soon as one is found, the stream is dropped and the tool is run on the client which injects the tool results into the messages array and resubmits the request
- initially client side tools include "run javascript" and "wait and retry"
add tick boxes to enable the client tools in the UI settings with a warning about run javascript


==============================
make a plan
planning UI
- ensure that all planning requests show an info button with llm transparency information and that any requests are logged to the google sheet
- the planning prompt should be considerably more expansive its current version, asking many more context questions and suggesting a long term 
the planning prompt should consider the possibility that the query is simple and respond with a very short message indicating that the lamda function should proceed as normal.
the planning prompt should consider the possibility that the user is seeking a generous overview of a topic and create searches, questions that need answering (as todos) and add to the system and user prompts to 
the planning prompt should consider the possibility that the user is asking for a long form document answering many questions and including lots of detail and images, in this case use todos to break the document creation down into a number of tasks and create snippets along the way which are combined and written to a final snippet document. don't take this path unless the user clearly indicates the need for a very long form response.
the planning prompt should consider the possibilty that it needs more information from the user in order to create a useful plan and respond with requests to update the user prompt

add a share link one click link to query from qrcode for plan


automatic planning
when a user submits a prompt it is first sent to a planning endpoint that functions the same as the planning UI to modify the user query and system prompt before handing the request over to a normal flow


In the planning phase, encourage the model to break the task down into TODO items and return those with the response
If todo items are returned the lamda function stores the items and passes them to the final assessor phase to be used to decide if the function should continue processing or stop because all the todo items are complete or unable to be completed in a reasonable amount of effort

Todos should be sent to the UI and displayed above the user prompt input in compact form (list count) with an expandable long form showing each of the todos in full as a list




 ===================
DO LAST

review all the features of the software and update the examples button to include a much wider range of examples that show off all the features of the software

create a help button in the menu and associated full screen dialog that contains the following help topics in vertical tabs
- overview/features
- prompting
- tool prompting
- plans
- todos, snippets and document building
- own keys and load balancing
- sponsor page with project goals, paypal button customised to say buy me a beer and visit the paypal public payment page for syntithenai
	- mention significant time and costs in copilot premium model fees to build.
	- github and github support forum links


# BUGS

if the ui client disconnects for any reason the lamda function must stop executing immediately

in swag, make tag selector in snippet content smaller. the same size as the tag buttons and about 1/3 the length on the same line as the buttons

can i control the chromecast device to force the TV to use it's hdmi port when the software shows something on the tv.

when viewing a snippet, show the snippet full screen on the tv and scroll with the sender device.




✅ COMPLETED - October 14, 2025
youtube/media player enhancements
✅ Use react-player library for multi-provider support (YouTube, Vimeo, direct URLs, etc.)
✅ Shuffle/repeat modes (none, all, one) with Fisher-Yates shuffle algorithm
✅ Playlist search/filter with real-time filtering
✅ Playback speed control (0.25x to 2x) - works for all providers
✅ Volume control slider

TODO (for next session):
- Play buttons in YouTube search results (videos already auto-added to playlist)
- Chromecast video casting (extend existing CastContext)
- Video quality control (YouTube-specific via IFrame API)


📋 FIXED - Bug Fixes (Oct 14, 2025)
   1. Cast scroll synchronization - Add scroll event listener to ChatTab
      - Send scroll position to Chromecast when user scrolls
      - Debounced to 100ms to avoid performance issues
      - CastContext already has sendScrollPosition() and receiver has handler
      - Estimated: 1-2 hours
   
   2. Inline tag management in snippets - Replace "+" button with TagAutocomplete
      - Remove tag dialog button from each snippet
      - Add inline TagAutocomplete component (reuse from edit dialog)
      - Add × button to tag chips with confirmation
      - Keep bulk tag operations dialog for multi-select
      - Estimated: 2-3 hours
   
   - Total estimated time: 3-5 hours
   - Documentation: developer_log/BUG_FIXES_CAST_INLINE_TAGS_PLAN.md




# FUTURE

==============================================









------------------
refine voice recognition by deploying an endpoint with websockets for bidirection voice streaming
implement streaming of locally recorded voice to the transcription endpoint to reduce the latency on transcription
allow for different serverless providers and update their deploy scripts as needed



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



-----------
take no action
make a business plan to commercialise the software based on prepayments using stripe or paypal
$1 credit to start
charge double llm provider rates
charge for search, transcribe, proxy and all other tools

implement registration, payment and user billing systems
may need to disable the dodgy approach to youtube subtitles to avoid stepping on google license terms in visible commercial operation

do i need to close the source?  can i partially release source.

api endpoint that functions like grok compound models integrating tools

assistants api endpoint??

pure proxy endpoint with optional auto model selection

buy credit and get best UI and api access	
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

