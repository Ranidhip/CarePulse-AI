import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Caption, Secondary } from "../components/Typography";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { api, ApiError } from "../api/client";
import { setSession } from "../lib/storage";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function SignInScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      setError("Enter your mobile number or email and password to continue.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { access_token, patient } = await api.signIn(email.trim(), password);
      await setSession({
        accessToken: access_token,
        patientId: patient.id,
        name: patient.name,
        email: patient.email,
      });
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? "Sign in failed. Please try again."
          : e instanceof Error
            ? e.message
            : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.centerBlock}>
        <H1 style={styles.centerText}>CarePulse AI</H1>
        <Secondary style={[styles.centerText, styles.subtitle]}>Patient application</Secondary>
      </View>

      <LabeledInput
        label="Mobile number or email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <LabeledInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
      />

      <View style={styles.switchRow}>
        <Switch value={showPassword} onValueChange={setShowPassword} />
        <Body style={{ marginLeft: spacing.sm }}>Show password</Body>
      </View>

      <AppButton label="Sign In" onPress={handleSignIn} loading={loading} style={{ marginBottom: spacing.md }} />

      <Body style={[styles.centerText, styles.link]}>Forgot Password</Body>

      <View style={styles.validationBox}>
        <Caption style={error ? styles.errorText : undefined}>
          {error ?? "Validation messages appear here."}
        </Caption>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerBlock: { marginTop: spacing.xl, marginBottom: spacing.xl, alignItems: "center" },
  centerText: { textAlign: "center" },
  subtitle: { marginTop: spacing.xs },
  switchRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  link: { textDecorationLine: "underline", marginBottom: spacing.lg },
  validationBox: {
    borderWidth: 1,
    borderColor: colors.borderDashed,
    borderStyle: "dashed",
    borderRadius: 6,
    padding: spacing.md,
    minHeight: 48,
  },
  errorText: { color: colors.error },
});
