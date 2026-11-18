import { Platform } from "react-native";

// NativeTabs (Liquid Glass) apenas no iOS 26+; demais plataformas usam <Tabs> clássico.
export const usesNativeTabs = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
