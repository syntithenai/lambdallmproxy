# Image Editor Feature - Overview

## Project Summary

Add a full-featured image editing capability to the Swag page that allows users to:
- Edit individual images from snippets
- Bulk edit multiple images from selected snippets
- Use natural language commands to manipulate images
- Apply predefined transformations via quick-action buttons
- Generate new images using LLM image providers as fallback

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React/UI)                      │
├─────────────────────────────────────────────────────────────┤
│  • Swag Page (snippet list with edit buttons)              │
│  • Image Editor Dialog (full-screen modal)                 │
│  • Image Grid (3-column responsive layout)                 │
│  • Bulk Operations Bar (transformation buttons)            │
│  • Command Input (natural language textarea)               │
│  • Progress Toasts (real-time status updates)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Backend API Gateway                         │
├─────────────────────────────────────────────────────────────┤
│  • /image-edit endpoint (new Lambda function)               │
│  • Tool definitions for ImageMagick operations              │
│  • LLM integration for command parsing                      │
│  • Progress event streaming (SSE)                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Image Processing Lambda                         │
├─────────────────────────────────────────────────────────────┤
│  • ImageMagick CLI wrapper                                  │
│  • Image format conversion                                  │
│  • Transformation operations (resize, crop, rotate, etc.)   │
│  • Memory: 2048MB (suitable for image processing)           │
│  • Timeout: 300 seconds (5 minutes)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Storage & Integration                      │
├─────────────────────────────────────────────────────────────┤
│  • IndexedDB (store generated images)                       │
│  • Swag snippets (auto-add generated images)                │
│  • Image metadata (tags, names, timestamps)                 │
└─────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Entry Points
- **Dedicated Page**: Image editor on a dedicated routable page (`/image-editor`)
- **Navigation**: 
  - Back to Swag button in the nav header
  - Navigation button on bottom right (above settings/help/privacy/github on desktop)
  - In nav dropdown on mobile (above settings/help/privacy/github)
- **Individual Image Edit**: Edit button on each image in snippet cards (navigates to `/image-editor`)
- **Bulk Image Edit**: Bulk operations button when snippets are selected (navigates to `/image-editor`)
- **Multi-image Support**: Extract all images from selected snippets and pass to editor page

### 2. Image Editor Page
- **Dedicated route**: `/image-editor` with full page layout
- **Responsive layout**: 3-column grid on desktop, 1-column on mobile
- **Image selection**: Checkbox on each image for bulk operations
- **Fixed input area**: Command textarea stays at bottom
- **Floating toolbar**: Bulk operation buttons above textarea
- **Navigation**: Back to Swag button in header

### 3. Bulk Operations
- **Quick transformations**: Preset buttons for common operations
  - Resize (25%, 50%, 75%, 150%, 200%)
  - Rotate (90°, 180°, 270°)
  - Flip (horizontal, vertical)
  - Format conversion (JPG, PNG, WebP)
  - Quality adjustment (low, medium, high)
  - Filters (grayscale, sepia, blur, sharpen)
- **Select all/none**: Batch selection controls
- **Apply to selection**: Operations apply only to checked images

### 4. Natural Language Commands
- **Text input**: Users type transformation commands
- **LLM parsing**: Convert natural language to tool calls
- **Tool execution**: Execute ImageMagick operations
- **Fallback**: Use LLM image generation if direct manipulation fails

### 5. Progress & Feedback
- **Real-time progress**: Server-sent events (SSE) for status updates
- **Toast notifications**: Show processing status per image
- **Visual feedback**: Highlight newly generated images
- **Error handling**: Display failures with retry options

### 6. Output Management
- **Auto-save to Swag**: Generated images added as new snippets
- **Naming**: User-provided or auto-generated names
- **Tagging**: Metadata for organization and search
- **Ordering**: New images appear at top with visual highlight

## Technology Stack

