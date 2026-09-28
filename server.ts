import express, { Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createProductionPackage,
  numberValue,
  objectValue,
  promptForAssetPlan,
  promptForResearch,
  promptForScript,
  promptForStoryboard,
  promptForVoiceMusic,
  requiredString,
  stringArray,
  validateDialogue,
  validateAssetPlan,
  validateResearch,
  validateScript,
  validateStoryboard,
  validateVoiceMusicPlan,
  type CharacterSpecification,
  type ProductionBriefInput,
  type ProductionPackage,
  type VoiceMusicPlan,
  type VisualAssetSpecification,
} from "./production-content.js";
import {
  generateStructuredOutput,
  generationProviderStatus,
  ProviderGenerationError,
  ProviderUnavailableError,
} from "./generation-provider.js";
import {
  createProductionStagePlan,
  nextProductionOrchestrationStep,
} from "./production-orchestration.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const PROJECT_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

interface AgentProfile {
  name: string;
  label: string;
  department: string;
  mission: string;
  defaultModel: { route: string; backend: string; model: string };
}

const AGENT_PROFILES: Record<string, AgentProfile> = {
  director: {
    name: "director",
    label: "Producer / Showrunner",
    department: "Production",
    mission: "Owns the entire children's education video project, coordinates departments, controls approvals and keeps the production moving.",
    defaultModel: { route: "gpt56_sol_max", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  librarian: {
    name: "librarian",
    label: "Research Agent",
    department: "Education & Research",
    mission: "Researches the educational topic and collects reliable, age-appropriate source material.",
    defaultModel: { route: "gpt56_sol", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  explorer: {
    name: "explorer",
    label: "Curriculum Agent",
    department: "Education & Research",
    mission: "Converts the topic into age-appropriate learning objectives, explanations, examples and lesson structure.",
    defaultModel: { route: "claude_opus", backend: "litellm", model: "anthropic/claude-opus-4-8" },
  },
  critic: {
    name: "critic",
    label: "Fact Checker",
    department: "Quality & Safety",
    mission: "Checks scientific/factual accuracy, misleading claims and unsuitable educational statements.",
    defaultModel: { route: "gpt56_sol_max", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  task_designer: {
    name: "task_designer",
    label: "Story Architect",
    department: "Story & Writing",
    mission: "Converts the learning objective into an original story concept, characters, scenes and narrative structure.",
    defaultModel: { route: "gpt56_sol_max", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  planner: {
    name: "planner",
    label: "Script Director",
    department: "Story & Writing",
    mission: "Builds the detailed script plan, scene order, dialogue, narration and pacing.",
    defaultModel: { route: "claude_opus", backend: "litellm", model: "anthropic/claude-opus-4-8" },
  },
  experimenter: {
    name: "experimenter",
    label: "Animation Director",
    department: "Animation",
    mission: "Plans scene motion, character actions, camera direction and animation requirements.",
    defaultModel: { route: "deepseek_harness", backend: "deepseek-harness", model: "deepseek-v4-pro" },
  },
  evaluator: {
    name: "evaluator",
    label: "Production QC",
    department: "Quality & Safety",
    mission: "Reviews the production result, detects problems and decides whether a scene or project should be revised.",
    defaultModel: { route: "gpt56_sol_max", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  visualizer: {
    name: "visualizer",
    label: "Creative Director",
    department: "Art & Storyboard",
    mission: "Designs storyboard shots, characters, environments, visual style and scene composition.",
    defaultModel: { route: "gpt56_sol", backend: "litellm", model: "openai/gpt-5.6-sol" },
  },
  writer: {
    name: "writer",
    label: "Story Writer",
    department: "Story & Writing",
    mission: "Writes the final child-friendly story narration and character dialogue based on the approved educational plan.",
    defaultModel: { route: "claude_opus", backend: "litellm", model: "anthropic/claude-opus-4-8" },
  },
  podcaster: {
    name: "podcaster",
    label: "Voice & Music Director",
    department: "Audio",
    mission: "Plans narration, character voices, background music, ambience and sound effects for the episode.",
    defaultModel: { route: "claude_opus", backend: "litellm", model: "anthropic/claude-opus-4-8" },
  },
  video_producer: {
    name: "video_producer",
    label: "Editor & Video Producer",
    department: "Post Production",
    mission: "Assembles scenes, voice, music, sound effects, captions, transitions and final video output.",
    defaultModel: { route: "gemini_flash", backend: "litellm", model: "gemini/gemini-3.6-flash" },
  },
  publisher: {
    name: "publisher",
    label: "YouTube & Thumbnail Director",
    department: "Publishing & Growth",
    mission: "Prepares thumbnail concepts, title, description, chapters, SEO metadata, Shorts opportunities and YouTube publishing package.",
    defaultModel: { route: "gpt56_luna", backend: "litellm", model: "openai/gpt-5.6-luna" },
  },
};


const app = express();

app.use(express.json({ limit: "2mb" }));

function getParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || "";
  return val || "";
}

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  next();
});

app.use("/static", express.static(path.join(__dirname, "public/static"), { maxAge: "1h" }));
interface WorkflowStep {
  stage: string;
  nextStage: string;
  agent: string;
  label: string;
  summary: string;
  supportAgents?: Array<{ agent: string; label: string; summary: string }>;
  deliverable?: string;
}

const LEGACY_RESEARCH_WORKFLOW: WorkflowStep[] = [
  { stage: "created", nextStage: "direction_ready", agent: "director", label: "Director", summary: "Refined charter and formalized core falsifiable inquiry." },
  { stage: "direction_ready", nextStage: "literature_ready", agent: "librarian", label: "Librarian", summary: "Indexed and grounded 38 relevant preprints and established empirical benchmarks." },
  { stage: "literature_ready", nextStage: "ideas_ready", agent: "explorer", label: "Explorer", summary: "Formulated divergent, high-leverage research hypotheses with concrete falsifiers." },
  { stage: "ideas_ready", nextStage: "waiting_idea", agent: "critic", label: "Critic", summary: "Audited candidates; constructed human decision packet at idea checkpoint." },
  { stage: "idea_approved", nextStage: "task_ready", agent: "task_designer", label: "Task Designer", summary: "Translated selected idea into an executable measurement task." },
  { stage: "task_ready", nextStage: "plan_ready", agent: "planner", label: "Planner", summary: "Preregistered experiment protocol, seeds, controls, and stop criteria." },
  { stage: "plan_ready", nextStage: "results_approved", agent: "experimenter", label: "Experimenter", summary: "Executed experimental harness, logged runs, and preserved telemetry." },
  { stage: "results_approved", nextStage: "visualization_ready", agent: "visualizer", label: "Visualizer", summary: "Generated declarative charts and data-linked visualizations." },
  { stage: "visualization_ready", nextStage: "paper_ready", agent: "writer", label: "Writer", summary: "Synthesized evidence ledger into publication-ready draft." },
  { stage: "paper_ready", nextStage: "podcast_ready", agent: "podcaster", label: "Podcaster", summary: "Produced research dialogue podcast audio transcript and notes." },
  { stage: "podcast_ready", nextStage: "media_ready", agent: "video_producer", label: "Video Producer", summary: "Rendered source-linked visual slides and video storyboard." },
  { stage: "media_ready", nextStage: "complete", agent: "publisher", label: "Publisher", summary: "Packaged release bundle, validated digests, and finalized artifacts." },
];

const ACTIVE_AGENTS_BY_STAGE: Record<string, string[]> = {
  created: ["director"],
  research_ready: ["librarian"],
  curriculum_ready: ["explorer"],
  fact_check_ready: ["critic"],
  education_review_ready: ["evaluator"],
  story_ready: ["task_designer"],
  script_ready: ["planner", "writer"],
  storyboard_ready: ["visualizer"],
  animation_ready: ["experimenter"],
  audio_ready: ["podcaster"],
  edit_ready: ["video_producer"],
  qc_ready: ["evaluator"],
  thumbnail_ready: ["publisher"],
  release_ready: ["publisher"],
  direction_ready: ["librarian"],
  literature_ready: ["explorer"],
  revising_ideas: ["explorer"],
  ideas_ready: ["critic"],
  waiting_idea: ["critic"],
  idea_approved: ["task_designer"],
  task_ready: ["planner"],
  plan_ready: ["experimenter"],
  experimenting: ["experimenter"],
  results_approved: ["visualizer"],
  visualization_ready: ["writer"],
  paper_ready: ["podcaster"],
  podcast_ready: ["video_producer"],
  media_ready: ["publisher"],
};

interface Handoff {
  agent: string;
  agent_label?: string;
  next_agent?: string;
  next_agent_label?: string;
  summary: string;
  time: string;
  artifacts?: Array<{ path: string; bytes: number }>;
  open_questions?: string[];
  findings?: string[];
}

interface EventItem {
  seq: number;
  type: string;
  time: string;
  data: Record<string, any>;
}

interface ArtifactItem {
  path: string;
  bytes: number;
  content?: string;
  mimeType?: string;
}

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  time: string;
  source?: string;
  model?: string | null;
}

interface ProjectData {
  project_id: string;
  state: {
    stage: string;
    topics: string[];
    human_feedback?: Record<string, string>;
  };
  manifest: Record<string, any>;
  running: boolean;
  updated_at: number;
  pending_decisions: Array<{
    checkpoint: string;
    request: Record<string, any>;
    packet: string;
  }>;
  handoffs: Handoff[];
  events: EventItem[];
  artifacts: Map<string, ArtifactItem>;
  chats: Record<string, ChatMessage[]>;
  eventListeners: Set<Response>;
}

const projects = new Map<string, ProjectData>();

function broadcastEvent(project: ProjectData, eventType: string, data: Record<string, any>): EventItem {
  const event: EventItem = {
    seq: project.events.length + 1,
    type: eventType,
    time: new Date().toISOString(),
    data,
  };
  project.events.push(event);
  project.updated_at = Date.now();

  const ssePayload = `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of project.eventListeners) {
    try {
      client.write(ssePayload);
    } catch {
      project.eventListeners.delete(client);
    }
  }
  return event;
}

function computeAgentRoster(project: ProjectData) {
  const stage = project.state.stage;
  const running = project.running;
  const activeAgents = ACTIVE_AGENTS_BY_STAGE[stage] || [];

  return Object.values(AGENT_PROFILES).map((profile, index) => {
    const ownHandoffs = project.handoffs.filter((h) => h.agent === profile.name);
    const latestHandoff = ownHandoffs.length > 0 ? ownHandoffs[ownHandoffs.length - 1] : null;

    let status = "queued";
    if (stage === "rejected") {
      status = "stopped";
    } else if (running && activeAgents.includes(profile.name)) {
      status = "working";
    } else if (ownHandoffs.length > 0) {
      status = "done";
    } else if (activeAgents.includes(profile.name)) {
      status = "ready";
    }

    let summary = "";
    if (latestHandoff) {
      summary = latestHandoff.summary;
    } else if (status === "working") {
      summary = "Working now. Open the desk for the latest activity.";
    } else if (status === "ready") {
      summary = "Ready to start when the current workflow resumes.";
    } else if (status === "stopped") {
      summary = "The research run stopped before this desk received a handoff.";
    } else {
      summary = `Waiting for upstream context before ${profile.name} can begin.`;
    }

    const artifacts = latestHandoff?.artifacts || [];
    const openQuestions = latestHandoff?.open_questions || [];

    return {
      name: profile.name,
      number: index + 1,
      label: profile.label,
      department: profile.department,
      mission: profile.mission,
      status,
      runs: ownHandoffs.length,
      models: [profile.defaultModel],
      summary,
      last_activity: latestHandoff?.time || null,
      artifacts,
      open_questions: openQuestions,
      latest_handoff: latestHandoff,
    };
  });
}

function createProductionBrief(title: string, objective: string, targetAge: string, storyConcept: string) {
  return createProductionPackage({
    topic: title,
    targetAge,
    educationalObjective: objective,
    durationSeconds: 120,
    tone: "warm and curious",
    style: "2D educational story",
    storyConcept,
  });
}

function seedInitialProjects() {
  // Project 1: Quantum Geometry Bounds (in waiting_idea stage for interactive decision making)
  const p1Artifacts = new Map<string, ArtifactItem>();
  p1Artifacts.set("paper/charter.md", {
    path: "paper/charter.md",
    bytes: 1420,
    mimeType: "text/markdown; charset=utf-8",
    content: `# Research Charter: Quantum Geometry & Phenomenology
**Core Question**: Can high-energy astrophysical neutrino dispersion constraints rule out minimal Planck-scale modified dispersion relations?
**Primary Metric**: Energy scale parameter E_QG bound (GeV) at 95% CL.
**Falsification Rule**: If dispersion spectral lag is consistent with source-intrinsic emission within observational error, reject Lorentz-violation hypothesis.`,
  });
  p1Artifacts.set("artifacts/literature_map.json", {
    path: "artifacts/literature_map.json",
    bytes: 2840,
    mimeType: "application/json; charset=utf-8",
    content: JSON.stringify(
      {
        prior_bounds: [
          { observatory: "IceCube", event: "IC-170922A", bound_gev: "1.2e18" },
          { observatory: "Fermi-LAT", event: "GRB 090510", bound_gev: "9.3e19" },
        ],
        unresolved_controversies: [
          "Cross-correlation between blazar flare timing and sub-PeV neutrino delays",
          "Source-intrinsic acceleration models versus vacuum quantum dispersion",
        ],
      },
      null,
      2
    ),
  });
  p1Artifacts.set("artifacts/candidate_hypotheses.json", {
    path: "artifacts/candidate_hypotheses.json",
    bytes: 1980,
    mimeType: "application/json; charset=utf-8",
    content: JSON.stringify(
      [
        {
          id: "hyp-1",
          title: "Multi-Messenger Spectral Lag Deconvolution",
          hypothesis: "Separating source-intrinsic synchrotron self-Compton lags from propagation delays using multi-epoch Fermi-LAT gamma rays.",
          score: 0.92,
        },
        {
          id: "hyp-2",
          title: "Stochastic Quantum Metric Fluctuations",
          hypothesis: "Testing non-systematic Gaussian broadening of astrophysical wavepackets instead of deterministic linear dispersion.",
          score: 0.86,
        },
        {
          id: "hyp-3",
          title: "Energy-Dependent Time-of-Flight Clustering",
          hypothesis: "Cluster analysis of PeV neutrino events against gamma-ray bursts to filter false coincidences.",
          score: 0.79,
        },
      ],
      null,
      2
    ),
  });
  p1Artifacts.set("decisions/idea.packet.md", {
    path: "decisions/idea.packet.md",
    bytes: 2150,
    mimeType: "text/markdown; charset=utf-8",
    content: `## Idea Checkpoint: Frontier Selection
The Explorer agent proposed three falsifiable research avenues. The Critic audited novelty, measurement validity, and confounders.
### Candidates:
1. **Multi-Messenger Spectral Lag Deconvolution (Score: 0.92)**:
   - *Strengths*: Direct causal decoupling of blazar jet emission from vacuum quantum geometry effects.
   - *Vulnerabilities*: High sensitivity to sparse gamma-ray photon counts in the 50-300 GeV window.
2. **Stochastic Quantum Metric Fluctuations (Score: 0.86)**:
   - *Strengths*: Circumvents fine-tuned linear dispersion models that conflict with stringent synchrotron limits.
3. **Energy-Dependent Time-of-Flight Clustering (Score: 0.79)**:
   - *Strengths*: High signal-to-noise on background rejection; relies on open IceCube Alert events.`,
  });

  const p1: ProjectData = {
    project_id: "quantum-geometry-bounds",
    state: {
      stage: "waiting_idea",
      topics: ["Quantum geometry", "Astrophysical neutrinos", "Lorentz invariance testing"],
      human_feedback: {},
    },
    manifest: {
      version: "0.2.0",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      demo: true,
    },
    running: false,
    updated_at: Date.now() - 60000,
    pending_decisions: [
      {
        checkpoint: "idea",
        request: {
          checkpoint: "idea",
          prompt: "Review candidate hypotheses from the Explorer and Critic. Select the most decisive hypothesis or provide steering feedback.",
          payload: {
            candidates: [
              {
                id: "hyp-1",
                title: "Multi-Messenger Spectral Lag Deconvolution",
                hypothesis: "Separating source-intrinsic synchrotron self-Compton lags from propagation delays using multi-epoch Fermi-LAT gamma rays.",
                score: 0.92,
                criticism: "Requires high photon statistics in the 50-300 GeV range; verify source redshift certainty.",
              },
              {
                id: "hyp-2",
                title: "Stochastic Quantum Metric Fluctuations",
                hypothesis: "Testing non-systematic Gaussian broadening of astrophysical wavepackets instead of deterministic linear dispersion.",
                score: 0.86,
                criticism: "Broader dispersion profile requires larger dataset across multi-year observational baselines.",
              },
              {
                id: "hyp-3",
                title: "Energy-Dependent Time-of-Flight Clustering",
                hypothesis: "Cluster analysis of PeV neutrino events against gamma-ray bursts to filter false coincidences.",
                score: 0.79,
                criticism: "Susceptible to selection bias in blazar catalogue completeness.",
              },
            ],
          },
        },
        packet: `# Idea Checkpoint: Frontier Selection\nPlease review the candidates and approve one to proceed to Task Design.`,
      },
    ],
    handoffs: [
      {
        agent: "director",
        summary: "Charter established: Focus on multi-messenger test of Planck-scale dispersion with IceCube and Fermi data.",
        time: new Date(Date.now() - 3500000).toISOString(),
        artifacts: [{ path: "paper/charter.md", bytes: 1420 }],
        open_questions: ["Which blazar flaring episodes offer highest signal-to-noise for arrival time correlation?"],
      },
      {
        agent: "librarian",
        summary: "Evidence graph assembled: mapped 42 primary publications across IceCube, Fermi-LAT, and MAGIC.",
        time: new Date(Date.now() - 3200000).toISOString(),
        artifacts: [{ path: "artifacts/literature_map.json", bytes: 2840 }],
        open_questions: ["Are source-intrinsic spectral lags consistently positive across all energy bands?"],
      },
      {
        agent: "explorer",
        summary: "Formulated 3 causal divergence hypotheses targeting model-independent dispersion bounds.",
        time: new Date(Date.now() - 2800000).toISOString(),
        artifacts: [{ path: "artifacts/candidate_hypotheses.json", bytes: 1980 }],
        open_questions: ["Can systematic jet deceleration simulate negative energy-time lags?"],
      },
      {
        agent: "critic",
        summary: "Audited hypotheses: hyp-1 has strongest empirical leverage; flagged intrinsic acceleration confounder.",
        time: new Date(Date.now() - 2400000).toISOString(),
        artifacts: [{ path: "decisions/idea.packet.md", bytes: 2150 }],
        open_questions: ["Requires human steering on candidate selection before proceeding to Task Design."],
      },
    ],
    events: [
      { seq: 1, type: "agent.lifecycle", time: new Date(Date.now() - 3500000).toISOString(), data: { agent: "director", phase: "start" } },
      { seq: 2, type: "agent.lifecycle", time: new Date(Date.now() - 3400000).toISOString(), data: { agent: "director", phase: "done" } },
      { seq: 3, type: "agent.lifecycle", time: new Date(Date.now() - 3200000).toISOString(), data: { agent: "librarian", phase: "start" } },
      { seq: 4, type: "agent.lifecycle", time: new Date(Date.now() - 3100000).toISOString(), data: { agent: "librarian", phase: "done" } },
      { seq: 5, type: "agent.lifecycle", time: new Date(Date.now() - 2800000).toISOString(), data: { agent: "explorer", phase: "start" } },
      { seq: 6, type: "agent.lifecycle", time: new Date(Date.now() - 2700000).toISOString(), data: { agent: "explorer", phase: "done" } },
      { seq: 7, type: "agent.lifecycle", time: new Date(Date.now() - 2400000).toISOString(), data: { agent: "critic", phase: "start" } },
      { seq: 8, type: "checkpoint.pending", time: new Date(Date.now() - 2300000).toISOString(), data: { checkpoint: "idea" } },
    ],
    artifacts: p1Artifacts,
    chats: {},
    eventListeners: new Set(),
  };

  // Project 2: Causal Transformer Circuits (fully completed research run)
  const p2Artifacts = new Map<string, ArtifactItem>();
  p2Artifacts.set("paper/main.md", {
    path: "paper/main.md",
    bytes: 12450,
    mimeType: "text/markdown; charset=utf-8",
    content: `# Circuit Scrubbing and Induction Head Resilience in Deep LLMs
**Abstract**: We systematically quantify the resilience of induction head circuits under layer-wise causal interventions across 7B to 70B parameter models. Using automated activation patching and path scrubbing, we isolate a minimal subgraph of 4 attention heads responsible for 91.4% of in-context copy capability.`,
  });
  p2Artifacts.set("visualizations/circuit_graph.svg", {
    path: "visualizations/circuit_graph.svg",
    bytes: 4890,
    mimeType: "image/svg+xml; charset=utf-8",
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><rect width="100%" height="100%" fill="#0f1c19"/><text x="30" y="40" fill="#71e2ad" font-family="sans-serif" font-size="16" font-weight="bold">Transformer Induction Circuit Graph</text><circle cx="100" cy="150" r="30" fill="#294039" stroke="#71e2ad" stroke-width="2"/><text x="100" y="155" fill="#eef7f2" font-size="12" text-anchor="middle">L4.H2</text><circle cx="280" cy="100" r="30" fill="#294039" stroke="#71e2ad" stroke-width="2"/><text x="280" y="105" fill="#eef7f2" font-size="12" text-anchor="middle">L8.H7</text><circle cx="280" cy="200" r="30" fill="#294039" stroke="#71e2ad" stroke-width="2"/><text x="280" y="205" fill="#eef7f2" font-size="12" text-anchor="middle">L9.H1</text><circle cx="480" cy="150" r="30" fill="#294039" stroke="#71e2ad" stroke-width="2"/><text x="480" y="155" fill="#eef7f2" font-size="12" text-anchor="middle">L12.H4</text><line x1="130" y1="140" x2="250" y2="110" stroke="#71e2ad" stroke-width="2"/><line x1="130" y1="160" x2="250" y2="190" stroke="#71e2ad" stroke-width="2"/><line x1="310" y1="110" x2="450" y2="140" stroke="#71e2ad" stroke-width="2"/><line x1="310" y1="190" x2="450" y2="160" stroke="#71e2ad" stroke-width="2"/></svg>`,
  });
  p2Artifacts.set("reports/reproducibility.json", {
    path: "reports/reproducibility.json",
    bytes: 1820,
    mimeType: "application/json; charset=utf-8",
    content: JSON.stringify(
      {
        seed: 42,
        eval_score: 0.914,
        statistical_significance: "p < 1e-6",
        hardware_profile: "NVIDIA H100 80GB SXM5",
        container_digest: "sha256:4f8e219ba38f0d8291c784918e9d0284e",
      },
      null,
      2
    ),
  });

  const p2Handoffs: Handoff[] = Object.keys(AGENT_PROFILES).map((agentKey, idx) => ({
    agent: agentKey,
    summary: `Completed stage ${idx + 1}/13 with verified evidence and clean handoff.`,
    time: new Date(Date.now() - (13 - idx) * 300000).toISOString(),
    artifacts: idx === 9 ? [{ path: "paper/main.md", bytes: 12450 }] : idx === 8 ? [{ path: "visualizations/circuit_graph.svg", bytes: 4890 }] : [{ path: "reports/reproducibility.json", bytes: 1820 }],
    open_questions: [],
  }));

  const p2: ProjectData = {
    project_id: "causal-transformer-circuits",
    state: {
      stage: "complete",
      topics: ["Transformer circuits", "Causal scrubbing", "Mechanistic interpretability"],
      human_feedback: { idea: "Approved hyp-1; focus on induction head ablation." },
    },
    manifest: {
      version: "0.2.0",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      demo: true,
    },
    running: false,
    updated_at: Date.now() - 3600000,
    pending_decisions: [],
    handoffs: p2Handoffs,
    events: [
      { seq: 1, type: "agent.lifecycle", time: new Date(Date.now() - 86000000).toISOString(), data: { agent: "director", phase: "start" } },
      { seq: 2, type: "agent.lifecycle", time: new Date(Date.now() - 85000000).toISOString(), data: { agent: "director", phase: "done" } },
      { seq: 3, type: "workflow.complete", time: new Date(Date.now() - 3600000).toISOString(), data: { stage: "complete" } },
    ],
    artifacts: p2Artifacts,
    chats: {},
    eventListeners: new Set(),
  };

  projects.set(p1.project_id, p1);
  projects.set(p2.project_id, p2);

  const rainbow: ProjectData = {
    project_id: "rainbow-formation-episode",
    state: {
      stage: "created",
      topics: ["How Does a Rainbow Form?"],
      human_feedback: {},
    },
    manifest: {
      version: "0.2.0",
      created_at: new Date().toISOString(),
      demo: true,
      production: createProductionBrief(
        "How Does a Rainbow Form?",
        "Explain how sunlight entering water droplets is refracted, reflected, and separated into the colors of a rainbow.",
        "Ages 6-8",
        "Two curious friends follow a sunbeam through a garden after the rain and discover how tiny water droplets spread white sunlight into a colorful arc.",
      ),
    },
    running: false,
    updated_at: Date.now(),
    pending_decisions: [],
    handoffs: [],
    events: [
      { seq: 1, type: "project.created", time: new Date().toISOString(), data: { project_id: "rainbow-formation-episode", topics: ["How Does a Rainbow Form?"] } },
    ],
    artifacts: new Map(),
    chats: {},
    eventListeners: new Set(),
  };

  projects.set(rainbow.project_id, rainbow);
}

seedInitialProjects();

const CONTENT_AGENTS: Record<string, string[]> = {
  research: ["librarian", "explorer"],
  script: ["planner", "writer"],
  storyboard: ["visualizer"],
  assets: ["experimenter"],
  voice_music: ["podcaster"],
};

function productionPackage(project: ProjectData): ProductionPackage | null {
  return project.manifest.production as ProductionPackage | undefined || null;
}

function addProductionHandoff(project: ProjectData, stage: string, agentKey: string, summary: string, content: unknown) {
  const profile = AGENT_PROFILES[agentKey];
  const packageData = productionPackage(project)!;
  const revision = packageData.revisionHistory.filter((item) => item.stage === stage && item.action === "revise").length + 1;
  const artifactPath = `production/${stage}-${agentKey}-r${revision}.json`;
  const artifactContent = JSON.stringify(content, null, 2);
  const bytes = Buffer.byteLength(artifactContent);
  project.artifacts.set(artifactPath, { path: artifactPath, bytes, mimeType: "application/json; charset=utf-8", content: artifactContent });
  const nextAgent = ({ librarian: "explorer", explorer: "writer", writer: "visualizer", visualizer: "experimenter", experimenter: "podcaster" } as Record<string, string>)[agentKey];
  const handoff: Handoff = {
    agent: agentKey,
    agent_label: profile.label,
    next_agent: nextAgent,
    next_agent_label: nextAgent ? AGENT_PROFILES[nextAgent].label : undefined,
    summary,
    time: new Date().toISOString(),
    artifacts: [{ path: artifactPath, bytes }],
    open_questions: ["Educational, factual, age-suitability, and source/license checks remain pending human review."],
  };
  project.handoffs.push(handoff);
  broadcastEvent(project, "agent.lifecycle", { agent: agentKey, phase: "done" });
  broadcastEvent(project, "agent.handoff", { agent: agentKey, handoff });
}

function providerErrorResponse(res: Response, error: unknown) {
  if (error instanceof ProviderUnavailableError) {
    res.status(503).json({ state: "provider_unavailable", error: error.code, message: error.message, provider: generationProviderStatus() });
    return;
  }
  if (error instanceof ProviderGenerationError) {
    res.status(502).json({ state: "generation_failed", error: error.code, message: error.message, provider: generationProviderStatus() });
    return;
  }
  res.status(502).json({ state: "generation_failed", error: "invalid_provider_output", message: error instanceof Error ? error.message : "The provider output could not be validated; no content was stored.", provider: generationProviderStatus() });
}

async function runProviderStage<T>(
  project: ProjectData,
  res: Response,
  stage: string,
  activeState: string,
  agentKeys: string[],
  prompt: string,
  validate: (value: unknown) => T,
  commit: (packageData: ProductionPackage, output: T) => void,
) {
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(409).json({ error: "This project does not have a production brief." });
    return;
  }
  if (packageData.stageStatuses[stage] === "generated") {
    res.status(409).json({ error: `Stage '${stage}' is already generated; request a revision before generating it again.` });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  if (project.running) {
    res.status(409).json({ error: "Another project stage is currently running." });
    return;
  }

  const previousState = project.state.stage;
  project.running = true;
  project.state.stage = activeState;
  project.updated_at = Date.now();
  broadcastEvent(project, "production.stage", { from: previousState, to: activeState, phase: "started" });
  for (const agent of agentKeys) broadcastEvent(project, "agent.lifecycle", { agent, phase: "start" });
  broadcastEvent(project, "production.generation_started", { stage, provider: generationProviderStatus() });

  try {
    const raw = await generateStructuredOutput<unknown>(prompt);
    const output = validate(raw);
    commit(packageData, output);
    if (project.state.stage !== activeState) broadcastEvent(project, "production.stage", { from: activeState, to: project.state.stage, phase: "content_ready" });
    for (const agent of agentKeys) {
      const payload = stage === "research" ? agent === "librarian"
        ? { researchNotes: packageData.researchNotes, verification: "unverified" }
        : { learningOutcomes: packageData.learningOutcomes }
        : stage === "script" && agent === "planner"
          ? packageData.script.content?.scenes.map(({ id, title, purpose, estimatedDurationSeconds }) => ({ id, title, purpose, estimatedDurationSeconds }))
          : output;
      addProductionHandoff(project, stage, agent, `Generated ${stage.replace(/_/g, " ")} content using the configured ${generationProviderStatus().provider} provider; review remains pending.`, payload);
    }
    project.running = false;
    project.updated_at = Date.now();
    broadcastEvent(project, "production.generation_completed", { stage, provider: generationProviderStatus() });
    res.json({ status: "generated", provider: generationProviderStatus(), package: packageData });
  } catch (error) {
    project.running = false;
    project.state.stage = previousState;
    project.updated_at = Date.now();
    for (const agent of agentKeys) broadcastEvent(project, "agent.lifecycle", { agent, phase: "error" });
    broadcastEvent(project, "production.generation_failed", { stage, error: error instanceof Error ? error.message : "generation failed" });
    providerErrorResponse(res, error);
  }
}

function productionBriefInput(body: any): ProductionBriefInput {
  const durationSeconds = Number(body?.durationSeconds ?? 120);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 3600) {
    throw new Error("durationSeconds must be an integer between 15 and 3600");
  }
  return {
    topic: requiredString(body?.topic, "topic"),
    targetAge: requiredString(body?.targetAge, "targetAge"),
    educationalObjective: requiredString(body?.educationalObjective, "educationalObjective"),
    durationSeconds: numberValue(durationSeconds, "durationSeconds"),
    tone: requiredString(body?.tone || "unspecified", "tone"),
    style: requiredString(body?.style || "unspecified", "style"),
    storyConcept: typeof body?.storyConcept === "string" ? body.storyConcept.trim() : "",
  };
}

function updateProductionDeliverable(project: ProjectData, key: string, status: string) {
  const deliverable = project.manifest.production?.deliverables?.[key];
  if (!deliverable) return;
  deliverable.status = status;
  broadcastEvent(project, "production.status", { deliverable: key, status });
}

// Pipeline simulation runner for newly created or resumed projects
function runProjectPipeline(project: ProjectData) {
  if (project.manifest.production) {
    project.running = false;
    return;
  }
  if (project.running) return;
  project.running = true;
  const sequence = LEGACY_RESEARCH_WORKFLOW;

  async function step() {
    if (!project.running) return;
    const currentStage = project.state.stage;

    if (currentStage === "waiting_idea") {
      project.running = false;
      return;
    }

    let stepInfo = sequence.find((candidate) => candidate.stage === currentStage);
    if (!stepInfo) {
      if (currentStage === "complete" || currentStage === "rejected") {
        project.running = false;
        return;
      }
      stepInfo = sequence[0];
    }

    const participants = [
      { agent: stepInfo.agent, label: stepInfo.label, summary: stepInfo.summary },
      ...(stepInfo.supportAgents || []),
    ];
    const nextStep = sequence.find((candidate) => candidate.stage === stepInfo.nextStage);
    if (stepInfo.deliverable) updateProductionDeliverable(project, stepInfo.deliverable, "In progress");
    for (const participant of participants) {
      broadcastEvent(project, "agent.lifecycle", { agent: participant.agent, phase: "start" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));

    for (const participant of participants) {
      const artifactPath = project.manifest.production
        ? `production/${currentStage}-${participant.agent}.md`
        : `artifacts/${participant.agent}_output.md`;
      const production = project.manifest.production;
      const artifactContent = production
        ? `# ${production.title} - ${participant.label}\n\n${participant.summary}\n\n**Educational objective:** ${production.educational_objective}\n**Target age:** ${production.target_age}\n**Project:** ${project.project_id}\n**Timestamp:** ${new Date().toISOString()}\n`
        : `# Output from ${participant.agent}\n\n**Summary**: ${participant.summary}\n**Project**: ${project.project_id}\n**Timestamp**: ${new Date().toISOString()}\n`;
      project.artifacts.set(artifactPath, {
        path: artifactPath,
        bytes: Buffer.byteLength(artifactContent),
        mimeType: "text/markdown; charset=utf-8",
        content: artifactContent,
      });

      const handoff: Handoff = {
        agent: participant.agent,
        agent_label: participant.label,
        next_agent: nextStep?.agent || (stepInfo.nextStage === "complete" ? "complete" : undefined),
        next_agent_label: nextStep?.label || (stepInfo.nextStage === "complete" ? "Release ready" : undefined),
        summary: participant.summary,
        time: new Date().toISOString(),
        artifacts: [{ path: artifactPath, bytes: Buffer.byteLength(artifactContent) }],
        open_questions: [],
      };
      project.handoffs.push(handoff);
      broadcastEvent(project, "agent.lifecycle", { agent: participant.agent, phase: "done" });
      broadcastEvent(project, "agent.handoff", { agent: participant.agent, handoff });
    }

    if (stepInfo.deliverable) updateProductionDeliverable(project, stepInfo.deliverable, "Complete");
    project.state.stage = stepInfo.nextStage;
    project.updated_at = Date.now();

    if (stepInfo.nextStage === "waiting_idea") {
      const pending = {
        checkpoint: "idea",
        request: {
          checkpoint: "idea",
          prompt: "Please review and select the frontier hypothesis or provide steering feedback.",
          payload: {
            candidates: [
              { id: "cand-1", title: "Empirical Divergence Hypothesis", hypothesis: `Ablation study on ${project.state.topics[0] || "primary topic"}`, score: 0.91 },
              { id: "cand-2", title: "Structural Invariance Model", hypothesis: `Boundary testing on ${project.state.topics[0] || "primary topic"}`, score: 0.84 },
            ],
          },
        },
        packet: `# Decision Packet: Idea Checkpoint\nSelect an idea to proceed to Task Design.`,
      };
      project.pending_decisions = [pending];
      project.running = false;
      broadcastEvent(project, "checkpoint.pending", { checkpoint: "idea" });
      return;
    }

    if (stepInfo.nextStage === "complete") {
      project.running = false;
      broadcastEvent(project, "workflow.complete", { stage: "complete" });
      return;
    }

    setTimeout(step, 800);
  }

  step().catch((err) => {
    console.error("Pipeline error:", err);
    project.running = false;
  });
}
// Root page
app.get(["/", "/index.html"], (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Models registry
app.get("/api/models", (req: Request, res: Response) => {
  const routes = [
    { name: "gpt56_sol", backend: "litellm", model: "openai/gpt-5.6-sol" },
    { name: "gpt56_sol_max", backend: "litellm", model: "openai/gpt-5.6-sol" },
    { name: "gpt56_luna", backend: "litellm", model: "openai/gpt-5.6-luna" },
    { name: "claude_opus", backend: "litellm", model: "anthropic/claude-opus-4-8" },
    { name: "gemini_flash", backend: "litellm", model: "gemini/gemini-3.6-flash" },
    { name: "deepseek_v4", backend: "litellm", model: "deepseek/deepseek-v4-pro" },
    { name: "deepseek_harness", backend: "deepseek-harness", model: "deepseek-v4-pro" },
  ];

  const assignments = Object.values(AGENT_PROFILES).map((profile) => ({
    agent: profile.name,
    label: profile.label,
    models: [profile.defaultModel],
  }));

  res.json({
    policy: "advisory_only_no_silent_route_changes",
    routes,
    assignments,
    content_generation: generationProviderStatus(),
    refreshed_at: new Date().toISOString(),
    sources: [
      { name: "artificial-analysis", status: "active" },
      { name: "swe-bench", status: "active" },
      { name: "deepresearch-bench", status: "active" },
      { name: "terminal-bench", status: "active" },
      { name: "paperbench", status: "active" },
      { name: "live-research-bench", status: "active" },
      { name: "artificial-analysis-media", status: "active" },
    ],
  });
});

// List projects
app.get("/api/projects", (req: Request, res: Response) => {
  const list = Array.from(projects.values()).map((p) => ({
    project_id: p.project_id,
    title: p.manifest.production?.title || p.project_id,
    stage: p.state.stage,
    topics: p.state.topics,
    running: p.running,
    updated_at: p.updated_at,
  }));
  list.sort((a, b) => b.updated_at - a.updated_at);
  res.json({ projects: list });
});

// Create project
app.post("/api/projects", (req: Request, res: Response) => {
  const { project_id, topics } = req.body || {};
  if (!project_id || !PROJECT_ID_REGEX.test(project_id)) {
    res.status(400).json({ error: "Invalid project_id" });
    return;
  }
  if (!Array.isArray(topics) || topics.length === 0) {
    res.status(400).json({ error: "topics must be a non-empty array" });
    return;
  }

  const existing = projects.get(project_id);
  if (existing) {
    res.status(400).json({ error: "Project already exists" });
    return;
  }

  const newProject: ProjectData = {
    project_id,
    state: {
      stage: "created",
      topics: topics.map(String),
      human_feedback: {},
    },
    manifest: {
      version: "0.2.0",
      created_at: new Date().toISOString(),
      production: createProductionBrief(
        topics.map(String).join(" / "),
        topics.map(String).join("; "),
        "To be selected",
        "To be developed from the approved learning objective.",
      ),
    },
    running: false,
    updated_at: Date.now(),
    pending_decisions: [],
    handoffs: [],
    events: [
      {
        seq: 1,
        type: "project.created",
        time: new Date().toISOString(),
        data: { project_id, topics },
      },
    ],
    artifacts: new Map(),
    chats: {},
    eventListeners: new Set(),
  };

  projects.set(project_id, newProject);
  runProjectPipeline(newProject);

  res.status(202).json({ status: "created", project_id });
});

// Get single project
app.get("/api/projects/:projectId", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const artifactsList = Array.from(p.artifacts.values()).map((a) => ({
    path: a.path,
    bytes: a.bytes,
  }));
  artifactsList.sort((a, b) => a.path.localeCompare(b.path));

  res.json({
    project_id: p.project_id,
    state: p.state,
    manifest: p.manifest,
    generationProvider: generationProviderStatus(),
    running: p.running,
    pending_decisions: p.pending_decisions,
    handoffs: p.handoffs,
    agents: computeAgentRoster(p),
    artifacts: artifactsList,
    events: {
      events: p.events.slice(-120),
      next: p.events.length,
    },
  });
});

app.post("/api/projects/:projectId/production/brief", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.running) {
    res.status(409).json({ error: "Cannot change the brief while a generation stage is running." });
    return;
  }
  const current = productionPackage(project);
  if (!current) {
    res.status(409).json({ error: "This project uses the research workflow and cannot be converted in place." });
    return;
  }
  if (Object.values(current.stageStatuses).some((status) => status === "generated")) {
    res.status(409).json({ error: "The brief cannot be replaced after generation. Request a stage revision instead." });
    return;
  }
  try {
    const brief = productionBriefInput(req.body);
    const packageData = createProductionPackage(brief);
    project.manifest.production = packageData;
    project.state.topics = [brief.topic];
    project.state.stage = "created";
    project.updated_at = Date.now();
    broadcastEvent(project, "production.brief_created", { topic: brief.topic, targetAge: brief.targetAge });
    res.status(201).json({ status: "created", package: packageData });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid production brief" });
  }
});

app.get("/api/projects/:projectId/production/package", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const project = projects.get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(404).json({ error: "Production package not found" });
    return;
  }
  res.json({ project_id: projectId, stage: project.state.stage, running: project.running, provider: generationProviderStatus(), package: packageData });
});

