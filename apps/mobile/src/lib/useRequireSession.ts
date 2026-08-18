import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getSession } from "./storage";
import type { PatientSession } from "../types";
import type { RootStackParamList } from "../navigation/RootNavigator";

/** Redirects to SignIn if there's no session. Returns the session once loaded. */
export function useRequireSession(): PatientSession | null {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [session, setSession] = useState<PatientSession | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      if (!s) {
        navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return session ?? null;
}
