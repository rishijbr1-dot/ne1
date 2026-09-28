export type ContentStatus = "not_started" | "generated" | "revision_requested";

export interface ProductionBrief {
  topic: string;
  targetAge: string;
  educationalObjective: string;
  durationSeconds: number;
  tone: string;
  style: string;
  storyConcept: string;
}

export interface ScriptDialogue {
  character: string;
  line: string;
}

export interface ScriptScene {
  id: string;
  title: string;
  purpose: string;
  narration: string;
  dialogue: ScriptDialogue[];
  educationalCheckpoints: string[];
  estimatedDurationSeconds: number;
}

export interface GeneratedScript {
  title: string;
  learningObjective: string;
  hook: string;
  scenes: ScriptScene[];
  estimatedDurationSeconds: number;
}

export interface StoryboardScene {
  id: string;
  purpose: string;
  narration: string;
  dialogue: ScriptDialogue[];
  visualDescription: string;
  characters: string[];
  props: string[];
  cameraDirection: string;
  transition: string;
  estimatedDurationSeconds: number;
  assetRequirements: string[];
}

export interface CharacterSpecification {
  id: string;
  name: string;
  role: string;
  appearance: string;
  consistencyNotes: string;
}

export interface VisualAssetSpecification {
  id: string;
  type: string;
  description: string;
  sceneReferences: string[];
  generationStatus: "not_generated";
  providerStatus: "not_configured";
  sourceOwnership: "unassessed";
  source: "provider_generated_specification";
  licenseStatus: "pending_review";
}

export interface VoiceMusicPlan {
  narrationTracks: Array<{ id: string; sceneId: string; text: string; timingSeconds: number }>;
  dialogueTracks: Array<{ id: string; sceneId: string; character: string; text: string; timingSeconds: number }>;
  voiceAssignments: Array<{ character: string; voiceDescription: string }>;
  musicCues: Array<{ id: string; sceneId: string; description: string; timingSeconds: number }>;
  sfxCues: Array<{ id: string; sceneId: string; description: string; timingSeconds: number }>;
}

export interface ProductionPackage {
  title: string;
  educational_objective: string;
  target_age: string;
  story_concept: string;
  deliverables: Record<string, { label: string; status: string }>;
  brief: ProductionBrief;
  learningOutcomes: string[];
  researchNotes: { status: ContentStatus; notes: string[]; sources: string[]; verification: "unverified" };
  episodeTitle: string;
  script: { status: ContentStatus; content: GeneratedScript | null };
  scenes: StoryboardScene[];
  storyboardBeats: StoryboardScene[];
  characters: CharacterSpecification[];
  visualAssets: VisualAssetSpecification[];
  voicePlan: VoiceMusicPlan | null;
  musicSfxPlan: VoiceMusicPlan | null;
  qualityChecks: {
    educationalQuality: "pending_review" | "human_approved" | "changes_requested";
    ageSuitability: "pending_review" | "human_approved" | "changes_requested";
    factualReview: "pending_review" | "human_approved" | "changes_requested";
    copyrightSourceReview: "pending_review" | "human_approved" | "changes_requested";
    humanApproval: "pending" | "approved" | "changes_requested";
  };
  approvalState: Record<string, { status: "pending" | "approved" | "revision_requested"; feedback?: string }>;
  revisionHistory: Array<{ stage: string; action: "approve" | "revise"; feedback: string; timestamp: string }>;
  stageStatuses: Record<string, ContentStatus>;
}

export interface ProductionBriefInput {
  topic: string;
  targetAge: string;
  educationalObjective: string;
  durationSeconds: number;
  tone: string;
  style: string;
  storyConcept: string;
}

export function createProductionPackage(input: ProductionBriefInput): ProductionPackage {
  return {
    title: input.topic,
    educational_objective: input.educationalObjective,
    target_age: input.targetAge,
    story_concept: input.storyConcept,
    deliverables: {
      script: { label: "Script", status: "Not started" },
      storyboard: { label: "Storyboard", status: "Not started" },
      audio: { label: "Voice / music plan", status: "Not started" },
      video_edit: { label: "Video / edit", status: "Not started" },
      thumbnail: { label: "Thumbnail", status: "Not started" },
      release: { label: "Release package", status: "Not started" },
    },
    brief: { ...input },
    learningOutcomes: [],
    researchNotes: { status: "not_started", notes: [], sources: [], verification: "unverified" },
    episodeTitle: input.topic,
    script: { status: "not_started", content: null },
    scenes: [],
    storyboardBeats: [],
    characters: [],
    visualAssets: [],
    voicePlan: null,
    musicSfxPlan: null,
    qualityChecks: {
      educationalQuality: "pending_review",
      ageSuitability: "pending_review",
      factualReview: "pending_review",
      copyrightSourceReview: "pending_review",
      humanApproval: "pending",
    },
    approvalState: {},
    revisionHistory: [],
    stageStatuses: { brief: "not_started", research: "not_started", script: "not_started", storyboard: "not_started", assets: "not_started", voice_music: "not_started" },
  };
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid structured output: ${field} must be a non-empty string`);
  return value.trim();
}

export function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid structured output: ${field} must be an array of non-empty strings`);
  }
  return value.map((item: string) => item.trim());
}

