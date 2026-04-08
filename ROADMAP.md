# TokenMatch Plugin Roadmap

This document outlines planned features for future updates to the TokenMatch Figma plugin. Each feature has a detailed implementation reference document in the `/roadmap` directory.

## Overview

TokenMatch currently excels at finding components that use specific design tokens (Match mode). The planned features expand this with a parallel Lint mode for validating token correctness, broader token source support, and reporting capabilities for design system governance.

---

## Implementation Phases

| Phase | Focus | Features |
|-------|-------|----------|
| **~~1 — Polish~~** | ~~Finish & verify existing foundation~~ | ~~09 (Exclude Token Paths), 08 (Background Indexing)~~ ✅ |
| **~~2 — Token Sources~~** | ~~Unified token source abstraction~~ | ~~06 (JSON Paste), 07 (Multi-Provider + URL + npm)~~ ✅ |
| **3 — Linting & Variables** | Lint mode + native Figma support | 11a/11b (Lint Mode), 10 (Figma Variables) |
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

### ~~6. JSON Paste~~ — Phase 2 ✅

> **Completed.** Reimagined from "JSON/Folder Upload" into a simpler paste-based approach as part of the unified token source abstraction. Users paste JSON directly into a textarea in settings — no file picker or drag-and-drop needed. Supports W3C DTCG, Tokens Studio, and plain JSON formats.
>
> **Implementation Reference:** [06-json-folder-upload.md](./roadmap/06-json-folder-upload.md) (original spec, superseded by implementation)

---

### ~~7. Unified Token Source Abstraction~~ — Phase 2 ✅

> **Completed.** Reimagined from "Multiple Repository Providers" into a comprehensive token source layer supporting 6 source types via a unified `TokenSource` interface:
>
> - **Git providers**: GitHub (refactored), GitLab (Cloud + self-hosted), BitBucket (Cloud + Server)
> - **URL**: fetch tokens from any URL with optional auth headers
> - **npm**: fetch from npm packages via jsdelivr/unpkg CDN with version resolution, directory path, and file pattern filtering
> - **JSON paste**: paste token JSON directly, no network needed
>
> Settings UI uses a SegmentedControl (Git | npm | URL | JSON) with a sub-dropdown for git provider selection. All sources output `ParsedToken[]` via the existing `TokenParser`.
>
> **Key files:** `services/sources/types.ts`, `services/sources/*-source.ts`, `services/sources/source-registry.ts`
>
> **Implementation Reference:** [07-multiple-repository-providers.md](./roadmap/07-multiple-repository-providers.md) (original spec, superseded by implementation)

---

### ~~8. Background Component Indexing~~ — Phase 1 ✅

> **Completed.** Reimagined from a manual "Pre-scan Components" settings UI into invisible infrastructure. The plugin now automatically warms the component cache on startup, tracks document changes via `figma.on('documentchange')` to mark dirty pages, and delta-scans only modified pages on the next match. No user-facing UI — caching is entirely transparent.
>
> **Key implementation details:**
> - Background warm-up chains after `figma.loadAllPagesAsync()` with `tokenType: 'all'`
> - `documentchange` listener tracks dirty page IDs; debounced re-warm after 5s of inactivity
> - User-triggered scans cancel background warm-up via `cancelToken` and take priority
> - Cache key fallback: specific tokenType lookups fall back to `'all'` entries
> - Targeted invalidation replaces the previous clear-everything approach
>
> **Implementation Reference:** [08-prescan-components.md](./roadmap/08-prescan-components.md) (original spec, superseded by implementation)

---

### ~~9. Exclude Token Paths~~ — Phase 1 ✅

> **Completed.** Glob-style exclusion patterns with quick presets (Primitives, Internal, Deprecated), real-time pattern testing, and transparent excluded count. Core exclusion service (`services/exclusion-service.ts`) and UI integration are fully implemented.
>
> **Implementation Reference:** [09-exclude-token-paths.md](./roadmap/09-exclude-token-paths.md)

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
Phase 1: Polish ✅
  09 Exclude Token Paths ──── ✅ complete
  08 Background Indexing ──── ✅ complete (invisible infrastructure)
        │
Phase 2: Token Sources ✅
  06 JSON Paste ──────────── ✅ complete (unified source abstraction)
  07 Multi-Provider + URL + npm ── ✅ complete (6 source types)
        │
Phase 3: Linting & Variables
  11a Lint: Untokenized ───── mode toggle UI, no repo needed
  11b Lint: Value Mismatch ── uses token source abstraction
  10 Figma Variables ──────── alternative native source
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
- `04 → 05`: Airtable integration builds on export patterns from JSON/CSV export
- `01 → 11`: Missing Token Detector superseded by Lint Mode's untokenized layers check

---

## Technical Considerations

### Shared Infrastructure Needs

1. **~~Provider Abstraction~~ (Phase 2)** ✅
   - Unified `TokenSource` interface across GitHub, GitLab, BitBucket, URL, npm, JSON
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
| ~~v1.2~~ | ~~1~~ | ~~09, 08~~ | ~~Polish: exclusions, background indexing~~ ✅ |
| ~~v1.3~~ | ~~2~~ | ~~06, 07~~ | ~~Token sources: JSON paste, multi-provider, URL, npm~~ ✅ |
| v1.4 | 3 | 11a, 11b, 10 | Linting & Variables: lint mode, Figma Variables |
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
