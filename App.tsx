import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';

import {
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
import { getPushToken } from './src/pushNotifications';
import { enqueueAction, flushQueue, getQueueLength, isNetworkError } from './src/offlineQueue';
import type { QueuedAction } from './src/offlineQueue';
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

  const loadOrders = useCallback(async (activeToken: string) => {
    const result = await fetchOrders(activeToken);
    setOrders(result);
  }, []);

  const loadAvailableOrders = useCallback(async (activeToken: string) => {
    const result = await fetchAvailableOrders(activeToken);
    setAvailableOrders(result);
  }, []);

  const loadEverything = useCallback(async (activeToken: string) => {
    const me = await fetchMe(activeToken);
    setCourier(me);
    await Promise.all([loadOrders(activeToken), loadAvailableOrders(activeToken)]);
  }, [loadOrders, loadAvailableOrders]);

  const applyOrderUpdate = useCallback((updated: Order) => {
    setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedOrder((current) => (current && current.id === updated.id ? updated : current));
  }, []);

  // تحديث محلي فوري لحالة الطلب مع وضع علامة "قيد المزامنة" — يُستخدم عندما ينقطع الاتصال أثناء
  // إجراء (قبول/استلام/تسليم...)، حتى يستمر السائق بعمله دون انتظار الخادم، ويُرسل الإجراء الفعلي
  // لاحقًا تلقائيًا عبر طابور المزامنة.
  const applyOptimisticStatus = useCallback((orderId: string, status: string) => {
    setOrders((current) => current.map((item) => (item.id === orderId ? { ...item, status, pendingSync: true } : item)));
    setSelectedOrder((current) => (current && current.id === orderId ? { ...current, status, pendingSync: true } : current));
  }, []);

  const refreshPendingSyncCount = useCallback(async () => {
    setPendingSyncCount(await getQueueLength());
  }, []);

  // ينفّذ عنصرًا واحدًا من طابور المزامنة عبر استدعاء الـ API الفعلي المطابق لنوعه. يُعيد false
  // إذا كان السبب انقطاع الاتصال (لإيقاف المحاولة حتى لا تُنفَّذ العناصر التالية بترتيب خاطئ)،
  // و true في أي حالة أخرى (نجاح، أو خطأ غير شبكي لا فائدة من تكراره — يُزال بدل التعليق للأبد).
  const executeQueuedAction = useCallback(async (action: QueuedAction): Promise<boolean> => {
    if (!token) return false;
    try {
      switch (action.type) {
        case 'accept': {
          const updated = await apiAcceptOrder(token, action.orderId);
          applyOrderUpdate(updated);
          return true;
        }
        case 'reject': {
          await apiRejectOrder(token, action.orderId);
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
      return !isNetworkError(err);
    }
  }, [token, applyOrderUpdate]);

  const attemptFlushQueue = useCallback(async () => {
    if (!token) return;
    const { processed } = await flushQueue(executeQueuedAction);
    await refreshPendingSyncCount();
    if (processed > 0) {
      loadEverything(token).catch(() => {});
    }
  }, [token, executeQueuedAction, refreshPendingSyncCount, loadEverything]);

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

  // تحديث لحظي: يعيد جلب الطلبات والطلبات القريبة وحالة السائق كل 15 ثانية طالما لا توجد شاشة فرعية مفتوحة
  // (حتى لا نقاطع السائق وهو يملأ فورم)، بالإضافة إلى تحديث فوري كل مرة يرجع فيها التطبيق من الخلفية.
  const prevOverlay = useRef<OverlayScreen>(null);

  useEffect(() => {
    if (!token || overlay) return;
    const interval = setInterval(() => {
      loadEverything(token).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [token, overlay, loadEverything]);

  useEffect(() => {
    if (!token) return;
    if (prevOverlay.current && !overlay) {
      loadEverything(token).catch(() => {});
    }
    prevOverlay.current = overlay;
  }, [overlay, token, loadEverything]);

  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attemptFlushQueue();
        loadEverything(token).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [token, loadEverything, attemptFlushQueue]);

  // بث الموقع الحي: مصدر واحد للموقع على مستوى التطبيق كله (بدل كل شاشة توظّف GPS الخاص بها)،
  // يحدّث الحالة محليًا لعرضها على الخريطة ويرسلها للباك إند في نفس اللحظة عبر updateLocation.
  useEffect(() => {
    if (!token) return;
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

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
            updateLocation(token, coords.latitude, coords.longitude).catch(() => {});
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
    setToken(result.token);
    setCourier(result.courier);
    await loadOrders(result.token);
  };

  const performLogout = async () => {
    await stopBackgroundLocationTracking().catch(() => {});
    await clearToken();
    setToken(null);
    setCourier(null);
    setOrders([]);
    setActiveTab('home');
    setOverlay(null);
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل تريد تسجيل الخروج من التطبيق؟',
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
    } catch {
      // تجاهل أخطاء التحديث العابرة، تبقى آخر بيانات محمّلة
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleAvailability = async (next: boolean) => {
    if (!token) return;
    const updated = await setAvailability(token, next);
    setCourier(updated);
  };

  // ملاحظة على المزامنة بلا اتصال: "استلام طلب متاح" (claim) مستثناة عمدًا من طابور المزامنة —
  // لأنها تنشئ سباقًا حقيقيًا مع سائقين آخرين على طلب لم يُسند لأحد بعد، بعكس بقية الإجراءات هنا
  // التي تُحدّث طلبًا مُسندًا لهذا السائق أصلاً فلا خطر تعارض من تأخير إرسالها.
  const handleAccept = async (orderId: string) => {
    if (!token) return;
    try {
      const updated = await apiAcceptOrder(token, orderId);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'accept', orderId });
      applyOptimisticStatus(orderId, 'accepted');
      await refreshPendingSyncCount();
    }
  };

  const handleClaim = async (orderId: string) => {
    if (!token) return;
    const updated = await apiClaimOrder(token, orderId);
    setAvailableOrders((current) => current.filter((item) => item.id !== orderId));
    setOrders((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
  };

  const handleReject = async (orderId: string) => {
    if (!token) return;
    try {
      await apiRejectOrder(token, orderId);
      setOrders((current) => current.filter((item) => item.id !== orderId));
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'reject', orderId });
      setOrders((current) => current.filter((item) => item.id !== orderId));
      await refreshPendingSyncCount();
    }
  };

  const handlePickup = async (orderId: string, proofUri: string) => {
    if (!token) return;
    try {
      const updated = await apiPickupOrder(token, orderId, proofUri);
      applyOrderUpdate(updated);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      await enqueueAction({ type: 'pickup', orderId, payload: { proofUri } });
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
      await enqueueAction({ type: 'onTheWay', orderId });
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
      await enqueueAction({ type: 'complete', orderId, payload: input });
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
      await enqueueAction({ type: 'deliveryFailed', orderId, payload: input });
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

  const activeCount = orders.filter((o) => !['delivered', 'closed', 'cancelled', 'deliveryFailed', 'returned'].includes(o.status)).length;

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
            onEmergencyReported={() => loadEverything(token).catch(() => {})}
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
