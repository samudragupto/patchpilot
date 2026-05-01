# Graph Report - PatchPilot  (2026-05-02)

## Corpus Check
- 71 files · ~346,772 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 774 nodes · 1214 edges · 34 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `CacheManager` - 47 edges
2. `FixGenerationPhase` - 34 edges
3. `PipelineTracer` - 30 edges
4. `ValidationPhase` - 30 edges
5. `MetricsCollector` - 28 edges
6. `PRAssemblyPhase` - 28 edges
7. `PipelineLogger` - 27 edges
8. `InputAnalysisPhase` - 25 edges
9. `AIReasoningPhase` - 23 edges
10. `GraphTraversalPhase` - 23 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `checkGitAvailable()`  [INFERRED]
  app\api\clone-repo\route.ts → lib\github\repo-manager.ts
- `POST()` --calls--> `generatePRPackage()`  [INFERRED]
  app\api\generate-pr\route.ts → lib\analyzer.ts
- `POST()` --calls--> `cleanupRepository()`  [INFERRED]
  app\api\generate-pr\route.ts → lib\github\repo-manager.ts
- `POST()` --calls--> `parseGitHubUrl()`  [INFERRED]
  app\api\clone-repo\route.ts → lib\github\repo-manager.ts
- `POST()` --calls--> `cloneRepository()`  [INFERRED]
  app\api\clone-repo\route.ts → lib\github\repo-manager.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (1): CacheManager

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (11): createCacheManager(), createDevCacheManager(), createCacheKey(), createConfiguredOrchestrator(), PipelineOrchestrator, handleStreamingRequest(), handleSynchronousRequest(), initializePipeline() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (1): FixGenerationPhase

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (9): POST(), assignCommunities(), discoverCodeFiles(), generateGraphFromRepo(), inferRelation(), markAffectedNodes(), sanitizeId(), shouldConnect() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (5): calculateProgress(), exportContext(), getCompletedPhases(), isPhaseCompleted(), PipelineContextManager

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (1): ValidationPhase

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (6): createDevelopmentObservability(), createMinimalObservability(), createObservability(), createProductionObservability(), getDefaultObservability(), ObservabilityManager

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (1): PipelineTracer

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (1): PRAssemblyPhase

