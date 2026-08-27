import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import RootNavigator from "./src/navigation/RootNavigator";
import { getSession } from "./src/lib/storage";
import { flushQueue } from "./src/lib/offlineQueue";
import { colors } from "./src/theme";

export default function App() {
  const [initialRoute, setInitialRoute] = useState<"SignIn" | "Home" | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      setInitialRoute(session ? "Home" : "SignIn");
    });
  }, []);

  // App-wide fallback for the offline queue (BP readings / check-ins
  // saved locally in lib/offlineQueue.ts): retry sending them whenever
  // the app comes back to the foreground, not just when Home happens to
  // be the visible screen. An initial attempt also runs on cold start in
  // case something was queued during a previous session.
  useEffect(() => {
    flushQueue();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") flushQueue();
    });
    return () => subscription.remove();
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <RootNavigator initialRouteName={initialRoute} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
