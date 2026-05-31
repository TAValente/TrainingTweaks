import type { TrainingPlanSource } from "./types";

export type TrainingPlanProfile = {
  id: TrainingPlanSource;
  label: string;
  examples?: string;
  guidance: string;
};

export const trainingPlanProfiles: TrainingPlanProfile[] = [
  {
    id: "unknown",
    label: "Not specified",
    guidance:
      "No named plan is selected. Infer only from user-provided plan context and avoid assuming a framework."
  },
  {
    id: "hal_higdon",
    label: "Hal Higdon",
    examples: "Novice 1/2, Intermediate, Advanced",
    guidance:
      "Generally simple, accessible marathon plans with clear weekly structure. Novice plans emphasize completion and gradual long-run progression; advanced versions add more volume and quality. Be cautious about adding complexity or making up missed workouts."
  },
  {
    id: "jack_daniels",
    label: "Jack Daniels",
    examples: "2Q, A/B, Elite",
    guidance:
      "Workout-driven plans using quality sessions, threshold/interval concepts, and VDOT-style pacing. The 2Q marathon structure often concentrates stress in two quality days. When adapting, preserve workout purpose and avoid stacking quality too closely."
  },
  {
    id: "pfitzinger",
    label: "Pfitzinger",
    examples: "18/55, 18/70, 12/55",
    guidance:
      "Intermediate-to-advanced marathon plans built around medium-long runs, long runs, lactate-threshold work, marathon-pace work, and cumulative aerobic volume. Adaptations should respect overall load and avoid compressing missed medium-long or quality work."
  },
  {
    id: "hansons",
    label: "Hansons Marathon Method",
    guidance:
      "High-frequency cumulative-fatigue model with frequent running, workouts, and long runs that are intentionally not maximal. Adaptations should preserve consistency and fatigue management rather than overemphasizing a single long run."
  },
  {
    id: "generic_online",
    label: "Generic online plan",
    examples: "Runner's World, Garmin Coach, app-generated plans",
    guidance:
      "Plans vary widely and may be pace-, time-, or completion-oriented. Use the user's pasted plan details as the source of truth and avoid assuming a named philosophy."
  },
  {
    id: "nike_run_club",
    label: "Nike Run Club",
    examples: "NRC marathon / half marathon plans",
    guidance:
      "App-friendly plan style with guided runs, recovery runs, speed sessions, tempo-style efforts, and long runs. Many users follow it flexibly. Adaptations should favor consistency, recovery, and preserving the next key long run or workout when reasonable."
  },
  {
    id: "first",
    label: "FIRST / Run Less, Run Faster",
    guidance:
      "Low-frequency, quality-focused framework often built around three key runs plus cross-training. Because each run carries more purpose, missed workouts may matter more, but injury/fatigue risk from quality density is also higher."
  },
  {
    id: "mcmillan",
    label: "McMillan",
    guidance:
      "Often individualized or pace-zone based, with workouts tied to race goals and current fitness. Use the user's specific plan notes and recent training data rather than assuming a single stock structure."
  },
  {
    id: "custom_coach_club",
    label: "Custom coach / club plan",
    guidance:
      "Treat the user's written plan context as authoritative. Preserve the apparent intent of the coach or club session when suggesting adaptations."
  },
  {
    id: "other_named",
    label: "Other named plan",
    guidance:
      "Use any plan name or description supplied by the user. Do not pretend to know details that are not provided."
  },
  {
    id: "custom",
    label: "Custom",
    guidance:
      "The user is describing their own plan or hybrid. Treat the selected custom description as authoritative and reason from recent load, goals, and constraints."
  }
];

export function getTrainingPlanProfile(id?: TrainingPlanSource) {
  return trainingPlanProfiles.find((profile) => profile.id === id) ?? trainingPlanProfiles[0];
}

export function planKnowledgeGuide(selected?: TrainingPlanSource) {
  const selectedProfile = getTrainingPlanProfile(selected);
  const planList = trainingPlanProfiles
    .filter((profile) => profile.id !== "unknown")
    .map((profile) => {
      const examples = profile.examples ? ` (${profile.examples})` : "";
      return `- ${profile.label}${examples}: ${profile.guidance}`;
    })
    .join("\n");

  return `Selected plan profile: ${selectedProfile.label}
Selected plan guidance: ${selectedProfile.guidance}

General plan reference:
${planList}`;
}
