# TokensMatch Plugin Roadmap

This document outlines planned features for future updates to the TokensMatch Figma plugin. Each feature has a detailed implementation reference document in the `/roadmap` directory.

## Overview

TokensMatch currently excels at finding components that use specific design tokens. The planned features expand this capability to provide comprehensive token governance, coverage analysis, and export functionality for design system documentation.

---

## Planned Features

### 1. Missing Token Detector

**Goal:** Find components with layers that have explicit values instead of token references, helping teams identify where design tokens should be applied but aren't.

**Key Capabilities:**
- Scan components for properties without token assignments
- Generate actionable to-do lists pasted directly on the Figma canvas
- "Paste All" option to create checklists next to all component containers across a file
- Filter by property type (colors, spacing, typography, effects)

**User Value:** Helps maintain design token coverage and consistency across a design system.

**Implementation Reference:** [01-missing-token-detector.md](./roadmap/01-missing-token-detector.md)

---

### 2. Unused Token Finder

**Goal:** Identify tokens from the repository that aren't referenced by any components, distinguishing between truly orphaned tokens and those consumed by other tokens in semantic relationships.

**Key Capabilities:**
- Compare all repository tokens against component token references
- Highlight unused tokens with categorization:
  - Orphaned (not used anywhere)
  - Semantic-only (consumed by other tokens, not directly by components)
  - Potentially deprecated candidates
- Support alias/reference chain analysis

**User Value:** Helps teams identify token bloat and clean up unused design decisions.

**Implementation Reference:** [02-unused-token-finder.md](./roadmap/02-unused-token-finder.md)

---

### 3. Token Statistics Dashboard

**Goal:** Provide analytics on token usage patterns across the design system, helping teams understand adoption and identify optimization opportunities.

**Key Capabilities:**
- Most/least used tokens ranking
- Components with highest token coverage
- Token distribution by type (color, spacing, typography, etc.)
- Coverage percentage across the file
- Token usage trends per page

**User Value:** Data-driven insights for design system governance and optimization.

**Implementation Reference:** [03-token-statistics.md](./roadmap/03-token-statistics.md)

---

### 4. JSON/CSV Export

**Goal:** Generate downloadable files documenting the relationships between tokens and components for external documentation, auditing, or integration with other tools.

**Key Capabilities:**
- Export token-to-component relationships as structured JSON
- Export as CSV for spreadsheet analysis
- Customizable export schemas
- Include metadata (confidence scores, property types, component paths)

**User Value:** Enables documentation generation, external tool integration, and offline analysis.

**Implementation Reference:** [04-json-csv-export.md](./roadmap/04-json-csv-export.md)

---

### 5. Airtable Integration

**Goal:** Push token and component relationship data directly to Airtable for collaborative design system documentation and governance workflows.

**Key Capabilities:**
- "Paste to Airtable" flow with guided setup
- Create/update records in existing Airtable bases
- Map token/component data to custom Airtable schemas
- Sync functionality to keep Airtable current with Figma

**User Value:** Enables collaborative design system governance using familiar tools, with data accessible to non-Figma users.

**Implementation Reference:** [05-airtable-integration.md](./roadmap/05-airtable-integration.md)

---

### 6. JSON/Folder Upload

**Goal:** Allow users to upload token files directly via JSON file upload or folder selection instead of requiring a GitHub repository connection.

**Key Capabilities:**
- Single JSON file upload via file picker or drag-and-drop
- Paste JSON content directly into a text area
- Folder upload with recursive scanning of nested directories
- Auto-detection of token formats (Style Dictionary, Tokens Studio, W3C DTCG)
- Token persistence in plugin storage for session continuity

**User Value:** Provides flexibility for teams who don't use GitHub or want to work with local token files without repository setup.

**Implementation Reference:** [06-json-folder-upload.md](./roadmap/06-json-folder-upload.md)

---

### 7. Multiple Repository Providers

**Goal:** Extend repository connectivity beyond GitHub to support BitBucket, GitLab, and custom Git URLs, enabling teams on different platforms to use TokensMatch.

