import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useConexao } from "../store/AppStore";
import { makeStyles, useTheme } from "../theme";

export function ConnectionChip({ testID = "connection-status-chip" }: { testID?: string }) {
  const { nivel, texto } = useConexao();
  const { colors } = useTheme();
  const s = useStyles();
  const dot = nivel === "ok" ? colors.success : nivel === "instavel" ? colors.warning : colors.error;
  const bg = nivel === "ok" ? colors.successSoft : nivel === "instavel" ? colors.warningSoft : colors.errorSoft;
  const fg = nivel === "ok" ? colors.successText : nivel === "instavel" ? colors.warningText : colors.errorText;
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
  }, [pulse]);
  const anim = useAnimatedStyle(() => ({ opacity: nivel === "ok" ? 1 : pulse.value }));
  return (
    <View testID={testID} style={[s.chip, { backgroundColor: bg }]}>
      <Animated.View style={[s.dot, { backgroundColor: dot }, anim]} />
      <Text style={[s.text, { color: fg }]} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 30, borderRadius: 999, maxWidth: 190 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
}));