### Frontend
- **React**: Component architecture
- **TypeScript**: Type safety
- **Tailwind CSS**: Responsive styling
- **React Query**: State management for async operations
- **EventSource/SSE**: Real-time progress updates
- **IndexedDB**: Local storage for images

### Backend
- **AWS Lambda**: Serverless compute
  - Main Lambda: Existing function (orchestration)
  - Image Lambda: New function (ImageMagick processing)
- **ImageMagick**: Image manipulation library
- **Lambda Layer**: Package ImageMagick binary
- **Node.js**: Runtime environment
- **Stream API**: Progress event streaming

### APIs & Integration
- **REST API**: HTTP endpoints for image operations
- **Server-Sent Events**: Real-time progress updates
- **Tool Calling**: LLM integration for command parsing
- **Image Providers**: Fallback for generative operations

## Project Phases

### Phase 1: Planning & Design
- [x] Detailed technical specifications
- [x] UI/UX mockups and wireframes
- [ ] API contract definition
- [ ] Database schema updates

### Phase 2: Backend Infrastructure
- [ ] Create image processing Lambda function
- [ ] Build ImageMagick Lambda Layer
- [ ] Implement tool definitions
- [ ] Create streaming endpoint

### Phase 3: Frontend Components
- [x] Build image editor page
- [x] Create image grid component
- [x] Implement bulk operations UI
- [x] Add command input interface
- [x] Add navigation button
- [x] Add route to App

### Phase 4: Integration & Testing
- [ ] Connect frontend to backend
- [ ] Implement SSE progress updates
- [ ] Test bulk operations
- [ ] Validate error handling

### Phase 5: Optimization & Polish
- [ ] Performance optimization
- [ ] UI/UX refinements
- [ ] Documentation
- [ ] Deployment

## Success Criteria

### Functional Requirements
- ✅ Users can edit individual images from snippets
- ✅ Users can bulk edit multiple images
- ✅ Natural language commands work correctly
- ✅ Quick-action buttons apply transformations
- ✅ Progress updates display in real-time
- ✅ Generated images auto-save to Swag
- ✅ Mobile-responsive layout

### Performance Requirements
- ✅ Image processing completes within 30 seconds per image
- ✅ UI remains responsive during processing
- ✅ Progress updates stream without lag
- ✅ Memory usage stays within Lambda limits (2048MB)

### Quality Requirements
- ✅ No data loss during processing
- ✅ Error messages are clear and actionable
- ✅ Images maintain quality after transformations
- ✅ Consistent behavior across browsers

## Risk Assessment

### Technical Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| ImageMagick Lambda layer size | High | Use optimized build, strip debug symbols |
| Memory limits for large images | High | Set 2048MB memory, implement size limits |
| Processing timeouts | Medium | Set 5-minute timeout, chunk operations |
| SSE connection drops | Medium | Implement reconnection logic, fallback polling |

### User Experience Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Unclear command syntax | Medium | Provide examples, autocomplete |
| Slow processing feedback | High | Real-time progress updates, optimistic UI |
| Lost work on errors | High | Auto-save intermediate results |
| Mobile usability issues | Medium | Responsive design, touch-friendly UI |

## Next Steps

1. Review and approve this overview
2. Create detailed implementation documents:
   - Frontend architecture
   - Backend architecture
   - API specification
   - Database schema
   - Deployment plan
3. Estimate effort and timeline
4. Begin implementation in phases

## Related Documents

- [Frontend Implementation Plan](./IMAGE_EDITOR_FRONTEND.md)
- [Backend Implementation Plan](./IMAGE_EDITOR_BACKEND.md)
- [API Specification](./IMAGE_EDITOR_API.md)
- [Tool Definitions](./IMAGE_EDITOR_TOOLS.md)
- [Deployment Guide](./IMAGE_EDITOR_DEPLOYMENT.md)
- [Testing Strategy](./IMAGE_EDITOR_TESTING.md)
