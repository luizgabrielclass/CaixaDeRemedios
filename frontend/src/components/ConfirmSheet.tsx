import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "../theme";
import { Button } from "./ui";

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable testID="confirm-sheet-backdrop" style={s.backdrop} onPress={onClose} />
      <View testID="confirm-sheet" style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.grabber} />
        <Text style={s.title}>{title}</Text>
        <Text style={s.msg}>{message}</Text>
        <Button testID="confirm-sheet-confirm-button" label={confirmLabel} variant={danger ? "danger" : "primary"} onPress={onConfirm} />
        <Button testID="confirm-sheet-cancel-button" label="Voltar" variant="ghost" onPress={onClose} style={{ marginTop: 8 }} />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.surfaceTertiary, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "800", color: c.onSurface, marginBottom: 8 },
  msg: { fontSize: 15, color: c.onSurfaceSecondary, lineHeight: 21, marginBottom: 24 },
}));