app.post("/api/projects/:projectId/production/research/generate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(409).json({ error: "This project does not have a production brief." });
    return;
  }
  const prompt = promptForResearch(packageData.brief);
  await runProviderStage(project, res, "research", "research_ready", CONTENT_AGENTS.research, prompt, validateResearch, (result, output) => {
    result.learningOutcomes = output.learningOutcomes;
    result.researchNotes = { status: "generated", notes: output.researchNotes, sources: [], verification: "unverified" };
    result.stageStatuses.research = "generated";
    result.approvalState.research = { status: "pending" };
    project.state.stage = "curriculum_ready";
  });
});

app.post("/api/projects/:projectId/production/script/generate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(409).json({ error: "This project does not have a production brief." });
    return;
  }
  if (packageData.researchNotes.status !== "generated") {
    res.status(409).json({ error: "Generate topic notes and learning outcomes before requesting a script." });
    return;
  }
  const feedback = packageData.approvalState.script?.feedback;
  const prompt = promptForScript(packageData.brief, packageData.researchNotes.notes, packageData.learningOutcomes) + (feedback ? `\nRevision feedback: ${feedback}` : "");
  await runProviderStage(project, res, "script", "script_ready", CONTENT_AGENTS.script, prompt, validateScript, (result, output) => {
    result.script = { status: "generated", content: output };
    result.episodeTitle = output.title;
    result.title = output.title;
    result.stageStatuses.script = "generated";
    result.approvalState.script = { status: "pending" };
    result.deliverables.script.status = `Generated by ${generationProviderStatus().provider}; review pending`;
    project.state.stage = "script_ready";
  });
});

