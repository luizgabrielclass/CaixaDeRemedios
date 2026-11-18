import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import React from "react";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";
import { IconName } from "@/src/components/ui";

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName; sf: string }[] = [
  { name: "index", title: "Início", icon: "home-outline", iconActive: "home", sf: "house.fill" },
  { name: "medicamentos", title: "Remédios", icon: "medkit-outline", iconActive: "medkit", sf: "pills.fill" },
  { name: "agenda", title: "Agenda", icon: "calendar-outline", iconActive: "calendar", sf: "calendar" },
  { name: "historico", title: "Histórico", icon: "time-outline", iconActive: "time", sf: "clock.arrow.circlepath" },
  { name: "caixa", title: "Caixa", icon: "hardware-chip-outline", iconActive: "hardware-chip", sf: "cpu" },
];

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf as any} />
            <NativeTabs.Trigger.Label>{t.title}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.divider, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? t.iconActive : t.icon} size={23} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
