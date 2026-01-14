# Custom Scrollbar Implementation for Figma Plugins

## Overview

This document describes the implementation of a custom JavaScript scrollbar for Figma plugins that prevents layout shift when scrolling content.

## The Problem

In Figma plugin UIs (Chromium/Electron environment), implementing a scrollbar that doesn't cause layout shift is challenging:

### Failed Approaches

1. **`overflow-y: overlay`** - Deprecated and unreliable
   - While some documentation suggests using `overflow: overlay`, this property is deprecated
   - Not consistently supported across Chromium versions
   - Figma's plugin iframe may not support it

2. **CSS-only solutions** - Unreliable
   - `scrollbar-gutter: stable` - Reserves permanent space (not desired)
   - Wrapper patterns with clipping - Complex and doesn't work consistently
   - Negative margins - Causes other layout issues

3. **Dynamic padding compensation** - Fragile
   - Detecting scrollbar presence and adjusting padding
   - Requires complex JavaScript and doesn't handle all edge cases
   - Causes brief layout flashes

### The Issue

When using standard `overflow-y: auto` or `overflow-y: scroll`:
- Native scrollbars take up ~8-15px of layout space
- Content shifts left when scrollbar appears
- Creates jarring UX and inconsistent layout
- Padding/margins are pushed inward

## The Solution: Custom JavaScript Scrollbar

Implement a lightweight custom scrollbar that:
1. Hides the native scrollbar
2. Renders a custom scrollbar that overlays the content
3. Handles all scroll interactions via JavaScript
4. Never affects content layout

## Implementation

### 1. CSS Structure

```css
/* Hide native scrollbar for custom scrollbar containers */
.custom-scroll-container {
  position: relative;
  overflow: hidden;
}

.custom-scroll-content {
  overflow-y: scroll;
  height: 100%;
  /* Hide native scrollbar */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.custom-scroll-content::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Opera */
}

/* Custom scrollbar track */
.custom-scrollbar-track {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 8px;
  background: transparent;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.custom-scroll-container:hover .custom-scrollbar-track,
.custom-scrollbar-track.dragging {
  opacity: 1;
}

/* Custom scrollbar thumb */
.custom-scrollbar-thumb {
  position: absolute;
  right: 0;
  width: 8px;
  min-height: 30px;
  background: var(--figma-color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.custom-scrollbar-thumb:hover,
.custom-scrollbar-thumb.dragging {
  background: var(--figma-color-border-strong);
}
```

### 2. React/Preact Hook

```typescript
// Custom scrollbar hook - creates an overlay scrollbar without layout shift
function useCustomScrollbar(contentRef: React.RefObject<HTMLDivElement>) {
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const dragStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

  // Calculate thumb size and position
  const updateScrollbar = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const { scrollHeight, clientHeight, scrollTop } = content;
    const hasScroll = scrollHeight > clientHeight;
    setShowScrollbar(hasScroll);

    if (hasScroll) {
      const ratio = clientHeight / scrollHeight;
      const newThumbHeight = Math.max(30, clientHeight * ratio);
      const maxScrollTop = scrollHeight - clientHeight;
      const scrollRatio = scrollTop / maxScrollTop;
      const maxThumbTop = clientHeight - newThumbHeight;
      
      setThumbHeight(newThumbHeight);
      setThumbTop(scrollRatio * maxThumbTop);
    }
  }, [contentRef]);

  // Handle scroll events
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => updateScrollbar();
    content.addEventListener('scroll', handleScroll);
    
    // Initial calculation
    updateScrollbar();
    
    // Recalculate on resize
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(content);

    return () => {
      content.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [contentRef, updateScrollbar]);

  // Handle thumb drag
  const handleThumbMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const content = contentRef.current;
    if (!content) return;

    setIsDragging(true);
    dragStartRef.current = { y: e.clientY, scrollTop: content.scrollTop };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartRef.current || !contentRef.current) return;
      
      const deltaY = moveEvent.clientY - dragStartRef.current.y;
      const content = contentRef.current;
      const { scrollHeight, clientHeight } = content;
      const maxScrollTop = scrollHeight - clientHeight;
      const thumbRange = clientHeight - thumbHeight;
      const scrollRatio = deltaY / thumbRange;
      
      content.scrollTop = dragStartRef.current.scrollTop + (scrollRatio * maxScrollTop);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [contentRef, thumbHeight]);

  // Handle track click
  const handleTrackClick = useCallback((e: MouseEvent) => {
    const content = contentRef.current;
    if (!content || e.target !== e.currentTarget) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const { scrollHeight, clientHeight } = content;
    const clickRatio = clickY / clientHeight;
    
    content.scrollTop = (scrollHeight - clientHeight) * clickRatio;
  }, [contentRef]);

  return {
    thumbHeight,
    thumbTop,
    isDragging,
    showScrollbar,
    handleThumbMouseDown,
    handleTrackClick
  };
}
```

### 3. JSX Usage

