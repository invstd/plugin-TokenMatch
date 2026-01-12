/**
 * Figma Component Service
 * Scans and extracts properties from Figma components
 */

import {
  ComponentProperties,
  ColorProperty,
  TypographyProperty,
  SpacingProperty,
  EffectProperty,
  ScanResult,
  ComponentScanError,
  ComponentUsageStats,
  RGBAColor
} from '../types/components';

export class FigmaComponentService {
  private errors: ComponentScanError[] = [];
  
  // Tokens Studio plugin namespace
  private readonly TOKENS_STUDIO_NAMESPACE = 'tokens';
  
  // Enable debug logging to discover token keys
  private readonly DEBUG_LOGGING = true;

  /**
   * Get ALL shared plugin data keys from a node (for debugging)
   * This helps discover what keys Tokens Studio actually uses
   */
  private getAllTokenKeys(node: SceneNode): Record<string, string> {
    const allKeys: Record<string, string> = {};
    const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens', 'figma-tokens'];
    
    for (const namespace of namespaces) {
      try {
        const keys = node.getSharedPluginDataKeys(namespace);
        for (const key of keys) {
          const value = node.getSharedPluginData(namespace, key);
          if (value && value.trim()) {
            allKeys[`${namespace}:${key}`] = value;
          }
        }
      } catch (e) {
        // Namespace doesn't exist
      }
    }
    
    return allKeys;
  }

  /**
   * Get Figma Variable binding for a property (modern approach)
   * Tokens Studio can sync tokens to Figma Variables
   */
  private getVariableBinding(node: SceneNode, property: string): string | undefined {
    try {
      if (!('boundVariables' in node) || !node.boundVariables) {
        return undefined;
      }
      
      const boundVars = node.boundVariables as Record<string, any>;
      const binding = boundVars[property];
      
      if (binding) {
        // Handle array bindings (e.g., fills[0])
        const bindingToCheck = Array.isArray(binding) ? binding[0] : binding;
        
        if (bindingToCheck?.id) {
          try {
            const variable = figma.variables.getVariableById(bindingToCheck.id);
            if (variable?.name) {
              // Variable names often contain the token path
              if (this.DEBUG_LOGGING) {
                console.log(`[Variable] ${node.name}.${property} → ${variable.name}`);
              }
              return variable.name;
            }
          } catch (e) {
            // Variable might not be accessible
          }
        }
      }
    } catch (e) {
      // Bound variables not available
    }
    return undefined;
  }