app.post("/api/projects/:projectId/production/storyboard/generate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData?.script.content) {
    res.status(409).json({ error: "Generate a script before requesting a storyboard." });
    return;
  }
  const feedback = packageData.approvalState.storyboard?.feedback;
  const prompt = promptForStoryboard(packageData.brief, packageData.script.content) + (feedback ? `\nRevision feedback: ${feedback}` : "");
  const validateStoryboardOutput = (value: unknown) => {
    const scenes = validateStoryboard(value);
    const scriptIds = packageData.script.content!.scenes.map((scene) => scene.id);
    if (scenes.length !== scriptIds.length || scenes.some((scene, index) => scene.id !== scriptIds[index])) {
      throw new Error("Invalid structured output: storyboard scene ids must match the source script in order");
    }
    return scenes;
  };
  await runProviderStage(project, res, "storyboard", "storyboard_ready", CONTENT_AGENTS.storyboard, prompt, validateStoryboardOutput, (result, output) => {
    result.scenes = output;
    result.storyboardBeats = output;
    result.stageStatuses.storyboard = "generated";
    result.approvalState.storyboard = { status: "pending" };
    result.deliverables.storyboard.status = `Specification generated by ${generationProviderStatus().provider}; review pending`;
    project.state.stage = "storyboard_ready";
  });
});

