import React from "react";
import { Pressable, Text, View } from "react-native";

import { AgendaItem } from "../lib/schedule";
import { fmtDateTime, fmtTime } from "../lib/time";
import { makeStyles, useTheme } from "../theme";
import { StatusBadge, doseStyle } from "./StatusBadge";

export function DoseRow({ item, onPress, showDate, testID }: { item: AgendaItem; onPress?: () => void; showDate?: boolean; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const st = doseStyle(item.status, colors);
  const done = item.status === "TOMADA" || item.status === "CANCELADA";
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <View style={s.timeCol}>
        <Text style={[s.time, done && { color: colors.muted }]}>{fmtTime(item.dose.epoch)}</Text>
      </View>
      <View style={[s.bar, { backgroundColor: item.status === "AGENDADA" ? colors.borderStrong : st.fg }]} />
      <View style={{ flex: 1 }}>
        <Text style={[s.name, item.status === "CANCELADA" && s.strike]} numberOfLines={1}>
          {item.med.nome} <Text style={s.dosage}>{item.med.dosagem}</Text>
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {item.med.quantidade} comprimido(s)
          {showDate ? ` · ${fmtDateTime(item.dose.epoch)}` : ""}
          {item.rec?.confirmadaEm ? ` · aberta ${fmtTime(item.rec.confirmadaEm)}` : ""}
        </Text>
      </View>
      <StatusBadge status={item.status} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: c.surface, minHeight: 60 },
  timeCol: { width: 48 },
  time: { fontSize: 16, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  name: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  dosage: { fontWeight: "500", color: c.muted },
  sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: c.muted },
}));
