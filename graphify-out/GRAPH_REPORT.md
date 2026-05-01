# Graph Report - PatchPilot  (2026-05-02)

## Corpus Check
- 19 files · ~9,390 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 41 nodes · 39 edges · 3 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]

## God Nodes (most connected - your core abstractions)
1. `generatePRPackage()` - 9 edges
2. `generateInvestigationSteps()` - 8 edges
3. `getNeighbors()` - 4 edges
4. `rankFilesByImpact()` - 4 edges
5. `POST()` - 3 edges
6. `extractFilesFromInput()` - 3 edges
7. `buildReasoningChain()` - 3 edges
8. `loadGraph()` - 3 edges
9. `findNodeByFile()` - 3 edges
10. `POST()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `generatePRPackage()`  [INFERRED]
  app\api\generate-pr\route.ts → lib\analyzer.ts
- `POST()` --calls--> `generateInvestigationSteps()`  [INFERRED]
  app\api\investigate\route.ts → lib\analyzer.ts
- `generatePRPackage()` --calls--> `loadGraph()`  [INFERRED]
  lib\analyzer.ts → lib\graph.ts
- `generatePRPackage()` --calls--> `findNodeByFile()`  [INFERRED]
  lib\analyzer.ts → lib\graph.ts
- `generatePRPackage()` --calls--> `rankFilesByImpact()`  [INFERRED]
  lib\analyzer.ts → lib\graph.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.43
Nodes (5): POST(), buildExecutionFlow(), buildReasoningChain(), extractFilesFromInput(), generatePRPackage()

### Community 1 - "Community 1"
Cohesion: 0.6
Nodes (5): generateInvestigationSteps(), findNodeByFile(), getNeighbors(), loadGraph(), rankFilesByImpact()

### Community 2 - "Community 2"
Cohesion: 0.4
Nodes (2): POST(), createInvestigationStream()

## Knowledge Gaps
- **Thin community `Community 2`** (5 nodes): `route.ts`, `POST()`, `createInvestigationStream()`, `encodeSSE()`, `stream.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `generateInvestigationSteps()` connect `Community 1` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `generatePRPackage()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `generatePRPackage()` (e.g. with `POST()` and `loadGraph()`) actually correct?**
  _`generatePRPackage()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `generateInvestigationSteps()` (e.g. with `POST()` and `loadGraph()`) actually correct?**
  _`generateInvestigationSteps()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `getNeighbors()` (e.g. with `generateInvestigationSteps()` and `generatePRPackage()`) actually correct?**
  _`getNeighbors()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `rankFilesByImpact()` (e.g. with `generateInvestigationSteps()` and `generatePRPackage()`) actually correct?**
  _`rankFilesByImpact()` has 2 INFERRED edges - model-reasoned connections that need verification._