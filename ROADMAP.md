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

## Feature Dependencies

```
                    ┌─────────────────────┐
                    │  Token Statistics   │
                    │    Dashboard (3)    │
                    └─────────┬───────────┘
                              │ depends on
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│Missing Token  │   │ Unused Token    │   │  JSON/CSV       │
│ Detector (1)  │   │  Finder (2)     │   │  Export (4)     │
└───────────────┘   └─────────────────┘   └────────┬────────┘
                                                   │
                                                   │ extends
                                                   ▼
                                          ┌─────────────────┐
                                          │   Airtable      │
                                          │ Integration (5) │
                                          └─────────────────┘
```

**Recommended Implementation Order:**
1. **Missing Token Detector** - Extends existing scanning, high user value
2. **Unused Token Finder** - Complements Missing Token Detector
3. **Token Statistics Dashboard** - Leverages data from features 1 & 2
4. **JSON/CSV Export** - Foundation for external integrations
5. **Airtable Integration** - Builds on export infrastructure

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
| v2.0 | Features 1, 2 | Token coverage analysis |
| v2.1 | Feature 3 | Analytics & insights |
| v3.0 | Features 4, 5 | Export & integrations |

---

## Contributing

Each feature document includes:
- Detailed specifications
- Implementation approach
- File modifications required
- UI/UX considerations
- Testing strategies

Review the individual implementation references before starting development on any feature.