  /**
   * Clean token reference value - remove surrounding quotes that Tokens Studio may include
   */
  private cleanTokenReference(value: string): string {
    let cleaned = value.trim();
    // Remove multiple layers of quotes (Tokens Studio stores values like "ids.spacing.1x" with quotes)
    while (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    // Also remove braces and $ prefix if present
    cleaned = cleaned.replace(/^[{]|[}]$/g, '');
    cleaned = cleaned.replace(/^\$/, '');
    return cleaned.trim();
  }

  /**
   * Get Tokens Studio token reference from node plugin data
   */
  private getTokenReference(node: SceneNode, key: string): string | undefined {
    try {
      // Tokens Studio uses different namespaces - try common ones
      const namespaces = ['tokens', 'tokens-studio', 'tokensStudio', 'design-tokens'];
      
      for (const namespace of namespaces) {
        try {
          const sharedData = node.getSharedPluginData(namespace, key);
          if (sharedData && sharedData.trim()) {
            // Clean the value - remove surrounding quotes
            const cleanedValue = this.cleanTokenReference(sharedData);
            if (this.DEBUG_LOGGING) {
              console.log(`[TokenRef] Found ${namespace}:${key} = "${cleanedValue}" on ${node.name}`);
            }
            return cleanedValue;
          }
        } catch (e) {
          // Namespace might not exist, continue
        }
      }
      
      // Try without namespace (direct key)
      try {
        const directData = node.getPluginData(key);
        if (directData && directData.trim()) {
          return this.cleanTokenReference(directData);
        }
      } catch (e) {
        // Plugin data might not exist, which is fine
      }
    } catch (error) {
      // Plugin data might not exist, which is fine
    }
    return undefined;
  }

  /**
   * Extract Tokens Studio token references for fills
   * Tokens Studio stores fill token references in various formats
   */
  private getFillTokenReferences(node: SceneNode, fillIndex: number): string | undefined {
    // Try different key formats that Tokens Studio might use
    const keys = [
      `fills[${fillIndex}]`,
      `fill[${fillIndex}]`,
      `fills.${fillIndex}`,
      `fill.${fillIndex}`,
      'fill',
      'fills',
      `fillColor`,
      `fillColor[${fillIndex}]`
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    return undefined;
  }

  /**
   * Extract Tokens Studio token references for strokes
   */
  private getStrokeTokenReferences(node: SceneNode, strokeIndex: number): string | undefined {
    // Try different key formats that Tokens Studio might use
    const keys = [
      `strokes[${strokeIndex}]`,
      `stroke[${strokeIndex}]`,
      `strokes.${strokeIndex}`,
      `stroke.${strokeIndex}`,
      'stroke',
      'strokes',
      `strokeColor`,
      `strokeColor[${strokeIndex}]`,
      'borderColor'
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    return undefined;
  }

  /**
   * Extract Tokens Studio token references for typography
   */
  private getTypographyTokenReference(node: SceneNode, property: string): string | undefined {
    // Try different key formats for typography properties
    const keyMap: Record<string, string[]> = {
      'fontFamily': ['fontFamily', 'fontFamilies', 'font-family', 'typography.fontFamily'],
      'fontSize': ['fontSize', 'fontSizes', 'font-size', 'typography.fontSize'],
      'fontWeight': ['fontWeight', 'fontWeights', 'font-weight', 'typography.fontWeight'],
      'lineHeight': ['lineHeight', 'lineHeights', 'line-height', 'typography.lineHeight'],
      'letterSpacing': ['letterSpacing', 'letter-spacing', 'typography.letterSpacing'],
      'typography': ['typography', 'text', 'textStyle', 'text-style']
    };
    
    const keys = keyMap[property] || [property];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    return undefined;
  }

  /**
   * Extract Tokens Studio token references for spacing/dimensions
   * Tokens Studio uses various keys - this is comprehensive based on their plugin
   */
  private getSpacingTokenReference(node: SceneNode, property: string): string | undefined {
    // Comprehensive key mapping based on Tokens Studio patterns
    // Keys are checked in order of likelihood
    const keyMap: Record<string, string[]> = {
      // Sizing/dimensions
      'width': ['width', 'sizing', 'dimension', 'sizing.width', 'dimensions.width'],
      'height': ['height', 'sizing', 'dimension', 'sizing.height', 'dimensions.height'],
      
      // Padding - Tokens Studio often uses these specific keys
      'padding': ['padding', 'spacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      'paddingTop': ['paddingTop', 'verticalPadding', 'padding', 'spacing'],
      'paddingRight': ['paddingRight', 'horizontalPadding', 'padding', 'spacing'],
      'paddingBottom': ['paddingBottom', 'verticalPadding', 'padding', 'spacing'],
      'paddingLeft': ['paddingLeft', 'horizontalPadding', 'padding', 'spacing'],
      'verticalPadding': ['verticalPadding', 'paddingTop', 'paddingBottom', 'padding', 'spacing'],
      'horizontalPadding': ['horizontalPadding', 'paddingLeft', 'paddingRight', 'padding', 'spacing'],
      
      // Gap/Item spacing - common in auto-layout
      'gap': ['itemSpacing', 'spacing', 'gap', 'counterAxisSpacing'],
      'itemSpacing': ['itemSpacing', 'spacing', 'gap'],
      'counterAxisSpacing': ['counterAxisSpacing', 'spacing'],
      
      // Border radius - can be uniform or per-corner
      'borderRadius': ['borderRadius', 'borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft', 'radius', 'cornerRadius'],
      'borderRadiusTopLeft': ['borderRadiusTopLeft', 'borderRadius', 'radius'],
      'borderRadiusTopRight': ['borderRadiusTopRight', 'borderRadius', 'radius'],
      'borderRadiusBottomRight': ['borderRadiusBottomRight', 'borderRadius', 'radius'],
      'borderRadiusBottomLeft': ['borderRadiusBottomLeft', 'borderRadius', 'radius'],
      
      // Border width
      'borderWidth': ['borderWidth', 'strokeWeight', 'borderWidthTop', 'borderWidthRight', 'borderWidthBottom', 'borderWidthLeft', 'border'],
      'strokeWeight': ['strokeWeight', 'borderWidth', 'border'],
      
      // Generic dimension
      'dimension': ['dimension', 'spacing', 'sizing', 'size']
    };
    
    const keys = keyMap[property] || [property];
    
    // First try plugin data
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) return ref;
    }
    
    // Then try Figma Variable bindings (modern approach)
    const variableRef = this.getVariableBinding(node, property);
    if (variableRef) return variableRef;
    
    return undefined;
  }

  /**
   * Extract border radius token references specifically
   * Handles both uniform radius and per-corner radius
   */
  private getBorderRadiusTokenReference(node: SceneNode): string | undefined {
    // Keys that Tokens Studio uses for border radius
    const keys = [
      'borderRadius',
      'borderRadiusTopLeft',
      'borderRadiusTopRight', 
      'borderRadiusBottomRight',
      'borderRadiusBottomLeft',
      'radius',
      'cornerRadius',
      'topLeftRadius',
      'topRightRadius',
      'bottomRightRadius',
      'bottomLeftRadius'
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) {
        if (this.DEBUG_LOGGING) {
          console.log(`[BorderRadius] Found ${key} = "${ref}" on ${node.name}`);
        }
        return ref;
      }
    }
    
    // Check Figma Variable binding for corner radius
    const variableRef = this.getVariableBinding(node, 'cornerRadius');
    if (variableRef) return variableRef;
    
    return undefined;
  }

  /**
   * Extract border/stroke width token reference
   */
  private getBorderWidthTokenReference(node: SceneNode): string | undefined {
    const keys = [
      'borderWidth',
      'strokeWeight', 
      'borderWidthTop',
      'borderWidthRight',
      'borderWidthBottom',
      'borderWidthLeft',
      'border',
      'strokeWidth'
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) {
        if (this.DEBUG_LOGGING) {
          console.log(`[BorderWidth] Found ${key} = "${ref}" on ${node.name}`);
        }
        return ref;
      }
    }
    
    // Check Figma Variable binding
    const variableRef = this.getVariableBinding(node, 'strokeWeight');
    if (variableRef) return variableRef;
    
    return undefined;
  }