app.post("/api/projects/:projectId/production/assets/generate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData || packageData.scenes.length === 0) {
    res.status(409).json({ error: "Generate a storyboard before requesting an asset plan." });
    return;
  }
  const feedback = packageData.approvalState.assets?.feedback;
  const prompt = promptForAssetPlan(packageData.brief, packageData.scenes) + (feedback ? `\nRevision feedback: ${feedback}` : "");
  await runProviderStage(project, res, "assets", "animation_ready", CONTENT_AGENTS.assets, prompt, validateAssetPlan, (result, output) => {
    result.characters = output.characters as CharacterSpecification[];
    result.visualAssets = output.visualAssets as VisualAssetSpecification[];
    result.stageStatuses.assets = "generated";
    result.approvalState.assets = { status: "pending" };
    project.state.stage = "animation_ready";
  });
});

app.post("/api/projects/:projectId/production/voice-music/generate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!generationProviderStatus().configured) {
    providerErrorResponse(res, new ProviderUnavailableError());
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData?.script.content) {
    res.status(409).json({ error: "Generate a script before requesting a voice and music plan." });
    return;
  }
  const feedback = packageData.approvalState.voice_music?.feedback;
  const prompt = promptForVoiceMusic(packageData.brief, packageData.script.content) + (feedback ? `\nRevision feedback: ${feedback}` : "");
  await runProviderStage(project, res, "voice_music", "audio_ready", CONTENT_AGENTS.voice_music, prompt, validateVoiceMusicPlan, (result, output) => {
    result.voicePlan = output;
    result.musicSfxPlan = output;
    result.stageStatuses.voice_music = "generated";
    result.approvalState.voice_music = { status: "pending" };
    result.deliverables.audio.status = `Plan generated by ${generationProviderStatus().provider}; audio not rendered`;
    project.state.stage = "audio_ready";
  });
});

