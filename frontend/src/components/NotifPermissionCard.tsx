import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";

import { PermState, getPermission, reagendarDoses, requestPermission } from "../services/notifications";
import { useApp } from "../store/AppStore";
import { makeStyles, useTheme } from "../theme";
import { Button } from "./ui";

// Pedido de permissão contextual: explica o benefício antes do pop-up do sistema
// e, se bloqueado, oferece abrir as Configurações.
export function NotifPermissionCard({ alwaysShow }: { alwaysShow?: boolean }) {
  const [perm, setPerm] = useState<PermState | null>(null);
  const { colors } = useTheme();
  const s = useStyles();
  const { agenda } = useApp();
  useFocusEffect(
    useCallback(() => {
      getPermission().then(setPerm);
    }, []),
  );
  if (!perm || perm === "unsupported") {
    return alwaysShow && perm === "unsupported" ? (
      <View testID="notif-permission-card" style={s.box}>
        <Ionicons name="notifications-off-outline" size={22} color={colors.muted} />
        <Text style={[s.text, { flex: 1 }]}>Notificações locais funcionam apenas no celular (não no preview web).</Text>
      </View>
    ) : null;
  }
  if (perm === "granted") {
    return alwaysShow ? (
      <View testID="notif-permission-card" style={s.box}>
        <Ionicons name="notifications" size={22} color={colors.success} />
        <Text style={[s.text, { flex: 1 }]}>Notificações ativas: próxima dose, hora da dose, atraso, confirmação e falhas.</Text>
      </View>
    ) : null;
  }
  const blocked = perm === "blocked";
  return (
    <View testID="notif-permission-card" style={s.box}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Ionicons name="notifications-outline" size={20} color={colors.brandPrimary} />
          <Text style={s.title}>Lembretes também no celular</Text>
        </View>
        <Text style={s.text}>
          {blocked
            ? "As notificações estão bloqueadas. Ative nas configurações para receber avisos de doses e de desconexão da caixa."
            : "Receba avisos da próxima dose, doses atrasadas e quando a caixa ficar offline — complementando o alarme físico."}
        </Text>
        <Button
          testID="notif-permission-button"
          label={blocked ? "Abrir configurações" : "Ativar notificações"}
          variant="secondary"
          icon={blocked ? "settings-outline" : "notifications-outline"}
          onPress={async () => {
            if (blocked) Linking.openSettings();
            else {
              const r = await requestPermission();
              setPerm(r);
              if (r === "granted") reagendarDoses(agenda, Date.now());
            }
          }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  box: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: c.surface, borderRadius: 20, padding: 16, marginTop: 16 },
  title: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  text: { fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 19 },
}));