```tsx
function Plugin() {
  // Create ref for scrollable content
  const mainScrollRef = useRef<HTMLDivElement>(null);
  
  // Initialize custom scrollbar
  const customScrollbar = useCustomScrollbar(mainScrollRef);

  return (
    <div className="custom-scroll-container" style={{ flex: 1, position: 'relative' }}>
      {/* Scrollable content with hidden native scrollbar */}
      <div 
        ref={mainScrollRef}
        className="custom-scroll-content"
        style={{ paddingBottom: '36px' }}
      >
        {/* Your content here */}
        <Container space="medium">
          {/* ... */}
        </Container>
      </div>
      
      {/* Custom scrollbar track and thumb */}
      {customScrollbar.showScrollbar && (
        <div 
          className={`custom-scrollbar-track ${customScrollbar.isDragging ? 'dragging' : ''}`}
          onClick={customScrollbar.handleTrackClick as any}
        >
          <div 
            className={`custom-scrollbar-thumb ${customScrollbar.isDragging ? 'dragging' : ''}`}
            style={{ 
              height: `${customScrollbar.thumbHeight}px`,
              top: `${customScrollbar.thumbTop}px`
            }}
            onMouseDown={customScrollbar.handleThumbMouseDown as any}
          />
        </div>
      )}
    </div>
  );
}
```

## How It Works

### 1. Container Structure

```
┌─────────────────────────────────────┐
│ custom-scroll-container (relative)  │
│ ┌─────────────────────────────────┐ │
│ │ custom-scroll-content           │ │
│ │ (overflow hidden native scroll) │ │
│ │                                 │ │
│ │  [Your Content Here]            │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                  ║   │ <- Custom scrollbar
│                                  ║   │    (absolute positioned)
└─────────────────────────────────────┘
```

### 2. Scroll Calculation

```typescript
// Thumb size proportional to viewport/content ratio
const ratio = clientHeight / scrollHeight;
const thumbHeight = Math.max(30, clientHeight * ratio);

// Thumb position based on scroll position
const scrollRatio = scrollTop / (scrollHeight - clientHeight);
const thumbTop = scrollRatio * (clientHeight - thumbHeight);
```

### 3. Interaction Handling

**Scrolling content:**
- Native scroll events work normally (mouse wheel, trackpad, touch)
- Hook listens to scroll events and updates thumb position

**Dragging thumb:**
- Mouse down on thumb starts drag
- Mouse move calculates delta and scrolls content proportionally
- Mouse up ends drag

**Clicking track:**
- Click position calculates desired scroll ratio
- Scrolls content to that position instantly

## Features

✓ **No layout shift** - Scrollbar is positioned absolutely, doesn't affect content  
✓ **Show on hover** - Appears when hovering container (configurable)  
✓ **Drag support** - Click and drag thumb to scroll  
✓ **Track click** - Click track to jump to position  
✓ **Native scroll** - Mouse wheel/trackpad work normally  
✓ **Responsive** - Recalculates on window/content resize  
✓ **Styled** - Uses Figma color variables for consistency  
✓ **Conditional rendering** - Only shows when content is scrollable  

## Customization

### Scrollbar Width

Change the width in both CSS locations:

```css
.custom-scrollbar-track {
  width: 12px; /* Change from 8px */
}

.custom-scrollbar-thumb {
  width: 12px; /* Change from 8px */
}
```

### Always Visible

Remove the opacity transition:

```css
.custom-scrollbar-track {
  opacity: 1; /* Always visible */
}
```

### Minimum Thumb Height

Adjust in the calculation:

```typescript
const newThumbHeight = Math.max(50, clientHeight * ratio); // Change from 30
```

### Colors

Use different Figma color variables:

```css
.custom-scrollbar-thumb {
  background: var(--figma-color-bg-brand);
}

.custom-scrollbar-thumb:hover {
  background: var(--figma-color-bg-brand-hover);
}
```

## Performance Considerations

1. **ResizeObserver** - Used instead of polling for better performance
2. **Event cleanup** - All listeners properly removed on unmount
3. **Callback optimization** - Uses `useCallback` to prevent unnecessary re-renders
4. **Conditional rendering** - Scrollbar only renders when needed

## Browser Compatibility

✓ Chrome/Chromium (Figma plugin environment)  
✓ Firefox (fallback scrollbar-width: none)  
✓ Safari (WebKit scrollbar hiding)  
✓ Edge (all versions)

## Limitations

- **Horizontal scrolling**: Current implementation is vertical only
- **Touch scrolling**: Works but no touch-drag thumb support
- **Accessibility**: Native scrollbar keyboard shortcuts still work, but screen readers may have issues

## Future Enhancements

1. **Horizontal scrollbar support**: Add `useCustomHorizontalScrollbar` hook
2. **Touch drag**: Add touch event handlers for mobile
3. **Keyboard navigation**: Add arrow key support for scrollbar
4. **Smooth scrolling**: Add animation when clicking track
5. **Custom styling props**: Make colors/sizes configurable via props

## Troubleshooting

### Scrollbar not appearing
- Check that `showScrollbar` is true (content must overflow)
- Verify container has `position: relative`
- Ensure z-index is higher than content

### Thumb position incorrect
- Verify `scrollHeight > clientHeight`
- Check that padding/margins are accounted for
- Ensure ResizeObserver is firing

### Drag not working
- Check that mouse events are properly bound
- Verify `e.preventDefault()` is called in mouseDown
- Ensure event listeners are cleaned up properly

## Conclusion

This custom scrollbar implementation provides a reliable solution for Figma plugins where native scrollbar behavior causes layout issues. While it requires more code than CSS-only solutions, it offers:

- **Guaranteed consistency** across all browsers
- **Full control** over appearance and behavior  
- **No layout shift** under any circumstances
- **Professional UX** matching Figma's design standards

The implementation is production-ready and can be adapted for other Electron/Chromium-based environments beyond Figma plugins.

