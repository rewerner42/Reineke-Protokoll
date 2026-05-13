import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout(): JSX.Element {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ title: 'Meetings' }} />
        <Stack.Screen name="record" options={{ title: 'Aufnahme' }} />
        <Stack.Screen name="meeting/[id]" options={{ title: 'Meeting' }} />
        <Stack.Screen name="protocol/[id]" options={{ title: 'Protokoll' }} />
        <Stack.Screen name="settings" options={{ title: 'Einstellungen' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