export function numberValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid structured output: ${field} must be a positive number`);
  return value;
}

export function nonNegativeNumberValue(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid structured output: ${field} must be a non-negative number`);
  return value;
}

export function objectValue(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid structured output: ${field} must be an object`);
  return value as Record<string, any>;
}

export function validateDialogue(value: unknown, field: string): ScriptDialogue[] {
  if (!Array.isArray(value)) throw new Error(`Invalid structured output: ${field} must be an array`);
  return value.map((item, index) => {
    const dialogue = objectValue(item, `${field}[${index}]`);
    return { character: requiredString(dialogue.character, `${field}[${index}].character`), line: requiredString(dialogue.line, `${field}[${index}].line`) };
  });
}

export function validateScript(value: unknown): GeneratedScript {
  const script = objectValue(value, "script");
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) throw new Error("Invalid structured output: script.scenes must contain at least one scene");
  const scenes = script.scenes.map((item: unknown, index: number): ScriptScene => {
    const scene = objectValue(item, `script.scenes[${index}]`);
    return {
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      title: requiredString(scene.title, `script.scenes[${index}].title`),
      purpose: requiredString(scene.purpose, `script.scenes[${index}].purpose`),
      narration: requiredString(scene.narration, `script.scenes[${index}].narration`),
      dialogue: validateDialogue(scene.dialogue, `script.scenes[${index}].dialogue`),
      educationalCheckpoints: stringArray(scene.educationalCheckpoints, `script.scenes[${index}].educationalCheckpoints`),
      estimatedDurationSeconds: numberValue(scene.estimatedDurationSeconds, `script.scenes[${index}].estimatedDurationSeconds`),
    };
  });
  return {
    title: requiredString(script.title, "script.title"),
    learningObjective: requiredString(script.learningObjective, "script.learningObjective"),
    hook: requiredString(script.hook, "script.hook"),
    scenes,
    estimatedDurationSeconds: numberValue(script.estimatedDurationSeconds, "script.estimatedDurationSeconds"),
  };
}

export function validateStoryboard(value: unknown): StoryboardScene[] {
  const result = objectValue(value, "storyboard");
  if (!Array.isArray(result.scenes) || result.scenes.length === 0) throw new Error("Invalid structured output: storyboard.scenes must contain at least one scene");
  return result.scenes.map((item: unknown, index: number): StoryboardScene => {
    const scene = objectValue(item, `storyboard.scenes[${index}]`);
    return {
      id: requiredString(scene.id, `storyboard.scenes[${index}].id`),
      purpose: requiredString(scene.purpose, `storyboard.scenes[${index}].purpose`),
      narration: requiredString(scene.narration, `storyboard.scenes[${index}].narration`),
      dialogue: validateDialogue(scene.dialogue, `storyboard.scenes[${index}].dialogue`),
      visualDescription: requiredString(scene.visualDescription, `storyboard.scenes[${index}].visualDescription`),
      characters: stringArray(scene.characters, `storyboard.scenes[${index}].characters`),
      props: stringArray(scene.props, `storyboard.scenes[${index}].props`),
      cameraDirection: requiredString(scene.cameraDirection, `storyboard.scenes[${index}].cameraDirection`),
      transition: requiredString(scene.transition, `storyboard.scenes[${index}].transition`),
      estimatedDurationSeconds: numberValue(scene.estimatedDurationSeconds, `storyboard.scenes[${index}].estimatedDurationSeconds`),
      assetRequirements: stringArray(scene.assetRequirements, `storyboard.scenes[${index}].assetRequirements`),
    };
  });
}

export function validateResearch(value: unknown): { learningOutcomes: string[]; researchNotes: string[] } {
  const result = objectValue(value, "research");
  return {
    learningOutcomes: stringArray(result.learningOutcomes, "research.learningOutcomes"),
    researchNotes: stringArray(result.researchNotes, "research.researchNotes"),
  };
}

export function validateAssetPlan(value: unknown): { characters: CharacterSpecification[]; visualAssets: VisualAssetSpecification[] } {
  const result = objectValue(value, "assetPlan");
  if (!Array.isArray(result.characters) || !Array.isArray(result.visualAssets)) throw new Error("Invalid structured output: assetPlan requires characters and visualAssets arrays");
  const characters = result.characters.map((item: unknown, index: number): CharacterSpecification => {
    const character = objectValue(item, `assetPlan.characters[${index}]`);
    return {
      id: `character-${String(index + 1).padStart(2, "0")}`,
      name: requiredString(character.name, `assetPlan.characters[${index}].name`),
      role: requiredString(character.role, `assetPlan.characters[${index}].role`),
      appearance: requiredString(character.appearance, `assetPlan.characters[${index}].appearance`),
      consistencyNotes: requiredString(character.consistencyNotes, `assetPlan.characters[${index}].consistencyNotes`),
    };
  });
  const visualAssets = result.visualAssets.map((item: unknown, index: number): VisualAssetSpecification => {
    const asset = objectValue(item, `assetPlan.visualAssets[${index}]`);
    return {
      id: `asset-${String(index + 1).padStart(2, "0")}`,
      type: requiredString(asset.type, `assetPlan.visualAssets[${index}].type`),
      description: requiredString(asset.description, `assetPlan.visualAssets[${index}].description`),
      sceneReferences: stringArray(asset.sceneReferences, `assetPlan.visualAssets[${index}].sceneReferences`),
      generationStatus: "not_generated",
      providerStatus: "not_configured",
      sourceOwnership: "unassessed",
      source: "provider_generated_specification",
      licenseStatus: "pending_review",
    };
  });
  return { characters, visualAssets };
}

export function validateVoiceMusicPlan(value: unknown): VoiceMusicPlan {
  const result = objectValue(value, "voiceMusicPlan");
  const validateTracks = (input: unknown, field: string, keys: string[]): any[] => {
    if (!Array.isArray(input)) throw new Error(`Invalid structured output: ${field} must be an array`);
    return input.map((item, index) => {
      const track = objectValue(item, `${field}[${index}]`);
      const output: Record<string, any> = { id: `track-${String(index + 1).padStart(2, "0")}` };
      for (const key of keys) output[key] = key === "timingSeconds"
        ? nonNegativeNumberValue(track[key], `${field}[${index}].${key}`)
        : requiredString(track[key], `${field}[${index}].${key}`);
      return output;
    });
  };
  const assignments = validateTracks(result.voiceAssignments, "voiceMusicPlan.voiceAssignments", ["character", "voiceDescription"]);
  const normalizeCueIds = (cues: any[], prefix: string) => cues.map((cue, index) => ({ ...cue, id: `${prefix}-${String(index + 1).padStart(2, "0")}` }));
  return {
    narrationTracks: validateTracks(result.narrationTracks, "voiceMusicPlan.narrationTracks", ["sceneId", "text", "timingSeconds"]),
    dialogueTracks: validateTracks(result.dialogueTracks, "voiceMusicPlan.dialogueTracks", ["sceneId", "character", "text", "timingSeconds"]),
    voiceAssignments: assignments,
    musicCues: normalizeCueIds(validateTracks(result.musicCues, "voiceMusicPlan.musicCues", ["sceneId", "description", "timingSeconds"]), "music"),
    sfxCues: normalizeCueIds(validateTracks(result.sfxCues, "voiceMusicPlan.sfxCues", ["sceneId", "description", "timingSeconds"]), "sfx"),
  };
}

export function promptForResearch(brief: ProductionBrief): string {
  return `Given this children's video brief, propose learning outcomes and concise topic notes for curriculum planning. Do not invent citations, sources, or claim external research was performed. All factual claims require later verification.\nBrief: ${JSON.stringify(brief)}\nReturn JSON with learningOutcomes [string] and researchNotes [string].`;
}

