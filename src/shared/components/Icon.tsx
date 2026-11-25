import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "../theme/ThemeProvider";
import { materialIcons } from "./materialIcons";

/** Icons keep the names the app always used and are drawn from the Material set (see materialIcons.ts). */
export type IconName = keyof typeof materialIcons;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const { layoutScale: scale } = useTheme();
  return <MaterialCommunityIcons name={materialIcons[name]} size={Math.round(size * scale)} color={color} />;
}
