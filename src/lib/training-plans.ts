import type { TrainingPlanSource } from "./types";

export type TrainingPlanProfile = {
  id: TrainingPlanSource;
  label: string;
  variants?: string[];
  primaryPurpose: string;
  typicalStructure: string;
  stressPattern: string;
  adaptationBias: string;
  missedWorkoutGuidance: string;
  caution: string;
};

export const trainingPlanProfiles: TrainingPlanProfile[] = [
  {
    id: "unknown",
    label: "Not specified",
    primaryPurpose: "Unknown until the user provides plan details.",
    typicalStructure: "Infer only from user-provided plan context.",
    stressPattern: "Unknown.",
    adaptationBias: "Use recent training, goals, constraints, and the user's actual plan notes.",
    missedWorkoutGuidance: "Avoid making up missed work unless the user-provided plan context makes the purpose clear.",
    caution: "Do not assume a named-plan framework."
  },
  {
    id: "hal_higdon",
    label: "Hal Higdon",
    variants: ["Novice 1", "Novice 2", "Intermediate 1", "Intermediate 2", "Advanced 1", "Advanced 2"],
    primaryPurpose: "Accessible progression toward race completion or steady improvement.",
    typicalStructure: "Clear weekly layout with gradually progressing long runs; novice variants are simpler, advanced variants add more volume and quality.",
    stressPattern: "Usually moderate and progression-based, with long-run development as the central anchor.",
    adaptationBias: "Keep the plan simple, preserve long-run progression when reasonable, and avoid adding complexity the plan did not ask for.",
    missedWorkoutGuidance: "Usually skip or replace missed easy/support runs; avoid cramming missed work into the next few days.",
    caution: "Variant matters a lot: Novice plans should be treated much more conservatively than Advanced plans."
  },
  {
    id: "jack_daniels",
    label: "Jack Daniels",
    variants: ["2Q", "A", "B", "Elite"],
    primaryPurpose: "Fitness development through workouts with specific physiological purposes.",
    typicalStructure: "Quality sessions built around threshold, interval, repetition, easy, and long-run concepts, often paced by VDOT-style fitness estimates.",
    stressPattern: "Workout purpose matters; 2Q plans concentrate much of the weekly stress into two quality sessions.",
    adaptationBias: "Preserve the purpose of the next key session rather than mechanically preserving exact mileage or pace.",
    missedWorkoutGuidance: "Do not stack quality sessions tightly to make up missed work; downshift, skip, or blend only if recovery spacing remains sensible.",
    caution: "Do not infer exact workout prescriptions without the user's actual plan details."
  },
  {
    id: "pfitzinger",
    label: "Pfitzinger",
    variants: ["18/55", "18/70", "12/55", "12/70"],
    primaryPurpose: "Marathon performance through aerobic volume, specific endurance, and well-placed quality.",
    typicalStructure: "Medium-long runs, long runs, lactate-threshold work, marathon-pace work, recovery runs, and higher weekly mileage than beginner plans.",
    stressPattern: "Cumulative aerobic load with important medium-long and long-run rhythm; workouts sit on top of meaningful volume.",
    adaptationBias: "Protect the long-run/medium-long rhythm and overall load management; avoid compressing missed medium-long or quality sessions.",
    missedWorkoutGuidance: "Usually skip or shorten missed work rather than moving it if it compromises the next medium-long, long, or quality day.",
    caution: "18/70-style variants imply substantially higher durability than 18/55; do not treat them interchangeably."
  },
  {
    id: "hansons",
    label: "Hansons Marathon Method",
    variants: ["Beginner", "Advanced"],
    primaryPurpose: "Marathon readiness through frequent running and cumulative fatigue.",
    typicalStructure: "High-frequency weeks with speed/strength or tempo work, steady easy volume, and long runs that are intentionally not maximal.",
    stressPattern: "Fatigue accumulates across the week; consistency is more central than one heroic long run.",
    adaptationBias: "Preserve frequency and fatigue management; do not over-prioritize making one long run huge.",
    missedWorkoutGuidance: "Avoid cramming because it undermines the cumulative-fatigue logic; resume rhythm or reduce the next quality session.",
    caution: "The plan's long-run cap is intentional; do not automatically recommend adding long-run distance to compensate."
  },
  {
    id: "generic_online",
    label: "Generic online plan",
    variants: ["Runner's World", "Garmin Coach", "app-generated", "watch-generated"],
    primaryPurpose: "Varies: completion, general fitness, race preparation, or adaptive app guidance.",
    typicalStructure: "Often combines easy runs, workouts, and long runs, but details vary widely.",
    stressPattern: "Unknown without pasted plan details.",
    adaptationBias: "Use the user's actual plan text as the source of truth and infer the purpose of each run from labels and placement.",
    missedWorkoutGuidance: "Default to preserving consistency and the next key run rather than making up every missed session.",
    caution: "Do not assume a coherent named-plan philosophy."
  },
  {
    id: "nike_run_club",
    label: "Nike Run Club",
    variants: ["NRC Marathon", "NRC Half Marathon", "NRC 10K", "NRC 5K"],
    primaryPurpose: "Accessible app-guided race preparation with flexible guided run types.",
    typicalStructure: "Recovery runs, speed runs, tempo-style efforts, long runs, and guided runs, often followed flexibly by users.",
    stressPattern: "Moderate structure with a mix of quality and long-run development; adherence often varies.",
    adaptationBias: "Favor consistency, recovery, and preserving the next meaningful workout or long run when reasonable.",
    missedWorkoutGuidance: "Skip or simplify missed support runs; do not turn the plan into a dense make-up schedule.",
    caution: "Many users adapt NRC heavily; the user's stated usage pattern matters more than the official plan."
  },
  {
    id: "first",
    label: "FIRST / Run Less, Run Faster",
    variants: ["Marathon", "Half Marathon", "5K/10K"],
    primaryPurpose: "Race preparation for time-constrained runners through fewer but higher-purpose runs plus cross-training.",
    typicalStructure: "Often three key runs per week, commonly interval, tempo, and long run, supported by cross-training.",
    stressPattern: "Lower run frequency but higher quality density; each run tends to carry more purpose.",
    adaptationBias: "Preserve recovery spacing between hard runs and be careful about adding extra running volume.",
    missedWorkoutGuidance: "A missed key run matters, but making it up can overload the week; choose the most relevant key session or reduce intensity.",
    caution: "Quality density can be risky for soreness-prone runners."
  },
  {
    id: "mcmillan",
    label: "McMillan",
    variants: ["Custom plan", "Level-based plan", "Coach add-on"],
    primaryPurpose: "Fitness- and goal-calibrated training, often using pace zones and race-specific workouts.",
    typicalStructure: "Varies by purchased/custom plan; often includes endurance, stamina, speed, and race-specific phases.",
    stressPattern: "Depends heavily on the specific plan and current fitness calibration.",
    adaptationBias: "Use the user's specific plan notes, workout labels, and recent training response rather than assuming a stock pattern.",
    missedWorkoutGuidance: "Preserve the intended training stimulus if clear; otherwise choose the option that keeps the next key session viable.",
    caution: "Do not infer proprietary/custom details not supplied by the user."
  },
  {
    id: "custom_coach_club",
    label: "Custom coach / club plan",
    variants: ["Private coach", "Club plan", "Boutique group"],
    primaryPurpose: "Determined by the coach/club and the user's stated goals.",
    typicalStructure: "Depends on the plan; may reflect group workout days, coach philosophy, or local race calendar.",
    stressPattern: "Infer from the actual week and recent history.",
    adaptationBias: "Treat the user's written plan context as authoritative and preserve the apparent intent of the coach or club session.",
    missedWorkoutGuidance: "Avoid overriding the coach/club logic unless recent load, soreness, or constraints clearly justify adapting.",
    caution: "If the user has a coach, frame suggestions as options to discuss or use with judgment."
  },
  {
    id: "other_named",
    label: "Other named plan",
    variants: ["Named plan not listed"],
    primaryPurpose: "Depends on the named plan and user details.",
    typicalStructure: "Use user-provided plan name, variant, and pasted details.",
    stressPattern: "Infer from the actual week and recent history.",
    adaptationBias: "Use supplied details and avoid pretending to know the plan if it is not described.",
    missedWorkoutGuidance: "Default to preserving consistency and the next key session unless the plan details say otherwise.",
    caution: "Ask for or rely on pasted plan details when the named plan is unfamiliar."
  },
  {
    id: "custom",
    label: "Custom",
    variants: ["Self-written", "Hybrid", "Informal"],
    primaryPurpose: "Defined by the user's own goals and constraints.",
    typicalStructure: "Defined by the user's description.",
    stressPattern: "Infer from recent activity data and plan notes.",
    adaptationBias: "Treat the custom description as authoritative and reason from recent load, goals, and constraints.",
    missedWorkoutGuidance: "Avoid rigid make-up logic; preserve long-term consistency and the next important training stimulus.",
    caution: "If the custom plan lacks structure, be clear about assumptions."
  }
];

export function getTrainingPlanProfile(id?: TrainingPlanSource) {
  return trainingPlanProfiles.find((profile) => profile.id === id) ?? trainingPlanProfiles[0];
}

export function planKnowledgeGuide(selected?: TrainingPlanSource) {
  const selectedProfile = getTrainingPlanProfile(selected);
  const variantText = selectedProfile.variants?.length
    ? selectedProfile.variants.join(", ")
    : "Not specified";

  return `Selected plan profile: ${selectedProfile.label}
Common variants/examples: ${variantText}
Primary purpose: ${selectedProfile.primaryPurpose}
Typical structure: ${selectedProfile.typicalStructure}
Stress pattern: ${selectedProfile.stressPattern}
Adaptation bias: ${selectedProfile.adaptationBias}
Missed-workout guidance: ${selectedProfile.missedWorkoutGuidance}
Caution: ${selectedProfile.caution}`;
}
