import { requestRecordingPermissionsAsync, getRecordingPermissionsAsync } from 'expo-audio';

export async function ensureMicrophonePermission(): Promise<boolean> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;
  const next = await requestRecordingPermissionsAsync();
  return next.granted;
}