app.post("/api/projects/:projectId/production/orchestrate", async (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(409).json({ error: "This project does not have a production brief." });
    return;
  }
  if (project.running) {
    res.status(409).json({ error: "Another project stage is currently running." });
    return;
  }

  const step = nextProductionOrchestrationStep(packageData);
  if (step.kind === "awaiting_approval") {
    res.json({ status: "awaiting_approval", stage: step.stage, package: packageData });
    return;
  }
  if (step.kind === "blocked") {
    res.status(409).json({ status: "blocked", stage: step.stage, error: step.reason });
    return;
  }
  if (step.kind === "awaiting_quality_review") {
    res.json({ status: "awaiting_quality_review", checks: step.checks, package: packageData });
    return;
  }
  if (step.kind === "awaiting_final_approval") {
    res.json({ status: "awaiting_final_approval", package: packageData });
    return;
  }
  if (step.kind === "production_ready") {
    res.json({ status: "production_ready", package: packageData });
    return;
  }

  const plan = createProductionStagePlan(packageData, step.stage);
  await runProviderStage(project, res, plan.stage, plan.activeState, plan.agentKeys, plan.prompt, plan.validate, (result, output) => {
    plan.commit(result, output);
    project.state.stage = plan.readyState;
  });
});

app.post("/api/projects/:projectId/production/stages/:stage/decision", (req: Request, res: Response) => {
  const project = projects.get(getParam(req.params.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const packageData = productionPackage(project);
  if (!packageData) {
    res.status(409).json({ error: "This project does not have a production brief." });
    return;
  }
  const stage = getParam(req.params.stage);
  const { action, feedback = "" } = req.body || {};
  const safetyFields = ["educationalQuality", "ageSuitability", "factualReview", "copyrightSourceReview"] as const;
  const generatedStages = ["research", "script", "storyboard", "assets", "voice_music"];
  if (project.running) {
    res.status(409).json({ error: "Cannot approve or revise while generation is running." });
    return;
  }
  if (action !== "approve" && action !== "revise") {
    res.status(400).json({ error: "action must be approve or revise" });
    return;
  }
  if (![...generatedStages, ...safetyFields, "humanApproval", "brief"].includes(stage as any)) {
    res.status(400).json({ error: "Unknown production review stage" });
    return;
  }
  if (generatedStages.includes(stage) && packageData.stageStatuses[stage] !== "generated") {
    res.status(409).json({ error: `Stage '${stage}' has no generated content to review.` });
    return;
  }
  if (stage === "humanApproval" && action === "approve") {
    const unapprovedContent = generatedStages.filter((contentStage) =>
      packageData.stageStatuses[contentStage] !== "generated" || packageData.approvalState[contentStage]?.status !== "approved");
    if (unapprovedContent.length > 0) {
      res.status(409).json({ error: `Human approval requires generated and approved content stages: ${unapprovedContent.join(", ")}.` });
      return;
    }
    const requiredChecks = ["educationalQuality", "ageSuitability", "factualReview", "copyrightSourceReview"] as const;
    const outstanding = requiredChecks.filter((check) => packageData.qualityChecks[check] !== "human_approved");
    if (outstanding.length > 0) {
      res.status(409).json({ error: `Human approval requires completed QA reviews: ${outstanding.join(", ")}.` });
      return;
    }
  }
  const status = action === "approve" ? "approved" : "revision_requested";
  packageData.approvalState[stage] = { status, feedback: String(feedback).slice(0, 4000) };
  packageData.revisionHistory.push({ stage, action, feedback: String(feedback).slice(0, 4000), timestamp: new Date().toISOString() });
  if (action === "revise" && generatedStages.includes(stage)) packageData.stageStatuses[stage] = "revision_requested";
  if (safetyFields.includes(stage as typeof safetyFields[number])) {
    packageData.qualityChecks[stage as typeof safetyFields[number]] = action === "approve" ? "human_approved" : "changes_requested";
  }
  if (stage === "humanApproval") packageData.qualityChecks.humanApproval = action === "approve" ? "approved" : "changes_requested";
  if (stage === "humanApproval" && action === "approve") project.state.stage = "production_ready";
  project.updated_at = Date.now();
  const event = broadcastEvent(project, "production.stage_decided", { stage, action, feedback: String(feedback).slice(0, 4000) });
  res.json({ status: "recorded", event, package: packageData });
});

// Resume project
app.post("/api/projects/:projectId/resume", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (p.manifest.production) {
    res.status(409).json({ error: "Production projects advance only through validated content-generation and approval routes." });
    return;
  }
  runProjectPipeline(p);
  res.status(202).json({ status: "started" });
});

// Get events
app.get("/api/projects/:projectId/events", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const after = Math.max(0, parseInt(req.query.after as string, 10) || 0);
  const events = p.events.slice(after);
  res.json({
    events,
    next: after + events.length,
  });
});

