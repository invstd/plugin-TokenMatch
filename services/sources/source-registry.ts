/**
 * Token Source Registry
 *
 * Factory for getting the appropriate TokenSource implementation
 * based on source type.
 */

import { TokenSource, TokenSourceType } from './types';
import { GitHubSource } from './github-source';
import { GitLabSource } from './gitlab-source';
import { BitBucketSource } from './bitbucket-source';
import { UrlSource } from './url-source';
import { NpmSource } from './npm-source';
import { JsonSource } from './json-source';

const sources: Record<TokenSourceType, TokenSource> = {
  github: new GitHubSource(),
  gitlab: new GitLabSource(),
  bitbucket: new BitBucketSource(),
  url: new UrlSource(),
  npm: new NpmSource(),
  json: new JsonSource(),
};

/**
 * Get the TokenSource implementation for the given type.
 * Throws if the source type is not yet implemented.
 */
export function getSource(type: TokenSourceType): TokenSource {
  const source = sources[type];
  if (!source) {
    throw new Error(`Token source "${type}" is not yet supported`);
  }
  return source;
}

/**
 * Register a new token source implementation.
 * Used to add sources without modifying this file.
 */
export function registerSource(source: TokenSource): void {
  sources[source.type] = source;
}
