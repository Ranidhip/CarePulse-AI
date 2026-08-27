import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SignInScreen from "../screens/SignInScreen";
import SignUpScreen from "../screens/SignUpScreen";
import HomeScreen from "../screens/HomeScreen";
import MedicationsScreen from "../screens/MedicationsScreen";
import EditMedicationScreen from "../screens/EditMedicationScreen";
import RecordBPScreen from "../screens/RecordBPScreen";
import CheckInStep1Screen from "../screens/CheckInStep1Screen";
import CheckInStep2Screen from "../screens/CheckInStep2Screen";
import CheckInReviewScreen from "../screens/CheckInReviewScreen";
import CheckInSubmittedScreen from "../screens/CheckInSubmittedScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ProfileScreen from "../screens/ProfileScreen";
import type { SupplyBucket } from "../types";

/**
 * What the patient just entered, carried from CheckInReviewScreen into
 * CheckInSubmittedScreen as route params — the server only ever stores
 * supply as a plain boolean (supply_remaining), so the original 4-way
 * bucket the patient actually picked (e.g. "7+ days") would otherwise be
 * lost the moment CheckInReviewScreen clears the local draft. Optional
 * because CheckInSubmitted must still render something reasonable if
 * ever reached without it (e.g. a future deep link).
 */
export type CheckInSubmittedParams = {
  missedDoseCount: number | null;
  supplyBucket: SupplyBucket;
  sideEffectsReported: boolean;
  // Set when the submission couldn't reach the backend and was stored in
  // the offline queue (lib/offlineQueue.ts) instead — there's no
  // server-assigned check-in to fetch yet, so the screen renders a
  // "queued offline" state from these params rather than calling
  // api.getLatestCheckIn().
  queued?: boolean;
  submittedAt?: string;
};

export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  Home: undefined;
  Medications: undefined;
  EditMedication:
    | {
        medicationId?: string;
        initial?: {
          name: string;
          instructions: string;
          scheduled_time: string | null;
          supply_status: string;
          reminder_enabled: boolean;
        };
      }
    | undefined;
  RecordBP: undefined;
  CheckInStep1: undefined;
  CheckInStep2: undefined;
  CheckInReview: undefined;
  CheckInSubmitted: CheckInSubmittedParams | undefined;
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
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Medications" component={MedicationsScreen} />
      <Stack.Screen name="EditMedication" component={EditMedicationScreen} />
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
