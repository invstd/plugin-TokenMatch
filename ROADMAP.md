# TokenMatch Plugin Roadmap

This document outlines planned features for future updates to the TokenMatch Figma plugin. Each feature has a detailed implementation reference document in the `/roadmap` directory.

## Overview

TokenMatch currently excels at finding components that use specific design tokens (Match mode). The planned features expand this with a parallel Lint mode for validating token correctness, broader token source support, and reporting capabilities for design system governance.

---

## Implementation Phases

| Phase | Focus | Features |
|-------|-------|----------|
| **1 — Polish** | Finish & verify existing foundation | 09 (Exclude Token Paths), 08 (Pre-scan Components) |
| **2 — Remove Barriers** | Enable usage without a repository | 06 (JSON/Folder Upload), 11a (Lint: untokenized layers) |
| **3 — Platform Expansion** | Broaden token sources & complete linting | 07 (Multi-Provider), 11b (Lint: value mismatch), 10 (Figma Variables) |
| **4 — Analysis** | Reverse analysis & discovery | 02 (Unused Token Finder) |
| **5 — Reporting** | Export & external integrations | 04 (JSON/CSV Export), 03 (Token Statistics), 05 (Airtable) |

---

## Planned Features

### ~~1. Missing Token Detector~~ — Superseded

> Replaced by item 11 (Token Linting Mode). The "Find untokenized layers" lint check covers this functionality within a broader lint mode. Canvas to-do list generation is planned as a future enhancement to the lint mode. See [01-missing-token-detector.md](./roadmap/01-missing-token-detector.md) for the original spec.

---

### 2. Unused Token Finder — Phase 4

**Goal:** Identify tokens from the repository that aren't referenced by any components, distinguishing between truly orphaned tokens and those consumed by other tokens in semantic relationships.

**Key Capabilities:**
- Compare all repository tokens against component token references
- Categorize: orphaned, semantic-only, deprecated candidates
- Alias/reference chain analysis

**Implementation Reference:** [02-unused-token-finder.md](./roadmap/02-unused-token-finder.md)

---

### 3. Token Statistics Dashboard — Phase 5

**Goal:** Provide analytics on token usage patterns across the design system.

**Key Capabilities:**
- Most/least used tokens ranking
- Component token coverage metrics
- Distribution by type, page, and concentration

**Implementation Reference:** [03-token-statistics.md](./roadmap/03-token-statistics.md)

---

### 4. JSON/CSV Export — Phase 5

**Goal:** Generate downloadable files documenting token-component relationships for external use.

**Key Capabilities:**
- Structured JSON and flattened CSV export
- Customizable schemas with metadata (confidence, property types)
- Foundation for Airtable integration (05)

**Implementation Reference:** [04-json-csv-export.md](./roadmap/04-json-csv-export.md)

---

### 5. Airtable Integration — Phase 5

**Goal:** Push token-component data to Airtable for collaborative governance workflows.

**Key Capabilities:**
- Guided "Paste to Airtable" setup
- Create/update/sync records
- Custom field mappings

**Depends on:** 04 (JSON/CSV Export) for shared export patterns.

**Implementation Reference:** [05-airtable-integration.md](./roadmap/05-airtable-integration.md)

---

### 6. JSON/Folder Upload — Phase 2

**Goal:** Allow direct token file upload without requiring a repository connection.

**Key Capabilities:**
- File picker, drag-and-drop, or paste JSON directly
- Folder upload with recursive scanning
- Auto-detection of token formats (Style Dictionary, Tokens Studio, W3C DTCG)
- Session persistence in plugin storage

**User Value:** Removes the biggest adoption barrier — teams can use TokenMatch without any repository setup.

**Implementation Reference:** [06-json-folder-upload.md](./roadmap/06-json-folder-upload.md)

---

### 7. Multiple Repository Providers — Phase 3

**Goal:** Extend connectivity beyond GitHub to GitLab, BitBucket, and custom Git URLs.

**Key Capabilities:**
- Provider abstraction layer with normalized API
- GitHub, GitLab (Cloud + Self-Managed), BitBucket (Cloud + Server), custom URLs
- Multiple auth methods: OAuth, PAT, App Passwords

**Dependency note:** Must complete before lint value mismatch check (11b) so it builds against a stable provider interface.

**Implementation Reference:** [07-multiple-repository-providers.md](./roadmap/07-multiple-repository-providers.md)

---

### 8. Pre-scan Components — Phase 1

**Goal:** Settings-driven component pre-scanning for faster subsequent matching.

**Key Capabilities:**
- "Scan All Pages" button in settings with progress indicator
- Persistent cache with smart invalidation
- "Last scanned" indicator and optional re-scan before matching

**Note:** The optimized component service with persistent caching already exists. Primary remaining work is the settings UX.

