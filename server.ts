import express, { Request, Response, NextFunction } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
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

const PRODUCTION_WORKFLOW: WorkflowStep[] = [
  { stage: "created", nextStage: "research_ready", agent: "director", label: "Producer / Showrunner", summary: "Production kickoff is set: episode scope, learning goal, department handoffs, and approval checkpoints are organized." },
  { stage: "research_ready", nextStage: "curriculum_ready", agent: "librarian", label: "Research Agent", summary: "Collected reliable, age-appropriate source material for the educational topic." },
  { stage: "curriculum_ready", nextStage: "fact_check_ready", agent: "explorer", label: "Curriculum Agent", summary: "Defined age-appropriate learning objectives, explanations, examples, and lesson structure." },
  { stage: "fact_check_ready", nextStage: "education_review_ready", agent: "critic", label: "Fact Checker", summary: "Checked factual accuracy and flagged misleading or unsuitable educational claims." },
  { stage: "education_review_ready", nextStage: "story_ready", agent: "evaluator", label: "Educational Reviewer", summary: "Reviewed the learning plan for children's age suitability, clarity, safety, and educational value." },
  { stage: "story_ready", nextStage: "script_ready", agent: "task_designer", label: "Story Architect", summary: "Turned the approved learning objective into an original story concept, characters, scenes, and narrative structure." },
  { stage: "script_ready", nextStage: "storyboard_ready", agent: "planner", label: "Script Director", summary: "Built the detailed scene order, dialogue plan, narration, and pacing.", supportAgents: [{ agent: "writer", label: "Story Writer", summary: "Drafted child-friendly story narration and character dialogue from the approved educational plan." }], deliverable: "script" },
  { stage: "storyboard_ready", nextStage: "animation_ready", agent: "visualizer", label: "Creative Director", summary: "Designed storyboard shots, characters, environments, visual style, and scene composition.", deliverable: "storyboard" },
  { stage: "animation_ready", nextStage: "audio_ready", agent: "experimenter", label: "Animation Director", summary: "Planned scene motion, character actions, camera direction, and animation requirements." },
  { stage: "audio_ready", nextStage: "edit_ready", agent: "podcaster", label: "Voice & Music Director", summary: "Planned narration, character voices, background music, ambience, and sound effects.", deliverable: "audio" },
  { stage: "edit_ready", nextStage: "qc_ready", agent: "video_producer", label: "Editor & Video Producer", summary: "Assembled the scene, audio, captions, transitions, and final video edit plan.", deliverable: "video_edit" },
  { stage: "qc_ready", nextStage: "thumbnail_ready", agent: "evaluator", label: "Production QC", summary: "Reviewed the episode package, identified production issues, and recorded required revisions." },
  { stage: "thumbnail_ready", nextStage: "release_ready", agent: "publisher", label: "YouTube & Thumbnail Director", summary: "Prepared the thumbnail concept, title, description, chapters, SEO metadata, and Shorts opportunities.", deliverable: "thumbnail" },
  { stage: "release_ready", nextStage: "complete", agent: "publisher", label: "YouTube & Thumbnail Director", summary: "Completed the offline YouTube publishing package and release checklist; no external upload was performed.", deliverable: "release" },
];

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
  return {
    title,
    educational_objective: objective,
    target_age: targetAge,
    story_concept: storyConcept,
    deliverables: {
      script: { label: "Script", status: "Not started" },
      storyboard: { label: "Storyboard", status: "Not started" },
      audio: { label: "Audio", status: "Not started" },
      video_edit: { label: "Video / edit", status: "Not started" },
      thumbnail: { label: "Thumbnail", status: "Not started" },
      release: { label: "Release", status: "Not started" },
    },
  };
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

function updateProductionDeliverable(project: ProjectData, key: string, status: string) {
  const deliverable = project.manifest.production?.deliverables?.[key];
  if (!deliverable) return;
  deliverable.status = status;
  broadcastEvent(project, "production.status", { deliverable: key, status });
}

// Pipeline simulation runner for newly created or resumed projects
function runProjectPipeline(project: ProjectData) {
  if (project.running) return;
  project.running = true;
  const sequence = project.manifest.production ? PRODUCTION_WORKFLOW : LEGACY_RESEARCH_WORKFLOW;

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

  res.status(202).json({ status: "started", project_id });
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

// Resume project
app.post("/api/projects/:projectId/resume", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
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

// Bundle builder
app.post("/api/projects/:projectId/bundle", (req: Request, res: Response) => {
  const projectId = getParam(req.params.projectId);
  const p = projects.get(projectId);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json({
    status: "bundled",
    project_id: p.project_id,
    bundle_hash: "sha256:7b919a32c028e18f2d5918bb12",
    artifacts_included: p.artifacts.size,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, HOST, () => {
  console.log(`OpenFARS WebUI running at http://${HOST}:${PORT}`);
});
