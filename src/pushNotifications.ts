import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// قناة الطلبات على أندرويد بأعلى أهمية حتى يظهر الإشعار منبثقًا مع صوت — مهلة قبول الطلب قصيرة،
// والأهمية الافتراضية تضع الإشعار بالدرج بدون أي تنبيه ظاهر.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
  });
}

// يتطلب توليد توكن Expo Push مشروعًا مربوطًا بـ EAS (يملك projectId) — بدونه نتجاهل التسجيل بصمت
// بدل ما نكسر تدفق تسجيل الدخول، لأن الإشعارات ميزة إضافية وليست حرجة لعمل التطبيق.
export async function getPushToken(): Promise<string | null> {
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data;
  } catch {
    return null;
  }
}

// يستدعي onActivity كلما وصل إشعار والتطبيق مفتوح، أو ضغط المستخدم على إشعار — حتى تُحدَّث البيانات
// فورًا بدل انتظار دورة السحب التالية. يعيد دالة لإلغاء الاشتراك.
export function subscribeToPushActivity(onActivity: () => void): () => void {
  const received = Notifications.addNotificationReceivedListener(() => onActivity());
  const responded = Notifications.addNotificationResponseReceivedListener(() => onActivity());
  return () => {
    received.remove();
    responded.remove();
  };
}

// تنبيه محلي فوري (صوت + شريط) — يُستخدم عندما يكتشف التطبيق حدثًا مهمًا عبر السحب الدوري ولم يصل
// إشعار من الخادم عنه. يفشل بصمت إذا لم تُمنح صلاحية الإشعارات.
export async function presentLocalAlert(title: string, body: string): Promise<void> {
  try {
    await ensureAndroidChannel();
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {
    // التنبيه إضافة فقط — لا نكسر أي شيء لو فشل
  }
}
