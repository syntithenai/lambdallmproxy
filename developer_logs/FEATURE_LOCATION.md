# Location Feature Implementation

## Overview

The location feature enables the application to request browser geolocation data and send it with chat requests to provide context-aware responses. This is particularly useful for location-specific queries about weather, local businesses, directions, and regional information.

## Implementation Date

- **Date**: January 12, 2025
- **Status**: ✅ Complete and deployed

## Components

### 1. LocationContext (`ui-new/src/contexts/LocationContext.tsx`)

React context that manages browser geolocation state and reverse geocoding.

**Key Features**:
- Browser Geolocation API integration with high accuracy mode
- OpenStreetMap Nominatim API for reverse geocoding (coordinates → address)
- Permission state management with change listener
- LocalStorage persistence with 24-hour expiry
- Comprehensive error handling

**API Configuration**:
- **Endpoint**: `https://nominatim.openstreetmap.org/reverse`
- **User-Agent**: `'LLMProxyChat/1.0'` (required by Nominatim)
- **Timeout**: 10 seconds
- **Maximum Age**: 5 minutes
- **High Accuracy**: Enabled

**State Management**:
```typescript
{
  location: {
    latitude: number,
    longitude: number,
    accuracy: number,  // in meters
    address: {
      city?: string,
      state?: string,
      country?: string,
      postalCode?: string,
      formatted?: string
    },
    timestamp: number
  } | null,
  isLoading: boolean,
  error: string | null,
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown'
}
```

**Exported Functions**:
- `requestLocation()`: Gets coordinates via navigator.geolocation
- `reverseGeocode(lat, lon)`: Fetches address from Nominatim API
- `clearLocation()`: Removes location data from state and localStorage

**Error Handling**:
- Code 1: Permission denied by user
- Code 2: Location unavailable (no GPS/network)
- Code 3: Timeout (exceeded 10 seconds)

### 2. Location Settings Tab (`ui-new/src/components/SettingsModal.tsx`)

Location management interface integrated into the Settings dialog as a dedicated tab.

**Features**:
- **📍 Location Tab**: Fourth tab in Settings dialog (after Provider, Tools, Proxy)
- **Status Card**: Large visual card showing current location state
  - **Green**: Location enabled (shows address and coordinates)
  - **Red**: Permission denied (with instructions)
  - **Gray**: Not enabled (with enable button)
- **Location Details** (when enabled):
  - Formatted address or city/state/country
  - Precise coordinates (6 decimal places)
  - Accuracy in meters
  - Last updated timestamp
- **Action Buttons**:
  - **Enable Location**: Request browser permission (when not enabled)
  - **Refresh**: Update location to current position
  - **Clear**: Remove location data from browser
- **Privacy Notice**: Blue info panel with usage and privacy information

**Placement**:
- Settings Dialog → Location Tab (📍)
- Accessed via Settings button in header
- Full-width dedicated interface (not a small button)

### 3. ChatTab Integration (`ui-new/src/components/ChatTab.tsx`)

**Changes**:
- Imported `useLocation` hook from LocationContext
- Extracts location data using `const { location } = useLocation()`
- Includes location in both initial and continuation requests:

```typescript
if (location) {
  requestPayload.location = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    address: location.address,
    timestamp: location.timestamp
  };
  console.log('📍 Including location in request:', 
    location.address?.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
}
```

### 4. Lambda System Prompt Injection (`src/endpoints/chat.js`)

**Changes**:
The Lambda handler now extracts location data from the request body and injects it as a system message at the beginning of the conversation.

