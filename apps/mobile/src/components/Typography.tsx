import { StyleSheet, Text, type TextProps } from "react-native";
import { colors, fontSizes } from "../theme";

export function H1(props: TextProps) {
  return <Text {...props} style={[styles.h1, props.style]} />;
}
export function H2(props: TextProps) {
  return <Text {...props} style={[styles.h2, props.style]} />;
}
export function H3(props: TextProps) {
  return <Text {...props} style={[styles.h3, props.style]} />;
}
export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]} />;
}
export function Caption(props: TextProps) {
  return <Text {...props} style={[styles.caption, props.style]} />;
}
export function Secondary(props: TextProps) {
  return <Text {...props} style={[styles.body, styles.secondary, props.style]} />;
}

const styles = StyleSheet.create({
  h1: { fontSize: fontSizes.h1, fontWeight: "700", color: colors.textPrimary },
  h2: { fontSize: fontSizes.h2, fontWeight: "700", color: colors.textPrimary },
  h3: { fontSize: fontSizes.h3, fontWeight: "600", color: colors.textPrimary },
  body: { fontSize: fontSizes.body, color: colors.textPrimary },
  caption: { fontSize: fontSizes.caption, color: colors.textSecondary },
  secondary: { color: colors.textSecondary },
});
