import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import React, { ComponentProps } from "react";
import { ActivityIndicator, Platform, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "../theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export const haptic = (kind: "light" | "success" | "warning" = "light") => {
  if (Platform.OS === "web") return;
  if (kind === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
};

export function Card({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const s = useStyles();
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable testID={testID} onPress={onAction} hitSlop={12}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    primary: [colors.brandPrimary, colors.onBrandPrimary],
    secondary: [colors.brandTertiary, colors.onBrandTertiary],
    danger: [colors.errorSoft, colors.errorText],
    ghost: [colors.surfaceSecondary, colors.onSurface],
  } as const;
  const [bg, fg] = map[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, text, children, testID }: { icon: IconName; title: string; text?: string; children?: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={32} color={colors.brandPrimary} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {children}
    </View>
  );
}

export function InfoRow({ icon, label, value, valueColor, testID, last }: { icon: IconName; label: string; value: string; valueColor?: string; testID?: string; last?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.infoRow, !last && s.infoRowBorder]}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text testID={testID} style={[s.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ScreenHeader({ title, subtitle, right, onBack, testID }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable testID="header-back-button" onPress={onBack} style={s.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.brandPrimary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
        <Text testID={testID} style={[s.headerTitle, onBack && { fontSize: 20 }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  sectionAction: { fontSize: 14, fontWeight: "600", color: c.brandPrimary },
  btn: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnText: { fontSize: 16, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  emptyText: { fontSize: 14, color: c.muted, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 10 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
  infoLabel: { flex: 1, fontSize: 15, color: c.onSurfaceSecondary },
  infoValue: { fontSize: 15, fontWeight: "600", color: c.onSurface, maxWidth: "55%", textAlign: "right" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: c.canvas, borderBottomWidth: 1, borderBottomColor: c.divider },
  backBtn: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
  headerSub: { fontSize: 13, color: c.muted, fontWeight: "500" },
  headerTitle: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
}));