**Injection Logic** (lines 585-632):
```javascript
if (location && location.latitude && location.longitude) {
  const locationInfo = [];
  locationInfo.push(`User's Current Location:`);
  locationInfo.push(`- Coordinates: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} (±${location.accuracy?.toFixed(0) || '?'}m)`);
  
  if (location.address) {
    const addr = location.address;
    if (addr.formatted) {
      locationInfo.push(`- Address: ${addr.formatted}`);
    } else {
      const parts = [];
      if (addr.city) parts.push(addr.city);
      if (addr.state) parts.push(addr.state);
      if (addr.country) parts.push(addr.country);
      if (parts.length > 0) {
        locationInfo.push(`- Location: ${parts.join(', ')}`);
      }
    }
  }
  
  locationInfo.push('');
  locationInfo.push('Please use this location information when answering location-specific queries such as:');
  locationInfo.push('- Weather and climate information');
  locationInfo.push('- Local businesses, restaurants, and services');
  locationInfo.push('- Directions and navigation');
  locationInfo.push('- Area-specific recommendations');
  locationInfo.push('- Time zones and local time');
  locationInfo.push('- Regional news or events');
  
  const locationSystemMessage = {
    role: 'system',
    content: locationInfo.join('\n')
  };
  
  // Prepend location system message to existing messages
  messages = [locationSystemMessage, ...messages];
  
  console.log('📍 Location injected into system prompt:', 
    location.address?.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
}
```

**System Message Format**:
```
User's Current Location:
- Coordinates: 37.7749, -122.4194 (±25m)
- Address: San Francisco, California, United States

Please use this location information when answering location-specific queries such as:
- Weather and climate information
- Local businesses, restaurants, and services
- Directions and navigation
- Area-specific recommendations
- Time zones and local time
- Regional news or events
```

## User Workflow

1. **First Time Use**:
   - User clicks Settings button in header
   - Navigates to Location tab (📍)
   - Clicks "Enable Location" button
   - Browser prompts for location permission
   - User grants permission
   - App fetches precise coordinates
   - Nominatim API reverse geocodes to address
   - Location data stored in localStorage (24-hour expiry)
   - Status card turns green showing address and details

2. **Subsequent Uses**:
   - Location automatically loaded from localStorage on page load
   - User can open Settings → Location tab to view details
   - User can click "Refresh" to get updated coordinates
   - User can click "Clear" to remove location data

3. **Chat Integration**:
   - When location is available, it's automatically included in all chat requests
   - Lambda injects location into system prompt
   - LLM uses location context for relevant queries

## Privacy Considerations

1. **User Consent**:
   - Browser native permission prompt required
   - User must explicitly grant location access
   - Permission can be revoked anytime via browser settings

2. **Data Handling**:
   - Location stored locally in browser (localStorage)
   - Sent to Lambda only when user sends a chat message
   - Not stored permanently on server
   - Expires automatically after 24 hours

3. **Privacy Notice**:
   - Location button details panel includes notice:
     > "Your location helps provide context-aware responses for local queries (weather, restaurants, directions, etc.)"

4. **User Control**:
   - Clear button to remove location data
   - Can disable by denying browser permission
   - Works fine without location (optional feature)

## Use Cases

### Example Queries That Benefit From Location:

1. **Weather**: "What's the weather like today?"
2. **Local Businesses**: "Find pizza restaurants nearby"
3. **Directions**: "How do I get to the airport?"
4. **Time**: "What time is it?" (uses timezone)
5. **Events**: "What's happening this weekend?"
6. **Recommendations**: "Suggest hiking trails"
7. **News**: "Local news updates"

### Queries That Don't Need Location:

- General knowledge questions
- Code generation
- Math problems
- Historical facts
- Philosophical discussions

## Technical Details

### Geolocation API Options:
```javascript
{
  enableHighAccuracy: true,  // Use GPS if available
  timeout: 10000,            // 10 second timeout
  maximumAge: 300000         // Accept 5-minute-old cache
}
```

### Nominatim API Request:
```
GET https://nominatim.openstreetmap.org/reverse
  ?lat=37.7749
  &lon=-122.4194
  &format=json
  
Headers:
  User-Agent: LLMProxyChat/1.0
