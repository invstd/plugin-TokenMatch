/**
 * Token Matching Service
 * Matches design tokens against Figma component properties
 */

import {
  ComponentProperties,
  ColorProperty,
  TypographyProperty,
  SpacingProperty,
  EffectProperty,
  ScanResult
} from '../types/components';
import { ParsedToken, TokenType } from '../types/tokens';

export interface MatchDetail {
  property: string;
  propertyType: 'color' | 'typography' | 'spacing' | 'effect';
  matchedValue: string;
  tokenValue: string;
  confidence: number; // 0-1, where 1 is exact match
  nestedMainComponentId?: string;  // NEW: mainComponentId of nested component
}

export interface ComponentMatch {
  component: ComponentProperties;
  matches: MatchDetail[];
  confidence: number; // Average confidence of all matches
}

export interface MatchingResult {
  token: ParsedToken;
  matchingComponents: ComponentMatch[];
  totalMatches: number;
  totalComponentsScanned: number;
}

export class TokenMatchingService {
  // Minimum confidence threshold to filter out false positives
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.85;

  /**
   * Match a token against scanned components
   */
  matchTokenToComponents(token: ParsedToken, scanResult: ScanResult): MatchingResult {
    const matchingComponents: ComponentMatch[] = [];

    for (const component of scanResult.components) {
      // Match the component and all its children recursively
      const matchDetails = this.matchComponentRecursively(token, component);

      // Filter out low-confidence matches
      const highConfidenceMatches = matchDetails.filter(m => m.confidence >= this.MIN_CONFIDENCE_THRESHOLD);

      if (highConfidenceMatches.length > 0) {
        const avgConfidence =
          highConfidenceMatches.reduce((sum, m) => sum + m.confidence, 0) / highConfidenceMatches.length;
        matchingComponents.push({
          component,
          matches: highConfidenceMatches,
          confidence: avgConfidence
        });
      }
    }

    // Sort by confidence (highest first)
    matchingComponents.sort((a, b) => b.confidence - a.confidence);

    return {
      token,
      matchingComponents,
      totalMatches: matchingComponents.length,
      totalComponentsScanned: scanResult.totalComponents
    };
  }

