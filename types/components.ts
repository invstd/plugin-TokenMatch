/**
 * Type definitions for Figma Component Analysis
 */

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ColorProperty {
  type: 'fill' | 'stroke';
  color: RGBAColor;
  hex: string;
  rgba: string;
  opacity: number;
  tokenReference?: string; // Token Studio token reference (e.g., "colors.primary.500")
}

export interface TypographyProperty {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number | string;
  letterSpacing?: number;
  textDecoration?: string;
  textCase?: string;
  tokenReference?: string; // Token Studio token reference
}

export interface SpacingProperty {
  type: 'width' | 'height' | 'padding' | 'gap' | 'borderRadius' | 'borderWidth';
  value: number;
  unit: string;
  tokenReference?: string; // Token Studio token reference
}

export interface EffectProperty {
  type: 'drop-shadow' | 'inner-shadow' | 'layer-blur' | 'background-blur';
  visible: boolean;
  radius: number;
  color?: RGBAColor;
  offset?: {
    x: number;
    y: number;
  };
  spread?: number;
  tokenReference?: string; // Token Studio token reference
}

export interface ComponentProperties {
  id: string;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE';
  pageName: string;
  mainComponentName?: string; // For variants: the parent ComponentSet name (e.g., "KdsButton")
  mainComponentId?: string; // ID of the main component or component set
  colors: ColorProperty[];
  typography: TypographyProperty[];
  spacing: SpacingProperty[];
  effects: EffectProperty[];
  width?: number;
  height?: number;
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID';
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  children?: ComponentProperties[];
}

export interface ComponentScanError {
  componentId: string;
  componentName: string;
  error: string;
}

export interface ScanResult {
  components: ComponentProperties[];
  totalComponents: number;
  totalInstances: number;
  pagesScanned: number;
  errors: ComponentScanError[];
}

export interface ComponentUsageStats {
  instances: number;
  pages: string[];
}

