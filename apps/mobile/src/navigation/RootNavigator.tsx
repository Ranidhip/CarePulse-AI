import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SignInScreen from "../screens/SignInScreen";
import HomeScreen from "../screens/HomeScreen";
import MedicationsScreen from "../screens/MedicationsScreen";
import RecordBPScreen from "../screens/RecordBPScreen";
import CheckInStep1Screen from "../screens/CheckInStep1Screen";
import CheckInStep2Screen from "../screens/CheckInStep2Screen";
import CheckInReviewScreen from "../screens/CheckInReviewScreen";
import CheckInSubmittedScreen from "../screens/CheckInSubmittedScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ProfileScreen from "../screens/ProfileScreen";

export type RootStackParamList = {
  SignIn: undefined;
  Home: undefined;
  Medications: undefined;
  RecordBP: undefined;
  CheckInStep1: undefined;
  CheckInStep2: undefined;
  CheckInReview: undefined;
  CheckInSubmitted: undefined;
  History: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator({
  initialRouteName,
}: {
  initialRouteName: keyof RootStackParamList;
}) {
  return (
    <Stack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Medications" component={MedicationsScreen} />
      <Stack.Screen name="RecordBP" component={RecordBPScreen} />
      <Stack.Screen name="CheckInStep1" component={CheckInStep1Screen} />
      <Stack.Screen name="CheckInStep2" component={CheckInStep2Screen} />
      <Stack.Screen name="CheckInReview" component={CheckInReviewScreen} />
      <Stack.Screen name="CheckInSubmitted" component={CheckInSubmittedScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
