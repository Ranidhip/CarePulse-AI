import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Screen from "../components/Screen";
import { H1, H3, Secondary } from "../components/Typography";
import Card from "../components/Card";
import AppButton from "../components/AppButton";
import BottomNav from "../components/BottomNav";
import { useRequireSession } from "../lib/useRequireSession";
import { clearSession } from "../lib/storage";
import { spacing } from "../theme";
import type { RootStackParamList } from "../navigation/RootNavigator";

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const session = useRequireSession();

  async function handleSignOut() {
    await clearSession();
    navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, padding: spacing.lg }}>
        <H1 style={{ marginBottom: spacing.lg }}>Profile</H1>
        <Card>
          <H3>{session?.name}</H3>
          <Secondary>{session?.email}</Secondary>
        </Card>
        <AppButton label="Sign Out" variant="outlined" onPress={handleSignOut} />
      </View>
      <BottomNav />
    </Screen>
  );
}
