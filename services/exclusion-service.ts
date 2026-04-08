import type {
  ExclusionConfig,
  ExclusionPattern,
  ExclusionPreset,
  ExclusionResult,
  TokenLike
} from '../types/exclusions';

const EXCLUSION_STORAGE_KEY = 'tokensmatch_exclusions';

export const EXCLUSION_PRESETS: ExclusionPreset[] = [
  {
    id: 'primitives',
    name: 'Primitives',
    description: 'Base/primitive tokens not intended for direct use',
    patterns: [
      'primitives.**',
      'primitive.**',
      'core.**',
      'base.**',
      '*.base.**',
      '*.primitives.**'
    ]
  },
  {
    id: 'internal',
    name: 'Internal Tokens',
    description: 'Internal or private tokens',
    patterns: [
      '_**',
      'internal.**',
      'private.**',
      '*.internal.**',
      '*.private.**'
    ]
  },
  {
    id: 'deprecated',
    name: 'Deprecated',
    description: 'Legacy or deprecated tokens',
    patterns: [
      'deprecated.**',
      'legacy.**',
      '*.deprecated.**',
      '*.legacy.**'
    ]
  },
  {
    id: 'scales',
    name: 'Numeric Scales',
    description: 'Raw scale values (50, 100, 200, etc.)',
    patterns: [
      '**.50',
      '**.100',
      '**.200',
      '**.300',
      '**.400',
      '**.500',
      '**.600',
      '**.700',
      '**.800',
      '**.900'
    ]
  }
];

function pathToString(path: string[] | string): string {
  if (Array.isArray(path)) return path.join('.');
  return typeof path === 'string' ? path : '';
}

export class ExclusionService {
  private config: ExclusionConfig;

  constructor() {
    this.config = this.getDefaultConfig();
  }

  async loadConfig(): Promise<ExclusionConfig> {
    try {
      const stored = await figma.clientStorage.getAsync(EXCLUSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ExclusionConfig;
        this.config = {
          ...this.getDefaultConfig(),
          ...parsed,
          scope: { ...this.getDefaultConfig().scope, ...(parsed.scope || {}) }
        };
      }
    } catch (e) {
      console.error('Error loading exclusion config:', e);
    }
    return this.config;
  }

  async saveConfig(config: Partial<ExclusionConfig>): Promise<void> {
    const defaults = this.getDefaultConfig();
    this.config = {
      enabled: config.enabled ?? defaults.enabled,
      patterns: config.patterns ?? this.config.patterns,
      scope: { ...defaults.scope, ...this.config.scope, ...(config.scope || {}) }
    };
    try {
      await figma.clientStorage.setAsync(
        EXCLUSION_STORAGE_KEY,
        JSON.stringify(config)
      );
    } catch (e) {
      console.error('Error saving exclusion config:', e);
    }
  }

  applyExclusions(tokens: TokenLike[]): ExclusionResult {
    if (!this.config.enabled) {
      return {
        included: tokens,
        excluded: [],
        excludedCount: 0,
        excludedByPattern: new Map()
      };
    }

    const enabledPatterns = this.config.patterns.filter((p) => p.enabled);
    const included: TokenLike[] = [];
    const excluded: TokenLike[] = [];
    const excludedByPattern = new Map<string, number>();

    for (const token of tokens) {
      const pathStr = pathToString(token.path);
      const matchingPattern = this.findMatchingPattern(pathStr, enabledPatterns);

      if (matchingPattern) {
        excluded.push(token);
        const count = excludedByPattern.get(matchingPattern.pattern) || 0;
        excludedByPattern.set(matchingPattern.pattern, count + 1);
      } else {
        included.push(token);
      }
    }

    return {
      included,
      excluded,
      excludedCount: excluded.length,
      excludedByPattern
    };
  }

  isExcluded(tokenPath: string | string[]): boolean {
    if (!this.config.enabled) return false;
    const pathStr = pathToString(tokenPath);
    const enabledPatterns = this.config.patterns.filter((p) => p.enabled);
    return this.findMatchingPattern(pathStr, enabledPatterns) !== null;
  }

  testPattern(pattern: string, tokens: TokenLike[]): TokenLike[] {
    const pathStr = (t: TokenLike) => pathToString(t.path);
    return tokens.filter((token) => this.matchesPattern(pathStr(token), pattern));
  }

  async addPattern(pattern: string): Promise<ExclusionPattern> {
    const newPattern: ExclusionPattern = {
      id: this.generateId(),
      pattern: pattern.trim(),
      enabled: true,
      source: 'custom'
    };
    this.config.patterns.push(newPattern);
    await this.saveConfig(this.config);
    return newPattern;
  }

  async removePattern(patternId: string): Promise<void> {
    this.config.patterns = this.config.patterns.filter((p) => p.id !== patternId);
    await this.saveConfig(this.config);
  }

  async togglePreset(presetId: string, enabled: boolean): Promise<void> {
    const preset = EXCLUSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    if (enabled) {
      for (const pattern of preset.patterns) {
        const exists = this.config.patterns.some(
          (p) => p.pattern === pattern && p.presetName === presetId
        );
        if (!exists) {
          this.config.patterns.push({
            id: this.generateId(),
            pattern,
            enabled: true,
            source: 'preset',
            presetName: presetId
          });
        }
      }
    } else {
      this.config.patterns = this.config.patterns.filter(
        (p) => p.presetName !== presetId
      );
    }
    await this.saveConfig(this.config);
  }

  isPresetEnabled(presetId: string): boolean {
    const preset = EXCLUSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;
    return preset.patterns.every((pattern) =>
      this.config.patterns.some(
        (p) =>
          p.pattern === pattern && p.presetName === presetId && p.enabled
      )
    );
  }

  getPresets(): Array<ExclusionPreset & { enabled: boolean }> {
    return EXCLUSION_PRESETS.map((preset) => ({
      ...preset,
      enabled: this.isPresetEnabled(preset.id)
    }));
  }

  getConfig(): ExclusionConfig {
    return this.config;
  }

  private getDefaultConfig(): ExclusionConfig {
    return {
      enabled: false,
      patterns: [],
      scope: {
        tokenList: true,
        matchResults: true,
        statistics: false
      }
    };
  }

  private findMatchingPattern(
    pathStr: string,
    patterns: ExclusionPattern[]
  ): ExclusionPattern | null {
    for (const pattern of patterns) {
      if (this.matchesPattern(pathStr, pattern.pattern)) {
        return pattern;
      }
    }
    return null;
  }

  private matchesPattern(pathStr: string, pattern: string): boolean {
    const re = this.globToRegex(pattern);
    return re.test(pathStr);
  }

  private globToRegex(pattern: string): RegExp {
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^.]*')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
    return new RegExp(`^${regexStr}$`, 'i');
  }

  private generateId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
}