// SSE event stream
app.get("/api/projects/:projectId/events/stream", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const after = Math.max(0, parseInt(req.query.after as string, 10) || 0);
  const missed = p.events.slice(after);
  for (const event of missed) {
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  p.eventListeners.add(res);

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(keepAliveTimer);
      p.eventListeners.delete(res);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    p.eventListeners.delete(res);
  });
});

// Get single agent details
app.get("/api/projects/:projectId/agents/:agentName", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const agentName = getParam(req.params.agentName);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const profile = AGENT_PROFILES[agentName];
  if (!profile) {
    res.status(400).json({ error: `Unknown office agent '${agentName}'` });
    return;
  }

  const roster = computeAgentRoster(p);
  const agentSummary = roster.find((a) => a.name === profile.name);

  const handoffs = p.handoffs.filter((h) => h.agent === profile.name);
  const recentEvents = p.events
    .filter((e) => e.data && e.data.agent === profile.name)
    .slice(-12);

  const artifactsMap = new Map<string, { path: string; bytes: number }>();
  for (const h of handoffs) {
    for (const art of h.artifacts || []) {
      artifactsMap.set(art.path, art);
    }
  }

  const chat = p.chats[profile.name] || [];

  res.json({
    ...agentSummary,
    handoffs,
    artifacts: Array.from(artifactsMap.values()),
    recent_events: recentEvents,
    chat,
  });
});