**Key Capabilities:**
- Support for GitHub, GitLab (Cloud and Self-Managed), BitBucket (Cloud and Server)
- Custom Git URL support for self-hosted or alternative Git providers
- Multiple authentication methods: OAuth, Personal Access Tokens, App Passwords
- Repository browsing, branch selection, and file path navigation
- Provider-specific features (workspaces, groups, organizations)

**User Value:** Removes GitHub dependency, allowing teams using any Git platform to connect their token repositories.

**Implementation Reference:** [07-multiple-repository-providers.md](./roadmap/07-multiple-repository-providers.md)

---

### 8. Pre-scan Components

**Goal:** Allow users to pre-scan all pages for components from the settings page, creating a cached index that makes subsequent token matching significantly faster.

**Key Capabilities:**
- "Scan All Pages" button in settings with progress indicator
- Cache scanned component data in plugin storage
- Display "Last scanned: [timestamp]" below Match button when cache exists
- "Re-scan components before matching" checkbox option
- Smart cache invalidation when file structure changes
- Background scanning that doesn't block the UI

**User Value:** Dramatically improves matching speed for large files by eliminating repeated full scans, providing a near-instant matching experience.

**Implementation Reference:** [08-prescan-components.md](./roadmap/08-prescan-components.md)

---

### 9. Exclude Token Paths

**Goal:** Allow users to configure token path patterns to exclude from matching results, enabling them to filter out primitive/base tokens and focus on semantic tokens intended for direct use.

**Key Capabilities:**
- Define glob-style exclusion patterns (e.g., `primitives.**`, `core.*`, `*.base.**`)
- Quick presets for common token architectures (Primitives, Internal, Deprecated)
- Real-time pattern testing with match preview
- Toggle to show/hide excluded tokens in the UI
- Transparent indicator showing excluded token count

**User Value:** Reduces noise by hiding primitive tokens that shouldn't be used directly, helping designers focus on semantic tokens intended for component use.

**Implementation Reference:** [09-exclude-token-paths.md](./roadmap/09-exclude-token-paths.md)

---

### 10. Figma Variables Support

**Goal:** Add support for Figma's native Variables as an alternative reference source, allowing users to match component properties against local Variable collections instead of external design token repositories.

**Key Capabilities:**
- Token source selection in Settings: "Variables (Local file only)" vs "Design Tokens (Repository)"
- Read all Variable collections from the current Figma file
- Support all variable types: Color, Number, String, Boolean
- Handle variable modes (e.g., Light/Dark themes)
- Resolve variable aliases/references
- Scan components for properties bound to Variables
- Search and filter Variables by name/path

**User Value:** Enables teams using Figma's native Variables system to audit and maintain component-variable relationships without requiring external repository setup—works offline with zero configuration.

**Implementation Reference:** [10-figma-variables-support.md](./roadmap/10-figma-variables-support.md)

---

## Feature Dependencies

