import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { colors, radius, spacing } from "../theme";

export default function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, color: colors.textPrimary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    minHeight: 44,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
});
