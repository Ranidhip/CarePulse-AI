import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import RootNavigator from "./src/navigation/RootNavigator";
import { getSession } from "./src/lib/storage";
import { colors } from "./src/theme";

export default function App() {
  const [initialRoute, setInitialRoute] = useState<"SignIn" | "Home" | null>(null);

  useEffect(() => {
    getSession().then((session) => {
      setInitialRoute(session ? "Home" : "SignIn");
    });
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
