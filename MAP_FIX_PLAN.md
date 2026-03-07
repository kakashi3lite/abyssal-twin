# Map Fix Plan

## Problem
Fleet assets not showing on map - markers don't align with actual map positions

## Root Cause
- Using iframe with simplified pixel projection math
- Overlay markers don't sync with Mapbox coordinate system
- No proper `react-map-gl` integration

## Solution
Replace iframe approach with proper `react-map-gl` implementation:

1. **Install react-map-gl** - Proper React Mapbox integration
2. **Use Map component** - With proper viewport state
3. **Add Marker components** - Positioned correctly by Mapbox
4. **Use FlyToInterpolator** - Smooth camera transitions
5. **Add NavigationControl** - Zoom/pan controls

## Implementation Steps
1. Update GlobalFleetMap.tsx with react-map-gl
2. Add proper map container styling
3. Implement Marker components for assets
4. Test locally with token
5. Deploy to Cloudflare Pages
