import type { IconName } from "./Icon";

export const categoryIcons: Record<string, IconName> = {
  push: "arrow-up-circle-outline",
  pull: "arrow-down-circle-outline",
  legs: "walk-outline",
  core: "shield-outline",
  skill: "sparkles-outline",
  mobility: "body-outline",
  cardio: "heart-outline",
};

export function iconForCategory(category: string): IconName {
  return categoryIcons[category] ?? "barbell-outline";
}