  /**
   * Match a token against a component and all its children recursively
   */
  private matchComponentRecursively(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matchDetails: MatchDetail[] = [];

    // Match based on token type for this component
    switch (token.type) {
      case 'color':
        matchDetails.push(...this.matchColor(token, component));
        break;
      case 'fontFamily':
      case 'fontWeight':
      case 'typography':
        matchDetails.push(...this.matchTypography(token, component));
        break;
      case 'dimension':
        matchDetails.push(...this.matchSpacing(token, component));
        break;
      case 'shadow':
        matchDetails.push(...this.matchEffects(token, component));
        break;
      case 'borderRadius':
        matchDetails.push(...this.matchSpacing(token, component, 'borderRadius'));
        break;
      case 'borderWidth':
        matchDetails.push(...this.matchSpacing(token, component, 'borderWidth'));
        break;
      case 'border':
        // Handle composite border tokens (with color, width, style)
        matchDetails.push(...this.matchBorder(token, component));
        break;
      case 'composition':
        // Handle composition tokens (may contain multiple properties)
        matchDetails.push(...this.matchComposition(token, component));
        break;
      default:
        // Try to match by inferring type from value AND path
        matchDetails.push(...this.matchByValue(token, component));
        // Also try spacing matching for tokens with spacing-related paths
        if (this.looksLikeSpacingToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component));
        }
        // Try border-radius matching specifically
        if (this.looksLikeBorderRadiusToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component, 'borderRadius'));
        }
        // Try border/stroke width matching
        if (this.looksLikeBorderToken(token)) {
          matchDetails.push(...this.matchSpacing(token, component, 'borderWidth'));
        }
        // Try effect matching for shadow-like paths
        if (this.looksLikeEffectToken(token)) {
          matchDetails.push(...this.matchEffects(token, component));
        }
    }
    
    // Set nestedMainComponentId for direct matches found on this component
    // This marks which component actually has the token
    if (matchDetails.length > 0 && component.mainComponentId) {
      matchDetails.forEach(detail => {
        if (!detail.nestedMainComponentId) {
          detail.nestedMainComponentId = component.mainComponentId;
        }
      });
    }

    // Recursively check children
    if (component.children && component.children.length > 0) {
      for (const child of component.children) {
        const childMatches = this.matchComponentRecursively(token, child);
        // Add child matches with context about where they were found
        for (const match of childMatches) {
          matchDetails.push({
            ...match,
            property: `${child.name} → ${match.property}`
            // Keep the nestedMainComponentId from the child match (already set above)
          });
        }
      }
    }

    return matchDetails;
  }

  /**
   * Match color tokens
   * PRIORITY ORDER:
   * 1. Match by token reference path (Tokens Studio) - highest confidence
   * 2. Fall back to value matching only if no path match and value exists
   */
  private matchColor(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = this.normalizeColor(token.value);

    // First pass: Match by token reference (Tokens Studio path matching)
    // This is the PRIMARY matching method and works even if token value is null
    for (const color of component.colors) {
      if (color.tokenReference) {
        // Clean up the token reference (remove braces, $, quotes, etc.)
        let refPath = color.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, ''); // Remove quotes
        refPath = refPath.replace(/^[{]|[}]$/g, ''); // Remove braces
        refPath = refPath.replace(/^\$/, ''); // Remove leading $
        
        // Normalize paths for comparison
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Exact path match - highest confidence
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${color.type} color (token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Only match if the reference ends with the full token path (e.g., "theme.kds.color.x" matches "kds.color.x")
        // OR if the token path ends with the full reference (for shortened refs)
        else if (normalizedRef.endsWith('.' + normalizedToken) || normalizedRef === normalizedToken ||
                 normalizedToken.endsWith('.' + normalizedRef) || normalizedToken === normalizedRef) {
          matches.push({
            property: `${color.type} color (token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // If we found reference matches with high confidence, return them (don't fall back to value matching)
    // Only consider matches with confidence >= 0.9 (exact or proper suffix match)
    const highConfidenceMatches = matches.filter(m => m.confidence >= 0.9);
    if (highConfidenceMatches.length > 0) {
      return highConfidenceMatches;
    }

    // SEMANTIC TOKEN MATCHING: If the token value is a reference (like "{kds.core.color.blue.500}"),
    // check if the component uses that inner reference
    const innerRef = this.extractTokenReference(token.value);
    if (innerRef) {
      const normalizedInnerRef = innerRef.toLowerCase();
      
      for (const color of component.colors) {
        if (color.tokenReference) {
          let refPath = color.tokenReference.trim()
            .replace(/^["']|["']$/g, '')
            .replace(/^[{]|[}]$/g, '')
            .replace(/^\$/, '');
          
          const normalizedRef = refPath.toLowerCase();
          
          // Check if component references the inner token (e.g., kds.core.color.blue.500)
          if (normalizedRef === normalizedInnerRef ||
              normalizedRef.endsWith('.' + normalizedInnerRef) ||
              normalizedInnerRef.endsWith('.' + normalizedRef)) {
            matches.push({
              property: `${color.type} color (via ${tokenPath})`,
              propertyType: 'color',
              matchedValue: `${color.hex} ← ${color.tokenReference}`,
              tokenValue: `${tokenPath} → ${token.value}`,
              confidence: 0.95
            });
          }
        }
      }
      
      // If we found semantic matches, return them
      if (matches.length > 0) {
        return matches;
      }
    }

    // VALUE-BASED MATCHING: Fall back to matching by actual color value
    // This is useful when components don't have token references (Tokens Studio data)
    // but do use the same color values as the tokens
    if (tokenValue) {
      for (const color of component.colors) {
        const componentColor = this.normalizeColor(color.hex);
        if (componentColor && tokenValue === componentColor) {
          matches.push({
            property: `${color.type} color (value match)`,
            propertyType: 'color',
            matchedValue: `${color.hex}`,
            tokenValue: `${tokenPath} = ${token.value}`,
            confidence: 0.7 // Lower confidence for value-based matches
          });
        }
      }
    }
    
    return matches;
  }

  /**
   * Match typography tokens
   */
  private matchTypography(
    token: ParsedToken,
    component: ComponentProperties
  ): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');

    for (const typo of component.typography) {
      let confidence = 0;
      let matchedValue = '';
      let matchType = 'value';

      // PRIORITY 1: Match by token reference (Tokens Studio)
      if (typo.tokenReference) {
        const refPath = typo.tokenReference.replace(/[{}]/g, '').replace(/^\$/, '');
        const normalizedRef = refPath.toLowerCase().replace(/\./g, '.');
        const normalizedToken = tokenPath.toLowerCase();
        
        if (normalizedRef === normalizedToken) {
          confidence = 1.0;
          matchedValue = `${typo.fontFamily} (ref: ${typo.tokenReference})`;
          matchType = 'reference';
        } else if (normalizedRef.includes(normalizedToken) || normalizedToken.includes(normalizedRef)) {
          confidence = 0.8;
          matchedValue = `${typo.fontFamily} (ref: ${typo.tokenReference})`;
          matchType = 'reference';
        }
      }

      // PRIORITY 2: Fall back to value matching
      if (confidence === 0) {
        if (token.type === 'fontFamily') {
          const tokenValue = String(token.value).toLowerCase().trim();
          const componentFamily = typo.fontFamily.toLowerCase().trim();

          if (tokenValue === componentFamily) {
            confidence = 0.9;
            matchedValue = typo.fontFamily;
          }
        } else if (token.type === 'fontWeight') {
          const tokenValue = this.normalizeFontWeight(token.value);
          const componentWeight = typo.fontWeight;

          if (tokenValue === componentWeight) {
            confidence = 0.9;
            matchedValue = String(componentWeight);
          }
        } else if (token.type === 'typography') {
          // For typography composite tokens with inner references
          if (typeof token.value === 'object' && token.value !== null) {
            const tokenObj = token.value as any;
            
            // Extract inner token references (e.g., "{kds.font.family.primary}" → "kds.font.family.primary")
            const fontFamilyRef = this.extractTokenReference(tokenObj.fontFamily);
            const fontSizeRef = this.extractTokenReference(tokenObj.fontSize);
            const fontWeightRef = this.extractTokenReference(tokenObj.fontWeight);
            const lineHeightRef = this.extractTokenReference(tokenObj.lineHeight);
            
            // Check if the component's typography token reference matches any inner reference
            if (typo.tokenReference) {
              const componentRef = typo.tokenReference.replace(/[{}]/g, '').replace(/^\$/, '').toLowerCase();
              
              const innerRefs = [fontFamilyRef, fontSizeRef, fontWeightRef, lineHeightRef].filter(Boolean);
              for (const innerRef of innerRefs) {
                if (!innerRef) continue;
                const normalizedInnerRef = innerRef.toLowerCase();
                
                if (componentRef === normalizedInnerRef ||
                    componentRef.endsWith('.' + normalizedInnerRef) ||
                    normalizedInnerRef.endsWith('.' + componentRef)) {
                  confidence = 0.95;
                  matchedValue = `${typo.fontFamily} (via ${tokenPath})`;
                  matchType = 'reference';
                  break;
                }
              }
            }
            
            // Also try literal value matching as fallback
            if (confidence === 0) {
              let hasMatch = false;
              let typoConfidence = 0;
              const matchedProps: string[] = [];

              // Check fontFamily (literal value, not reference)
              if (tokenObj.fontFamily && !tokenObj.fontFamily.toString().includes('{')) {
                const tokenFamily = String(tokenObj.fontFamily).toLowerCase().trim();
                const componentFamily = typo.fontFamily.toLowerCase().trim();
                if (tokenFamily === componentFamily) {
                  hasMatch = true;
                  typoConfidence += 0.4;
                  matchedProps.push(`fontFamily: ${typo.fontFamily}`);
                }
              }

              // Check fontSize (literal value)
              if (tokenObj.fontSize && !String(tokenObj.fontSize).includes('{')) {
                const tokenSize = Number(tokenObj.fontSize);
                const componentSize = typo.fontSize;
                if (!isNaN(tokenSize) && Math.abs(tokenSize - componentSize) < 0.5) {
                  hasMatch = true;
                  typoConfidence += 0.3;
                  matchedProps.push(`fontSize: ${componentSize}`);
                }
              }

              // Check fontWeight (literal value)
              if (tokenObj.fontWeight && !String(tokenObj.fontWeight).includes('{')) {
                const tokenWeight = this.normalizeFontWeight(tokenObj.fontWeight);
                if (tokenWeight === typo.fontWeight) {
                  hasMatch = true;
                  typoConfidence += 0.3;
                  matchedProps.push(`fontWeight: ${typo.fontWeight}`);
                }
              }

              if (hasMatch) {
                confidence = Math.min(typoConfidence, 1.0);
                matchedValue = matchedProps.join(', ');
              }
            }
          }
        }
      }

      if (confidence > 0) {
        matches.push({
          property: `typography${matchType === 'reference' ? ' (token ref)' : ''}`,
          propertyType: 'typography',
          matchedValue,
          tokenValue: typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value),
          confidence
        });
      }
    }

    return matches;
  }

  /**
   * Match spacing/dimension tokens
   * @param filterType - Optional filter to only match specific spacing types (e.g., 'borderRadius', 'borderWidth')
   */
  private matchSpacing(token: ParsedToken, component: ComponentProperties, filterType?: string): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = this.normalizeDimension(token.value);

    // Filter spacing properties if a type filter is specified
    const spacingToCheck = filterType 
      ? component.spacing.filter(s => s.type === filterType)
      : component.spacing;

    // First pass: Match by token reference (Tokens Studio path matching)
    for (const spacing of spacingToCheck) {
      if (spacing.tokenReference) {
        // Clean up the token reference
        let refPath = spacing.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, '');
        refPath = refPath.replace(/^[{]|[}]$/g, '');
        refPath = refPath.replace(/^\$/, '');
        // Remove context prefix like "[horizontal] " for path comparison
        refPath = refPath.replace(/^\[\w+\]\s*/, '');
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        // Format the property type for display - include the token reference for context
        const displayType = this.formatSpacingType(spacing.type);
        
        // Exact path match
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${displayType} (token ref)`,
            propertyType: 'spacing',
            // Include token reference in matchedValue for UI to parse direction from
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Only match if the reference ends with the full token path (proper suffix/prefix)
        else if (normalizedRef.endsWith('.' + normalizedToken) || normalizedRef === normalizedToken ||
                 normalizedToken.endsWith('.' + normalizedRef) || normalizedToken === normalizedRef) {
          matches.push({
            property: `${displayType} (token ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // If we found high confidence reference matches, return them (skip value matching)
    const highConfidenceMatches = matches.filter(m => m.confidence >= 0.9);
    if (highConfidenceMatches.length > 0) {
      return highConfidenceMatches;
    }

    // SEMANTIC TOKEN MATCHING: If the token value is a reference (like "{kds.spacing.md}"),
    // check if the component uses that inner reference
    const innerRef = this.extractTokenReference(token.value);
    if (innerRef) {
      const normalizedInnerRef = innerRef.toLowerCase();
      
      for (const spacing of spacingToCheck) {
        if (spacing.tokenReference) {
          let refPath = spacing.tokenReference.trim()
            .replace(/^["']|["']$/g, '')
            .replace(/^[{]|[}]$/g, '')
            .replace(/^\$/, '')
            .replace(/^\[\w+\]\s*/, '');
          
          const normalizedRef = refPath.toLowerCase();
          const displayType = this.formatSpacingType(spacing.type);
          
          // Check if component references the inner token
          if (normalizedRef === normalizedInnerRef ||
              normalizedRef.endsWith('.' + normalizedInnerRef) ||
              normalizedInnerRef.endsWith('.' + normalizedRef)) {
            matches.push({
              property: `${displayType} (via ${tokenPath})`,
              propertyType: 'spacing',
              matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
              tokenValue: `${tokenPath} → ${token.value}`,
              confidence: 0.95
            });
          }
        }
      }
      
      if (matches.length > 0) {
        return matches;
      }
    }

    // VALUE-BASED MATCHING: Fall back to matching by dimension value
    if (tokenValue !== null) {
      for (const spacing of spacingToCheck) {
        if (Math.abs(spacing.value - tokenValue) < 0.5) {
          const displayType = this.formatSpacingType(spacing.type);
          matches.push({
            property: `${displayType} (value match)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit}`,
            tokenValue: `${tokenPath} = ${token.value}`,
            confidence: 0.6 // Lower confidence for value-based matches
          });
        }
      }
    }

    return matches;
  }

  /**
   * Format spacing type for display
   */
  private formatSpacingType(type: string): string {
    switch (type) {
      case 'borderRadius':
        return 'border-radius';
      case 'borderWidth':
        return 'border-width';
      case 'gap':
        return 'gap/spacing';
      default:
        return type;
    }
  }

  /**
   * Match effect/shadow tokens
   * 
   * Handles both:
   * 1. Direct token references (component uses the shadow token directly)
   * 2. Composite shadow tokens with inner references (e.g., { color: "{kds.color.shadow}", blur: "{kds.elevation.blur}" })
   */
  private matchEffects(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const normalizedTokenPath = tokenPath.toLowerCase();

    // First pass: Match by direct token reference (Tokens Studio path matching)
    for (const effect of component.effects) {
      if (effect.tokenReference) {
        // Clean up the token reference
        let refPath = effect.tokenReference.trim();
        refPath = refPath.replace(/^["']|["']$/g, '');
        refPath = refPath.replace(/^[{]|[}]$/g, '');
        refPath = refPath.replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        
        // Exact path match
        if (normalizedRef === normalizedTokenPath) {
          matches.push({
            property: `${effect.type} (token ref)`,
            propertyType: 'effect',
            matchedValue: `${effect.type} ← ${effect.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        }
        // Proper suffix/prefix match
        else if (normalizedRef.endsWith('.' + normalizedTokenPath) ||
                 normalizedTokenPath.endsWith('.' + normalizedRef)) {
          matches.push({
            property: `${effect.type} (token ref)`,
            propertyType: 'effect',
            matchedValue: `${effect.type} ← ${effect.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // Second pass: For composite shadow tokens, match inner references
    if (typeof token.value === 'object' && token.value !== null) {
      const shadowObj = token.value as Record<string, any>;
      
      // Extract inner references from shadow properties (color, blur, spread, x, y)
      for (const [key, value] of Object.entries(shadowObj)) {
        const innerRef = this.extractTokenReference(value);
        if (!innerRef) continue;
        
        const normalizedInnerRef = innerRef.toLowerCase();
        
        // Match inner references against effect token references
        for (const effect of component.effects) {
          if (effect.tokenReference) {
            let componentRef = effect.tokenReference.trim()
              .replace(/^["']|["']$/g, '')
              .replace(/^[{]|[}]$/g, '')
              .replace(/^\$/, '');
            const normalizedComponentRef = componentRef.toLowerCase();
            
            if (normalizedComponentRef === normalizedInnerRef ||
                normalizedComponentRef.endsWith('.' + normalizedInnerRef) ||
                normalizedInnerRef.endsWith('.' + normalizedComponentRef)) {
              matches.push({
                property: `${effect.type} (via ${tokenPath}.${key})`,
                propertyType: 'effect',
                matchedValue: `${effect.type} ← ${effect.tokenReference}`,
                tokenValue: `${tokenPath} → ${key}: ${value}`,
                confidence: 0.95
              });
            }
          }
        }
        
        // Also check colors for shadow color references
        if (key.toLowerCase().includes('color')) {
          for (const color of component.colors) {
            if (color.tokenReference) {
              let componentRef = color.tokenReference.trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^[{]|[}]$/g, '')
                .replace(/^\$/, '');
              const normalizedComponentRef = componentRef.toLowerCase();
              
              if (normalizedComponentRef === normalizedInnerRef ||
                  normalizedComponentRef.endsWith('.' + normalizedInnerRef) ||
                  normalizedInnerRef.endsWith('.' + normalizedComponentRef)) {
                matches.push({
                  property: `shadow color (via ${tokenPath}.${key})`,
                  propertyType: 'color',
                  matchedValue: `${color.hex} ← ${color.tokenReference}`,
                  tokenValue: `${tokenPath} → ${key}: ${value}`,
                  confidence: 0.95
                });
              }
            }
          }
        }
      }
    }

    // Return unique high confidence matches first
    const uniqueMatches = this.deduplicateMatches(matches);
    const highConfidenceMatches = uniqueMatches.filter(m => m.confidence >= 0.9);
    
    return highConfidenceMatches.length > 0 ? highConfidenceMatches : uniqueMatches;
  }

  /**
   * Extract token reference path from a value like "{kds.color.border.neutral}" or "$kds.color.border.neutral"
   */
  private extractTokenReference(value: any): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    // Match {token.path} or $token.path patterns
    const match = trimmed.match(/^[{$]?([^{}$]+)[}]?$/);
    return match ? match[1].trim() : null;
  }

  /**
   * Match composite border tokens
   * Composite border tokens typically have: { color, width, style }
   * 
   * MATCHING STRATEGY:
   * 1. Direct reference match: Check if the composite token path itself is referenced
   * 2. Inner reference match: Check if the token's inner values (color, width) reference 
   *    tokens that are used in the component
   * 
   * For example, if the composite token is:
   *   kds.border.base.default = { color: "{kds.color.border.neutral}", width: "{kds.core.border-width.xs}" }
   * 
   * We check if the component uses:
   *   - kds.border.base.default directly (unlikely, but possible)
   *   - kds.color.border.neutral for stroke color
   *   - kds.core.border-width.xs for stroke weight
   */
  private matchBorder(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = token.value;

    // Check if this is actually a composite border token (has color, width, style properties)
    const isComposite = typeof tokenValue === 'object' && tokenValue !== null &&
      ('color' in tokenValue || 'width' in tokenValue || 'style' in tokenValue);

    if (isComposite) {
      // Decompose composite border token and match INNER REFERENCES
      const borderObj = tokenValue as { color?: any; width?: any; style?: any };

      // Extract the inner token references (e.g., "{kds.color.border.neutral}" → "kds.color.border.neutral")
      const colorRef = this.extractTokenReference(borderObj.color);
      const widthRef = this.extractTokenReference(borderObj.width);

      // Match the inner color reference against stroke colors
      if (colorRef) {
        const normalizedColorRef = colorRef.toLowerCase();
        
        for (const color of component.colors.filter(c => c.type === 'stroke')) {
          if (color.tokenReference) {
            let componentRef = color.tokenReference.trim()
              .replace(/^["']|["']$/g, '')
              .replace(/^[{]|[}]$/g, '')
              .replace(/^\$/, '');
            
            const normalizedComponentRef = componentRef.toLowerCase();
            
            // Check if the component's reference matches the inner color reference
            if (normalizedComponentRef === normalizedColorRef ||
                normalizedComponentRef.endsWith('.' + normalizedColorRef) ||
                normalizedColorRef.endsWith('.' + normalizedComponentRef)) {
              matches.push({
                property: `stroke color (via ${tokenPath})`,
                propertyType: 'color',
                matchedValue: `${color.hex} ← ${color.tokenReference}`,
                tokenValue: `${tokenPath} → color: ${borderObj.color}`,
                confidence: 0.95
              });
            }
          }
        }
      }

      // Match the inner width reference against stroke weight
      if (widthRef) {
        const normalizedWidthRef = widthRef.toLowerCase();
        
        for (const spacing of component.spacing.filter(s => s.type === 'borderWidth')) {
          if (spacing.tokenReference) {
            let componentRef = spacing.tokenReference.trim()
              .replace(/^["']|["']$/g, '')
              .replace(/^[{]|[}]$/g, '')
              .replace(/^\$/, '');
            
            const normalizedComponentRef = componentRef.toLowerCase();
            
            // Check if the component's reference matches the inner width reference
            if (normalizedComponentRef === normalizedWidthRef ||
                normalizedComponentRef.endsWith('.' + normalizedWidthRef) ||
                normalizedWidthRef.endsWith('.' + normalizedComponentRef)) {
              matches.push({
                property: `border-width (via ${tokenPath})`,
                propertyType: 'spacing',
                matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
                tokenValue: `${tokenPath} → width: ${borderObj.width}`,
                confidence: 0.95
              });
            }
          }
        }
      }
      
      // If we matched BOTH color and width from the composite token, boost confidence
      const hasColorMatch = matches.some(m => m.property.includes('stroke color'));
      const hasWidthMatch = matches.some(m => m.property.includes('border-width'));
      if (hasColorMatch && hasWidthMatch) {
        matches.forEach(m => {
          m.confidence = Math.min(1.0, m.confidence + 0.05);
          m.property = m.property.replace('(via ', '(full match via ');
        });
      }
    }

    // Also try direct token reference matching for the border token itself
    // (Some tools apply composite border tokens directly)
    const normalizedTokenPath = tokenPath.toLowerCase();
    
    // Check stroke colors for the full border token reference
    for (const color of component.colors.filter(c => c.type === 'stroke')) {
      if (color.tokenReference) {
        let refPath = color.tokenReference.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^[{]|[}]$/g, '')
          .replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        
        if (normalizedRef === normalizedTokenPath) {
          matches.push({
            property: `stroke color (direct border ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        } else if (normalizedRef.endsWith('.' + normalizedTokenPath) || 
                   normalizedTokenPath.endsWith('.' + normalizedRef)) {
          matches.push({
            property: `stroke color (direct border ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // Check border width for the full border token reference
    for (const spacing of component.spacing.filter(s => s.type === 'borderWidth')) {
      if (spacing.tokenReference) {
        let refPath = spacing.tokenReference.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^[{]|[}]$/g, '')
          .replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        
        if (normalizedRef === normalizedTokenPath) {
          matches.push({
            property: `border-width (direct ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        } else if (normalizedRef.endsWith('.' + normalizedTokenPath) || 
                   normalizedTokenPath.endsWith('.' + normalizedRef)) {
          matches.push({
            property: `border-width (direct ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // If the token path looks like it might be a radius token that was incorrectly typed,
    // also try borderRadius matching
    if (this.looksLikeBorderRadiusToken(token)) {
      matches.push(...this.matchSpacing(token, component, 'borderRadius'));
    }

    // If the token path looks like it might be a width token,
    // also try borderWidth matching
    if (this.looksLikeBorderToken(token) && !this.looksLikeBorderRadiusToken(token)) {
      matches.push(...this.matchSpacing(token, component, 'borderWidth'));
    }

    // Filter out duplicates and return high-confidence matches
    const uniqueMatches = this.deduplicateMatches(matches);
    const highConfidenceMatches = uniqueMatches.filter(m => m.confidence >= 0.85);
    
    return highConfidenceMatches.length > 0 ? highConfidenceMatches : uniqueMatches;
  }

  /**
   * Match composition tokens
   * Composition tokens can contain multiple nested properties with inner references
   * 
   * For example: { fill: "{kds.color.primary}", padding: "{kds.spacing.md}" }
   * We extract the inner references and match them against component properties
   */
  private matchComposition(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const tokenPath = token.path.join('.');
    const tokenValue = token.value;

    // If the composition token has a value object, try to match each property's inner reference
    if (typeof tokenValue === 'object' && tokenValue !== null) {
      const compositionObj = tokenValue as Record<string, any>;

      // Check each property in the composition token
      for (const [key, value] of Object.entries(compositionObj)) {
        // Extract inner token reference (e.g., "{kds.color.primary}" → "kds.color.primary")
        const innerRef = this.extractTokenReference(value);
        
        if (innerRef) {
          const normalizedInnerRef = innerRef.toLowerCase();
          
          // Try to match inner color references against component colors
          for (const color of component.colors) {
            if (color.tokenReference) {
              let componentRef = color.tokenReference.trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^[{]|[}]$/g, '')
                .replace(/^\$/, '');
              const normalizedComponentRef = componentRef.toLowerCase();
              
              if (normalizedComponentRef === normalizedInnerRef ||
                  normalizedComponentRef.endsWith('.' + normalizedInnerRef) ||
                  normalizedInnerRef.endsWith('.' + normalizedComponentRef)) {
                matches.push({
                  property: `${color.type} color (via ${tokenPath}.${key})`,
                  propertyType: 'color',
                  matchedValue: `${color.hex} ← ${color.tokenReference}`,
                  tokenValue: `${tokenPath} → ${key}: ${value}`,
                  confidence: 0.95
                });
              }
            }
          }
          
          // Try to match inner spacing references against component spacing
          for (const spacing of component.spacing) {
            if (spacing.tokenReference) {
              let componentRef = spacing.tokenReference.trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^[{]|[}]$/g, '')
                .replace(/^\$/, '');
              const normalizedComponentRef = componentRef.toLowerCase();
              
              if (normalizedComponentRef === normalizedInnerRef ||
                  normalizedComponentRef.endsWith('.' + normalizedInnerRef) ||
                  normalizedInnerRef.endsWith('.' + normalizedComponentRef)) {
                matches.push({
                  property: `${spacing.type} (via ${tokenPath}.${key})`,
                  propertyType: 'spacing',
                  matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
                  tokenValue: `${tokenPath} → ${key}: ${value}`,
                  confidence: 0.95
                });
              }
            }
          }
          
          // Try to match inner effect references against component effects
          for (const effect of component.effects) {
            if (effect.tokenReference) {
              let componentRef = effect.tokenReference.trim()
                .replace(/^["']|["']$/g, '')
                .replace(/^[{]|[}]$/g, '')
                .replace(/^\$/, '');
              const normalizedComponentRef = componentRef.toLowerCase();
              
              if (normalizedComponentRef === normalizedInnerRef ||
                  normalizedComponentRef.endsWith('.' + normalizedInnerRef) ||
                  normalizedInnerRef.endsWith('.' + normalizedComponentRef)) {
                matches.push({
                  property: `${effect.type} (via ${tokenPath}.${key})`,
                  propertyType: 'effect',
                  matchedValue: `${effect.type} ← ${effect.tokenReference}`,
                  tokenValue: `${tokenPath} → ${key}: ${value}`,
                  confidence: 0.95
                });
              }
            }
          }
        }
        
        // Fallback: literal value matching for non-reference values
        else if (this.looksLikeColor(value)) {
          for (const color of component.colors) {
            const normalizedColorValue = this.normalizeColor(value);
            const normalizedComponentColor = this.normalizeColor(color.hex);
            if (normalizedColorValue === normalizedComponentColor) {
              matches.push({
                property: `${color.type} color (composition.${key} literal)`,
                propertyType: 'color',
                matchedValue: `${color.hex}`,
                tokenValue: `${tokenPath}.${key}`,
                confidence: 0.7
              });
            }
          }
        }
      }
    }

    // Also try direct token reference matching
    // Check all spacing properties
    for (const spacing of component.spacing) {
      if (spacing.tokenReference) {
        let refPath = spacing.tokenReference.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^[{]|[}]$/g, '')
          .replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${spacing.type} (composition token ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        } else if (normalizedRef.endsWith('.' + normalizedToken) || 
                   normalizedToken.endsWith('.' + normalizedRef)) {
          matches.push({
            property: `${spacing.type} (composition token ref)`,
            propertyType: 'spacing',
            matchedValue: `${spacing.value}${spacing.unit} ← ${spacing.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // Check all colors
    for (const color of component.colors) {
      if (color.tokenReference) {
        let refPath = color.tokenReference.trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^[{]|[}]$/g, '')
          .replace(/^\$/, '');
        
        const normalizedRef = refPath.toLowerCase();
        const normalizedToken = tokenPath.toLowerCase();
        
        if (normalizedRef === normalizedToken) {
          matches.push({
            property: `${color.type} color (composition token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 1.0
          });
        } else if (normalizedRef.endsWith('.' + normalizedToken) || 
                   normalizedToken.endsWith('.' + normalizedRef)) {
          matches.push({
            property: `${color.type} color (composition token ref)`,
            propertyType: 'color',
            matchedValue: `${color.hex} ← ${color.tokenReference}`,
            tokenValue: tokenPath,
            confidence: 0.9
          });
        }
      }
    }

    // Filter out duplicates
    return this.deduplicateMatches(matches);
  }

  /**
   * Remove duplicate matches based on property and matchedValue
   */
  private deduplicateMatches(matches: MatchDetail[]): MatchDetail[] {
    const seen = new Set<string>();
    return matches.filter(match => {
      const key = `${match.property}|${match.matchedValue}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Try to match by inferring type from value
   */
  private matchByValue(token: ParsedToken, component: ComponentProperties): MatchDetail[] {
    const matches: MatchDetail[] = [];

    // Try color matching
    if (this.looksLikeColor(token.value)) {
      matches.push(...this.matchColor(token, component));
    }

    // Try dimension matching
    if (this.looksLikeDimension(token.value)) {
      matches.push(...this.matchSpacing(token, component));
    }

    return matches;
  }

  // Helper methods

  /**
   * Normalize color value to a standard format
   */
  private normalizeColor(value: any): string | null {
    if (typeof value !== 'string') return null;
    const str = value.trim().toLowerCase();

    // Already in a recognizable format
    if (str.match(/^#[0-9a-f]{3,8}$/) || str.match(/^rgba?\(/) || str.match(/^hsla?\(/)) {
      return str;
    }

    return null;
  }

  /**
   * Normalize hex color (remove #, lowercase, expand shorthand)
   */
  private normalizeHex(hex: string): string | null {
    if (!hex) return null;
    let normalized = hex.trim().toLowerCase().replace('#', '');

    // Expand shorthand (e.g., #fff -> #ffffff)
    if (normalized.length === 3) {
      normalized = normalized
        .split('')
        .map(c => c + c)
        .join('');
    }

    return normalized.length === 6 ? normalized : null;
  }

  /**
   * Normalize rgba string
   */
  private normalizeRgba(rgba: string): string | null {
    if (!rgba) return null;
    const match = rgba.match(/rgba?\(([^)]+)\)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Parse rgba values from string
   */
  private parseRgba(rgba: string): { r: number; g: number; b: number; a: number } | null {
    const normalized = this.normalizeRgba(rgba);
    if (!normalized) return null;

    const parts = normalized.split(',').map(p => parseFloat(p.trim()));
    if (parts.length >= 3) {
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts.length > 3 ? parts[3] : 1
      };
    }

    return null;
  }

  /**
   * Convert RGBAColor to rgba string
   */
  private rgbaToString(color: { r: number; g: number; b: number; a: number }): string {
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a.toFixed(2)})`;
  }

  /**
   * Check if two color strings match (with tolerance)
   */
  private colorsMatch(color1: string, color2: string): boolean {
    const rgba1 = this.parseRgba(color1);
    const rgba2 = this.parseRgba(color2);

    if (rgba1 && rgba2) {
      return (
        Math.abs(rgba1.r - rgba2.r) < 2 &&
        Math.abs(rgba1.g - rgba2.g) < 2 &&
        Math.abs(rgba1.b - rgba2.b) < 2 &&
        Math.abs(rgba1.a - rgba2.a) < 0.01
      );
    }

    const hex1 = this.normalizeHex(color1);
    const hex2 = this.normalizeHex(color2);
    return hex1 !== null && hex2 !== null && hex1 === hex2;
  }

  /**
   * Normalize font weight value
   */
  private normalizeFontWeight(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 400;

    const weightMap: Record<string, number> = {
      thin: 100,
      extralight: 200,
      light: 300,
      regular: 400,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900
    };

    const lower = value.toLowerCase().trim();
    if (weightMap[lower]) return weightMap[lower];

    const num = parseInt(value, 10);
    return isNaN(num) ? 400 : num;
  }

  /**
   * Normalize dimension value to number (removes units)
   */
  private normalizeDimension(value: any): number | null {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;

    // Remove units and parse
    const cleaned = value.replace(/px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Check if value looks like a color
   */
  private looksLikeColor(value: any): boolean {
    if (typeof value !== 'string') return false;
    const str = value.trim().toLowerCase();
    return (
      str.match(/^#[0-9a-f]{3,8}$/) !== null ||
      str.match(/^rgba?\(/) !== null ||
      str.match(/^hsla?\(/) !== null
    );
  }

  /**
   * Check if value looks like a dimension
   */
  private looksLikeDimension(value: any): boolean {
    if (typeof value === 'number') return true;
    if (typeof value !== 'string') return false;
    return /^-?\d+(\.\d+)?(px|rem|em|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax|%)$/.test(value.trim());
  }

  /**
   * Check if token path suggests it's a spacing/dimension token
   */
  private looksLikeSpacingToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const spacingKeywords = [
      'spacing', 'space', 'size', 'sizing', 'dimension',
      'width', 'height', 'padding', 'margin', 'gap',
      'radius', 'border', 'inset', 'offset',
      // Additional keywords for common token naming patterns
      'corner', 'round', 'stroke', 'weight',
      // Numeric patterns like "1x", "2x", "4x" are common for spacing
      '1x', '2x', '3x', '4x', '5x', '6x', '8x', '10x', '12x', '16x'
    ];
    return spacingKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's a border-radius token
   */
  private looksLikeBorderRadiusToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const radiusKeywords = [
      'radius', 'corner', 'round', 'rounded', 'borderradius'
    ];
    return radiusKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's a border/stroke token
   */
  private looksLikeBorderToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const borderKeywords = [
      'border', 'stroke', 'outline', 'line'
    ];
    // Exclude borderRadius which is handled separately
    if (pathStr.includes('radius')) return false;
    return borderKeywords.some(keyword => pathStr.includes(keyword));
  }

  /**
   * Check if token path suggests it's an effect/shadow token
   */
  private looksLikeEffectToken(token: ParsedToken): boolean {
    const pathStr = token.path.join('.').toLowerCase();
    const effectKeywords = [
      'shadow', 'effect', 'blur', 'elevation', 'drop'
    ];
    return effectKeywords.some(keyword => pathStr.includes(keyword));
  }
}

