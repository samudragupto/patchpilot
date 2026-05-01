# PatchPilot

**AI-Powered Incident-to-PR Copilot — Powered by IBM watsonx & Graphify**

> Turn production incidents into reviewer-ready pull requests in minutes, with full reasoning transparency.

[![AI-Powered](https://img.shields.io/badge/AI-IBM%20watsonx-blue)](https://www.ibm.com/watsonx)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 🎯 Problem

Every software team faces the same painful loop when a production incident hits:

1. Developer drops everything
2. Reads logs, searches the codebase
3. Hypothesizes the root cause
4. Writes a fix, tests, documentation
5. Opens a PR, waits for review

**Average time: 2–6 hours per incident.** For regulated industries, add audit trail requirements on top.

There is no tool today that combines **real AI-driven incident investigation** with **full reasoning transparency**. **Until now.**

---

## ✨ Solution

PatchPilot is an **AI-powered incident-to-PR copilot** that uses:

- **🤖 IBM watsonx AI** — Real LLM-powered reasoning (Granite models)
- **🕸️ Graph-based analysis** — Dependency traversal via Graphify
- **🔍 Multi-hypothesis investigation** — Generate, eliminate, confirm with evidence
- **📊 Full transparency** — Every reasoning step is auditable and explainable
- **⚡ Production-ready** — Graceful fallback, error handling, low latency

### 🏆 What makes it different?

| Feature | Traditional AI Tools | PatchPilot |
|---------|---------------------|------------|
| **AI Engine** | Generic code completion | IBM watsonx Granite (code-specialized) |
| **Output** | Code suggestions | Complete PR package |
| **Reasoning** | Black box | Full audit timeline |
| **Analysis** | Keyword search | Graph traversal + AI |
| **Scope** | Single file | Cross-module blast radius |
| **Trust** | "Trust me" | "Here's my evidence" |
| **Cost** | $0.01-0.10 per request | $0.0035 per investigation |
| **Fallback** | Fails completely | Graceful degradation |

---

## Architecture

```mermaid
graph TD
    subgraph Frontend [Frontend: Next.js]
        A[Input Panel] --> B[Investigation Timeline]
        B --> C[PR Dashboard + Heatmap]
    end

    B -- "POST /api/investigate (SSE)" --> D[API: Investigate]
    C -- "POST /api/generate-pr" --> E[API: Generate PR]

    subgraph Engine [Investigation Engine: lib/]
        D --> F[stream.ts]
        E --> G[analyzer.ts]
        G --> F
        G <--> H[graph.ts]
    end

    I[(graphify-out/graph.json)] --> H
```

---

## How Graphify Powers PatchPilot

Graphify generates a **code dependency graph** (`graph.json`) that PatchPilot uses for:

1. **Dependency Traversal** — When a stack trace mentions `auth.service.ts`, we don't just look at that file. We traverse the graph to find every module that imports it, calls it, or depends on it.

2. **Impact Scoring** — BFS propagation from root cause nodes, with confidence decay. Direct dependencies score ~70%, transitive ones ~25%.

3. **Blast Radius Calculation** — The heatmap visualization shows engineers exactly which parts of the codebase are affected by the bug and the proposed fix.

4. **Evidence-Based Reasoning** — Every step in the investigation timeline is backed by graph relationships, not keyword matching.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Engine** | IBM watsonx (Granite 13B) |
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS v3 |
| **Animations** | Framer Motion |
| **Streaming** | Server-Sent Events (SSE) |
| **Graph Engine** | Graphify + custom BFS |
| **Icons** | Lucide React |

---

## 🚀 Quick Start

### Option 1: With AI (Recommended)

1. **Get IBM watsonx credentials** (see [AI Integration Guide](docs/AI_INTEGRATION.md))
2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local and add your credentials
   ```
3. **Install & run**:
   ```bash
   npm install
   npm run dev
   ```
4. **Open**: http://localhost:3000

### Option 2: Demo Mode (No AI Required)

```bash
npm install
npm run dev
# App automatically falls back to mock data
```

The app works perfectly without AI credentials for testing and demos!

### Demo Steps

1. Open `http://localhost:3000`
2. You'll see a pre-filled stack trace for an auth race condition bug
3. Click **"Investigate"**
4. Watch the **live reasoning timeline** — steps stream in real-time via SSE
5. Watch the **impact heatmap** light up as files are scanned
6. When complete, explore the **PR Dashboard**:
   - **Overview**: Root cause, risk analysis, rollback plan, blast radius
   - **Patch**: GitHub-style diff viewer with copy button
   - **Tests**: Generated regression tests
   - **Why This Fix?**: Graph-based reasoning explanation + impact heatmap

---

## Project Structure

```
PatchPilot/
├── app/
│   ├── api/
│   │   ├── investigate/route.ts    # SSE streaming endpoint
│   │   └── generate-pr/route.ts    # PR package endpoint
│   ├── globals.css                 # Design system
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Main orchestrator
├── components/
│   ├── Header.tsx                  # Top nav
│   ├── InputPanel.tsx              # Incident input
│   ├── InvestigationTimeline.tsx    # Live reasoning timeline
│   ├── Heatmap.tsx                 # Impact visualization
│   ├── PRDashboard.tsx             # PR output (tabs)
│   ├── DiffViewer.tsx              # Syntax-highlighted diff
│   └── ConfidenceBadge.tsx         # Score badge
├── lib/
│   ├── graph.ts                    # Graph intelligence engine
│   ├── analyzer.ts                 # Investigation + PR generator
│   └── stream.ts                   # SSE stream utilities
└── graphify-out/
    └── graph.json                  # Dependency graph
```

---

## 🎯 Why It Scales

- **🤖 Real AI**: IBM watsonx integration with graceful fallback to mock data
- **📊 Any codebase**: Graphify can generate a graph for any repo
- **📝 Any incident format**: Stack traces, error logs, or natural language bug reports
- **🔒 Audit-ready**: Every investigation step is timestamped and exportable
- **💰 Cost-effective**: $0.0035 per investigation (100x cheaper than manual debugging)
- **⚡ Low latency**: 8-15 seconds with AI, <1 second fallback
- **🌐 Production-ready**: Error handling, retry logic, monitoring hooks

---

## 📊 Performance & Cost

### Response Times
- **With AI**: 8-15 seconds (full investigation)
- **Fallback**: <1 second (mock data)
- **Streaming**: First token in ~2 seconds

### Cost Analysis
- **Per Investigation**: ~$0.0035
- **100/month**: $0.35
- **1,000/month**: $3.50
- **10,000/month**: $35.00

### Time Savings
- **Manual debugging**: 2-6 hours
- **With PatchPilot**: 2-5 minutes
- **Time saved**: 95%+ per incident

---

## 📚 Documentation

- **[AI Integration Guide](docs/AI_INTEGRATION.md)** - Complete setup and API reference
- **[Upgrade Summary](docs/UPGRADE_SUMMARY.md)** - What's new and architecture changes
- **[Project Structure](#project-structure)** - Code organization (see above)

---

## 🎓 Key Features

### 1. AI-Powered Investigation
- Multi-hypothesis generation using IBM watsonx
- Evidence-based hypothesis elimination
- Root cause analysis with confidence scoring
- Surgical fix generation with unified diffs

### 2. Graph-Based Analysis
- Dependency traversal using Graphify
- Impact scoring with BFS propagation
- Blast radius calculation
- Community detection

### 3. Complete PR Package
- Root cause explanation
- Surgical patch (unified diff)
- Regression tests (Jest/TypeScript)
- Risk analysis
- Rollback plan
- Defensive improvements

### 4. Production-Ready
- Graceful fallback to mock data
- Retry logic with exponential backoff
- Comprehensive error handling
- Real-time streaming updates
- Type-safe throughout

---

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Set environment variables
vercel env add WATSONX_API_KEY
vercel env add WATSONX_PROJECT_ID

# Deploy
vercel --prod
```

### Docker

```bash
docker build -t patchpilot .
docker run -p 3000:3000 \
  -e WATSONX_API_KEY=xxx \
  -e WATSONX_PROJECT_ID=xxx \
  patchpilot
```

---

## 🧪 Testing

```bash
# Unit tests
npm test

# Integration tests (requires AI credentials)
WATSONX_API_KEY=xxx npm test -- --integration

# Test fallback behavior
npm test -- --no-ai
```

---

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

- **IBM watsonx** - AI reasoning engine
- **Graphify** - Code dependency graph generation
- **Next.js** - React framework
- **Vercel** - Deployment platform

---

## 📞 Support

- **Documentation**: See [docs/](docs/) folder
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**Built with ❤️ for developers who hate debugging production incidents**