// Ask agent
app.post("/api/projects/:projectId/agents/:agentName/ask", async (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const agentName = getParam(req.params.agentName);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const profile = AGENT_PROFILES[agentName];
  if (!profile) {
    res.status(400).json({ error: `Unknown office agent '${agentName}'` });
    return;
  }

  const question = String(req.body?.question || "").trim();
  if (!question) {
    res.status(400).json({ error: "question must not be empty" });
    return;
  }

  const now = new Date().toISOString();
  const roster = computeAgentRoster(p);
  const agentData = roster.find((a) => a.name === agentName);
  const handoffs = p.handoffs.filter((h) => h.agent === agentName);

  let answer = "";
  let source = "evidence_summary";
  let modelName: string | null = null;

  // Check if GEMINI_API_KEY is available
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const prompt = `You are the ${profile.label} in the OpenFARS Autonomous Research Team (${profile.department}).
Mission: ${profile.mission}
Current Project: ${p.project_id}
Stage: ${p.state.stage}
Topics: ${p.state.topics.join(", ")}
Your Status: ${agentData?.status || "queued"}
Recorded Work Summary: ${agentData?.summary || "No prior handoffs."}
User Question: "${question}"

Provide a concise, direct, scientific response in 2-3 sentences based strictly on the current recorded work. Distinguish completed work from next steps.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
          }),
        }
      );

      if (response.ok) {
        const json = await response.json();
        const generated = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (generated) {
          answer = generated;
          source = "model";
          modelName = "gemini-2.5-flash";
        }
      }
    } catch {
      // Fallback below
    }
  }

  if (!answer) {
    const parts = [
      `${profile.label} status: ${agentData?.status || "queued"}.`,
      agentData?.summary || "No handoff has been recorded yet.",
    ];
    if (handoffs.length > 0 && handoffs[handoffs.length - 1].artifacts?.length) {
      parts.push(`Outputs: ${handoffs[handoffs.length - 1].artifacts!.map((a) => a.path).join(", ")}.`);
    }
    answer = parts.join(" ");
    source = "evidence_summary";
  }

  const userMsg: ChatMessage = { role: "user", content: question, time: now };
  const agentMsg: ChatMessage = {
    role: "agent",
    content: answer,
    time: new Date().toISOString(),
    source,
    model: modelName,
  };

  if (!p.chats[agentName]) p.chats[agentName] = [];
  p.chats[agentName].push(userMsg, agentMsg);

  broadcastEvent(p, "web.agent_asked", {
    agent: agentName,
    source,
    question: question.slice(0, 80),
  });

  res.json({
    agent: agentName,
    message: agentMsg,
    chat: p.chats[agentName],
  });
});

// Human decision checkpoint
app.post("/api/projects/:projectId/decisions/:checkpoint", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const checkpoint = getParam(req.params.checkpoint);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { action, feedback, selected_id } = req.body || {};

  if (!p.state.human_feedback) p.state.human_feedback = {};
  p.state.human_feedback[checkpoint] = String(feedback || action || "approved");

  p.pending_decisions = p.pending_decisions.filter((d) => d.checkpoint !== checkpoint);

  broadcastEvent(p, "checkpoint.decided", {
    checkpoint,
    action,
    selected_id,
    feedback,
  });

  if (action === "reject") {
    p.state.stage = "rejected";
    p.running = false;
  } else if (action === "revise") {
    p.state.stage = "revising_ideas";
    runProjectPipeline(p);
  } else {
    // Approve
    p.state.stage = "idea_approved";
    runProjectPipeline(p);
  }

  res.status(202).json({ status: "recorded_and_resumed" });
});

// Artifacts viewer
app.get("/api/projects/:projectId/artifacts/*", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const relativePath = (req.params as any)[0] || "";
  const art = p.artifacts.get(relativePath);
  if (!art) {
    res.status(404).json({ error: "Artifact not found" });
    return;
  }

  res.setHeader("Content-Type", art.mimeType || "text/plain; charset=utf-8");
  res.setHeader("Content-Length", String(art.bytes));
  res.send(art.content || "");
});

// Bundle endpoint is retained but does not claim an unimplemented bundle exists.
app.post("/api/projects/:projectId/bundle", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.status(501).json({ state: "unavailable", error: "Release bundle creation is not implemented by this WebUI." });
});

app.listen(PORT, HOST, () => {
  console.log(`OpenFARS WebUI running at http://${HOST}:${PORT}`);
});
