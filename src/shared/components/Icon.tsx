import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useTheme } from "../theme/ThemeProvider";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const { scale } = useTheme();
  return <Ionicons name={name} size={Math.round(size * scale)} color={color} />;
}
