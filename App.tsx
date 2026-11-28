import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';

import {
  ApiError,
  acceptOrder as apiAcceptOrder,
  claimOrder as apiClaimOrder,
  clearToken,
  completeDelivery as apiCompleteDelivery,
  markDeliveryFailed as apiMarkDeliveryFailed,
  fetchAvailableOrders,
  fetchMe,
  fetchOrders,
  getToken,
  hasSeenOnboarding,
  loginCourier,
  markOnTheWay as apiMarkOnTheWay,
  markOnboardingSeen,
  pickupOrder as apiPickupOrder,
  rejectOrder as apiRejectOrder,
  saveToken,
  setAvailability,
  updateLocation,
  registerPushToken,
} from './src/api';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from './src/backgroundLocationTask';
import { getPushToken, presentLocalAlert, subscribeToPushActivity } from './src/pushNotifications';
import { applyPendingQueue, clearQueue, enqueueAction, flushQueue, getQueue, getQueueLength, isNetworkError } from './src/offlineQueue';
import type { QueuedAction, QueuedActionType } from './src/offlineQueue';
import type { Courier, Order } from './src/api';
import { colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrdersListScreen from './src/screens/OrdersListScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import WalletScreen from './src/screens/WalletScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ViolationsScreen from './src/screens/ViolationsScreen';
import StatementScreen from './src/screens/StatementScreen';
import SupportScreen from './src/screens/SupportScreen';
import TabBar, { TabKey } from './src/components/TabBar';

type OverlayScreen = 'detail' | 'violations' | 'statement' | 'support' | null;

// مهلة قبول الطلب قصيرة، لذلك تُسحب الطلبات كل بضع ثوانٍ وعلى كل الشاشات. بيانات الحساب (المحفظة،
// المخالفات...) أثقل وأقل استعجالًا فتُسحب على فترة أطول.
const ORDERS_POLL_MS = 7000;
const PROFILE_POLL_MS = 30000;
// الخادم يعتبر السائق غير متصل إذا مرّت ٩٠ ثانية بلا نبضة موقع. watchPositionAsync لا يرسل شيئًا
// إذا لم يتحرك السائق ١٥ مترًا، فالسائق الواقف ينتظر طلبًا كان "يختفي" من الإسناد مع أن التطبيق مفتوح.
// لذلك نعيد إرسال آخر موقع معروف كل ٣٠ ثانية حتى لو لم يتحرك.
const LOCATION_HEARTBEAT_MS = 30000;
// إذا وصل إشعار من الخادم خلال هذه المدة فلا داعي لتنبيه محلي مكرر عن نفس الحدث.
const PUSH_DEDUPE_WINDOW_MS = 10000;

const TERMINAL_STATUSES = ['delivered', 'closed', 'cancelled', 'deliveryFailed', 'returned'];

const ACTION_LABELS: Record<QueuedActionType, string> = {
  accept: 'قبول الطلب',
  claim: 'استلام الطلب',
  reject: 'رفض الطلب',
  pickup: 'استلام الطلب من المتجر',
  onTheWay: 'بدء التوصيل',
  complete: 'تسليم الطلب',
  deliveryFailed: 'تسجيل تعذّر التسليم',
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [onboardingSeen, setOnboardingSeen] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [overlay, setOverlay] = useState<OverlayScreen>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [courierLocation, setCourierLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // نسخ مرجعية من الحالة تُقرأ داخل دوال السحب الدوري دون إعادة إنشائها مع كل تغيّر.
  const courierRef = useRef<Courier | null>(null);
  const selectedOrderRef = useRef<Order | null>(null);
  const overlayRef = useRef<OverlayScreen>(null);
  courierRef.current = courier;
  selectedOrderRef.current = selectedOrder;
  overlayRef.current = overlay;

  // رقم تسلسلي لكل سحب للطلبات: أي رد قديم يصل بعد تعديل محلي أحدث منه يُهمل بدل ما يكتب فوقه.
  const ordersSeq = useRef(0);
  // آخر حالة معروفة لكل طلب (null قبل أول تحميل) — لاكتشاف الطلبات الجديدة والملغاة بين سحبين.
  const knownOrders = useRef<Map<string, string> | null>(null);
  const lastPushAt = useRef(0);
  // طلب يرفضه السائق الآن — اختفاؤه من القائمة متوقع فلا يُعرض له تنبيه "سُحب منك".
  const rejectingOrderId = useRef<string | null>(null);
  const ordersRefreshBusy = useRef(false);
  const flushFailures = useRef<{ type: QueuedActionType; orderId: string; message: string }[]>([]);

  // شاشة تفاصيل الطلب تعرض نسخة من الطلب، فتُحدَّث هنا مع كل سحب. وإذا اختفى الطلب من قائمة السائق
  // (سُحب منه بعد انتهاء المهلة أو حُوِّل لسائق آخر) تُغلق الشاشة مع إبلاغه بدل ما يبقى زر القبول ظاهرًا.
  const reconcileSelection = useCallback((latest: Order[]) => {
    const selected = selectedOrderRef.current;
    if (!selected || overlayRef.current !== 'detail') return;
    const fresh = latest.find((item) => item.id === selected.id);
    if (fresh) {
      setSelectedOrder(fresh);
      return;
    }
    setOverlay(null);
    setSelectedOrder(null);
    if (rejectingOrderId.current === selected.id) return;
    Alert.alert(
      'الطلب لم يعد معك',
      `الطلب ${selected.orderNumber || selected.id} سُحب منك أو حُوِّل لسائق آخر.`,
    );
  }, []);

  const announceChanges = useCallback((latest: Order[]) => {
    const previous = knownOrders.current;
    knownOrders.current = new Map(latest.map((item) => [item.id, item.status]));
    if (!previous) return;

    const newlyAssigned = latest.filter(
      (item) => !previous.has(item.id) && !item.courierAcceptedAt && !TERMINAL_STATUSES.includes(item.status),
    );
    if (newlyAssigned.length > 0 && Date.now() - lastPushAt.current > PUSH_DEDUPE_WINDOW_MS) {
      const first = newlyAssigned[0];
      presentLocalAlert(
        newlyAssigned.length === 1 ? 'طلب جديد مسند إليك' : `${newlyAssigned.length} طلبات جديدة مسندة إليك`,
        `${first.restaurantName} — افتح التطبيق لقبول الطلب قبل انتهاء المهلة.`,
      );
    }

    for (const item of latest) {
      const before = previous.get(item.id);
      if (item.status === 'cancelled' && before && before !== 'cancelled') {
        Alert.alert('تم إلغاء الطلب', `الطلب ${item.orderNumber || item.id} أُلغي، لا تكمل توصيله.`);
      }
    }
  }, []);

  const loadOrders = useCallback(async (activeToken: string) => {
    const seq = ++ordersSeq.current;
    const [result, queue] = await Promise.all([fetchOrders(activeToken), getQueue()]);
    if (seq !== ordersSeq.current) return;
    const merged = applyPendingQueue(result, queue, courierRef.current?.id);
    setOrders(merged);
    reconcileSelection(merged);
    announceChanges(merged);
  }, [reconcileSelection, announceChanges]);

  const loadAvailableOrders = useCallback(async (activeToken: string) => {
    const result = await fetchAvailableOrders(activeToken);
    setAvailableOrders(result);
  }, []);

  const refreshOrders = useCallback(async (activeToken: string) => {
    await Promise.all([loadOrders(activeToken), loadAvailableOrders(activeToken)]);
  }, [loadOrders, loadAvailableOrders]);

  const loadProfile = useCallback(async (activeToken: string) => {
    const me = await fetchMe(activeToken);
    courierRef.current = me;
    setCourier(me);
  }, []);

  const loadEverything = useCallback(async (activeToken: string) => {
    await loadProfile(activeToken);
    await refreshOrders(activeToken);
  }, [loadProfile, refreshOrders]);

  const applyOrderUpdate = useCallback((updated: Order) => {
    ordersSeq.current += 1;
    knownOrders.current?.set(updated.id, updated.status);
    setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedOrder((current) => (current && current.id === updated.id ? updated : current));
  }, []);

  // تحديث محلي فوري لحالة الطلب مع وضع علامة "قيد المزامنة" — يُستخدم عندما ينقطع الاتصال أثناء
  // إجراء (استلام/تسليم...)، حتى يستمر السائق بعمله دون انتظار الخادم، ويُرسل الإجراء الفعلي
  // لاحقًا تلقائيًا عبر طابور المزامنة.
  const applyOptimisticStatus = useCallback((orderId: string, status: string) => {
    ordersSeq.current += 1;
    setOrders((current) => current.map((item) => (item.id === orderId ? { ...item, status, pendingSync: true } : item)));
    setSelectedOrder((current) => (current && current.id === orderId ? { ...current, status, pendingSync: true } : current));
  }, []);

  const refreshPendingSyncCount = useCallback(async () => {
    setPendingSyncCount(await getQueueLength());
  }, []);

  const performLogout = useCallback(async () => {
    await stopBackgroundLocationTracking().catch(() => {});
    // الطابور يخص هذا السائق فقط — لو بقي لأُرسلت إجراءاته بتوكن أي سائق يسجّل دخوله بعده على نفس الجهاز.
    await clearQueue();
    await clearToken();
    ordersSeq.current += 1;
    knownOrders.current = null;
    courierRef.current = null;
    setToken(null);
    setCourier(null);
    setOrders([]);
    setAvailableOrders([]);
    setSelectedOrder(null);
    setPendingSyncCount(0);
    setActiveTab('home');
    setOverlay(null);
  }, []);

  // أخطاء السحب الدوري العابرة تُتجاهل وتبقى آخر بيانات محمّلة، إلا انتهاء/إلغاء الجلسة (401):
  // بدون هذا يبقى السائق "داخلًا" على بيانات قديمة للأبد ولا يصله أي طلب.
  const handleRefreshError = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      performLogout().then(() => {
        Alert.alert('انتهت الجلسة', 'يرجى تسجيل الدخول من جديد.');
      });
    }
  }, [performLogout]);

  // ينفّذ عنصرًا واحدًا من طابور المزامنة عبر استدعاء الـ API الفعلي المطابق لنوعه. يُعيد false
  // إذا كان السبب انقطاع الاتصال (لإيقاف المحاولة حتى لا تُنفَّذ العناصر التالية بترتيب خاطئ)،
  // و true في أي حالة أخرى (نجاح، أو خطأ غير شبكي لا فائدة من تكراره — يُزال بدل التعليق للأبد
  // ويُسجَّل في flushFailures ليُبلَّغ به السائق).
  const executeQueuedAction = useCallback(async (action: QueuedAction): Promise<boolean> => {
    if (!token) return false;
    const currentCourierId = courierRef.current?.id;
    if (action.courierId && currentCourierId && action.courierId !== currentCourierId) {
      return true;
    }
    try {
      switch (action.type) {
        case 'accept': {
          const updated = await apiAcceptOrder(token, action.orderId);
          applyOrderUpdate(updated);
          return true;
        }
        case 'reject': {
          await apiRejectOrder(token, action.orderId);
          ordersSeq.current += 1;
          setOrders((current) => current.filter((item) => item.id !== action.orderId));
          return true;
        }
        case 'pickup': {
          const updated = await apiPickupOrder(token, action.orderId, action.payload?.proofUri);
          applyOrderUpdate(updated);
          return true;
        }
        case 'onTheWay': {
          const updated = await apiMarkOnTheWay(token, action.orderId);
          applyOrderUpdate(updated);
          return true;
        }
        case 'complete': {
          const updated = await apiCompleteDelivery(token, action.orderId, action.payload as any);
          applyOrderUpdate(updated);
          return true;
        }
        case 'deliveryFailed': {
          const updated = await apiMarkDeliveryFailed(token, action.orderId, action.payload?.reason, action.payload?.proofUri);
          applyOrderUpdate(updated);
          return true;
        }
        default:
          return true;
      }
    } catch (err) {
      if (isNetworkError(err)) return false;
      // رفض الطلب الذي سُحب أصلًا من السائق ليس مشكلة تستحق تنبيهًا.
      if (action.type !== 'reject') {
        flushFailures.current.push({
          type: action.type,
          orderId: action.orderId,
          message: err instanceof Error ? err.message : 'خطأ غير معروف',
        });
      }
      return true;
    }
  }, [token, applyOrderUpdate]);

  const attemptFlushQueue = useCallback(async () => {
    if (!token) return;
    const { processed } = await flushQueue(executeQueuedAction);
    await refreshPendingSyncCount();

    const failures = flushFailures.current;
    flushFailures.current = [];
    if (failures.length > 0) {
      Alert.alert(
        'إجراء محفوظ لم يُقبل من الخادم',
        failures.map((item) => `• ${ACTION_LABELS[item.type]}: ${item.message}`).join('\n') +
          '\n\nتم تحديث حالة طلباتك من الخادم — راجعها قبل المتابعة.',
      );
    }
    if (processed > 0) {
      loadEverything(token).catch(handleRefreshError);
    }
  }, [token, executeQueuedAction, refreshPendingSyncCount, loadEverything, handleRefreshError]);

  useEffect(() => {
    if (!token) return;
    refreshPendingSyncCount();
    attemptFlushQueue();
  }, [token, refreshPendingSyncCount, attemptFlushQueue]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => { attemptFlushQueue(); }, 20000);
    return () => clearInterval(interval);
  }, [token, attemptFlushQueue]);

  useEffect(() => {
    (async () => {
      const seen = await hasSeenOnboarding();
      setOnboardingSeen(seen);
      const stored = await getToken();
      if (stored) {
        try {
          await loadEverything(stored);
          setToken(stored);
        } catch {
          await clearToken();
        }
      }
      setBooting(false);
    })();
  }, [loadEverything]);

  // تحديث لحظي للطلبات: يعمل على كل الشاشات بما فيها شاشة تفاصيل الطلب. السحب لا يمسّ ما يكتبه
  // السائق في أي فورم (حالة الفورم محلية بالشاشة)، وإيقافه على الشاشات الفرعية كان يجعل الطلب
  // الجديد يُسحب من السائق قبل أن يراه، ويُبقي زر القبول ظاهرًا على طلب لم يعد له.
  const refreshOrdersNow = useCallback(() => {
    if (!token || ordersRefreshBusy.current) return;
    ordersRefreshBusy.current = true;
    refreshOrders(token)
      .catch(handleRefreshError)
      .finally(() => {
        ordersRefreshBusy.current = false;
      });
  }, [token, refreshOrders, handleRefreshError]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refreshOrdersNow();
    }, ORDERS_POLL_MS);
    return () => clearInterval(interval);
  }, [token, refreshOrdersNow]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') loadProfile(token).catch(handleRefreshError);
    }, PROFILE_POLL_MS);
    return () => clearInterval(interval);
  }, [token, loadProfile, handleRefreshError]);

  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attemptFlushQueue();
        loadEverything(token).catch(handleRefreshError);
      }
    });
    return () => subscription.remove();
  }, [token, loadEverything, attemptFlushQueue, handleRefreshError]);

  // أي إشعار يصل والتطبيق مفتوح (أو يضغط عليه السائق) يحدّث الطلبات فورًا بدل انتظار السحب التالي.
  useEffect(() => {
    if (!token) return;
    return subscribeToPushActivity(() => {
      lastPushAt.current = Date.now();
      refreshOrdersNow();
    });
  }, [token, refreshOrdersNow]);

  // بث الموقع الحي: مصدر واحد للموقع على مستوى التطبيق كله (بدل كل شاشة توظّف GPS الخاص بها)،
  // يحدّث الحالة محليًا لعرضها على الخريطة ويرسلها للباك إند في نفس اللحظة عبر updateLocation.
  useEffect(() => {
    if (!token) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    let lastSent: { latitude: number; longitude: number } | null = null;

    const sendLocation = (coords: { latitude: number; longitude: number }) => {
      lastSent = coords;
      updateLocation(token, coords.latitude, coords.longitude).catch(() => {});
    };

    const heartbeat = setInterval(() => {
      if (cancelled || !lastSent || AppState.currentState !== 'active') return;
      sendLocation(lastSent);
    }, LOCATION_HEARTBEAT_MS);

    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationDenied(true);
        return;
      }
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 4000, distanceInterval: 15 },
          (position) => {
            if (cancelled) return;
            const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            setCourierLocation(coords);
            sendLocation(coords);
          },
        );
      } catch {
        setLocationDenied(true);
      }

      // تعطيل مؤقت: التتبع بالخلفية على أندرويد يحتاج إعداد إضافي (صلاحية الإشعارات قبل تشغيل
      // foreground service) بدونه يتسبب بتعطّل التطبيق عند فتح تفاصيل الطلب على بعض الأجهزة.
      // التتبع بالمقدمة (أعلاه) يبقى شغّالًا طول ما التطبيق مفتوح.
      // startBackgroundLocationTracking().catch(() => {});
    })();

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      subscription?.remove();
    };
  }, [token]);

  // تسجيل توكن الإشعارات الفورية — يفشل بصمت إذا لم يكن المشروع مربوطًا بـ EAS أو رُفضت الصلاحية،
  // لأن الإشعارات ميزة إضافية ولا يجب أن توقف تسجيل الدخول.
  useEffect(() => {
    if (!token) return;
    (async () => {
      const pushToken = await getPushToken();
      if (pushToken) {
        registerPushToken(token, pushToken).catch(() => {});
      }
    })();
  }, [token]);

  const handleLogin = async (identifier: string, password: string) => {
    const result = await loginCourier(identifier, password);
    await saveToken(result.token);
    courierRef.current = result.courier;
    setToken(result.token);
    setCourier(result.courier);
    await loadOrders(result.token);
    loadAvailableOrders(result.token).catch(() => {});
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      pendingSyncCount > 0
        ? `لديك ${pendingSyncCount} إجراء لم يُرسل للخادم بعد. تسجيل الخروج الآن سيحذفها نهائيًا. هل تريد المتابعة؟`
        : 'هل تريد تسجيل الخروج من التطبيق؟',
      [
        { text: 'لا', style: 'cancel' },
        { text: 'نعم', style: 'destructive', onPress: () => { performLogout(); } },
      ],
    );
  };

  const handleRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await loadEverything(token);
    } catch (err) {
      // تجاهل أخطاء التحديث العابرة، تبقى آخر بيانات محمّلة
      handleRefreshError(err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleAvailability = async (next: boolean) => {
    if (!token) return;
    const updated = await setAvailability(token, next);
    setCourier(updated);
  };

  // ملاحظة على المزامنة بلا اتصال: القبول و"استلام طلب متاح" (claim) مستثنيان عمدًا من طابور
  // المزامنة. الاستلام سباق مع سائقين آخرين على طلب لم يُسند بعد، والقبول سباق مع مهلة القبول
  // بالخادم: قبول يُرسَل بعد انتهائها يكون الطلب قد حُوِّل لسائق آخر، فلا يصحّ إظهاره "مقبولًا"
  // للسائق وهو لم يصل للخادم. بقية الإجراءات تُحدّث طلبًا مقبولًا من هذا السائق أصلًا فلا خطر من تأخيرها.
  const handleAccept = async (orderId: string) => {
    if (!token) return;
    try {
      const updated = await apiAcceptOrder(token, orderId);
      applyOrderUpdate(updated);
    } catch (err) {
      if (isNetworkError(err)) {
        throw new Error('لا يوجد اتصال بالإنترنت. قبول الطلب يحتاج اتصالًا — أعد المحاولة فور عودة الشبكة.');
      }
      // الخادم رفض القبول (غالبًا الطلب لم يعد مسندًا لهذا السائق) — نحدّث القائمة لتعكس الواقع.
      refreshOrdersNow();
      throw err;
    }
  };

  const handleClaim = async (orderId: string) => {
    if (!token) return;
    const updated = await apiClaimOrder(token, orderId);
    ordersSeq.current += 1;
    knownOrders.current?.set(updated.id, updated.status);
    setAvailableOrders((current) => current.filter((item) => item.id !== orderId));
    setOrders((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
  };

  const handleReject = async (orderId: string) => {
    if (!token) return;
    rejectingOrderId.current = orderId;
    try {
      await apiRejectOrder(token, orderId);
    } catch (err) {
      if (!isNetworkError(err)) {
        rejectingOrderId.current = null;
        throw err;
      }
      await enqueueAction({ type: 'reject', orderId, courierId: courier?.id });
      await refreshPendingSyncCount();
    }
    ordersSeq.current += 1;
    setOrders((current) => current.filter((item) => item.id !== orderId));
  };

  const handlePickup = async (orderId: string, proofUri: string) => {
    if (!token) return;
    try {
      const updated = await apiPickupOrder(token, orderId, proofUri);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'pickup', orderId, courierId: courier?.id, payload: { proofUri } });
      applyOptimisticStatus(orderId, 'pickedUp');
      await refreshPendingSyncCount();
    }
  };

  const handleOnTheWay = async (orderId: string) => {
    if (!token) return;
    try {
      const updated = await apiMarkOnTheWay(token, orderId);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'onTheWay', orderId, courierId: courier?.id });
      applyOptimisticStatus(orderId, 'onTheWay');
      await refreshPendingSyncCount();
    }
  };

  const handleComplete = async (orderId: string, input: { proofUri: string; collectedAmount: number; paymentMethod: 'cash' | 'pos' }) => {
    if (!token) return;
    try {
      const updated = await apiCompleteDelivery(token, orderId, input);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'complete', orderId, courierId: courier?.id, payload: input });
      applyOptimisticStatus(orderId, 'delivered');
      await refreshPendingSyncCount();
    }
  };

  const handleDeliveryFailed = async (orderId: string, input: { reason: string; proofUri: string }) => {
    if (!token) return;
    try {
      const updated = await apiMarkDeliveryFailed(token, orderId, input.reason, input.proofUri);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'deliveryFailed', orderId, courierId: courier?.id, payload: input });
      applyOptimisticStatus(orderId, 'deliveryFailed');
      await refreshPendingSyncCount();
    }
  };

  if (booting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!onboardingSeen) {
    return (
      <OnboardingScreen
        onFinish={() => {
          markOnboardingSeen().catch(() => {});
          setOnboardingSeen(true);
        }}
      />
    );
  }

  if (!token || !courier) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (overlay === 'detail' && selectedOrder) {
    return (
      <OrderDetailScreen
        order={selectedOrder}
        token={token}
        courierLocation={courierLocation}
        locationDenied={locationDenied}
        onBack={() => setOverlay(null)}
        onRefresh={refreshOrdersNow}
        onAccept={handleAccept}
        onReject={handleReject}
        onPickup={handlePickup}
        onOnTheWay={handleOnTheWay}
        onComplete={handleComplete}
        onDeliveryFailed={handleDeliveryFailed}
      />
    );
  }

  if (overlay === 'violations') {
    return (
      <ViolationsScreen
        courier={courier}
        token={token}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onBack={() => setOverlay(null)}
      />
    );
  }

  if (overlay === 'statement') {
    return <StatementScreen token={token} onBack={() => setOverlay(null)} />;
  }

  if (overlay === 'support') {
    return <SupportScreen token={token} onBack={() => setOverlay(null)} />;
  }

  const openOrder = (order: Order) => {
    setSelectedOrder(order);
    setOverlay('detail');
  };

  const activeCount = orders.filter((o) => !TERMINAL_STATUSES.includes(o.status)).length;

  return (
    <View style={styles.appShell}>
      <View style={styles.content}>
        {activeTab === 'home' && (
          <HomeScreen
            courier={courier}
            token={token}
            orders={orders}
            availableOrders={availableOrders}
            onNavigate={setActiveTab}
            onOpenOrder={openOrder}
            onToggleAvailability={handleToggleAvailability}
            onClaimOrder={handleClaim}
            onLogout={handleLogout}
            onEmergencyReported={() => loadEverything(token).catch(handleRefreshError)}
            pendingSyncCount={pendingSyncCount}
          />
        )}
        {activeTab === 'orders' && (
          <OrdersListScreen orders={orders} refreshing={refreshing} onRefresh={handleRefresh} onOpenOrder={openOrder} />
        )}
        {activeTab === 'wallet' && (
          <WalletScreen
            courier={courier}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onOpenStatement={() => setOverlay('statement')}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            courier={courier}
            onLogout={handleLogout}
            onOpenViolations={() => setOverlay('violations')}
            onOpenSupport={() => setOverlay('support')}
          />
        )}
      </View>
      <TabBar active={activeTab} onChange={setActiveTab} badges={{ orders: activeCount || undefined }} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  appShell: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
