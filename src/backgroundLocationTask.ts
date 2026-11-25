import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

import { getToken, updateLocation } from './api';

export const BACKGROUND_LOCATION_TASK = 'wasla-courier-background-location';

// يعمل هذا حتى لو كان التطبيق مغلقًا بالخلفية أو مُقفلًا من قِبل النظام — لذلك يقرأ التوكن من التخزين
// الآمن مباشرة بدل الاعتماد على حالة React، ويتجاهل بصمت أي فشل مؤقت لأن النقطة التالية ستصل بعد قليل.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const { locations } = (data as { locations?: Location.LocationObject[] }) || {};
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  const token = await getToken();
  if (!token) return;

  try {
    await updateLocation(token, latest.coords.latitude, latest.coords.longitude);
  } catch {
    // نتجاهل فشل نقطة واحدة، التالية بعد قليل
  }
});

export async function startBackgroundLocationTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (alreadyStarted) return true;

  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;

  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return false;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 30,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'وصلة - تتبع الموقع نشط',
      notificationBody: 'يشارك التطبيق موقعك مع الإدارة أثناء عملك كسائق.',
    },
  });
  return true;
}

export async function stopBackgroundLocationTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