**Implementation Reference:** [08-prescan-components.md](./roadmap/08-prescan-components.md)

---

### 9. Exclude Token Paths — Phase 1

**Goal:** Filter out primitive/base tokens via configurable glob patterns.

**Key Capabilities:**
- Glob-style exclusion patterns
- Quick presets (Primitives, Internal, Deprecated)
- Real-time pattern testing and transparent excluded count

**Note:** Core exclusion service is already implemented (`services/exclusion-service.ts`). Verify remaining UI integration and close if complete.

**Implementation Reference:** [09-exclude-token-paths.md](./roadmap/09-exclude-token-paths.md)

---

### 10. Figma Variables Support — Phase 3

**Goal:** Use Figma's native Variables as an alternative token source with zero external setup.

**Key Capabilities:**
- Token source selector: Variables (local) vs. Design Tokens (repository)
- Read all Variable collections, types, and modes
- Resolve variable aliases and scan component bindings

**Implementation Reference:** [10-figma-variables-support.md](./roadmap/10-figma-variables-support.md)

---

### 11. Token Linting Mode — Phase 2/3

**Goal:** Add a dedicated Lint mode parallel to Match, accessible via a toggle tab bar. Validates token correctness rather than finding token usage.

**Key Capabilities:**
- **Phase 2 (11a):** Mode toggle UI + "Find untokenized layers" check — no repo dependency
- **Phase 3 (11b):** "Find token value mismatches" check — requires provider abstraction (07)
- Results grouped by page/component with expandable detail
- Navigate to offending layer + recommendation per issue

**Depends on:** 07 (Multi-Provider) for value mismatch check only. Untokenized layers check is independent.

**Prior art:** Adapted from FigmaCWC's token validation pipeline (untokenized-detector, value-mismatch-detector).

**Implementation Reference:** [11-token-linting-mode.md](./roadmap/11-token-linting-mode.md)

---

## Feature Dependencies

```
Phase 1: Polish
  09 Exclude Token Paths ──── verify if already complete
  08 Pre-scan Components ──── settings UX on existing cache
        │
Phase 2: Remove Barriers
  06 JSON/Folder Upload ───── no repo needed
  11a Lint: Untokenized ───── no repo needed, mode toggle UI
        │
Phase 3: Platform Expansion
  07 Multi-Provider ─────┬─── provider abstraction
  11b Lint: Value Mismatch│── builds on 07
  10 Figma Variables ─────┘── alternative native source
        │
Phase 4: Analysis
  02 Unused Token Finder ──── reverse analysis
        │
Phase 5: Reporting
  04 JSON/CSV Export ─────┬── export foundation
  03 Token Statistics ────┤── analytics layer
  05 Airtable Integration ┘── builds on 04
```

**Key dependency chains:**
- `07 → 11b`: Provider abstraction must be stable before lint value mismatch check
- `04 → 05`: Airtable integration builds on export patterns from JSON/CSV export
- `01 → 11`: Missing Token Detector superseded by Lint Mode's untokenized layers check

---

## Technical Considerations

### Shared Infrastructure Needs

1. **Provider Abstraction (Phase 3)**
   - Normalize token fetching across GitHub, GitLab, BitBucket, custom URLs
   - Consumed by Match mode, Lint mode (value mismatch), and future analysis features

2. **Token Usage Index**
   - Reverse index: token path → components using it
   - Enables unused token detection (02) and statistics (03)

3. **Export Service Layer**
   - Abstract data transformation for multiple output formats
   - Shared between JSON/CSV export (04) and Airtable integration (05)

4. **Mode Toggle Architecture (Phase 2)**
   - Match and Lint as parallel modes with independent state
   - Shared component scanning and caching layer underneath

### Performance Considerations

- Lint mode reuses the same component cache as Match mode — no duplicate scans
- Statistics calculations should use existing scan cache
- Export operations should be non-blocking with progress indication
- Airtable sync should batch API calls to respect rate limits

---

## Version Planning

| Version | Phase | Features | Focus |
|---------|-------|----------|-------|
| v1.2 | 1 | 09, 08 | Polish: exclusions (verify), pre-scan UX |
| v1.3 | 2 | 06, 11a | Remove barriers: JSON upload, lint mode + untokenized check |
| v1.4 | 3 | 07, 11b, 10 | Platform expansion: multi-provider, lint value mismatch, Figma Variables |
| v1.5 | 4 | 02 | Analysis: unused token finder |
| v1.6 | 5 | 04, 03, 05 | Reporting: export, statistics, Airtable |

---

## Contributing

Each feature document includes:
- Detailed specifications with phase tag and dependencies
- Implementation approach
- File modifications required
- UI/UX considerations
- Testing strategies

Review the individual implementation references before starting development on any feature.