  /**
   * Extract Tokens Studio token references for effects/shadows
   * Tokens Studio typically uses 'boxShadow' as the primary key
   */
  private getEffectTokenReference(node: SceneNode, effectIndex: number): string | undefined {
    // Keys that Tokens Studio uses for effects/shadows
    // boxShadow is the primary key used by Tokens Studio
    const keys = [
      'boxShadow',           // Primary Tokens Studio key
      'shadow',              // Alternative
      `boxShadow[${effectIndex}]`,  // Indexed if multiple
      `shadow[${effectIndex}]`,
      'effects',
      'effect',
      `effects[${effectIndex}]`,
      `effect[${effectIndex}]`,
      'dropShadow',
      'innerShadow',
      'elevation',           // Material Design style
      'shadowColor',
      'shadowOffset',
      'shadowRadius',
      'shadowSpread'
    ];
    
    for (const key of keys) {
      const ref = this.getTokenReference(node, key);
      if (ref) {
        if (this.DEBUG_LOGGING) {
          console.log(`[Effect] Found ${key} = "${ref}" on ${node.name}`);
        }
        return ref;
      }
    }
    
    // Check Figma Variable binding
    const variableRef = this.getVariableBinding(node, 'effects');
    if (variableRef) return variableRef;
    
    return undefined;
  }

  /**
   * Log all token data found on a node (for debugging)
   * Call this to discover what keys Tokens Studio actually uses
   */
  private logNodeTokenData(node: SceneNode): void {
    if (!this.DEBUG_LOGGING) return;
    
    const allKeys = this.getAllTokenKeys(node);
    if (Object.keys(allKeys).length > 0) {
      console.log(`\n[TokenData] Node: "${node.name}" (${node.type})`);
      for (const [key, value] of Object.entries(allKeys)) {
        const cleaned = this.cleanTokenReference(value);
        // Show cleaned value, and raw if different
        if (cleaned !== value) {
          console.log(`  ${key} = ${cleaned} (raw: ${value})`);
        } else {
          console.log(`  ${key} = ${cleaned}`);
        }
      }
    }
  }