```
                         ┌─────────────────────┐
                         │  Token Statistics   │
                         │    Dashboard (3)    │
                         └─────────┬───────────┘
                                   │ depends on
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐        ┌─────────────────┐        ┌─────────────────┐
│ Missing Token │        │   Unused Token  │        │     JSON/CSV    │
│ Detector (1)  │        │    Finder (2)   │        │    Export (4)   │
└───────────────┘        └─────────────────┘        └────────┬────────┘
                                                             │
                                                             │ extends
                                                             ▼
                                                    ┌─────────────────┐
                                                    │     Airtable    │
                                                    │ Integration (5) │
                                                    └─────────────────┘

 ┌──────────────────────────────────────────────────────────────────┐
 │                     Token Source Enhancements                    │
 ├─────────────────────────────────────────────────────────────────┤
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐ │
 │  │                    TOKEN SOURCE SELECTOR                    │ │
 │  │        (Settings: Choose reference source type)             │ │
 │  └───────────────────────┬────────────────────────────────────┘ │
 │                          │                                      │
 │         ┌────────────────┴────────────────┐                     │
 │         ▼                                 ▼                     │
 │  ┌──────────────────┐           ┌──────────────────────────┐   │
 │  │ Figma Variables  │           │     Design Tokens        │   │
 │  │ Support (10)     │           │     (Repository)         │   │
 │  │                  │           │                          │   │
 │  │ • Local file     │           │ ┌────────────────────┐   │   │
 │  │ • Zero config    │           │ │ JSON/Folder        │   │   │
 │  │ • Works offline  │           │ │ Upload (6)         │   │   │
 │  └──────────────────┘           │ └────────────────────┘   │   │
 │                                 │                          │   │
 │                                 │ ┌────────────────────┐   │   │
 │                                 │ │ Multiple Repo      │   │   │
 │                                 │ │ Providers (7)      │   │   │
 │                                 │ └────────────────────┘   │   │
 │                                 └──────────────────────────┘   │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────┐
 │                     Performance & Filtering                      │
 ├──────────────────────────────┬───────────────────────────────────┤
 │                              │                                   │
 │  ┌────────────────────┐      │      ┌────────────────────────┐   │
 │  │  Pre-scan          │      │      │  Exclude Token         │   │
 │  │  Components (8)    │      │      │  Paths (9)             │   │
 │  └────────────────────┘      │      └────────────────────────┘   │
 │          │                   │                 │                 │
 │          ▼                   │                 ▼                 │
 │   Faster matching            │         Cleaner results           │
 │   operations                 │         (hide primitives)         │
 │                              │                                   │
 │        Improves core matching experience                         │
 └──────────────────────────────────────────────────────────────────┘
```

**Recommended Implementation Order:**
1. **Exclude Token Paths (9)** - Quick win, improves UX immediately
2. **Pre-scan Components (8)** - Performance foundation, benefits all features
3. **Figma Variables Support (10)** - Zero-config alternative, high demand from Variables users
4. **JSON/Folder Upload (6)** - Low complexity, immediate value for non-GitHub users
5. **Multiple Repository Providers (7)** - Expands user base, pairs with feature 6
6. **Missing Token Detector (1)** - Extends existing scanning, high user value
7. **Unused Token Finder (2)** - Complements Missing Token Detector
8. **Token Statistics Dashboard (3)** - Leverages data from features 1 & 2
9. **JSON/CSV Export (4)** - Foundation for external integrations
10. **Airtable Integration (5)** - Builds on export infrastructure

---

## Technical Considerations

### Shared Infrastructure Needs

All features will benefit from these common enhancements:

1. **Extended Component Scanning**
   - Current scanner already extracts properties with/without token references
   - Need to expose "missing token" data in results

2. **Token Usage Index**
   - Build reverse index: token path → components using it
   - Enables both unused detection and statistics

3. **Export Service Layer**
   - Abstract data transformation for multiple output formats
   - Shared between JSON/CSV export and Airtable integration

4. **UI Framework Extensions**
   - New view types for statistics dashboard
   - Canvas interaction utilities for pasting to-do lists

### Performance Considerations

- Statistics calculations should use existing scan cache
- Export operations should be non-blocking with progress indication
- Airtable sync should batch API calls to respect rate limits

---

## Version Planning

| Version | Features | Focus |
|---------|----------|-------|
| v1.x | Current | Token-to-component matching |
| v1.2 | Features 8, 9 | Performance & filtering (pre-scan, exclusions) |
| v1.3 | Feature 10 | Figma Variables support (alternative token source) |
| v1.4 | Features 6, 7 | Token source flexibility (JSON upload, multi-provider) |
| v1.5 | Features 1, 2 | Token coverage analysis |
| v1.6 | Feature 3 | Analytics & insights |
| v1.7 | Features 4, 5 | Export & integrations |

---

## Contributing

Each feature document includes:
- Detailed specifications
- Implementation approach
- File modifications required
- UI/UX considerations
- Testing strategies

Review the individual implementation references before starting development on any feature.