export function promptForScript(brief: ProductionBrief, researchNotes: string[], learningOutcomes: string[]): string {
  return `Create an original children's educational video script. Do not claim external research was performed. Use only the brief and clearly flag factual checks as unresolved.\nBrief: ${JSON.stringify(brief)}\nModel-suggested research notes (unverified): ${JSON.stringify(researchNotes)}\nLearning outcomes: ${JSON.stringify(learningOutcomes)}\nReturn one JSON object with title, learningObjective, hook, estimatedDurationSeconds, and scenes. Each scene needs title, purpose, narration, dialogue [{character,line}], educationalCheckpoints [string], estimatedDurationSeconds.`;
}

export function promptForStoryboard(brief: ProductionBrief, script: GeneratedScript): string {
  return `Convert this script into a storyboard specification. Preserve scene ids, narration, dialogue, and durations. Do not claim visual assets have been generated.\nBrief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}\nReturn one JSON object containing scenes. Each scene needs id, purpose, narration, dialogue [{character,line}], visualDescription, characters [string], props [string], cameraDirection, transition, estimatedDurationSeconds, assetRequirements [string].`;
}

export function promptForAssetPlan(brief: ProductionBrief, scenes: StoryboardScene[]): string {
  return `Plan character and visual asset specifications from this storyboard. Do not create or claim to have generated image/audio/video files.\nBrief: ${JSON.stringify(brief)}\nStoryboard: ${JSON.stringify(scenes)}\nReturn JSON with characters [{name,role,appearance,consistencyNotes}] and visualAssets [{type,description,sceneReferences [scene id]}].`;
}

export function promptForVoiceMusic(brief: ProductionBrief, script: GeneratedScript): string {
  return `Plan narration/dialogue tracks and music/SFX cues from this approved-for-planning script. Do not generate audio or claim a voice provider was used. TimingSeconds are offsets from episode start.\nBrief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}\nReturn JSON with narrationTracks [{sceneId,text,timingSeconds}], dialogueTracks [{sceneId,character,text,timingSeconds}], voiceAssignments [{character,voiceDescription}], musicCues [{sceneId,description,timingSeconds}], sfxCues [{sceneId,description,timingSeconds}].`;
}