```

### LocalStorage Schema:
```javascript
{
  "chat_location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracy": 25,
    "address": {
      "city": "San Francisco",
      "state": "California",
      "country": "United States",
      "postalCode": "94102",
      "formatted": "San Francisco, California, United States"
    },
    "timestamp": 1705075200000
  }
}
```

## Deployment

**UI Deployment**:
```bash
make deploy-ui  # Builds React app and deploys to GitHub Pages
```

**Lambda Deployment**:
```bash
make deploy-lambda-fast  # Fast deployment (code only)
# or
make deploy-lambda  # Full deployment (with dependencies)
```

**Verification**:
1. UI: https://syntithenai.github.io/lambdallmproxy/
2. Lambda: Check CloudWatch logs for "📍 Location injected" messages
3. Test: Enable location, send query like "weather today"

## Testing Checklist

✅ **Completed Tests**:
- [x] Location permission flow (prompt → grant → success)
- [x] Geolocation accuracy (high accuracy mode)
- [x] Nominatim reverse geocoding
- [x] LocalStorage persistence
- [x] 24-hour expiry logic
- [x] Location button UI states (enabled, disabled, error)
- [x] Integration with ChatTab requests
- [x] Lambda system prompt injection
- [x] Continuation request location handling
- [x] CloudWatch logging verification
- [x] UI deployment successful
- [x] Lambda deployment successful

## Future Enhancements

### Potential Improvements:
1. **IP-based Fallback**: Use IP geolocation if browser permission denied
2. **Manual Location Entry**: Allow users to type city name
3. **Location History**: Remember multiple locations
4. **Auto-refresh**: Update location periodically for mobile users
5. **Distance Calculations**: Calculate distances to points of interest
6. **Map Integration**: Show location on embedded map
7. **Location Sharing**: Generate shareable location links

### Performance Optimizations:
1. **Caching**: Cache Nominatim responses to reduce API calls
2. **Batching**: Batch multiple geocoding requests
3. **CDN**: Use geocoding CDN for faster responses
4. **Compression**: Compress location data in localStorage

## Known Issues

### Browser Compatibility:
- ✅ Chrome/Edge: Full support
- ✅ Firefox: Full support
- ✅ Safari: Full support (requires HTTPS)
- ⚠️ Mobile Safari: May require user interaction first
- ⚠️ HTTP Sites: Geolocation API blocked (requires HTTPS)

### Nominatim API Limitations:
- **Rate Limit**: 1 request/second (we're well below this)
- **Usage Policy**: Must include User-Agent header ✅
- **Accuracy**: Varies by region (urban > rural)
- **Availability**: Free service, may have occasional downtime

### Edge Cases:
1. **No GPS**: Falls back to IP-based location (less accurate)
2. **Offline**: Geolocation fails, uses cached location if available
3. **VPN**: May show VPN server location instead of actual location
4. **Airplane Mode**: Fails gracefully with error message

## Related Files

**Frontend**:
- `ui-new/src/contexts/LocationContext.tsx` - Location state management
- `ui-new/src/components/SettingsModal.tsx` - Location tab UI (lines 119-286)
- `ui-new/src/components/ChatTab.tsx` - Chat integration
- `ui-new/src/App.tsx` - LocationProvider wrapper

**Deprecated**:
- `ui-new/src/components/LocationButton.tsx` - Replaced by Settings tab integration

**Backend**:
- `src/endpoints/chat.js` - System prompt injection (lines 585-632)

**Documentation**:
- `developer_log/FEATURE_LOCATION.md` - This file

## Logs and Monitoring

**CloudWatch Logs**:
```bash
make logs  # View recent logs
make logs-tail  # Tail logs in real-time
```

**Search for location-related logs**:
```
📍 Location injected into system prompt: <city>
📍 Including location in request: <city>
📍 Including location in continuation request: <city>
```

**UI Console Logs**:
```
📍 Location request successful: <city>
📍 Including location in request: <city>
📍 Reverse geocoding successful for <coordinates>
```

## Summary

The location feature is now fully implemented and deployed. Users can enable location services via the LocationButton in the header, and the location data will automatically be included in chat requests to provide context-aware responses. The feature is privacy-respecting, optional, and works seamlessly with the existing chat functionality.

**Status**: ✅ Complete and Production Ready
