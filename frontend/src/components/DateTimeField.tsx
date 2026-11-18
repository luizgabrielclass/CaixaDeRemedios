import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { keyToBr, keyToPickerDate, pickerDateToKey, pickerDateToTime } from "../lib/time";
import { makeStyles, useTheme } from "../theme";
import { Button } from "./ui";

// Campo de data (YYYY-MM-DD) ou hora (HH:mm). Usa o seletor nativo no celular
// e um campo de texto no preview web (onde o seletor nativo não existe).
export function DateTimeField({ mode, value, onChange, testID }: { mode: "date" | "time"; value: string; onChange: (v: string) => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [tmp, setTmp] = useState<Date>(new Date());

  const asDate = () => (mode === "date" ? keyToPickerDate(value) : keyToPickerDate("2026-01-01", value || "08:00"));
  const fromDate = (d: Date) => (mode === "date" ? pickerDateToKey(d) : pickerDateToTime(d));

  if (Platform.OS === "web") {
    const display = mode === "date" ? value.split("-").reverse().join("/") : value;
    return (
      <TextInput
        testID={testID}
        style={s.field}
        value={display}
        placeholder={mode === "date" ? "dd/mm/aaaa" : "hh:mm"}
        placeholderTextColor={colors.muted}
        onChangeText={(t) => {
          if (mode === "date") {
            const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            onChange(m ? `${m[3]}-${m[2]}-${m[1]}` : t.split("/").reverse().join("-"));
          } else onChange(t);
        }}
      />
    );
  }

  return (
    <>
      <Pressable
        testID={testID}
        style={s.field}
        onPress={() => {
          setTmp(asDate());
          setOpen(true);
        }}
      >
        <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={18} color={colors.brandPrimary} />
        <Text style={s.value}>{mode === "date" ? keyToBr(value) : value}</Text>
      </Pressable>
      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={asDate()}
          mode={mode}
          is24Hour
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === "set" && d) onChange(fromDate(d));
          }}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <DateTimePicker value={tmp} mode={mode} display="spinner" locale="pt-BR" is24Hour onChange={(_, d) => d && setTmp(d)} />
            <Button
              testID={`${testID}-confirm`}
              label="Confirmar"
              onPress={() => {
                onChange(fromDate(tmp));
                setOpen(false);
              }}
            />
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  field: { flexDirection: "row", alignItems: "center", gap: 8, height: 50, borderRadius: 12, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
  value: { fontSize: 16, fontWeight: "600", color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
}));
