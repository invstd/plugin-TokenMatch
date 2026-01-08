import { render, Button, Textbox, Dropdown, IconButton, Text, Stack, Container, Inline } from '@create-figma-plugin/ui';
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { on, emit } from '@create-figma-plugin/utilities';
import '!./output.css';

function Plugin() {
  const [currentView, setCurrentView] = useState<'main' | 'settings'>('main');
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [filePath, setFilePath] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [savedBranch, setSavedBranch] = useState<string | null>(null); // Store config branch separately
  const [branches, setBranches] = useState<string[]>([]);
  const [fetchedTokens, setFetchedTokens] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<any | null>(null);
  const [tokenSearch, setTokenSearch] = useState('');
  const [scanOption, setScanOption] = useState<'all' | 'current' | 'selection'>('all');
  const [isConfigured, setIsConfigured] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [perFileCounts, setPerFileCounts] = useState<Array<{ file: string; count: number }>>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ file: string; message: string }>>([]);
  const [fileCount, setFileCount] = useState(0);
  const [sampleFiles, setSampleFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Refs to access current values in callbacks (fixes closure issues)
  const repoUrlRef = useRef(repoUrl);
  const tokenRef = useRef(token);
  const filePathRef = useRef(filePath);
  const selectedBranchRef = useRef(selectedBranch);
  const savedBranchRef = useRef(savedBranch);

  // Keep refs in sync with state
  useEffect(() => { repoUrlRef.current = repoUrl; }, [repoUrl]);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { selectedBranchRef.current = selectedBranch; }, [selectedBranch]);
  useEffect(() => { savedBranchRef.current = savedBranch; }, [savedBranch]);

  useEffect(() => {
    // Load any saved config (fields stay empty until user acts)
    emit('load-config');
  }, []);

  useEffect(() => {
    on('config-loaded', (config: any) => {
      if (config) {
        // Populate fields from stored config (but do NOT auto-fetch anything)
        setRepoUrl(config.repoUrl || '');
        setToken(config.token || '');
        setFilePath(config.filePath || '');

        if (config.branch) {
          setSavedBranch(config.branch);
          setSelectedBranch(config.branch);
        }

        // Update configured status only
        updateConfigStatus(config);
      }
    });

    on('connection-progress', (msg: any) => {
      setLoadingMessage(msg.message || '');
    });

    on('connection-result', (msg: any) => {
      if (msg.success) {
        const newBranches = msg.branches || [];
        setBranches(newBranches);
        
        if (msg.fileCount !== undefined) {
          setFileCount(msg.fileCount);
          setSampleFiles(msg.sampleFiles || []);
          setSettingsError(null);
        }
        // Do NOT set tokenCount here (tokens come from fetch-tokens)
        setTokenCount(0);

        // Auto-select a branch and fetch tokens for it (prefer saved or first)
        // Use refs to get current values (fixes closure issue)
        const currentSelectedBranch = selectedBranchRef.current;
        const currentSavedBranch = savedBranchRef.current;
        
        const branchToUse =
          (currentSelectedBranch && newBranches.includes(currentSelectedBranch)) ? currentSelectedBranch :
          (currentSavedBranch && newBranches.includes(currentSavedBranch)) ? currentSavedBranch :
          newBranches[0] || null;

        if (branchToUse) {
          setSelectedBranch(branchToUse);
          setLoading(true);
          // Use refs to get current repoUrl, token, filePath values
          emit('fetch-tokens', { 
            repoUrl: repoUrlRef.current, 
            token: tokenRef.current, 
            branch: branchToUse, 
            filePath: filePathRef.current || '' 
          });
        } else {
          setLoading(false);
        }
        setLoadingMessage('');
      } else {
        setSettingsError(msg.error || 'Connection failed');
        setLoading(false);
        setLoadingMessage('');
      }
    });

    on('tokens-progress', (msg: any) => {
      setLoadingMessage(msg.message || '');
    });

    on('tokens-result', (msg: any) => {
      if (msg.success) {
        const total = msg.metadata?.totalTokens ?? (msg.tokens?.length || 0);
        const filesProcessed = msg.metadata?.filesProcessed ?? fileCount;
        const totalFiles = msg.metadata?.totalFiles ?? filesProcessed;
        const perFileCounts = msg.metadata?.perFileCounts;
        const errors = msg.metadata?.errors;

        setFetchedTokens(msg.tokens || []);
        setTokenCount(total);
        setFileCount(totalFiles);
        setPerFileCounts(perFileCounts || []);
        setParseErrors(errors || []);
        setError(null);
        setLoading(false);
        setLoadingMessage('');

        // If still zero tokens, surface a helpful hint
        if (total === 0) {
          if (perFileCounts && perFileCounts.length > 0) {
            const counts = perFileCounts
              .map((p: any) => `${p.file}: ${p.count}`)
              .slice(0, 5)
              .join(', ');
            setSettingsError(`Parsed 0 tokens. File counts: ${counts}${perFileCounts.length > 5 ? '...' : ''}`);
          } else {
            setSettingsError('Parsed 0 tokens. No per-file counts returned (parser may have failed).');
          }
        }
      } else {
        // Show token fetch errors in settings if in settings view, otherwise main
        if (currentView === 'settings') {
          setSettingsError(msg.error || 'Failed to fetch tokens');
        } else {
          setError(msg.error || 'Failed to fetch tokens');
        }
        setLoading(false);
        setLoadingMessage('');
      }
    });

    on('config-saved', () => {
      // Config saved in background - just ensure state is updated
      setIsConfigured(true);
      setSettingsError(null);
      setLoading(false);
      // Reload config to ensure state is in sync
      emit('load-config');
    });
  }, []);

  const updateConfigStatus = (config: any) => {
    const hasAll = config?.repoUrl && config?.token && config?.branch;
    setIsConfigured(!!hasAll);
  };

  // Make sure updateConfigStatus is available when useEffect runs
  useEffect(() => {
    if (repoUrl && token && selectedBranch) {
      setIsConfigured(true);
    } else {
      setIsConfigured(false);
    }
  }, [repoUrl, token, selectedBranch]);

  const handleTestConnection = () => {
    if (!repoUrl || !token) {
      setSettingsError('Please fill in Repository URL and Token');
      return;
    }
    setLoading(true);
    setError(null);
    setSettingsError(null);
    emit('test-connection', { repoUrl, token, filePath: filePath || '' });
  };

  const handleSaveConfig = () => {
    if (!repoUrl || !token || !selectedBranch) {
      setSettingsError('Please fill in Repository URL, Token, and test the connection first');
      return;
    }
    // Immediately switch to main view for better UX
    setCurrentView('main');
    setIsConfigured(true);
    setSettingsError(null);
    // Show success toast
    setToast('Configuration saved');
    setTimeout(() => setToast(null), 3000);
    // Save config in background
    emit('save-config', { repoUrl, token, branch: selectedBranch, filePath: filePath || '' });
  };

  const handleBranchSelect = (branch: string) => {
    setSelectedBranch(branch);
    setSelectedToken(null);
    setTokenSearch('');
    setFetchedTokens([]);
    setTokenCount(0);
    
    if (repoUrl && token) {
      setLoading(true);
      emit('fetch-tokens', { repoUrl, token, branch, filePath: filePath || '' });
    }
  };

  const handleTokenSelect = (token: any) => {
    setSelectedToken(token);
    setTokenSearch(''); // Clear search to hide dropdown
  };
  
  const handleClearToken = () => {
    setSelectedToken(null);
    setTokenSearch('');
  };

  const handleScan = () => {
    if (!selectedToken) return;
    emit('scan-components-for-token', {
      token: selectedToken,
      scanAll: scanOption === 'all',
      scanSelection: scanOption === 'selection'
    });
  };

  // Safe string conversion for display
  const safeString = (val: any): string => {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join('.');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Get full token path as a dot-separated string
  const getTokenFullPath = (t: any): string => {
    if (Array.isArray(t.path)) return t.path.join('.');
    if (typeof t.path === 'string') return t.path;
    return safeString(t.name);
  };

  // Fuzzy search: all search terms must be found in the path (in order or not)
  const matchesSearch = (fullPath: string, search: string): boolean => {
    const pathLower = fullPath.toLowerCase();
    const searchLower = search.toLowerCase().trim();
    
    // If search contains dots, treat as path segment search
    if (searchLower.includes('.')) {
      return pathLower.includes(searchLower);
    }
    
    // Otherwise, split by spaces for multi-term fuzzy search
    const searchTerms = searchLower.split(/\s+/).filter(Boolean);
    return searchTerms.every(term => pathLower.includes(term));
  };

  const filteredTokens = tokenSearch.length > 0 
    ? fetchedTokens.filter(t => {
        const fullPath = getTokenFullPath(t);
        const value = safeString(t.value);
        return matchesSearch(fullPath, tokenSearch) || matchesSearch(value, tokenSearch);
      })
    : [];

  // Handle Enter key to select first matching token
  const handleTokenSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTokens.length > 0) {
      handleTokenSelect(filteredTokens[0]);
    }
  };

  const canScan = isConfigured && selectedToken && fetchedTokens.length > 0;

  return (
    <Container space="medium">
      <Stack space="medium">
        {currentView === 'main' ? (
          <Stack space="medium">
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', fontWeight: '600' }}>Token source</Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Text>
                  {isConfigured ? 'Configured' : 'Not configured'}
                </Text>
                <IconButton onClick={() => setCurrentView('settings')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" stroke-width="1.25"/>
                  <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48572 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" stroke-width="1.25"/>
                </svg>
              </IconButton>
              </div>
            </div>

            <Stack space="small">
              <Text>Branch</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  {branches.length > 0 ? (
                    <Dropdown
                      value={branches.includes(selectedBranch || '') ? selectedBranch : null}
                      options={branches.map(b => ({ 
                        value: b, 
                        text: b === selectedBranch && tokenCount > 0
                          ? `${b} (${tokenCount} token${tokenCount !== 1 ? 's' : ''})`
                          : b
                      }))}
                      placeholder="Select ..."
                      disabled={!isConfigured}
                      onValueChange={handleBranchSelect}
                    />
                  ) : (
                    <Textbox
                      value=""
                      placeholder={isConfigured ? "Scan tokens first" : "Set up repository first"}
                      disabled
                    />
                  )}
                </div>
                {isConfigured && branches.length === 0 && (
                  <Button onClick={handleTestConnection} disabled={loading} style={{ flexShrink: 0 }}>
                    {loading ? 'Scanning...' : 'Scan'}
                  </Button>
                )}
              </div>
              {!isConfigured && (
                <Text style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)' }}>Set up repository first</Text>
              )}
            </Stack>

            <Stack space="small">
              <Text>Find Token</Text>
              <div style={{ position: 'relative' }}>
                <Textbox
                  value={tokenSearch}
                  placeholder={selectedToken ? "Type to change selection..." : "Start typing to search tokens..."}
                  disabled={!isConfigured || !selectedBranch || fetchedTokens.length === 0}
                  onValueInput={setTokenSearch}
                  onKeyDown={handleTokenSearchKeyDown}
                />
                {tokenSearch.length > 0 && (
                  <div style={{ 
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    maxHeight: '200px', 
                    overflowY: 'auto', 
                    border: '1px solid var(--figma-color-border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--figma-color-bg)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    marginTop: '4px'
                  }}>
                {filteredTokens.length > 0 ? (
                  <div>
                    <Text style={{ 
                      fontSize: '10px', 
                      color: 'var(--figma-color-text-secondary)', 
                      padding: '4px 8px',
                      display: 'block',
                      borderBottom: '1px solid var(--figma-color-border)'
                    }}>
                      {filteredTokens.length} match{filteredTokens.length !== 1 ? 'es' : ''} - click or press Enter
                    </Text>
                    {filteredTokens.slice(0, 50).map((t, i) => {
                      const fullPath = getTokenFullPath(t);
                      const valueStr = safeString(t.value);
                      return (
                        <div
                          key={i}
                          onClick={() => handleTokenSelect(t)}
                          style={{ 
                            padding: '6px 8px', 
                            cursor: 'pointer',
                            backgroundColor: i === 0 ? 'var(--figma-color-bg-hover)' : 'transparent',
                            borderBottom: '1px solid var(--figma-color-border)'
                          }}
                        >
                          <Text style={{ fontSize: '11px', fontWeight: i === 0 ? '600' : '400', wordBreak: 'break-all' }}>
                            {fullPath}
                          </Text>
                          {valueStr && (
                            <Text style={{ fontSize: '10px', color: 'var(--figma-color-text-tertiary)', display: 'block' }}>
                              → {valueStr.substring(0, 50)}{valueStr.length > 50 ? '...' : ''}
                            </Text>
                          )}
                        </div>
                      );
                    })}
                    {filteredTokens.length > 50 && (
                      <Text style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)', padding: '4px 8px' }}>
                        ...and {filteredTokens.length - 50} more
                      </Text>
                    )}
                  </div>
                ) : (
                  <Text style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)', padding: '8px' }}>
                    No tokens matching "{tokenSearch}"
                  </Text>
                )}
                  </div>
                )}
              </div>
              {selectedToken && (
                <div style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px', 
                  backgroundColor: 'var(--figma-color-bg-brand)', 
                  borderRadius: '4px',
                  maxWidth: '100%',
                  marginTop: '8px'
                }}>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: '500',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0,
                    color: '#ffffff'
                  }}>
                    ✓ {getTokenFullPath(selectedToken)}
                  </span>
                  <div 
                    onClick={handleClearToken} 
                    style={{ 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      width: '16px',
                      height: '16px',
                      borderRadius: '2px'
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M8 2L2 8M2 2L8 8" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </div>
                </div>
              )}
            </Stack>

            <Stack space="small">
              <Text>Scan components</Text>
              <Dropdown
                value={scanOption}
                options={[
                  { value: 'all', text: 'On all pages (slow)' },
                  { value: 'current', text: 'Current page' },
                  { value: 'selection', text: 'Selection' }
                ]}
                onValueChange={(value) => setScanOption(value as any)}
              />
            </Stack>

            {error && (
              <div style={{ padding: '12px', backgroundColor: 'var(--figma-color-bg-danger)', borderRadius: '6px' }}>
                <Text>{error}</Text>
              </div>
            )}

            <Button onClick={handleScan} disabled={!canScan}>
              {canScan ? 'Scan for Token Usage' : 'Scan (select a token first)'}
            </Button>
          </Stack>
        ) : (
          <Stack space="medium">
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: '13px', fontWeight: '600' }}>GitHub Settings</Text>
              <IconButton onClick={() => setCurrentView('main')}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </IconButton>
            </div>

            {settingsError && (
              <div style={{ padding: '12px', backgroundColor: 'var(--figma-color-bg-danger)', borderRadius: '6px' }}>
                <Text>{settingsError}</Text>
              </div>
            )}

            <Stack space="small">
              <Text>Repository URL</Text>
              <Textbox
                value={repoUrl}
                placeholder="https://github.com/owner/repo"
                onValueInput={setRepoUrl}
              />
            </Stack>

            <Stack space="small">
              <Text>Personal Access Token</Text>
              <Textbox
                value={token}
                placeholder="GitHub token with repo access"
                onValueInput={setToken}
                password
              />
            </Stack>

            <Stack space="small">
              <Text>Directory Path (optional)</Text>
              <Textbox
                value={filePath}
                placeholder="Leave empty for root"
                onValueInput={setFilePath}
              />
            </Stack>

            <Button onClick={handleTestConnection} disabled={loading}>
              {loading ? loadingMessage || 'Testing...' : 'Test Connection & Scan Files'}
            </Button>

            <Stack space="small">
              <Text>Branch</Text>
              <Dropdown
                value={branches.includes(selectedBranch || '') ? selectedBranch : null}
                options={branches.length > 0 ? branches.map(b => ({
                  value: b,
                  text: b === selectedBranch && tokenCount > 0
                    ? `${b} (${tokenCount} token${tokenCount !== 1 ? 's' : ''})`
                    : b
                })) : [{ value: '', text: '' }]}
                placeholder={branches.length > 0 ? "Select branch..." : "Test connection first"}
                disabled={branches.length === 0 || loading}
                onValueChange={(value) => {
                  if (value && value !== '' && value !== selectedBranch) {
                    // Use handleBranchSelect to also re-fetch tokens
                    handleBranchSelect(value);
                  }
                }}
              />
            </Stack>

            {!loading && fileCount > 0 && tokenCount > 0 && (
              <div style={{ 
                padding: '12px', 
                backgroundColor: 'var(--figma-color-bg-success)', 
                borderRadius: '6px',
                border: '1px solid var(--figma-color-border-success)'
              }}>
                <Text style={{ fontSize: '12px', fontWeight: '600', color: 'var(--figma-color-text-success)' }}>
                  ✓ Found {tokenCount} token{tokenCount !== 1 ? 's' : ''} in {fileCount} file{fileCount !== 1 ? 's' : ''}
                </Text>
              </div>
            )}
            
            {!loading && fileCount > 0 && tokenCount === 0 && (
              <div style={{ 
                padding: '12px', 
                backgroundColor: 'var(--figma-color-bg-warning)', 
                borderRadius: '6px'
              }}>
                <Text style={{ fontSize: '12px', fontWeight: '600' }}>
                  ⚠ Found {fileCount} file{fileCount !== 1 ? 's' : ''} but no tokens parsed
                </Text>
                {parseErrors.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {parseErrors.slice(0,3).map((e, i) => (
                      <Text key={i} style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)', display: 'block' }}>
                        {e.file}: {e.message}
                      </Text>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleSaveConfig} disabled={loading || !selectedBranch}>
              Save Configuration
            </Button>
            
            <Button onClick={() => {
              emit('clear-config');
              setRepoUrl('');
              setToken('');
              setFilePath('');
              setSelectedBranch(null);
              setSavedBranch(null);
              setBranches([]);
              setFetchedTokens([]);
              setSelectedToken(null);
              setTokenSearch('');
              setIsConfigured(false);
              setFileCount(0);
              setTokenCount(0);
              setSampleFiles([]);
              setSettingsError(null);
            }} secondary>
              Clear All Data
            </Button>
          </Stack>
        )}
      </Stack>
      
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          right: '16px',
          padding: '10px 16px',
          backgroundColor: 'var(--figma-color-bg-success)',
          color: 'var(--figma-color-text-onsuccess)',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {toast}
        </div>
      )}
    </Container>
  );
}

export default render(Plugin);
