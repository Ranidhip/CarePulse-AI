import { useState } from "react";
import { Switch, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, Body, Caption, Secondary } from "../components/Typography";
import LabeledInput from "../components/LabeledInput";
import AppButton from "../components/AppButton";
import { Pressable } from "react-native";
import { api, ApiError } from "../api/client";
import { setSession } from "../lib/storage";
import { signUpSchema, validateOrError } from "../lib/validation";
import { colors, spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function SignUpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    const validation = validateOrError(signUpSchema, {
      full_name: fullName,
      email,
      password,
      age: age.trim() ? Number(age) : undefined,
      contact_number: contactNumber,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const session = await api.signUp({
        email: validation.data.email,
        password: validation.data.password,
        full_name: validation.data.full_name,
        age: validation.data.age,
        contact_number: validation.data.contact_number || undefined,
      });
      await setSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        patientId: session.user.id,
        name: session.user.email,
        email: session.user.email,
      });
      const profile = await api.getProfile();
      await setSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        patientId: profile.id,
        name: profile.name,
        email: profile.email,
      });
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
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
      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl, alignItems: "center" }}>
        <H1 style={{ textAlign: "center" }}>Create Account</H1>
        <Secondary style={{ textAlign: "center", marginTop: spacing.xs }}>
          Set up your CarePulse AI patient account
        </Secondary>
      </View>

      <LabeledInput label="Full name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
      <LabeledInput
        label="Email"
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
        placeholder="At least 8 characters"
      />
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Switch value={showPassword} onValueChange={setShowPassword} />
        <Body style={{ marginLeft: spacing.sm }}>Show password</Body>
      </View>

      <LabeledInput label="Age (optional)" value={age} onChangeText={setAge} keyboardType="number-pad" />
      <LabeledInput
        label="Contact number (optional)"
        value={contactNumber}
        onChangeText={setContactNumber}
        keyboardType="phone-pad"
      />

      <AppButton
        label="Create Account"
        onPress={handleSignUp}
        loading={loading}
        style={{ marginBottom: spacing.md }}
      />

      <Pressable onPress={() => navigation.navigate("SignIn")}>
        <Body style={{ textAlign: "center", textDecorationLine: "underline", marginBottom: spacing.lg }}>
          Already have an account? Sign in
        </Body>
      </Pressable>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.borderDashed,
          borderStyle: "dashed",
          borderRadius: 6,
          padding: spacing.md,
          minHeight: 48,
        }}
      >
        <Caption style={error ? { color: colors.error } : undefined}>
          {error ?? "Validation messages appear here."}
        </Caption>
      </View>
    </Screen>
  );
}
