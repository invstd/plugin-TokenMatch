# Hover States in Figma Plugins

This guide explains how to implement hover states for buttons and interactive elements in Figma plugins built with `@create-figma-plugin/ui`.

## Overview

The Figma Plugin API fully supports standard CSS and React/Preact event handlers. Hover states are implemented using `onMouseEnter` and `onMouseLeave` events to provide visual feedback when users interact with UI elements.

## Button Types & Hover Behavior

### Primary Buttons (Blue/Brand)
**Do NOT add hover states** - Figma's UI library handles these automatically.

```tsx
<Button onClick={handleClick}>
  Primary Action
</Button>
```

### Secondary Buttons (Gray/Neutral)
**Add background color hover states** - Changes background color on hover.

```tsx
<Button 
  onClick={handleClick}
  secondary
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--figma-color-bg-hover)';
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = '';
  }}
>
  Secondary Action
</Button>
```

### Icon Buttons (Custom HTML buttons)
**Add background color hover states with transition** - Similar to secondary buttons but with smooth animation.

```tsx
<button 
  onClick={handleClick}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--figma-color-bg-hover)';
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
  }}
  style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '6px',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--figma-color-text)',
    transition: 'background-color 0.15s ease' // Smooth animation
  }}
>
  <svg width="16" height="16">
    {/* Icon SVG */}
  </svg>
</button>
```

## Figma Color Variables

Always use Figma's CSS variables for consistent theming:

- `var(--figma-color-bg-hover)` - Background color on hover
- `var(--figma-color-bg)` - Default background
- `var(--figma-color-text)` - Default text color
- `var(--figma-color-border)` - Border color
- `var(--figma-color-bg-brand)` - Primary/brand color

These variables automatically adapt to Figma's light/dark mode.

## Best Practices

### ✅ Do

- Use `var(--figma-color-bg-hover)` for hover backgrounds
- Add `transition` CSS property for smooth animations (0.15s is recommended)
- Keep text color unchanged during hover
- Type cast event targets: `(e.currentTarget as HTMLElement)`
- Reset to empty string `''` or `'transparent'` on mouse leave

### ❌ Don't

- Don't use opacity changes on text buttons (this dims the text)
- Don't add hover states to primary buttons (handled by Figma UI library)
- Don't use hard-coded colors (breaks light/dark mode)
- Don't forget to add cursor: 'pointer' to custom buttons

## Interactive Elements Beyond Buttons

### Dropdown Items / List Items

For custom dropdown or list items, use the same hover pattern:

```tsx
<div
  onClick={handleSelect}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--figma-color-bg-hover)';
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
  }}
  style={{ 
    padding: '8px', 
    cursor: 'pointer',
    backgroundColor: 'transparent',
    transition: 'background-color 0.1s ease'
  }}
>
  List Item
</div>
```

### Cards / Large Interactive Areas

For larger interactive elements like cards:

```tsx
<div
  onClick={handleClick}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--figma-color-border-brand)';
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLElement).style.borderColor = 'var(--figma-color-border)';
  }}
  style={{
    padding: '12px',
    border: '1px solid var(--figma-color-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease'
  }}
>
  Card Content
</div>
```

## Disabled States

Hover effects should not apply to disabled elements. The `disabled` attribute on Button components automatically prevents hover handlers from executing.

```tsx
<Button 
  onClick={handleClick}
  secondary
  disabled={isLoading}
  onMouseEnter={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--figma-color-bg-hover)';
  }}
  onMouseLeave={(e) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = '';
  }}
>
  {isLoading ? 'Loading...' : 'Click Me'}
</Button>
```

## Testing Your Hover States

1. Test in both light and dark mode
2. Verify hover states don't affect disabled buttons
3. Check that text remains readable during hover
4. Ensure transitions feel smooth (not too fast or slow)
5. Test with keyboard navigation (focus states are separate)

## Quick Reference Table

| Element Type | Hover Effect | Color Variable | Transition |
|--------------|--------------|----------------|------------|
| Primary Button | None (automatic) | N/A | N/A |
| Secondary Button | Background | `var(--figma-color-bg-hover)` | Optional |
| Icon Button | Background | `var(--figma-color-bg-hover)` | 0.15s ease |
| List/Dropdown Item | Background | `var(--figma-color-bg-hover)` | 0.1s ease |
| Card | Border | `var(--figma-color-border-brand)` | 0.2s ease |

## Prompting AI to Implement Hover States

When working with AI to build your Figma plugin, use this prompt:

> "Add hover states to all secondary buttons and icon buttons. Secondary buttons should change background color to `var(--figma-color-bg-hover)` on hover. Icon buttons should do the same and include a `transition: 'background-color 0.15s ease'` in their style. Primary buttons should not have hover states added. Text color should remain unchanged during hover."

## Additional Resources

- [Figma Plugin API Documentation](https://www.figma.com/plugin-docs/)
- [Create Figma Plugin UI Kit](https://github.com/yuanqing/create-figma-plugin)
- [Figma Color Variables Reference](https://www.figma.com/plugin-docs/api/figma-ui/)

---

**Last Updated:** January 2026  
**Related Files:** `src/ui.tsx`
