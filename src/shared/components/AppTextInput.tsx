import { StyleSheet, TextInput as NativeTextInput, type TextInputProps } from "react-native";
import { resolveFont } from "../theme/fontChoices";
import { useTheme } from "../theme/ThemeProvider";

/** A TextInput that follows the font chosen in settings, like the app's Text does. */
export function TextInput({ style, ...props }: TextInputProps) {
  const { fontSelection } = useTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  return <NativeTextInput {...props} style={[flat, resolveFont(flat.fontFamily, fontSelection)]} />;
}
