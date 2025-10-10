# Complete Link Filtering Guide

This document explains how the system filters and prioritizes links to show only relevant content.

## Overview

The link extraction system now applies **multi-layer filtering** to remove navigation, ads, and irrelevant links while prioritizing content that answers the user's query.

## Filtering Layers

### Layer 1: URL Pattern Filtering

**Purpose:** Block common navigation and utility URL patterns

**Blocked Patterns:**
```
Navigation:       /page/, /edit/, /user/, /admin/, /login/, /signup/, /register/
Site Sections:    /privacy, /terms, /about, /contact, /sitemap, /rss
Utility:          /cookie, /disclaimer, /advertise, /careers, /jobs
Sharing:          ?share=, /share/, /print/, /pdf/
Social Media:     ?utm_, /facebook.com/sharer, /twitter.com/intent
System:           javascript:, #, mailto:, /search?, /tag/, /category/
```

**Example:**
- ✅ `https://techcrunch.com/2024/ai-breakthrough/` (kept)
- ❌ `https://techcrunch.com/privacy-policy/` (filtered)
- ❌ `https://techcrunch.com/about/` (filtered)

### Layer 2: Ad Domain Filtering

**Purpose:** Block advertising and tracking networks

**Blocked Domains:**
```
Ad Networks:      doubleclick.net, googlesyndication.com, googleadservices.com
                  advertising.com, adnxs.com, criteo.com
Content Ads:      outbrain.com, taboola.com, revcontent.com, mgid.com
                  zergnet.com
Social Widgets:   disqus.com, spot.im
Share Buttons:    facebook.com/sharer, twitter.com/intent, linkedin.com/share
```

**Example:**
- ✅ `https://nytimes.com/article/story` (kept)
- ❌ `https://ads.doubleclick.net/click...` (filtered)
- ❌ `https://www.outbrain.com/recommended...` (filtered)

### Layer 3: Link Text Filtering

**Purpose:** Filter by common navigation phrases

**Blocked Text Patterns:**
```
Navigation:       Home, About, Contact, Menu, Navigation, Skip to...
Authentication:   Login, Sign In, Sign Up, Register, Subscribe
Utility:          Print, Email, Share, Follow Us, Social
Actions:          Next, Previous, More, View All, Back to Top
Legal:            Privacy, Terms, Copyright, All Rights Reserved
```

**Example:**
- ✅ `The Ultimate Guide to Python` (kept)
- ❌ `Home` (filtered)
- ❌ `Sign Up for Newsletter` (filtered)

### Layer 4: HTML Structure Filtering

**Purpose:** Remove links from navigation elements

**Blocked HTML Contexts:**
```html
<header>...</header>          <!-- Site header -->
<footer>...</footer>          <!-- Site footer -->
<nav>...</nav>                <!-- Navigation menu -->
<aside>...</aside>            <!-- Sidebar -->

<!-- Ad-related classes/IDs -->
<a class="advertisement">...</a>
<a id="sidebar-nav">...</a>
<div class="sponsored">
  <a>...</a>
</div>
```

**Example:**
```html
✅ <main><article><a href="story">Article</a></article></main>  (kept)
❌ <header><nav><a href="/">Home</a></nav></header>             (filtered)
❌ <footer><a href="/privacy">Privacy</a></footer>              (filtered)
```

### Layer 5: Position-Based Filtering

**Purpose:** Filter links at page edges (likely header/footer)

**Rules:**
- **Top 10%** of page → Likely header navigation → Penalty -0.3
- **Bottom 10%** of page → Likely footer → Penalty -0.3
- **Middle 80%** of page → Likely content → No penalty

**Example:**
```
Page Structure:
┌─────────────────────┐
│ Header (Top 10%)    │ ← Links penalized -0.3
├─────────────────────┤
│                     │
│ Content (80%)       │ ← Links kept with full score
│                     │
├─────────────────────┤
│ Footer (Bottom 10%) │ ← Links penalized -0.3
└─────────────────────┘
```

### Layer 6: CSS Class/ID Filtering

**Purpose:** Remove links with ad-related styling

**Blocked Class/ID Keywords:**
```
ad, advertisement, sponsored, promo, banner
sidebar, widget, footer, header, nav
```

**Example:**
```html
✅ <a class="article-link" href="...">Story</a>           (kept)
❌ <a class="sidebar-ad" href="...">Sponsored</a>         (filtered)
❌ <a id="nav-menu-item" href="...">Menu</a>              (filtered)
```

### Layer 7: Link Length Filtering

**Purpose:** Remove empty or extremely long link text

**Rules:**
- **< 3 characters** (non-numeric) → Filtered (navigation arrows)
- **> 150 characters** → Filtered (likely malformed)
- **0 characters** → Filtered (empty)

**Example:**
- ✅ `Read More` (kept)
- ❌ `←` (filtered - too short)
- ❌ `This is an extremely long link text that goes on and on...` (filtered)

## Relevance Scoring

After filtering, remaining links are scored for relevance:

### Scoring Formula

