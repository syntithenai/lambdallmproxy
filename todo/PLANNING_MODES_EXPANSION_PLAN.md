# Planning Modes Expansion - Comprehensive Plan

**Created**: October 27, 2025  
**Status**: 📋 Planning Phase (No Implementation)  
**Purpose**: Expand planning mode types from 5 to 25+ specialized modes

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [20 New Planning Mode Proposals](#20-new-planning-mode-proposals)
3. [Implementation Architecture](#implementation-architecture)
4. [Code Implementation Plan](#code-implementation-plan)
5. [Benefits Analysis](#benefits-analysis)
6. [Migration Strategy](#migration-strategy)

---

## Current State Analysis

### Existing Planning Modes (5 Total)

**Current Implementation Location**: `src/lambda_search_llm_handler.js` (line 1505)

1. **overview** - "general research"
   - Broad exploration with multiple angles
   - Multiple search queries and sub-questions needed
   - Example: "Explain quantum computing"

2. **long-form** - "document creation"
   - Article, essay, report, tutorial creation
   - Structured output with sections
   - Example: "Write a guide to React hooks"

3. **minimal** - "quick answer"
   - Single fact lookup, definition, simple calculation
   - Direct answer without extensive research
   - Example: "What is the capital of France?"

4. **clarification** - "needs more info"
   - User query is ambiguous or incomplete
   - System requests additional context
   - Example: "Tell me about Python" (language? snake? software?)

5. **guidance** - "help with approach"
   - User needs help structuring their own research
   - Meta-advice about how to approach a problem
   - Example: "How should I research machine learning?"

### Current Categorization System

```javascript
{
  "queryType": "overview|long-form|minimal|clarification|guidance",
  "complexity": "simple|moderate|complex",
  "researchApproach": "search-based|analytical|creative"
}
```

### Limitations of Current System

1. **Too Generic**: 5 modes can't capture nuanced research needs
2. **Conflation**: "overview" is overused for many different intent types
3. **Missing Specializations**: No modes for debugging, comparison, trend analysis, etc.
4. **No Temporal Awareness**: Can't distinguish "current news" from "historical analysis"
5. **No Domain Specificity**: Technical vs creative vs legal research all use same mode

---

## 20 New Planning Mode Proposals

### Category 1: Time-Based Modes (3 modes)

#### 1. **trending** - "current events tracking"

**Description**: Real-time analysis of breaking news, trending topics, or rapidly evolving situations.

**How It Works**:
- Prioritizes sources from last 24-72 hours
- Uses date-filtered search queries (e.g., "topic after:2025-10-25")
- Focuses on news sites, social media trends, live feeds
- Generates timeline-based questions ("What happened today?", "Latest developments?")
- Uses higher search frequency (15-20 queries vs 8-12)

**Trigger Patterns**:
- Keywords: "latest", "breaking", "today", "current", "trending", "now", "recent"
- Time references: "this week", "yesterday", "2025", "right now"
- Examples: "Latest AI developments", "Breaking news about SpaceX", "Current COVID variants"

**Contrast with Existing Modes**:
- **vs overview**: Focuses on recency, not comprehensiveness
- **vs minimal**: Requires aggregating multiple recent sources
- **Why useful**: News becomes stale quickly; standard overview might cite outdated info

---

#### 2. **historical** - "chronological deep dive"

**Description**: Trace evolution of a topic, technology, or event across time periods.

**How It Works**:
- Generates timeline-based search queries (e.g., "topic 1990s", "topic history", "topic evolution")
- Structures research plan in chronological phases
- Focuses on historical databases, archives, academic papers
- Questions about origins, key milestones, turning points
- Creates timeline-based todos (research origins → early development → modern state)

**Trigger Patterns**:
- Keywords: "history of", "evolution", "origins", "timeline", "development over time"
- Temporal scope: "since inception", "past 50 years", "from beginning"
- Examples: "History of JavaScript", "Evolution of climate policy", "Origins of cryptocurrency"

**Contrast with Existing Modes**:
- **vs overview**: Emphasizes temporal progression, not current state
- **vs long-form**: Not creating document, tracing historical narrative
- **Why useful**: Understanding "how we got here" requires different sources than "where we are"

---

#### 3. **forecasting** - "future trends prediction"

**Description**: Analyze current data to predict future developments, trends, or outcomes.

**How It Works**:
- Searches for: trend analyses, expert predictions, market forecasts, scenario planning
- Generates forward-looking questions ("What will happen next?", "Future impact?")
- Focuses on: analyst reports, think tanks, futures studies, extrapolation models
- Research plan includes: current state → trend identification → expert predictions → synthesis
- Tools: statistical analysis, data visualization, scenario modeling

**Trigger Patterns**:
- Keywords: "future of", "predictions", "trends", "forecast", "will", "upcoming", "next 5 years"
- Conditional language: "what if", "scenarios", "potential outcomes"
- Examples: "Future of electric vehicles", "AI predictions 2030", "Climate change scenarios"

**Contrast with Existing Modes**:
- **vs overview**: Predictive vs descriptive
- **vs analytical**: Extrapolation vs retrospection
- **Why useful**: Requires different sources (forecasts, models) than factual research

---

### Category 2: Analytical Modes (4 modes)

#### 4. **comparison** - "side-by-side analysis"

**Description**: Compare 2+ entities (products, technologies, concepts, options) across multiple dimensions.

**How It Works**:
- Automatically identifies comparison entities from query
- Generates parallel search queries for each entity
- Creates structured comparison framework (features, pros/cons, use cases, pricing)
- Research questions focus on differentiators and trade-offs
- Output format: comparison table, decision matrix

**Trigger Patterns**:
- Keywords: "vs", "versus", "compare", "difference between", "better", "which", "or"
- Multiple entities: "React vs Vue", "iPhone vs Samsung", "Python or JavaScript"
- Decision language: "should I choose", "what's the difference"

**Contrast with Existing Modes**:
- **vs overview**: Contrasts specific items, not general exploration
- **vs guidance**: Provides analysis, not just advice
- **Why useful**: Comparison requires balanced research on multiple targets

---

#### 5. **causal** - "cause-and-effect analysis"

**Description**: Investigate causal relationships, root causes, and downstream effects.

**How It Works**:
- Identifies suspected cause and effect from query
- Generates searches for: mechanisms, evidence, counterexamples, contributing factors
- Research questions probe causality ("Does X really cause Y?", "What evidence exists?")
- Focuses on: scientific studies, controlled experiments, longitudinal data
- Research plan: establish correlation → investigate mechanism → validate causation

**Trigger Patterns**:
- Keywords: "why does", "cause of", "reason for", "leads to", "results in", "because"
- Causal language: "impact of", "effect of", "due to", "attributed to"
- Examples: "Why do LLMs hallucinate?", "Cause of inflation", "Effects of remote work"

**Contrast with Existing Modes**:
- **vs analytical**: Focuses on causality, not general analysis
- **vs overview**: Not describing phenomenon, explaining mechanism
- **Why useful**: Causal research requires experimental design expertise, not just facts

---

#### 6. **sentiment** - "opinion and perception analysis"

**Description**: Analyze how people feel about a topic, product, person, or event across different groups.

**How It Works**:
- Searches for: reviews, surveys, social media analysis, polls, sentiment data
- Generates questions about perceptions ("How do users feel?", "What are common complaints?")
- Categorizes sources by stakeholder group (users, experts, critics, fans)
- Research plan: gather opinions → categorize sentiment → identify patterns → synthesize
- Tools: sentiment analysis, review aggregation, poll data

**Trigger Patterns**:
- Keywords: "what do people think", "reviews", "opinions", "perception", "reception", "criticized"
- Evaluative language: "is X good", "worth it", "recommend", "satisfaction"
- Examples: "iPhone 15 reviews", "Public opinion on AI", "User feedback on ChatGPT"

**Contrast with Existing Modes**:
- **vs overview**: Subjective opinions vs objective facts
- **vs comparison**: Single-entity perception vs multi-entity comparison
- **Why useful**: Requires aggregating subjective data, not factual research

---

#### 7. **diagnostic** - "problem troubleshooting"

**Description**: Debug errors, diagnose issues, troubleshoot problems with systematic approach.

**How It Works**:
- Extracts error messages, symptoms, or problem description from query
- Generates searches for: error documentation, known bugs, troubleshooting guides, solutions
- Creates diagnostic tree (check A → if fails, check B → common fixes)
- Research questions focus on root causes and proven solutions
- Prioritizes: Stack Overflow, GitHub issues, official docs, forum threads

**Trigger Patterns**:
- Keywords: "error", "not working", "failed", "broken", "fix", "troubleshoot", "debug"
- Error codes: "HTTP 500", "MemoryError", "compilation failed"
- Examples: "React useEffect infinite loop", "AWS Lambda timeout", "CORS error"

**Contrast with Existing Modes**:
- **vs minimal**: Errors often need deep investigation, not quick answer
- **vs guidance**: Need specific solution, not general advice
- **Why useful**: Debugging requires filtering for working solutions, not theory

---

### Category 3: Creative & Generative Modes (3 modes)

#### 8. **ideation** - "creative brainstorming"

**Description**: Generate novel ideas, creative solutions, alternative approaches to a problem.

**How It Works**:
- Searches for: innovative examples, creative solutions, lateral thinking techniques
- Generates divergent questions ("What if...", "Alternative approaches?")
- Research plan: gather inspiration → identify patterns → generate combinations → evaluate novelty
- Focuses on: case studies, creative industries, innovation research, unusual applications
- Uses higher temperature LLM settings for more creative output

**Trigger Patterns**:
- Keywords: "ideas for", "creative", "innovative", "brainstorm", "alternatives", "new approach"
- Open-ended requests: "ways to", "possibilities", "could we", "what about"
- Examples: "Startup ideas in AI", "Creative marketing campaigns", "Alternative energy sources"

**Contrast with Existing Modes**:
- **vs creative (research approach)**: Generating ideas vs researching creative topics
- **vs overview**: Producing novelty vs understanding existing
- **Why useful**: Idea generation requires different mindset than fact-finding

---

#### 9. **synthesis** - "knowledge integration"

**Description**: Combine insights from multiple disparate domains to create unified understanding.

**How It Works**:
- Identifies multiple knowledge domains in query
- Generates cross-domain search queries (e.g., "biology + computer science", "economics + psychology")
- Research questions focus on connections, parallels, integrations
- Research plan: master each domain → identify commonalities → synthesize framework
- Looks for: interdisciplinary papers, analogies, transferable concepts

**Trigger Patterns**:
- Keywords: "combine", "integrate", "intersection of", "apply X to Y", "cross-domain"
- Multiple domains: "AI in healthcare", "Psychology of UX design", "Game theory in politics"
- Examples: "Neuroscience applied to AI", "Economic principles in dating", "Physics metaphors for programming"

**Contrast with Existing Modes**:
- **vs overview**: Connecting domains vs exploring one domain
- **vs analytical**: Integration vs decomposition
- **Why useful**: Interdisciplinary research requires navigating multiple knowledge bases

---

#### 10. **scenario** - "simulation and modeling"

**Description**: Explore hypothetical scenarios, thought experiments, "what if" situations.

**How It Works**:
- Extracts scenario parameters from query
- Searches for: similar historical cases, simulation models, expert speculation
- Generates questions about scenario dynamics ("What would happen if...", "Second-order effects?")
- Research plan: establish baseline → model changes → predict cascades → validate logic
- Tools: simulation studies, scenario planning literature, expert interviews

**Trigger Patterns**:
- Keywords: "what if", "hypothetical", "imagine", "scenario", "simulation", "would happen"
- Counterfactual language: "if X instead of Y", "without", "alternative reality"
- Examples: "What if Bitcoin failed?", "If AI becomes AGI", "Without internet society"

**Contrast with Existing Modes**:
- **vs forecasting**: Exploring hypotheticals vs predicting likely futures
- **vs analytical**: Speculative vs evidence-based
- **Why useful**: Scenario analysis requires different reasoning than factual research

---

### Category 4: Domain-Specific Modes (4 modes)

#### 11. **technical** - "code, APIs, and implementation"

**Description**: Research technical implementations, code examples, API usage, architecture patterns.

**How It Works**:
- Prioritizes: official documentation, code repositories, technical blogs, API references
- Generates searches for: code examples, integration guides, best practices, performance tips
- Research questions focus on "how to implement" not "what is"
- Output includes: code snippets, configuration examples, architecture diagrams
- Validates against latest versions and deprecation notices

**Trigger Patterns**:
- Keywords: "how to implement", "code example", "API", "integrate", "setup", "configure"
- Technical terms: "React hooks", "AWS Lambda", "REST API", "Docker", "authentication"
- Examples: "How to use Stripe API", "React Server Components tutorial", "PostgreSQL optimization"

**Contrast with Existing Modes**:
- **vs overview**: Implementation-focused vs conceptual
- **vs diagnostic**: Proactive building vs reactive fixing
- **Why useful**: Developers need working code, not theoretical explanations

---

#### 12. **legal** - "regulations and compliance"

**Description**: Research laws, regulations, compliance requirements, legal precedents.

**How It Works**:
- Searches: legal databases, government sites, case law, regulatory docs
- Generates questions about: applicability, exceptions, penalties, compliance steps
- Research plan: identify relevant laws → understand requirements → check precedents → compliance steps
- Focuses on: official sources, legal experts, recent court decisions
- Includes jurisdiction awareness (US federal vs state, EU vs US, etc.)

**Trigger Patterns**:
- Keywords: "legal", "law", "regulation", "compliance", "GDPR", "copyright", "license"
- Legal language: "is it legal", "lawful", "prohibited", "permitted", "sue"
- Examples: "GDPR requirements for SaaS", "Open source license comparison", "Medical device FDA approval"

**Contrast with Existing Modes**:
- **vs overview**: Legal specificity vs general information
- **vs guidance**: Regulatory requirements vs general advice
- **Why useful**: Legal research requires authoritative sources and jurisdictional accuracy

---

#### 13. **academic** - "scholarly research"

**Description**: Deep academic research using peer-reviewed sources, citations, rigorous methodology.

**How It Works**:
- Prioritizes: Google Scholar, PubMed, JSTOR, arXiv, academic journals
- Generates searches for: primary research, systematic reviews, meta-analyses
- Research questions mirror academic inquiry ("What does the literature say?", "Evidence quality?")
- Research plan: literature review → primary sources → citation network → critical evaluation
- Output includes: proper citations, methodology critique, research gaps

**Trigger Patterns**:
- Keywords: "research", "studies", "papers", "academic", "scholarly", "evidence-based"
- Academic language: "peer-reviewed", "meta-analysis", "systematic review", "empirical"
- Examples: "Research on sleep deprivation", "Studies about meditation", "Academic papers on LLMs"

**Contrast with Existing Modes**:
- **vs overview**: Scholarly rigor vs general information
- **vs search-based (approach)**: Academic sources vs web search
- **Why useful**: Academic research requires different search strategy and source evaluation

---

#### 14. **medical** - "health and clinical information"

**Description**: Research medical conditions, treatments, drug information with clinical accuracy.

**How It Works**:
- Prioritizes: PubMed, Mayo Clinic, NIH, medical journals, clinical trials databases
- Generates searches for: symptoms, treatments, drug interactions, clinical guidelines
- Research questions focus on: efficacy, safety, contraindications, current standards
- Research plan: symptom research → treatment options → evidence quality → clinical guidelines
- **CRITICAL**: Includes medical disclaimers, emphasizes consulting professionals

**Trigger Patterns**:
- Keywords: "symptoms", "treatment", "disease", "medication", "drug", "clinical", "diagnosis"
- Medical terms: "diabetes", "hypertension", "chemotherapy", "vaccine", "side effects"
- Examples: "Metformin side effects", "Treatments for depression", "COVID vaccine efficacy"

**Contrast with Existing Modes**:
- **vs academic**: Clinical practice vs research papers
- **vs overview**: Medical accuracy requirements vs general information
- **Why useful**: Health information requires authoritative medical sources and safety warnings

---

### Category 5: Strategic & Decision Support Modes (3 modes)

#### 15. **strategic** - "business and competitive intelligence"

**Description**: Business strategy research, market analysis, competitive intelligence, strategic planning.

**How It Works**:
- Searches for: market reports, competitor analysis, industry trends, SWOT analyses
- Generates questions about: market size, competitive landscape, opportunities, threats
- Research plan: market overview → competitor analysis → trend identification → strategic recommendations
- Prioritizes: industry reports, analyst ratings, business news, financial data
- Output format: strategic framework (SWOT, Porter's Five Forces, etc.)

**Trigger Patterns**:
- Keywords: "market analysis", "competitive", "strategy", "business model", "market size", "TAM"
- Business language: "competitors", "market opportunity", "positioning", "go-to-market"
- Examples: "AI market analysis", "Competitors to Shopify", "SaaS pricing strategies"

**Contrast with Existing Modes**:
- **vs overview**: Strategic lens vs general information
- **vs analytical**: Business context vs general analysis
- **Why useful**: Business research requires market data and competitive intelligence

---

#### 16. **decision** - "choice optimization"

**Description**: Support decision-making with structured analysis of options, criteria, and trade-offs.

**How It Works**:
- Extracts decision options and criteria from query
- Generates searches for: evaluation frameworks, expert recommendations, user experiences
- Research questions focus on: critical factors, deal-breakers, optimization criteria
- Research plan: define criteria → gather option data → score alternatives → recommend
- Tools: decision matrices, weighted scoring, cost-benefit analysis

**Trigger Patterns**:
- Keywords: "should I", "which to choose", "best option", "decide between", "recommendations"
- Decision language: "worth it", "pros and cons", "trade-offs", "optimal"
- Examples: "MacBook vs ThinkPad for development", "Should I learn Rust or Go", "Best CMS for ecommerce"

**Contrast with Existing Modes**:
- **vs comparison**: Decision-focused with criteria weighting
- **vs guidance**: Specific recommendation vs general advice
- **Why useful**: Decisions require structured evaluation, not just information

---

#### 17. **risk** - "threat and vulnerability assessment"

**Description**: Identify, analyze, and mitigate risks, threats, vulnerabilities, and potential failures.

**How It Works**:
- Searches for: risk assessments, failure modes, security vulnerabilities, incident reports
- Generates questions about: likelihood, impact, mitigation strategies, early warnings
- Research plan: identify threats → assess severity → find mitigations → create safeguards
- Prioritizes: security advisories, post-mortems, safety standards, audit reports
- Output format: risk matrix (likelihood × impact), mitigation checklist

**Trigger Patterns**:
- Keywords: "risk", "vulnerability", "threat", "security", "failure", "danger", "unsafe"
- Risk language: "could go wrong", "attack vector", "exposure", "mitigation"
- Examples: "Security risks of public WiFi", "Risks of cloud migration", "AI safety concerns"

**Contrast with Existing Modes**:
- **vs diagnostic**: Preventive vs reactive
- **vs analytical**: Risk-focused vs general analysis
- **Why useful**: Risk assessment requires specific methodologies and threat intelligence

---

### Category 6: Learning & Knowledge Modes (3 modes)

#### 18. **tutorial** - "step-by-step learning path"

**Description**: Create structured learning curriculum with progressive difficulty and hands-on exercises.

**How It Works**:
- Generates learning path: prerequisites → basics → intermediate → advanced
- Searches for: tutorials, courses, documentation, practice exercises, projects
- Research questions focus on: "what to learn first", "common pitfalls", "practice problems"
- Research plan: skill assessment → curriculum design → resource gathering → progression milestones
- Output format: learning roadmap with resources, exercises, and checkpoints

**Trigger Patterns**:
- Keywords: "learn", "tutorial", "guide", "how to get started", "beginner", "roadmap"
- Learning language: "step-by-step", "from scratch", "zero to hero", "curriculum"
- Examples: "Learn React from scratch", "Beginner's guide to machine learning", "SQL tutorial"

**Contrast with Existing Modes**:
- **vs guidance**: Structured curriculum vs general approach advice
- **vs long-form**: Educational progression vs static document
- **Why useful**: Learning requires pedagogical sequencing, not just information

---

#### 19. **eli5** - "simple explanations"

**Description**: Explain complex topics using simple language, analogies, and concrete examples.

**How It Works**:
- Searches for: simplified explanations, analogies, visual guides, intro articles
- Research questions focus on: "explain simply", "what does this mean", "real-world example"
- Research plan: grasp core concept → find analogies → eliminate jargon → validate clarity
- Prioritizes: educational sites, "explain like I'm 5" resources, visual learners
- Uses simple language validation (reading level < 8th grade)

**Trigger Patterns**:
- Keywords: "explain simply", "ELI5", "for dummies", "basic explanation", "layman's terms"
- Simplicity requests: "in simple words", "without jargon", "easy to understand"
- Examples: "ELI5 blockchain", "Quantum computing for beginners", "What is REST API simply"

**Contrast with Existing Modes**:
- **vs minimal**: Simplified explanation vs quick fact
- **vs tutorial**: Understanding vs doing
- **Why useful**: Simplification requires finding accessible sources and avoiding complexity

---

#### 20. **deep-dive** - "exhaustive expert-level research"

**Description**: Comprehensive, expert-level analysis with maximum depth and technical rigor.

**How It Works**:
- Searches: academic papers, technical specs, source code, expert analyses, niche forums
- Generates 20-30 research questions across all aspects of topic
- Research plan: surface overview → technical details → edge cases → advanced topics → cutting edge
- No simplification - uses technical terminology, assumes domain knowledge
- Output format: comprehensive report with technical depth, advanced concepts, expert insights

**Trigger Patterns**:
- Keywords: "deep dive", "comprehensive", "in-depth", "advanced", "expert-level", "everything about"
- Depth indicators: "all aspects", "complete analysis", "exhaustive", "thorough"
- Examples: "Deep dive on React Fiber architecture", "Comprehensive analysis of transformer models", "Everything about Kubernetes networking"

**Contrast with Existing Modes**:
- **vs overview**: Maximum depth vs breadth
- **vs academic**: Practical expertise vs scholarly research
- **Why useful**: Experts need comprehensive technical details, not simplified overviews

---

### Category 7: Specialized Use Cases (3 modes)

#### 21. **ethical** - "moral and ethical analysis"

**Description**: Analyze ethical implications, moral considerations, value conflicts, and philosophical dimensions.

**How It Works**:
- Searches for: ethical frameworks, philosophy papers, case studies, debate arguments
- Generates questions about: stakeholders, harms/benefits, principles, alternative perspectives
- Research plan: identify ethical dimensions → gather perspectives → analyze trade-offs → philosophical grounding
- Prioritizes: ethics journals, philosophical analyses, multi-stakeholder viewpoints
- Output format: ethical analysis with multiple perspectives, no single "right" answer

**Trigger Patterns**:
- Keywords: "ethical", "moral", "right/wrong", "should we", "implications", "values"
- Ethical language: "is it ethical", "morally acceptable", "consequences", "stakeholders"
- Examples: "Ethics of AI surveillance", "Is gene editing moral", "Privacy vs security debate"

**Contrast with Existing Modes**:
- **vs analytical**: Normative (should) vs descriptive (is)
- **vs overview**: Value-focused vs fact-focused
- **Why useful**: Ethical analysis requires philosophical frameworks, not just data

---

#### 22. **meta** - "research about research"

**Description**: Understand how to approach research, evaluate sources, design studies, avoid biases.

**How It Works**:
- Searches for: research methodology, source evaluation, epistemology, critical thinking
- Generates questions about: "how to research X", "how to evaluate Y", "what makes evidence strong"
- Research plan: methodology education → source evaluation → bias detection → research design
- Prioritizes: research methods textbooks, librarian guides, academic methodology
- Output: meta-advice about research strategy, not domain knowledge

**Trigger Patterns**:
- Keywords: "how to research", "how do I find", "evaluate sources", "research strategy", "methodology"
- Meta-questions: "how do I know", "what makes evidence credible", "research best practices"
- Examples: "How to research medical claims", "Evaluate news source credibility", "Design user research study"

**Contrast with Existing Modes**:
- **vs guidance**: Research skills vs topic approach
- **vs tutorial**: Meta-learning vs domain learning
- **Why useful**: Users need research literacy, not just research results

---

#### 23. **conversational** - "dialogue-based exploration"

**Description**: Multi-turn iterative exploration where LLM asks clarifying questions before final research.

**How It Works**:
- Initial response: "To give you the best answer, I need to understand..."
- Generates 3-5 clarifying questions about intent, scope, constraints, audience
- Waits for user responses before executing full research plan
- Adapts research strategy based on answers
- Research plan is co-created with user input

**Trigger Patterns**:
- Ambiguous queries: "Help me with marketing", "I need to build an app"
- Broad topics without specifics: "Climate change", "Investing"
- Vague requests: "Make me better at X", "Solve my problem"

**Contrast with Existing Modes**:
- **vs clarification**: Active dialogue vs single clarification request
- **vs guidance**: Collaborative vs prescriptive
- **Why useful**: Prevents wasting effort on wrong research direction

---

#### 24. **monitoring** - "ongoing tracking and alerts"

**Description**: Set up continuous monitoring of a topic with periodic updates and change detection.

**How It Works**:
- Establishes baseline understanding of topic
- Generates searches for: new developments, updates, changes since last check
- Research questions focus on: "what's new", "what changed", "recent updates"
- Research plan: baseline capture → change detection → impact analysis → alert threshold
- Output: delta report (what changed since last update)

**Trigger Patterns**:
- Keywords: "keep me updated", "track", "monitor", "watch for changes", "ongoing"
- Temporal scope: "daily updates", "weekly digest", "alert me when"
- Examples: "Monitor AI legislation", "Track competitor pricing", "Updates on clinical trial"

**Contrast with Existing Modes**:
- **vs trending**: Specific topic tracking vs general trends
- **vs forecasting**: Observing changes vs predicting future
- **Why useful**: Monitoring requires delta detection, not full research each time

---

#### 25. **multi-lingual** - "cross-language research synthesis"

**Description**: Research topic across multiple languages and cultural contexts, synthesize global perspectives.

**How It Works**:
- Identifies target languages from query or user preferences
- Generates search queries in multiple languages
- Searches: native-language sources, regional news, local experts, cultural contexts
- Research questions include: "how does [culture] view this", "regional differences"
- Research plan: English sources → target language sources → cultural translation → synthesis
- Output: globally-informed perspective highlighting cultural differences

**Trigger Patterns**:
- Keywords: "global perspective", "in [language]", "how does [country] view", "international"
- Multi-cultural: "Chinese vs Western view", "European regulations", "Japanese approach"
- Examples: "Global AI regulation", "Privacy laws worldwide", "Cultural attitudes toward climate"

**Contrast with Existing Modes**:
- **vs overview**: Multi-lingual vs English-only
- **vs comparison**: Cross-cultural vs cross-entity
- **Why useful**: English-only research misses regional expertise and cultural context

---

## Implementation Architecture

### 1. Mode Detection System

**Location**: `src/endpoints/planning.js` - `generatePlan()` function

**Current Detection**:
```javascript
// Simple keyword matching in LLM prompt
"Choose queryType from: overview, long-form, minimal, clarification, guidance"
```

**Proposed Enhancement**:
```javascript
// Multi-stage detection with confidence scoring

1. Keyword Analysis (40% weight)
   - Extract trigger keywords from query
   - Match against mode keyword dictionaries
   - Score: matches / total keywords

2. Intent Classification (30% weight)
   - Use separate LLM call with classification prompt
   - "Classify intent as: research, decision, learning, creative, etc."
   - Probabilistic output: {"trending": 0.8, "overview": 0.2}

3. Structural Analysis (20% weight)
   - Query structure: question vs statement vs command
   - Entity detection: entities mentioned, their types
   - Temporal markers: past, present, future indicators

4. User History (10% weight)
   - Recent queries and modes used
   - User preferences (if available)
   - Context from conversation

5. Final Mode Selection
   - Weighted score combination
   - Threshold for primary mode (>60% confidence)
   - Fallback: "overview" if no clear winner
   - Support for multi-mode (e.g., "comparison + technical")
```

### 2. Mode Configuration Schema

**Location**: `src/config/planning-modes.json` (new file)

```jsonc
{
  "modes": {
    "trending": {
      "id": "trending",
      "name": "Current Events Tracking",
      "description": "Real-time analysis of breaking news and trending topics",
      "category": "time-based",
      "triggers": {
        "keywords": ["latest", "breaking", "today", "current", "trending", "now", "recent"],
        "patterns": ["after:YYYY-MM-DD", "this week", "yesterday"],
        "intent": ["time-sensitive", "news"],
        "examples": ["Latest AI developments", "Breaking news about SpaceX"]
      },
      "config": {
        "searchQueries": {
          "count": 15,  // More queries than default (8-12)
          "recencyBias": 0.9,  // Heavily prioritize recent
          "dateFilter": "week",  // Only last week
          "sources": ["news", "social", "blogs"]
        },
        "researchQuestions": {
          "count": 10,
          "templates": [
            "What happened in the last 24 hours regarding {topic}?",
            "What are the latest developments in {topic}?",
            "Who are the key players in this developing story?",
            "What is the current status of {topic}?"
          ]
        },
        "sources": {
          "priority": ["news-sites", "twitter", "reddit", "tech-blogs"],
          "avoid": ["academic-papers", "books", "historical-archives"]
        },
        "llmSettings": {
          "temperature": 0.3,  // Lower for factual accuracy
          "maxTokens": 2000,
          "systemPromptSuffix": "Focus on the most recent information. Cite publication dates. Distinguish between confirmed facts and speculation."
        },
        "outputFormat": {
          "timeline": true,  // Include chronological timeline
          "sources": "with-dates",  // Show source dates prominently
          "updates": "highlighted"  // Highlight what changed recently
        }
      },
      "relatedModes": ["monitoring", "forecasting"],
      "complexity": "moderate"
    },
    
    "historical": {
      "id": "historical",
      "name": "Chronological Deep Dive",
      "description": "Trace evolution across time periods",
      // ... similar structure
    }
    
    // ... all 25 modes
  },
  
  "modeRelationships": {
    "trending": {
      "upgrades": ["monitoring"],  // More complex version
      "alternatives": ["overview", "forecasting"],
      "combines": ["trending + comparison", "trending + sentiment"]
    }
  },
  
  "fallbackChain": [
    "requested-mode",
    "auto-detected-mode",
    "overview",
    "minimal"
  ]
}
```

### 3. Mode Orchestration Engine

**Location**: `src/planning/mode-orchestrator.js` (new file)

```javascript
/**
 * Planning Mode Orchestrator
 * Detects, configures, and executes planning modes
 */

class PlanningModeOrchestrator {
  constructor(modeConfigPath = './config/planning-modes.json') {
    this.modes = require(modeConfigPath).modes;
    this.modeDetector = new ModeDetector(this.modes);
    this.templateEngine = new PromptTemplateEngine();
  }
  
  /**
   * Analyze query and select best planning mode
   */
  async detectMode(query, userContext = {}) {
    const scores = {
      keyword: this.modeDetector.scoreKeywords(query),
      intent: await this.modeDetector.classifyIntent(query),
      structure: this.modeDetector.analyzeStructure(query),
      context: this.modeDetector.scoreContext(userContext)
    };
    
    // Weighted combination
    const finalScores = this.combineScores(scores);
    const topMode = this.selectTopMode(finalScores);
    
    return {
      primaryMode: topMode.id,
      confidence: topMode.score,
      alternatives: this.getAlternatives(finalScores, 3),
      reasoning: this.explainSelection(scores, topMode)
    };
  }
  
  /**
   * Generate mode-specific research plan
   */
  async generatePlan(mode, query, providers) {
    const modeConfig = this.modes[mode];
    
    // Build mode-specific prompt
    const prompt = this.templateEngine.buildPrompt({
      mode: modeConfig,
      query: query,
      searchCount: modeConfig.config.searchQueries.count,
      questionTemplates: modeConfig.config.researchQuestions.templates,
      outputFormat: modeConfig.config.outputFormat
    });
    
    // Call LLM with mode-specific settings
    const plan = await this.callPlanningLLM(prompt, {
      temperature: modeConfig.config.llmSettings.temperature,
      maxTokens: modeConfig.config.llmSettings.maxTokens
    });
    
    // Post-process based on mode
    return this.postProcessPlan(plan, modeConfig);
  }
  
  /**
   * Execute multi-mode plans (e.g., "comparison + technical")
   */
  async executeMultiMode(modes, query, providers) {
    const plans = await Promise.all(
      modes.map(mode => this.generatePlan(mode, query, providers))
    );
    
    return this.mergePlans(plans, modes);
  }
}

class ModeDetector {
  scoreKeywords(query) {
    const queryLower = query.toLowerCase();
    const scores = {};
    
    for (const [modeId, modeConfig] of Object.entries(this.modes)) {
      const triggers = modeConfig.triggers.keywords || [];
      const matches = triggers.filter(keyword => 
        queryLower.includes(keyword.toLowerCase())
      ).length;
      
      scores[modeId] = matches / Math.max(triggers.length, 1);
    }
    
    return scores;
  }
  
  async classifyIntent(query) {
    // Use fast classification LLM
    const response = await this.callClassificationLLM(`
      Classify the user's intent for this query: "${query}"
      
      Choose from these categories (can select multiple):
      - time-sensitive (needs current/breaking information)
      - decision-support (choosing between options)
      - learning (wants to understand or learn)
      - creative (generating ideas or content)
      - analytical (deep analysis required)
      - technical (code/implementation focused)
      - strategic (business/planning focused)
      
      Return JSON: {"categories": ["category1", "category2"], "confidence": 0.85}
    `);
    
    return response.categories;
  }
  
  analyzeStructure(query) {
    return {
      isQuestion: query.includes('?'),
      hasComparison: /\b(vs|versus|compare|difference)\b/i.test(query),
      hasTimeReference: this.extractTimeReferences(query).length > 0,
      hasMultipleEntities: this.extractEntities(query).length > 1,
      wordCount: query.split(/\s+/).length,
      complexity: this.estimateComplexity(query)
    };
  }
}

class PromptTemplateEngine {
  buildPrompt({ mode, query, searchCount, questionTemplates, outputFormat }) {
    return `
You are a ${mode.name} specialist. Your task is to create a comprehensive ${mode.description.toLowerCase()}.

User Query: "${query}"

**Mode-Specific Instructions**:
${this.getModeInstructions(mode)}

**Search Strategy**:
- Generate ${searchCount} highly specific search queries for this topic
${mode.config.searchQueries.recencyBias ? `- Prioritize sources from the last ${mode.config.searchQueries.dateFilter}` : ''}
- Focus on these source types: ${mode.config.sources.priority.join(', ')}
- Avoid these source types: ${mode.config.sources.avoid.join(', ')}

**Research Questions**:
Generate ${questionTemplates.length}-${questionTemplates.length + 5} questions following these templates:
${questionTemplates.map((t, i) => `${i + 1}. ${t.replace('{topic}', 'this topic')}`).join('\n')}

**Output Requirements**:
${this.formatOutputRequirements(outputFormat)}

${mode.config.llmSettings.systemPromptSuffix}

Respond with valid JSON following this structure:
${this.getJSONSchema(mode)}
    `.trim();
  }
  
  getModeInstructions(mode) {
    // Mode-specific behavior instructions
    const instructions = {
      trending: "Focus on the MOST RECENT information only. Include timestamps. Separate confirmed facts from rumors/speculation.",
      historical: "Create a chronological narrative. Identify key turning points and evolution stages.",
      comparison: "Create balanced comparison across all dimensions. Use comparison tables.",
      diagnostic: "Follow systematic troubleshooting methodology. Prioritize proven solutions.",
      // ... etc
    };
    
    return instructions[mode.id] || mode.description;
  }
}

module.exports = { PlanningModeOrchestrator, ModeDetector };
```

### 4. Integration with Existing Planning Endpoint

**Location**: `src/endpoints/planning.js` - modify `generatePlan()` function

```javascript
// BEFORE (current)
async function generatePlan(query, providers, requestedModel, ...) {
  // Hardcoded prompt with 5 modes
  const prompt = `Choose queryType from: overview, long-form, minimal, clarification, guidance`;
  // ...
}

// AFTER (with orchestrator)
const { PlanningModeOrchestrator } = require('../planning/mode-orchestrator');
const orchestrator = new PlanningModeOrchestrator();

async function generatePlan(query, providers, requestedModel, ...) {
  // Step 1: Detect best mode
  const modeDetection = await orchestrator.detectMode(query, {
    userHistory: [], // TODO: track user query history
    preferences: {}
  });
  
  console.log(`🎯 Detected planning mode: ${modeDetection.primaryMode} (${Math.round(modeDetection.confidence * 100)}% confidence)`);
  console.log(`📊 Alternative modes: ${modeDetection.alternatives.map(a => a.id).join(', ')}`);
  
  // Emit mode detection to UI
  if (eventCallback) {
    eventCallback('mode_detected', {
      mode: modeDetection.primaryMode,
      confidence: modeDetection.confidence,
      alternatives: modeDetection.alternatives,
      reasoning: modeDetection.reasoning
    });
  }
  
  // Step 2: Check if multi-mode needed
  const isMultiMode = modeDetection.confidence < 0.6 && modeDetection.alternatives.length > 0;
  
  let plan;
  if (isMultiMode) {
    // Combine top 2 modes
    plan = await orchestrator.executeMultiMode(
      [modeDetection.primaryMode, modeDetection.alternatives[0].id],
      query,
      providers
    );
  } else {
    // Single mode execution
    plan = await orchestrator.generatePlan(
      modeDetection.primaryMode,
      query,
      providers
    );
  }
  
  // Step 3: Add mode metadata to response
  return {
    ...plan,
    _meta: {
      mode: modeDetection.primaryMode,
      modeConfidence: modeDetection.confidence,
      alternativeModes: modeDetection.alternatives,
      isMultiMode: isMultiMode
    }
  };
}
```

---

## Code Implementation Plan

### Phase 1: Foundation (Week 1)

**Goal**: Create mode configuration infrastructure without changing existing behavior

#### Tasks:

1. **Create Mode Config Schema** (Day 1-2)
   - File: `src/config/planning-modes.json`
   - Define all 25 modes with full configuration
   - Validate JSON schema
   - Document mode properties

2. **Build Mode Detector** (Day 3-4)
   - File: `src/planning/mode-detector.js`
   - Implement keyword scoring
   - Implement structural analysis
   - Unit tests for detection accuracy

3. **Create Prompt Template Engine** (Day 5)
   - File: `src/planning/prompt-template.js`
   - Mode-specific prompt generation
   - Template variable substitution
   - JSON schema generation per mode

### Phase 2: Orchestration (Week 2)

**Goal**: Implement mode orchestration with fallback to existing system

#### Tasks:

1. **Build Orchestrator** (Day 1-3)
   - File: `src/planning/mode-orchestrator.js`
   - Mode detection pipeline
   - Multi-mode support
   - Plan merging logic

2. **Integrate with Planning Endpoint** (Day 4-5)
   - Modify `src/endpoints/planning.js`
   - Feature flag: `ENABLE_ADVANCED_MODES=true/false`
   - Fallback to existing 5-mode system if flag disabled
   - Emit mode detection events to UI

### Phase 3: UI Integration (Week 3)

**Goal**: Show mode detection in UI and allow manual mode override

#### Tasks:

1. **Update PlanningDialog UI** (Day 1-2)
   - File: `ui-new/src/components/PlanningDialog.tsx`
   - Display detected mode with confidence
   - Show alternative modes as chips
   - Add mode selector dropdown (optional override)

2. **Add Mode Explainer** (Day 3)
   - Show mode description and why it was selected
   - "Change mode" button to override detection
   - Mode selection affects research plan generation

3. **Update Result Display** (Day 4-5)
   - Mode-specific result formatting (e.g., timeline for trending mode)
   - Mode badge on saved plans
   - Filter saved plans by mode

### Phase 4: Advanced Features (Week 4)

**Goal**: Multi-mode support, user preferences, mode analytics

#### Tasks:

1. **Multi-Mode Execution** (Day 1-2)
   - Execute 2+ modes in parallel
   - Merge research plans intelligently
   - UI: show multi-mode badge

2. **User Preferences** (Day 3)
   - Allow users to favor certain modes
   - "Always use X mode for Y queries" rules
   - Mode usage analytics dashboard

3. **Mode Analytics** (Day 4-5)
   - Track mode usage statistics
   - Mode accuracy feedback ("Was this the right mode?")
   - Improve detection over time with user feedback

### Phase 5: Testing & Refinement (Week 5)

**Goal**: Validate all modes work correctly, refine detection

#### Tasks:

1. **Mode-Specific Testing** (Day 1-3)
   - Create test queries for each of 25 modes
   - Validate mode detection accuracy
   - Validate mode-specific search strategies
   - Compare output quality vs generic "overview" mode

2. **Performance Optimization** (Day 4)
   - Cache mode configurations
   - Optimize detection pipeline
   - Measure latency added by mode detection

3. **Documentation** (Day 5)
   - Update API documentation with mode list
   - User guide for each mode with examples
   - Developer docs for adding new modes

---

## Benefits Analysis

### 1. User Experience Benefits

**Before Expansion**:
- User asks: "Latest AI developments"
- System uses: "overview" mode (generic research)
- Result: Mix of old and new info, no recency bias
- User satisfaction: Low (needs to manually filter for recent)

**After Expansion**:
- User asks: "Latest AI developments"
- System detects: "trending" mode (92% confidence)
- System applies: Recency filters, news sources, date-based searches
- Result: Only information from last week, clearly dated
- User satisfaction: High (exactly what they wanted)

### 2. Cost Optimization

**Scenario**: User asks "What is HTTP?"

**Before**:
- Mode: "overview" (default)
- Search queries: 10 web searches
- Token usage: 3000 tokens for comprehensive plan
- Cost: ~$0.002 per query

**After**:
- Mode: "minimal" (detected simple question)
- Search queries: 1 targeted search
- Token usage: 500 tokens for simple answer
- Cost: ~$0.0003 per query
- **Savings**: 85% cost reduction for simple queries

### 3. Quality Improvements

**Example: Medical Query**

**Before (overview mode)**:
- Searches generic web, may include unreliable sources
- No medical disclaimers
- Mixes clinical and anecdotal information

**After (medical mode)**:
- Searches only: PubMed, Mayo Clinic, NIH
- Includes prominent medical disclaimers
- Separates clinical evidence from patient experiences
- **Quality**: Medical-grade accuracy

### 4. Developer Productivity

**Example: Technical Implementation**

**Before (overview mode)**:
- "How to use React hooks"
- Result: Conceptual explanation, few code examples
- Developer needs to search for actual implementation

**After (technical mode)**:
- Detects implementation query
- Prioritizes: official docs, code examples, GitHub repos
- Result: Working code snippets, API references, version-specific guidance
- **Time saved**: Developer gets answer 5x faster

---

## Migration Strategy

### Backward Compatibility

**Requirement**: Existing 5 modes must continue to work

**Implementation**:
```javascript
// Legacy mode mapping
const legacyModeMap = {
  'overview': 'overview',  // Maps to new "overview" mode
  'long-form': 'long-form',  // Maps to new "long-form" mode
  'minimal': 'minimal',  // Maps to new "minimal" mode
  'clarification': 'clarification',  // Maps to new "clarification" mode
  'guidance': 'guidance'  // Maps to new "guidance" mode
};

// If query used old mode explicitly, honor it
if (requestedMode && legacyModeMap[requestedMode]) {
  return orchestrator.generatePlan(legacyModeMap[requestedMode], query, providers);
}
```

### Feature Flag Rollout

**Staged Deployment**:

1. **Week 1-2**: Internal testing only
   - Flag: `ADVANCED_MODES_INTERNAL=true`
   - Only available to developer accounts
   - Monitor error rates, latency

2. **Week 3-4**: Beta users (10% traffic)
   - Flag: `ADVANCED_MODES_BETA=true`
   - Opt-in beta program
   - Collect feedback on mode accuracy

3. **Week 5-6**: Gradual rollout (50% traffic)
   - Flag: `ADVANCED_MODES_ENABLED=true`
   - A/B test vs old system
   - Monitor satisfaction metrics

4. **Week 7+**: Full deployment (100% traffic)
   - Advanced modes become default
   - Old system remains as fallback
   - Legacy API endpoints supported

### User Education

**UI Changes**:
1. **Mode Badge**: Show mode name and icon in results
2. **Mode Explainer**: Tooltip explaining why this mode was chosen
3. **Mode Gallery**: Browse all 25 modes with examples
4. **Feedback Loop**: "Was this the right mode?" thumbs up/down

**Documentation**:
1. Update HelpPage with mode descriptions
2. Create mode selection guide ("When to use each mode")
3. Video tutorials for power users
4. API documentation for mode parameter

---

## Success Metrics

### Detection Accuracy

**Target**: 85% mode detection accuracy

**Measurement**:
- User feedback: "Was this the right mode?" (yes/no)
- Manual evaluation: 100 test queries, expert judgment
- A/B test: mode-specific vs generic results (user preference)

### Performance Impact

**Target**: <500ms latency added for mode detection

**Measurement**:
- Time from query received to mode selected
- Benchmark: 100 queries, p50/p95/p99 latency
- Optimize if p95 > 500ms

### User Satisfaction

**Target**: 20% improvement in user satisfaction scores

**Measurement**:
- Post-query survey: "How helpful was this result?" (1-5 stars)
- Compare: mode-specific vs generic "overview"
- Track: mode-specific satisfaction (which modes work best)

### Cost Efficiency

**Target**: 30% reduction in average token usage

**Measurement**:
- Track tokens per query before/after
- Savings from "minimal" mode for simple queries
- ROI: reduced cost vs development investment

---

## Future Enhancements

### Phase 6: Adaptive Modes (Month 2)

**Concept**: Modes evolve based on user feedback

1. **Personalized Modes**
   - User-specific mode preferences
   - "Always use technical mode when I ask about code"
   - Learn from user's manual mode overrides

2. **Dynamic Mode Tuning**
   - Adjust mode parameters based on feedback
   - If "trending" mode gets low ratings, increase search count
   - A/B test different configurations

3. **Context-Aware Detection**
   - Use conversation history to improve detection
   - If previous query was technical, bias toward technical mode
   - Multi-turn mode refinement

### Phase 7: Community Modes (Month 3)

**Concept**: Users create custom modes

1. **Mode Builder UI**
   - Visual interface to configure new modes
   - Set search strategies, question templates, source priorities
   - Test mode with sample queries

2. **Mode Marketplace**
   - Share custom modes with community
   - "Reddit Mode", "Academic CS Mode", "Crypto News Mode"
   - Download and import community modes

3. **Mode Forking**
   - Clone existing mode and customize
   - Contribute improvements back to core modes
   - Version control for modes

---

## Conclusion

This plan expands planning modes from 5 to 25+, providing:

1. **Specialized Research**: Each mode optimized for specific query types
2. **Better Detection**: Multi-factor detection with 85%+ accuracy target
3. **Cost Efficiency**: 30% token reduction via appropriate mode selection
4. **User Satisfaction**: 20% improvement via mode-specific strategies
5. **Extensibility**: Framework for adding unlimited custom modes

**Total Development Time**: 5 weeks (foundation + deployment)

**Total Investment**: ~200 engineer-hours

**Expected ROI**: 
- 30% cost savings = ~$X/month (depends on query volume)
- 20% satisfaction increase = lower churn, higher engagement
- Competitive advantage: No other LLM proxy has 25 specialized planning modes

**Approval Status**: ⏸️ Awaiting stakeholder review

**Next Steps**:
1. Review this plan with team
2. Approve/reject/modify proposal
3. If approved: Begin Phase 1 (Foundation)
4. If rejected: Document reasons and alternative approaches

---

**END OF PLAN**