### Community 9 - "Community 9"
Cohesion: 0.1
Nodes (1): MetricsCollector

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (6): areAllPhasesRegistered(), createExecutionPlan(), getMissingPhases(), getPhaseRegistry(), PhaseRegistry, registerPhases()

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (1): PipelineLogger

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (16): createFailureResult(), createPhaseConfig(), createSkippedResult(), createSuccessResult(), createTimeoutPromise(), createValidationError(), delay(), execute() (+8 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (1): InputAnalysisPhase

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (3): ExecutionManager, formatDuration(), getExecutionSummary()

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (1): AIReasoningPhase

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (10): buildDefensivePrompt(), buildEliminationPrompt(), buildHypothesisPrompt(), buildRootCausePrompt(), buildTestGenerationPrompt(), parseAIResponse(), validateEliminations(), validateHypotheses() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.11
Nodes (4): FallbackChainError, FallbackError, FallbackManager, withFallback()

### Community 18 - "Community 18"
Cohesion: 0.1
Nodes (4): createResilience(), executeResilient(), ResilienceManager, Resilient()

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (15): getReasoningEngine(), POST(), buildExecutionFlow(), buildPRPackageFromAI(), buildReasoningChain(), extractFilesFromInput(), generateInvestigationSteps(), generateMockInvestigationSteps() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.19
Nodes (3): CircuitBreaker, CircuitBreakerError, withCircuitBreaker()

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (5): createTimeout(), raceWithTimeout(), TimeoutError, TimeoutManager, withTimeout()

### Community 22 - "Community 22"
Cohesion: 0.2
Nodes (12): POST(), POST(), checkGitAvailable(), cleanupRepository(), cloneRepository(), getRepoStats(), listRepoFiles(), parseGitHubUrl() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (1): ValidationGate

### Community 24 - "Community 24"
Cohesion: 0.27
Nodes (11): addSortIndicators(), enableUI(), getNthColumn(), getTable(), getTableBody(), getTableHeader(), loadColumns(), loadData() (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.23
Nodes (2): RetryManager, withRetry()

### Community 26 - "Community 26"
Cohesion: 0.26
Nodes (7): getPhaseConfig(), getPhaseConfigKey(), loadConfig(), loadConfigFromEnv(), loadConfigFromFile(), mergeConfigs(), parseBooleanEnv()

### Community 27 - "Community 27"
Cohesion: 0.35
Nodes (8): a(), B(), D(), g(), i(), k(), Q(), y()

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (1): WatsonxClient

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (2): delay(), wait()

### Community 30 - "Community 30"
Cohesion: 0.6
Nodes (4): DELETE(), formatExecutionStatus(), GET(), getExecutionManager()

### Community 31 - "Community 31"
Cohesion: 0.7
Nodes (4): goToNext(), goToPrevious(), makeCurrent(), toggleClass()

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (2): handleClone(), handleKeyPress()

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): createMockPipelineContext(), createMockPipelineInput()

## Knowledge Gaps
- **Thin community `Community 0`** (47 nodes): `CacheManager`, `.calculateAverageSize()`, `.calculateHitRate()`, `.calculatePhaseStatistics()`, `.cleanupExpiredEntries()`, `.clear()`, `.close()`, `.computeHash()`, `.constructor()`, `.createEntry()`, `.createInitialPhaseStatistics()`, `.createInitialStatistics()`, `.delete()`, `.emitEvent()`, `.estimateSize()`, `.evictEntry()`, `.extendTTL()`, `.findFIFOKey()`, `.findLFUKey()`, `.findLRUKey()`, `.generateKey()`, `.generateKeyFromContext()`, `.get()`, `.getBackendInfo()`, `.getCacheSize()`, `.getEntryCount()`, `.getHitRate()`, `.getPhaseFromKey()`, `.getStatistics()`, `.has()`, `.hashObject()`, `.incrementPhaseHits()`, `.incrementPhaseMisses()`, `.isExpired()`, `.off()`, `.on()`, `.recordExpiration()`, `.recordHit()`, `.recordMiss()`, `.removeFromTrackingStructures()`, `.resetStatistics()`, `.set()`, `.startCleanupInterval()`, `.updateAccessMetadata()`, `.updateTrackingStructures()`, `.verifyIntegrity()`, `.warm()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 2`** (35 nodes): `fix-generation.ts`, `createFixGenerationPhase()`, `FixGenerationPhase`, `.assessRiskLevel()`, `.buildFixPrompt()`, `.buildTestPrompt()`, `.calculateChecksum()`, `.calculateConfidence()`, `.calculateOverallConfidence()`, `.calculateSimilarity()`, `.calculateTotalLinesChanged()`, `.countLinesChanged()`, `.createRollbackInfo()`, `.detectFileType()`, `.detectTestFramework()`, `.determineChangeType()`, `.estimateFixTime()`, `.executePhase()`, `.extractDependencies()`, `.extractExplanation()`, `.extractFixedContent()`, `.extractInput()`, `.findRelatedFiles()`, `.formatErrorInfo()`, `.generateFixAlternatives()`, `.generateOverallExplanation()`, `.generateTestPath()`, `.generateTestUpdates()`, `.generateUnifiedDiff()`, `.getResourceUsage()`, `.handleError()`, `.readFilesWithContext()`, `.selectBestFixes()`, `.validate()`, `.validateOutput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 5`** (31 nodes): `validation.ts`, `createValidationPhase()`, `ValidationPhase`, `.analyzeBreakingChanges()`, `.analyzeCodeQuality()`, `.analyzeLintIssues()`, `.analyzePerformance()`, `.calculateLintScore()`, `.calculateOverallQualityScore()`, `.calculateQualityMetrics()`, `.calculateSecurityScore()`, `.checkTestCoverage()`, `.checkTypes()`, `.detectBreakingChanges()`, `.detectLanguage()`, `.detectPerformanceIssues()`, `.detectSecurityIssues()`, `.determineValidationStatus()`, `.executePhase()`, `.extractInput()`, `.findOptimizationOpportunities()`, `.generateDetailedReport()`, `.generateSummary()`, `.parseSyntax()`, `.runSecurityScan()`, `.runStaticAnalysis()`, `.runTypeChecking()`, `.validate()`, `.validateSyntax()`, `.validateTests()`, `.validateTestSyntax()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (30 nodes): `tracer.js`, `PipelineTracer`, `.addSpanAttribute()`, `.addSpanAttributes()`, `.addSpanEvent()`, `.addSpanLink()`, `.clear()`, `.clearTrace()`, `.constructor()`, `.createTraceContext()`, `.endSpan()`, `.exportAllTraces()`, `.exportTrace()`, `.extractTraceContext()`, `.findTraceIdForSpan()`, `.generateId()`, `.generateSpanId()`, `.generateTraceId()`, `.getActiveSpans()`, `.getAllTraces()`, `.getSpan()`, `.getTrace()`, `.getTraceIdForSpan()`, `.injectTraceContext()`, `.spanKindToOTLP()`, `.spanToOTLP()`, `.startSpan()`, `.storeSpan()`, `.updateSpan()`, `.valueToOTLP()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (29 nodes): `pr-assembly.ts`, `createPRAssemblyPhase()`, `PRAssemblyPhase`, `.calculateConfidence()`, `.createFileChanges()`, `.createTestFiles()`, `.executePhase()`, `.extractInput()`, `.formatCategory()`, `.formatErrorType()`, `.generateBranchName()`, `.generateBreakingChangesSection()`, `.generateChangesSummary()`, `.generateChecklist()`, `.generateDetailedChanges()`, `.generateLabels()`, `.generatePRDescription()`, `.generatePRTitle()`, `.generateQualityMetrics()`, `.generateRollbackInstructions()`, `.generateSummary()`, `.generateTestingInstructions()`, `.generateTestsSection()`, `.generateValidationSection()`, `.getResourceUsage()`, `.handleError()`, `.suggestReviewers()`, `.truncate()`, `.validate()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (28 nodes): `metrics.js`, `MetricsCollector`, `.buildPhaseMetrics()`, `.buildResourceUsage()`, `.calculateCostMetrics()`, `.calculatePerformanceMetrics()`, `.calculateQualityMetrics()`, `.calculateStats()`, `.constructor()`, `.exportPrometheus()`, `.generateKey()`, `.getCustomMetricStats()`, `.getMetrics()`, `.getPhaseMetrics()`, `.percentile()`, `.record()`, `.recordAICall()`, `.recordCacheHit()`, `.recordCacheMiss()`, `.recordCustomMetric()`, `.recordError()`, `.recordPhase()`, `.recordPhaseCacheHit()`, `.recordPhaseEnd()`, `.recordPhaseResourceUsage()`, `.recordPhaseRetry()`, `.recordPhaseStart()`, `.reset()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (27 nodes): `logger.js`, `PipelineLogger`, `.aiCall()`, `.cacheOperation()`, `.clearContext()`, `.clearLogBuffer()`, `.constructor()`, `.debug()`, `.error()`, `.exportLogs()`, `.extractErrorDetails()`, `.filterByLevel()`, `.filterByPhase()`, `.formatCompact()`, `.formatPretty()`, `.getLogBuffer()`, `.info()`, `.log()`, `.output()`, `.outputToConsole()`, `.phaseCheckpoint()`, `.phaseEnd()`, `.phaseStart()`, `.setContext()`, `.updateFromPipelineContext()`, `.validation()`, `.warn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (26 nodes): `input-analysis.ts`, `createInputAnalysisPhase()`, `InputAnalysisPhase`, `.analyzeRepository()`, `.calculateClassificationConfidence()`, `.classifyIssue()`, `.detectFramework()`, `.detectLanguage()`, `.detectRepositoryLanguage()`, `.determineComplexity()`, `.determineIssueType()`, `.determineSeverity()`, `.executePhase()`, `.extractErrorContext()`, `.extractInput()`, `.extractTags()`, `.findRelatedFiles()`, `.generateClassificationReasoning()`, `.getAllFiles()`, `.getDirectorySize()`, `.getResourceUsage()`, `.identifyRelevantFiles()`, `.parseStackFrame()`, `.parseStackTrace()`, `.validate()`, `.validateOutput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (24 nodes): `ai-reasoning.ts`, `AIReasoningPhase`, `.analyzeRootCause()`, `.buildAIContext()`, `.buildHypothesisPrompt()`, `.buildReasoningChain()`, `.calculateOverallConfidence()`, `.categorizeError()`, `.estimateComplexity()`, `.estimateSideEffects()`, `.executePhase()`, `.extractInput()`, `.generateFallbackHypotheses()`, `.generateFixStrategies()`, `.generateHypotheses()`, `.generateReasoningExplanation()`, `.getResourceUsage()`, `.handleError()`, `.identifyFilesToExamine()`, `.parseHypothesesFromResponse()`, `.rankHypotheses()`, `.validate()`, `.validateOutput()`, `createAIReasoningPhase()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (17 nodes): `createValidationGate()`, `createValidationRule()`, `validateTransition()`, `ValidationGate`, `.addRule()`, `.clearFailedRules()`, `.constructor()`, `.disableRule()`, `.enableRule()`, `.getAllRules()`, `.getApplicableRules()`, `.getFailedRules()`, `.getRule()`, `.initializeDefaultRules()`, `.removeRule()`, `.validate()`, `validation-gate.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (13 nodes): `retry-manager.ts`, `createRetryManager()`, `RetryManager`, `.calculateBackoff()`, `.constructor()`, `.createRetryError()`, `.executeWithRetry()`, `.executeWithRetryResult()`, `.getStatistics()`, `.resetStatistics()`, `.shouldRetry()`, `.sleep()`, `withRetry()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (8 nodes): `getWatsonxClient()`, `WatsonxClient`, `.constructor()`, `.generate()`, `.generateBatch()`, `.generateStream()`, `.healthCheck()`, `watsonx-client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (8 nodes): `helpers.ts`, `assertPhaseFailure()`, `assertPhaseSuccess()`, `createMockFileContent()`, `delay()`, `randomString()`, `validateRequiredFields()`, `wait()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (3 nodes): `handleClone()`, `handleKeyPress()`, `RepoInput.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (3 nodes): `mocks.ts`, `createMockPipelineContext()`, `createMockPipelineInput()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PipelineOrchestrator` connect `Community 1` to `Community 18`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `createObservability()` connect `Community 6` to `Community 18`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._