```
Base Score = Query Keyword Match in (Text + Caption + Context)

Boosts:
  + 0.2  if link text is 20-100 characters (article-length titles)
  + 0.1  if context around link is > 50 characters (descriptive)

Penalties:
  - 0.3  if link is in top/bottom 10% of page (edge areas)

Final Score = Clamp(Base + Boosts - Penalties, 0, 1)
```

### Example Calculation

**Link:** `"AI Breakthrough: New Model Achieves 95% Accuracy"`
**Query:** `"AI breakthrough"`

```
Base Score:    0.7  (strong keyword match)
Text Boost:    +0.2 (39 chars - perfect article title length)
Context Boost: +0.1 (paragraph around link is descriptive)
Position:      0.0  (middle of page - no penalty)
─────────────────────
Final Score:   1.0  (excellent relevance)
```

**Link:** `"Home"`
**Query:** `"AI breakthrough"`

```
Base Score:    0.0  (no keyword match)
Text Boost:    0.0  (only 4 chars - too short for article)
Context Boost: 0.0  (minimal context)
Position:      -0.3 (in top 5% of page - header area)
─────────────────────
Final Score:   0.0  (filtered out)
```

## Link Limits

After filtering and scoring, links are limited:

| Source | Limit | Priority |
|--------|-------|----------|
| Search Results | All | Highest |
| Scraped Pages (per page) | Top 30 | High |
| Prioritized Display | Top 5 scraped | High |
| Expandable Section | Top 20 scraped | Medium |

### Extraction Flow

```
1. Extract all <a> tags from HTML
   ↓
2. Apply 7 filtering layers
   ↓ (70-80% filtered out)
3. Score remaining links for relevance
   ↓
4. Sort by relevance score (descending)
   ↓
5. Limit to top N links
   ↓
6. Categorize (search results vs scraped)
   ↓
7. Present to user (prioritized + expandable)
```

## Real-World Examples

### Example 1: News Article

**Query:** `"climate change report 2024"`

**Before Filtering (150 links):**
- Home, About, Contact, Privacy, Terms
- Share on Facebook, Tweet, Email
- Subscribe, Login, Sign Up
- More Articles, Popular, Trending
- Climate Article 1, Climate Article 2, ...
- Footer: Careers, Advertise, Help

**After Filtering (12 links):**
- Climate Article 1: IPCC Report Summary
- Climate Article 2: Scientists Warn of Tipping Points
- Climate Article 3: Global Temperatures Rising
- Related: Paris Agreement Updates
- Related: Renewable Energy Advances
- ... (more content links)

### Example 2: Technical Tutorial

**Query:** `"python async await tutorial"`

**Before Filtering (200+ links):**
- Python.org Home, Documentation, Downloads
- Sign In, Register, Community, Events
- Twitter, Facebook, LinkedIn
- Async Tutorial 1, Async Tutorial 2
- Sidebar: Quick Links, Reference, FAQ
- Footer: Privacy, Terms, Sitemap

**After Filtering (18 links):**
- Python Async/Await Tutorial
- Asyncio Documentation
- Coroutines and Tasks Guide
- Real-World Async Examples
- Performance Comparison
- ... (more tutorial links)

## Testing the Filter

### Test Commands

```bash
# Deploy the changes
make deploy-lambda-fast

# Test with queries
curl -X POST https://your-lambda-url/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "AI news"}]}'
```

### What to Verify

**✅ Good Signs:**
- Links are all content-related
- No "Home", "Privacy", "Contact" links
- No social sharing buttons
- No ad network URLs
- 20-50 total links (not 100+)
- Links match the query topic

**❌ Bad Signs:**
- Navigation links still present
- Social sharing buttons included
- Ad network URLs appearing
- 100+ links extracted
- Irrelevant links to site structure

## Adjusting Filters

### To Make Filtering More Aggressive

```javascript
// src/html-parser.js
extractLinks(maxLinks = 30)  // Reduce from 50

// src/endpoints/chat.js
scrapedLinks.slice(0, 3)     // Reduce from 5 (prioritized)
scrapedLinks.slice(0, 10)    // Reduce from 20 (expandable)
```

### To Make Filtering Less Aggressive

```javascript
// src/html-parser.js
extractLinks(maxLinks = 100) // Increase from 50

// Comment out specific filters in shouldFilterLink()
// if (textLower.length < 3) {
//   return true; // Disabled: allow short links
// }
```

### To Add Custom Patterns

```javascript
// src/html-parser.js - shouldFilterLink()

// Add URL patterns
const navPatterns = [
  '/your-custom-pattern/',
  // ... existing patterns
];

// Add domains
const adDomains = [
  'your-ad-domain.com',
  // ... existing domains
];

// Add text patterns
const navTextPatterns = [
  /^your pattern$/i,
  // ... existing patterns
];
```

## Performance Impact

**Before:**
- Parse 1000+ links per page
- Store all in memory
- Send 500+ links to LLM
- Context window quickly filled

**After:**
- Parse 1000+ links (same)
- Filter to 30-50 relevant
- Send only relevant to LLM
- 70-80% context saved

**Result:**
- ⚡ Faster processing
- 💾 Less memory usage
- 🎯 Better LLM responses
- 👍 Happier users

---

**Last Updated:** October 10, 2025
**Status:** ✅ Production
**Version:** 2.0 (Enhanced Filtering)
