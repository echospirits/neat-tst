import { z } from "zod";
export const visitGuideInput = z
  .array(
    z.object({
      accountType: z.enum(["AGENCY", "WHOLESALE"]),
      name: z.string().trim().min(1).max(100),
      questions: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
    }),
  )
  .max(2)
  .refine((v) => new Set(v.map((g) => g.accountType)).size === v.length);
export const defaultVisitGuides = [
  {
    accountType: "AGENCY" as const,
    name: "Agency visit",
    questions: [
      "Check shelf and display availability",
      "Confirm stock or replenishment needs",
      "Agree the next action with the contact",
    ],
  },
  {
    accountType: "WHOLESALE" as const,
    name: "On-premise visit",
    questions: [
      "Review menu and back-bar placement",
      "Ask about reorder timing and staff training",
      "Agree the next action with the buyer",
    ],
  },
];
export function readVisitGuides(preferences: unknown) {
  const parsed = visitGuideInput.safeParse(
    (preferences as { visitGuides?: unknown })?.visitGuides,
  );
  return parsed.success ? parsed.data : defaultVisitGuides;
}
export function captureVisitGuide(
  form: FormData,
  preferences: unknown,
  accountType: string,
) {
  const guide = readVisitGuides(preferences).find(
    (g) => g.accountType === accountType,
  );
  if (!guide || form.get("guideEnabled") !== "on") return {};
  if (form.get("guideSignature") !== JSON.stringify(guide))
    throw Error("Visit guide changed. Reload before saving guide answers.");
  return {
    name: guide.name,
    answers: guide.questions.map((question, index) => ({
      question,
      answer: String(form.get(`guideAnswer${index}`) ?? "")
        .trim()
        .slice(0, 1500),
    })),
  };
}
