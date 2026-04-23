// navigation/AppNavigator.js
import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator }     from "@react-navigation/stack";

import DashboardScreen           from "../screens/DashboardScreen";
import FundWalletScreen          from "../screens/FundWalletScreen";
import BuyAirtimeScreen          from "../screens/BuyAirtimeScreen";
import BuyDataScreen             from "../screens/BuyDataScreen";
import ElectricityScreen         from "../screens/ElectricityScreen";
import CableTVScreen             from "../screens/CableTVScreen";
import TransactionHistoryScreen  from "../screens/TransactionHistoryScreen";
import { COLORS } from "../utils/theme";

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

// HomeStack contains all screens reachable from the Dashboard
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard"   component={DashboardScreen} />
      <Stack.Screen name="FundWallet"  component={FundWalletScreen} />
      <Stack.Screen name="BuyAirtime"  component={BuyAirtimeScreen} />
      <Stack.Screen name="BuyData"     component={BuyDataScreen} />
      <Stack.Screen name="Electricity" component={ElectricityScreen} />
      <Stack.Screen name="CableTV"     component={CableTVScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   COLORS.purple,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused, color }) => {
          const icons = { Home: "🏠", History: "📋" };
          return (
            <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
              {icons[route.name]}
            </Text>
          );
        },
      })}
    >
      <Tab.Screen name="Home"    component={HomeStack}                label="Home"    />
      <Tab.Screen name="History" component={TransactionHistoryScreen} label="History" />
    </Tab.Navigator>
  );
}