  /**
   * Scan all components in the document
   */
  scanAllComponents(): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    const pages = figma.root.children;

    // Scan all pages
    for (const page of pages) {
      if (page.type === 'PAGE') {
        // Find all components and component sets
        const pageComponents = page.findAll(
          node => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
        );
        // Find all component instances
        const instances = page.findAll(node => node.type === 'INSTANCE');
        totalInstances += instances.length;

        // Process each component
        for (const component of pageComponents) {
          try {
            const props = this.extractComponentProperties(component, page.name);
            if (props) {
              components.push(props);
            }
          } catch (error) {
            this.errors.push({
              componentId: component.id,
              componentName: component.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: pages.length,
      errors: this.errors
    };
  }

  /**
   * Scan components on the current page only
   */
  scanCurrentPage(): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    const currentPage = figma.currentPage;
    let totalInstances = 0;

    // Find all components and component sets on current page
    const pageComponents = currentPage.findAll(
      node => node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );
    // Find all component instances
    const instances = currentPage.findAll(node => node.type === 'INSTANCE');
    totalInstances += instances.length;

    // Process each component
    for (const component of pageComponents) {
      try {
        const props = this.extractComponentProperties(component, currentPage.name);
        if (props) {
          components.push(props);
        }
      } catch (error) {
        this.errors.push({
          componentId: component.id,
          componentName: component.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: 1,
      errors: this.errors
    };
  }

  /**
   * Scan components from selected nodes
   */
  scanNodes(nodes: readonly SceneNode[]): ScanResult {
    this.errors = [];
    const components: ComponentProperties[] = [];
    let totalInstances = 0;
    const currentPage = figma.currentPage;

    // Process each selected node
    for (const node of nodes) {
      // Check if node has findAll method (only certain node types do)
      let nodeComponents: SceneNode[] = [];
      let instances: SceneNode[] = [];
      
      if ('findAll' in node && typeof node.findAll === 'function') {
        // Find all components and component sets within the selected node
        nodeComponents = node.findAll(
          (n: SceneNode) => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'
        ) as SceneNode[];
        // Find all component instances
        instances = node.findAll((n: SceneNode) => n.type === 'INSTANCE') as SceneNode[];
        totalInstances += instances.length;
      }

      // Process each component
      for (const component of nodeComponents) {
        try {
          const props = this.extractComponentProperties(component, currentPage.name);
          if (props) {
            components.push(props);
          }
        } catch (error) {
          this.errors.push({
            componentId: component.id,
            componentName: component.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // If the selected node itself is a component, include it
      if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
        try {
          const props = this.extractComponentProperties(node, currentPage.name);
          if (props) {
            // Check if we already added this component
            if (!components.find(c => c.id === props.id)) {
              components.push(props);
            }
          }
        } catch (error) {
          this.errors.push({
            componentId: node.id,
            componentName: node.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return {
      components,
      totalComponents: components.length,
      totalInstances,
      pagesScanned: 1,
      errors: this.errors
    };
  }

  /**
   * Extract all properties from a component node
   */
  extractComponentProperties(
    node: SceneNode,
    pageName: string
  ): ComponentProperties | null {
    if (
      node.type !== 'COMPONENT' &&
      node.type !== 'COMPONENT_SET' &&
      node.type !== 'INSTANCE'
    ) {
      return null;
    }

    const properties: ComponentProperties = {
      id: node.id,
      name: node.name,
      type: node.type,
      pageName: pageName,
      colors: [],
      typography: [],
      spacing: [],
      effects: []
    };

    // Determine main component name for variants
    // For COMPONENT inside COMPONENT_SET: parent's name
    // For COMPONENT_SET: its own name
    // For INSTANCE: get from mainComponent's parent
    if (node.type === 'COMPONENT_SET') {
      properties.mainComponentName = node.name;
      properties.mainComponentId = node.id;
    } else if (node.type === 'COMPONENT') {
      const component = node as ComponentNode;
      if (component.parent?.type === 'COMPONENT_SET') {
        properties.mainComponentName = component.parent.name;
        properties.mainComponentId = component.parent.id;
      } else {
        // Standalone component (not a variant)
        properties.mainComponentName = node.name;
        properties.mainComponentId = node.id;
      }
    } else if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      // Try to get mainComponent synchronously first
      try {
        const mainComp = instance.mainComponent;
        if (mainComp) {
          if (mainComp.parent?.type === 'COMPONENT_SET') {
            properties.mainComponentName = mainComp.parent.name;
            properties.mainComponentId = mainComp.parent.id;
          } else {
            properties.mainComponentName = mainComp.name;
            properties.mainComponentId = mainComp.id;
          }
        }
      } catch (e) {
        // mainComponent might not be available synchronously
        properties.mainComponentName = node.name.split(',')[0].trim();
      }
    }

    // Extract colors (fills and strokes) - includes token references
    // extractColors already handles the node itself, and we'll get children separately
    properties.colors = this.extractColors(node);

    // Extract typography - includes token references
    // extractTypography already recursively checks children
    properties.typography = this.extractTypography(node);

    // Extract spacing
    properties.spacing = this.extractSpacing(node);

    // Extract effects
    properties.effects = this.extractEffects(node);

    // Extract layout properties if it's a frame-like node
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const frame = node as ComponentNode | ComponentSetNode;
      if ('layoutMode' in frame && frame.layoutMode) {
        properties.layoutMode = frame.layoutMode;
        properties.itemSpacing = frame.itemSpacing;
        properties.paddingTop = frame.paddingTop;
        properties.paddingRight = frame.paddingRight;
        properties.paddingBottom = frame.paddingBottom;
        properties.paddingLeft = frame.paddingLeft;
      }
      properties.width = frame.width;
      properties.height = frame.height;
    } else if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      properties.width = instance.width;
      properties.height = instance.height;
    }

    // Recursively extract from children
    if ('children' in node) {
      const childProperties: ComponentProperties[] = [];
      for (const child of node.children) {
        const childProps = this.extractComponentProperties(child, pageName);
        if (childProps) {
          childProperties.push(childProps);
        }
      }
      if (childProperties.length > 0) {
        properties.children = childProperties;
      }
    }

    return properties;
  }

  /**
   * Extract color properties (fills and strokes)
   */
  extractColors(node: SceneNode): ColorProperty[] {
    const colors: ColorProperty[] = [];

    // Extract fills
    if ('fills' in node && Array.isArray(node.fills)) {
      for (let i = 0; i < node.fills.length; i++) {
        const fill = node.fills[i];
        if (fill.type === 'SOLID') {
          const opacity = fill.opacity ?? 1;
          const color = this.rgbaToColor(fill.color, opacity);
          const tokenRef = this.getFillTokenReferences(node, i);
          
          colors.push({
            type: 'fill',
            color: {
              r: fill.color.r,
              g: fill.color.g,
              b: fill.color.b,
              a: opacity
            },
            hex: color.hex,
            rgba: color.rgba,
            opacity: opacity,
            tokenReference: tokenRef
          });
        }
      }
    }

    // Extract strokes
    if ('strokes' in node && Array.isArray(node.strokes)) {
      for (let i = 0; i < node.strokes.length; i++) {
        const stroke = node.strokes[i];
        if (stroke.type === 'SOLID') {
          const opacity = stroke.opacity ?? 1;
          const color = this.rgbaToColor(stroke.color, opacity);
          const tokenRef = this.getStrokeTokenReferences(node, i);
          
          colors.push({
            type: 'stroke',
            color: {
              r: stroke.color.r,
              g: stroke.color.g,
              b: stroke.color.b,
              a: opacity
            },
            hex: color.hex,
            rgba: color.rgba,
            opacity: opacity,
            tokenReference: tokenRef
          });
        }
      }
    }

    return colors;
  }

  /**
   * Extract typography properties from text nodes
   */
  extractTypography(node: SceneNode): TypographyProperty[] {
    const typography: TypographyProperty[] = [];

    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      
      // Load fonts if needed
      if (typeof textNode.fontName !== 'symbol') {
        const fontName = textNode.fontName;
        
        // Get Tokens Studio token references for typography
        // First try composite typography token, then individual properties
        const typographyToken = this.getTypographyTokenReference(textNode, 'typography');
        const fontFamilyToken = this.getTypographyTokenReference(textNode, 'fontFamily');
        const fontSizeToken = this.getTypographyTokenReference(textNode, 'fontSize');
        const fontWeightToken = this.getTypographyTokenReference(textNode, 'fontWeight');
        const lineHeightToken = this.getTypographyTokenReference(textNode, 'lineHeight');
        const letterSpacingToken = this.getTypographyTokenReference(textNode, 'letterSpacing');
        
        // Use composite typography token if available, otherwise use first individual token
        const tokenRef = typographyToken || fontFamilyToken || fontSizeToken || fontWeightToken || lineHeightToken || letterSpacingToken;

        typography.push({
          fontFamily: fontName.family,
          fontSize: typeof textNode.fontSize === 'number' ? textNode.fontSize : 16,
          fontWeight:
            typeof fontName.style === 'string'
              ? this.parseFontWeight(fontName.style)
              : 400,
        lineHeight:
          typeof textNode.lineHeight === 'number' ||
          typeof textNode.lineHeight === 'string'
            ? textNode.lineHeight
            : undefined,
        letterSpacing:
          typeof textNode.letterSpacing === 'number'
            ? textNode.letterSpacing
            : undefined,
        textDecoration:
          typeof textNode.textDecoration === 'string'
            ? textNode.textDecoration
            : undefined,
        textCase:
          typeof textNode.textCase === 'string' ? textNode.textCase : undefined,
        tokenReference: tokenRef
        });
      }
    }

    // Recursively check children for typography (including token references)
    if ('children' in node) {
      for (const child of node.children) {
        typography.push(...this.extractTypography(child));
      }
    }

    return typography;
  }

  /**
   * Extract spacing properties including border-radius and border-width
   */
  extractSpacing(node: SceneNode): SpacingProperty[] {
    const spacing: SpacingProperty[] = [];
    
    // Log all token data for debugging
    this.logNodeTokenData(node);

    // Check if this is a frame-like node (has layout properties)
    const isFrameLike = node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || 
                        node.type === 'FRAME' || node.type === 'INSTANCE';

    if (isFrameLike) {
      const frame = node as ComponentNode | ComponentSetNode | FrameNode | InstanceNode;

      // Width and height with token references
      const widthToken = this.getSpacingTokenReference(node, 'width');
      const heightToken = this.getSpacingTokenReference(node, 'height');
      
      spacing.push({
        type: 'width',
        value: frame.width,
        unit: 'px',
        tokenReference: widthToken
      });
      spacing.push({
        type: 'height',
        value: frame.height,
        unit: 'px',
        tokenReference: heightToken
      });

      // Padding (only for frames with auto-layout)
      if ('paddingTop' in frame && typeof frame.paddingTop === 'number') {
        // Check for horizontalPadding and verticalPadding tokens first
        const horizontalPaddingToken = this.getSpacingTokenReference(node, 'horizontalPadding');
        const verticalPaddingToken = this.getSpacingTokenReference(node, 'verticalPadding');
        const paddingToken = this.getSpacingTokenReference(node, 'padding');
        
        // Individual padding tokens - check specific keys first, then fall back
        const paddingTopSpecific = this.getSpacingTokenReference(node, 'paddingTop');
        const paddingRightSpecific = this.getSpacingTokenReference(node, 'paddingRight');
        const paddingBottomSpecific = this.getSpacingTokenReference(node, 'paddingBottom');
        const paddingLeftSpecific = this.getSpacingTokenReference(node, 'paddingLeft');
        
        // Helper to format token ref with context
        const formatWithContext = (token: string | undefined, context: string) => {
          return token ? `[${context}] ${token}` : undefined;
        };
        
        // Determine token and context for each padding side
        const getPaddingToken = (specific: string | undefined, grouped: string | undefined, groupContext: string) => {
          if (specific) return specific;
          if (grouped) return formatWithContext(grouped, groupContext);
          if (paddingToken) return formatWithContext(paddingToken, 'all');
          return undefined;
        };
        
        if (frame.paddingTop) {
          spacing.push({
            type: 'padding',
            value: frame.paddingTop,
            unit: 'px',
            tokenReference: getPaddingToken(paddingTopSpecific, verticalPaddingToken, 'vertical')
          });
        }
        if (frame.paddingRight) {
          spacing.push({
            type: 'padding',
            value: frame.paddingRight,
            unit: 'px',
            tokenReference: getPaddingToken(paddingRightSpecific, horizontalPaddingToken, 'horizontal')
          });
        }
        if (frame.paddingBottom) {
          spacing.push({
            type: 'padding',
            value: frame.paddingBottom,
            unit: 'px',
            tokenReference: getPaddingToken(paddingBottomSpecific, verticalPaddingToken, 'vertical')
          });
        }
        if (frame.paddingLeft) {
          spacing.push({
            type: 'padding',
            value: frame.paddingLeft,
            unit: 'px',
            tokenReference: getPaddingToken(paddingLeftSpecific, horizontalPaddingToken, 'horizontal')
          });
        }
      }

      // Item spacing (for auto-layout)
      if ('itemSpacing' in frame && typeof frame.itemSpacing === 'number' && frame.itemSpacing) {
        const gapToken = this.getSpacingTokenReference(node, 'itemSpacing') || 
                        this.getSpacingTokenReference(node, 'gap') ||
                        this.getSpacingTokenReference(node, 'spacing');
        spacing.push({
          type: 'gap',
          value: frame.itemSpacing,
          unit: 'px',
          tokenReference: gapToken
        });
      }
      
      // Counter-axis spacing (for wrapped auto-layout)
      if ('counterAxisSpacing' in frame && typeof frame.counterAxisSpacing === 'number' && frame.counterAxisSpacing) {
        const counterSpacingToken = this.getSpacingTokenReference(node, 'counterAxisSpacing');
        spacing.push({
          type: 'gap',
          value: frame.counterAxisSpacing as number,
          unit: 'px',
          tokenReference: counterSpacingToken
        });
      }
      
      // Border radius - use dedicated method
      if ('cornerRadius' in frame) {
        const radiusToken = this.getBorderRadiusTokenReference(node);
        
        // Handle uniform radius
        if (typeof frame.cornerRadius === 'number' && frame.cornerRadius > 0) {
        spacing.push({
          type: 'borderRadius',
          value: frame.cornerRadius,
          unit: 'px',
          tokenReference: radiusToken
        });
        }
        // Handle mixed/per-corner radius
        else if (frame.cornerRadius === figma.mixed) {
          // Get individual corner radii if available
          if ('topLeftRadius' in frame && typeof frame.topLeftRadius === 'number' && frame.topLeftRadius > 0) {
            spacing.push({
              type: 'borderRadius' ,
              value: frame.topLeftRadius,
              unit: 'px',
              tokenReference: this.getSpacingTokenReference(node, 'borderRadiusTopLeft') || radiusToken
            });
          }
          if ('topRightRadius' in frame && typeof frame.topRightRadius === 'number' && frame.topRightRadius > 0) {
            spacing.push({
              type: 'borderRadius' ,
              value: frame.topRightRadius,
              unit: 'px',
              tokenReference: this.getSpacingTokenReference(node, 'borderRadiusTopRight') || radiusToken
            });
          }
          if ('bottomRightRadius' in frame && typeof frame.bottomRightRadius === 'number' && frame.bottomRightRadius > 0) {
            spacing.push({
              type: 'borderRadius' ,
              value: frame.bottomRightRadius,
              unit: 'px',
              tokenReference: this.getSpacingTokenReference(node, 'borderRadiusBottomRight') || radiusToken
            });
          }
          if ('bottomLeftRadius' in frame && typeof frame.bottomLeftRadius === 'number' && frame.bottomLeftRadius > 0) {
            spacing.push({
              type: 'borderRadius' ,
              value: frame.bottomLeftRadius,
              unit: 'px',
              tokenReference: this.getSpacingTokenReference(node, 'borderRadiusBottomLeft') || radiusToken
            });
          }
        }
      }
      
      // Border/stroke width
      if ('strokeWeight' in frame && typeof frame.strokeWeight === 'number' && frame.strokeWeight > 0) {
        const borderWidthToken = this.getBorderWidthTokenReference(node);
        spacing.push({
          type: 'borderWidth' ,
          value: frame.strokeWeight,
          unit: 'px',
          tokenReference: borderWidthToken
        });
      }
    }
    // Handle other nodes that might have border radius (rectangles, etc.)
    else if ('cornerRadius' in node) {
      const radiusToken = this.getBorderRadiusTokenReference(node);
      const rectNode = node as RectangleNode;
      
      if (typeof rectNode.cornerRadius === 'number' && rectNode.cornerRadius > 0) {
        spacing.push({
          type: 'borderRadius' ,
          value: rectNode.cornerRadius,
          unit: 'px',
          tokenReference: radiusToken
        });
      }
    }

    return spacing;
  }

  /**
   * Extract effect properties (shadows, blurs)
   */
  extractEffects(node: SceneNode): EffectProperty[] {
    const effects: EffectProperty[] = [];

    if ('effects' in node && Array.isArray(node.effects)) {
      for (let i = 0; i < node.effects.length; i++) {
        const effect = node.effects[i];
        if (effect.visible) {
          // Get token reference for this effect
          const tokenRef = this.getEffectTokenReference(node, i);
          
          switch (effect.type) {
            case 'DROP_SHADOW':
              effects.push({
                type: 'drop-shadow',
                visible: effect.visible,
                radius: effect.radius,
                color: effect.color
                  ? {
                      r: effect.color.r,
                      g: effect.color.g,
                      b: effect.color.b,
                      a: effect.color.a
                    }
                  : undefined,
                offset: {
                  x: effect.offset?.x ?? 0,
                  y: effect.offset?.y ?? 0
                },
                spread: effect.spread,
                tokenReference: tokenRef
              });
              break;

            case 'INNER_SHADOW':
              effects.push({
                type: 'inner-shadow',
                visible: effect.visible,
                radius: effect.radius,
                color: effect.color
                  ? {
                      r: effect.color.r,
                      g: effect.color.g,
                      b: effect.color.b,
                      a: effect.color.a
                    }
                  : undefined,
                offset: {
                  x: effect.offset?.x ?? 0,
                  y: effect.offset?.y ?? 0
                },
                spread: effect.spread,
                tokenReference: tokenRef
              });
              break;

            case 'LAYER_BLUR':
              effects.push({
                type: 'layer-blur',
                visible: effect.visible,
                radius: effect.radius,
                tokenReference: tokenRef
              });
              break;

            case 'BACKGROUND_BLUR':
              effects.push({
                type: 'background-blur',
                visible: effect.visible,
                radius: effect.radius,
                tokenReference: tokenRef
              });
              break;
          }
        }
      }
    }

    return effects;
  }

  /**
   * Convert RGBA color to hex and rgba string
   */
  rgbaToColor(color: RGB, opacity: number): { hex: string; rgba: string } {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = opacity;

    const hex = `#${[r, g, b]
      .map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')}`;

    const rgba = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;

    return { hex, rgba };
  }

  /**
   * Parse font weight from font style name
   */
  parseFontWeight(style: string): number {
    const weightMap: Record<string, number> = {
      thin: 100,
      extralight: 200,
      light: 300,
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900
    };

    const lowerStyle = style.toLowerCase();
    for (const [key, value] of Object.entries(weightMap)) {
      if (lowerStyle.includes(key)) {
        return value;
      }
    }

    // Try to extract number from style
    const match = style.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    return 400; // Default
  }

  /**
   * Get component usage statistics
   */
  getComponentUsageStats(componentId: string): ComponentUsageStats {
    const instances: InstanceNode[] = [];
    const pages = new Set<string>();

    for (const page of figma.root.children) {
      if (page.type === 'PAGE') {
        const pageInstances = page.findAll(
          node =>
            node.type === 'INSTANCE' &&
            node.mainComponent?.id === componentId
        ) as InstanceNode[];

        if (pageInstances.length > 0) {
          instances.push(...pageInstances);
          pages.add(page.name);
        }
      }
    }

    return {
      instances: instances.length,
      pages: Array.from(pages)
    };
  }
}

