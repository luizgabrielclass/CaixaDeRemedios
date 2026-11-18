import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "../theme";

type Kind = "ok" | "erro" | "info";
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: Kind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = useStyles();
  const show = useCallback((msg: string, kind: Kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const icon = toast?.kind === "ok" ? "checkmark-circle" : toast?.kind === "erro" ? "alert-circle" : "information-circle";
  const iconColor = toast?.kind === "ok" ? colors.success : toast?.kind === "erro" ? colors.error : colors.info;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View key={toast.id} entering={FadeInDown} exiting={FadeOutDown} pointerEvents="none" style={[s.wrap, { bottom: insets.bottom + 72 }]}>
          <View testID="toast-message" style={s.toast}>
            <Ionicons name={icon} size={20} color={iconColor} />
            <Text style={s.text}>{toast.msg}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 16, right: 16 },
  toast: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surfaceInverse, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  text: { color: c.onSurfaceInverse, fontSize: 14, fontWeight: "600", flex: 1 },
}));
