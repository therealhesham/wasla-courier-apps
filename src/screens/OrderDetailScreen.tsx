import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { colors, radius, spacing, tintedShadow, getStatusMeta } from '../theme';
import { getServerNow, uploadPhoto } from '../api';
import type { Order } from '../api';
import LiveMap from '../components/LiveMap';

const EARTH_RADIUS_KM = 6371;
const AVERAGE_SPEED_KMH = 28;
// مطابقة لمهلة قبول الطلب بالباك إند (COURIER_ACCEPTANCE_TIMEOUT_MS) — بعدها يُسحب الطلب تلقائيًا
// من هذا السائق ويُسند لأقرب سائق تالٍ متاح.
const ACCEPTANCE_TIMEOUT_SECONDS = 30;

function useAcceptanceCountdown(assignedAt?: string, active?: boolean) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !assignedAt) {
      setRemainingSeconds(null);
      return;
    }

    // assignedAt وقت الخادم، فنقارنه بساعة الخادم لا بساعة الجوال — وإلا يظهر العدّاد خاطئًا على
    // أي جوال ساعته متقدمة أو متأخرة ولو بثوانٍ.
    const compute = () => {
      const elapsedSeconds = (getServerNow() - new Date(assignedAt).getTime()) / 1000;
      return Math.max(0, Math.ceil(ACCEPTANCE_TIMEOUT_SECONDS - elapsedSeconds));
    };

    setRemainingSeconds(compute());
    const interval = setInterval(() => setRemainingSeconds(compute()), 1000);
    return () => clearInterval(interval);
  }, [assignedAt, active]);

  return remainingSeconds;
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function buildDirectionsUrlFromCoords(latitude?: number, longitude?: number, fallbackQuery?: string) {
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
  }
  const query = encodeURIComponent(fallbackQuery || '');
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildCustomerDirectionsUrl(order: Order) {
  if (order.mapLink) return order.mapLink;
  return buildDirectionsUrlFromCoords(order.customerLatitude, order.customerLongitude, `${order.area} ${order.address}`);
}

function buildRestaurantDirectionsUrl(order: Order) {
  return buildDirectionsUrlFromCoords(order.restaurantLatitude, order.restaurantLongitude, order.restaurantName);
}

const SETTLEMENT_MODE_LABELS: Record<string, string> = {
  courier_collects: 'الدفع عند الاستلام',
  courier_advances: 'تسليف من السائق',
  customer_prepaid: 'مدفوع مسبقًا',
};

const TERMINAL_STATUSES = ['delivered', 'closed', 'cancelled', 'deliveryFailed', 'returned'];
const ISSUE_STATUSES = ['cancelled', 'deliveryFailed', 'returned'];
const ACCEPTED_OR_LATER_STATUSES = ['accepted', 'pickedUp', 'onTheWay'];

const JOURNEY_STEPS: { status: string; label: string; icon: keyof typeof Ionicons.glyphMap; getTime: (order: Order) => string | undefined }[] = [
  { status: 'assigned', label: 'إسناد الطلب', icon: 'document-text-outline', getTime: (o) => o.assignedAt || o.createdAt },
  { status: 'accepted', label: 'تم القبول', icon: 'checkmark-circle-outline', getTime: (o) => o.courierAcceptedAt },
  { status: 'pickedUp', label: 'استلام من المتجر', icon: 'storefront-outline', getTime: (o) => o.pickedUpAt },
  { status: 'onTheWay', label: 'في الطريق للعميل', icon: 'navigate-outline', getTime: (o) => o.onTheWayAt },
  { status: 'delivered', label: 'تم التسليم', icon: 'checkmark-done-outline', getTime: (o) => o.deliveredAt },
];

const JOURNEY_ORDER = ['new', 'preparing', 'readyForPickup', 'assigned', 'accepted', 'pickedUp', 'onTheWay', 'delivered', 'closed'];

type Props = {
  order: Order;
  token: string;
  courierLocation: { latitude: number; longitude: number } | null;
  locationDenied: boolean;
  onBack: () => void;
  // يطلب من التطبيق سحب أحدث حالة للطلب من الخادم فورًا.
  onRefresh?: () => void;
  onAccept: (orderId: string) => Promise<void>;
  onReject: (orderId: string) => Promise<void>;
  onPickup: (orderId: string, proofUri: string) => Promise<void>;
  onOnTheWay: (orderId: string) => Promise<void>;
  onComplete: (orderId: string, input: { proofUri: string; collectedAmount: number; paymentMethod: 'cash' | 'pos' }) => Promise<void>;
  onDeliveryFailed: (orderId: string, input: { reason: string; proofUri: string }) => Promise<void>;
};

function formatDateTime(value?: string) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

function SectionCard({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={15} color={colors.primary} />
        </View>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowValue}>{value}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
  );
}

async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) return null;

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: false })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: false });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

export default function OrderDetailScreen({ order, token, courierLocation, locationDenied, onBack, onRefresh, onAccept, onReject, onPickup, onOnTheWay, onComplete, onDeliveryFailed }: Props) {
  const meta = getStatusMeta(order.status);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [photoPickerVisible, setPhotoPickerVisible] = useState<'pickup' | 'complete' | 'failure' | null>(null);
  const [completeVisible, setCompleteVisible] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const isPrepaid = order.settlementMode === 'customer_prepaid';
  const isAdvanced = order.settlementMode === 'courier_advances';
  const [collectedAmount, setCollectedAmount] = useState(isPrepaid ? '0' : String(order.mealAmount + order.deliveryFee));
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos'>('cash');

  const [failureVisible, setFailureVisible] = useState(false);
  const [failurePhoto, setFailurePhoto] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState('');


  const distanceKm =
    courierLocation && typeof order.customerLatitude === 'number' && typeof order.customerLongitude === 'number'
      ? haversineDistanceKm(courierLocation.latitude, courierLocation.longitude, order.customerLatitude, order.customerLongitude)
      : null;
  const etaMinutes = distanceKm !== null ? Math.max(1, Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60)) : null;

  const restaurantDistanceKm =
    courierLocation && typeof order.restaurantLatitude === 'number' && typeof order.restaurantLongitude === 'number'
      ? haversineDistanceKm(courierLocation.latitude, courierLocation.longitude, order.restaurantLatitude, order.restaurantLongitude)
      : null;
  const restaurantEtaMinutes = restaurantDistanceKm !== null ? Math.max(1, Math.round((restaurantDistanceKm / AVERAGE_SPEED_KMH) * 60)) : null;

  const currentStepIndex = JOURNEY_ORDER.indexOf(order.status);
  const hasIssue = ISSUE_STATUSES.includes(order.status);
  const total = order.mealAmount + order.deliveryFee;

  const beforePickup = ['assigned', 'accepted'].includes(order.status);
  const enRouteToCustomer = ['pickedUp', 'onTheWay'].includes(order.status);
  const showLiveMap = !TERMINAL_STATUSES.includes(order.status) && (beforePickup || enRouteToCustomer);
  const mapDestinationType: 'restaurant' | 'customer' = beforePickup ? 'restaurant' : 'customer';
  const mapDestination = beforePickup
    ? (typeof order.restaurantLatitude === 'number' && typeof order.restaurantLongitude === 'number'
        ? { latitude: order.restaurantLatitude, longitude: order.restaurantLongitude, label: order.restaurantName }
        : null)
    : (typeof order.customerLatitude === 'number' && typeof order.customerLongitude === 'number'
        ? { latitude: order.customerLatitude, longitude: order.customerLongitude, label: order.customerName }
        : null);

  // حالة الطلب نفسها قد تسبق courierAcceptedAt (طلب قيد المزامنة)، فنستبعد الحالات التي تعني أن
  // القبول تم فعلًا حتى لا يظهر زر القبول وزر الاستلام معًا.
  const notAccepted = !order.courierAcceptedAt && !ACCEPTED_OR_LATER_STATUSES.includes(order.status);
  const canAcceptReject = notAccepted && !TERMINAL_STATUSES.includes(order.status);
  const acceptanceSecondsLeft = useAcceptanceCountdown(order.assignedAt, canAcceptReject);

  // عند انتهاء المهلة نسأل الخادم فورًا عن مصير الطلب: إن سُحب من السائق تُغلق الشاشة من App،
  // وإن بقي معه يبقى زر القبول متاحًا — بدل عرض "جاري التحويل" إلى ما لا نهاية بلا تحقق.
  const expiryCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    if (acceptanceSecondsLeft !== 0 || !order.assignedAt) return;
    if (expiryCheckedFor.current === order.assignedAt) return;
    expiryCheckedFor.current = order.assignedAt;
    onRefresh?.();
  }, [acceptanceSecondsLeft, order.assignedAt, onRefresh]);
  const canPickup = order.status === 'accepted';
  const canGoOnTheWay = order.status === 'pickedUp';
  const canComplete = order.status === 'onTheWay';
  const canReportFailure = order.status === 'onTheWay';

  const handleAccept = async () => {
    setActing(true);
    setError('');
    try {
      await onAccept(order.id);
    } catch (err: any) {
      setError(err?.message || 'تعذر قبول الطلب.');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    setError('');
    try {
      await onReject(order.id);
      onBack();
    } catch (err: any) {
      setError(err?.message || 'تعذر رفض الطلب.');
    } finally {
      setActing(false);
    }
  };

  const handlePickPhotoForPickup = async (source: 'camera' | 'library') => {
    setPhotoPickerVisible(null);
    const uri = await pickPhoto(source);
    if (!uri) return;

    setActing(true);
    setError('');
    try {
      const url = await uploadPhoto(token, uri);
      await onPickup(order.id, url);
    } catch (err: any) {
      setError(err?.message || 'تعذر رفع الصورة أو تحديث الحالة.');
    } finally {
      setActing(false);
    }
  };

  const handleOnTheWay = async () => {
    setActing(true);
    setError('');
    try {
      await onOnTheWay(order.id);
    } catch (err: any) {
      setError(err?.message || 'تعذر التحديث.');
    } finally {
      setActing(false);
    }
  };

  const handlePickPhotoForComplete = async (source: 'camera' | 'library') => {
    setPhotoPickerVisible(null);
    const uri = await pickPhoto(source);
    if (!uri) return;
    setCapturedPhoto(uri);
    setCompleteVisible(true);
  };

  const handlePickPhotoForFailure = async (source: 'camera' | 'library') => {
    setPhotoPickerVisible(null);
    const uri = await pickPhoto(source);
    if (!uri) return;
    setFailurePhoto(uri);
    setFailureReason('');
    setFailureVisible(true);
  };

  const handleSubmitFailure = async () => {
    if (!failurePhoto) return;
    if (failureReason.trim().length < 3) {
      setError('يرجى كتابة سبب تعذّر التسليم.');
      return;
    }

    setActing(true);
    setError('');
    try {
      const url = await uploadPhoto(token, failurePhoto);
      await onDeliveryFailed(order.id, { reason: failureReason.trim(), proofUri: url });
      setFailureVisible(false);
      setFailurePhoto(null);
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل حالة الطلب.');
    } finally {
      setActing(false);
    }
  };

  const handleSubmitComplete = async () => {
    if (!capturedPhoto) return;
    const amount = isPrepaid ? 0 : Number(collectedAmount);
    if (!isPrepaid && (!amount || amount < 0)) {
      setError('يرجى إدخال المبلغ المُحصَّل بشكل صحيح.');
      return;
    }

    setActing(true);
    setError('');
    try {
      const url = await uploadPhoto(token, capturedPhoto);
      await onComplete(order.id, { proofUri: url, collectedAmount: amount, paymentMethod });
      setCompleteVisible(false);
      setCapturedPhoto(null);
    } catch (err: any) {
      setError(err?.message || 'تعذر إنهاء الطلب.');
    } finally {
      setActing(false);
    }
  };

  const issueText = order.cancelReason || order.deliveryFailureReason;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.title}>تفاصيل الطلب</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.heroCard}>
        <View style={[styles.heroIconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as any} size={30} color={meta.color} />
        </View>
        <Text style={[styles.heroStatus, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.heroOrderNumber}>{order.orderNumber || order.id}</Text>
        <Text style={styles.heroTime}>{formatDateTime(order.createdAt)}</Text>
      </View>

      {showLiveMap ? (
        <View style={styles.mapCard}>
          <View style={styles.mapCardHeader}>
            <Text style={styles.mapCardTitle}>{beforePickup ? 'مسارك إلى المتجر' : 'مسارك إلى العميل'}</Text>
            <Ionicons name="navigate-circle-outline" size={16} color={colors.accent} />
          </View>
          <LiveMap
            courierLocation={courierLocation}
            destination={mapDestination}
            destinationType={mapDestinationType}
            locationDenied={locationDenied}
          />
        </View>
      ) : null}

      {hasIssue ? (
        <View style={styles.issueCard}>
          <View style={styles.issueHeader}>
            <Ionicons name="alert-circle" size={17} color={colors.danger} />
            <Text style={styles.issueTitle}>هذا الطلب لم يعد نشطًا</Text>
          </View>
          {issueText ? <Text style={styles.issueBody}>{issueText}</Text> : null}
        </View>
      ) : (
        <View style={styles.journeyCard}>
          <Text style={styles.journeyTitle}>مراحل الطلب</Text>
          {JOURNEY_STEPS.map((step, index) => {
            const stepIndex = JOURNEY_ORDER.indexOf(step.status);
            const done = currentStepIndex >= 0 && stepIndex <= currentStepIndex;
            const time = formatDateTime(step.getTime(order));
            return (
              <View key={step.status} style={styles.timelineRow}>
                <View style={styles.timelineTrack}>
                  <View style={[styles.timelineDot, done ? styles.timelineDotDone : null]}>
                    <Ionicons name={step.icon} size={13} color={done ? '#fff' : colors.muted} />
                  </View>
                  {index < JOURNEY_STEPS.length - 1 ? (
                    <View style={[styles.timelineLine, done && stepIndex < currentStepIndex ? styles.timelineLineDone : null]} />
                  ) : null}
                </View>
                <View style={styles.timelineTextWrap}>
                  <Text style={[styles.timelineLabel, done ? styles.timelineLabelDone : null]}>{step.label}</Text>
                  <Text style={styles.timelineTime}>{time || (done ? '—' : 'لم يصل بعد')}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <SectionCard icon="storefront-outline" title="المتجر">
        <InfoRow label="الاسم" value={order.restaurantName} />

        {(restaurantDistanceKm !== null || locationDenied) && (
          <View style={styles.distanceRow}>
            {restaurantDistanceKm !== null ? (
              <>
                <View style={styles.distanceItem}>
                  <Ionicons name="navigate-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.distanceValue, { color: colors.primaryDark }]}>{restaurantDistanceKm.toFixed(1)} كم</Text>
                  <Text style={[styles.distanceLabel, { color: colors.primaryDark }]}>المسافة</Text>
                </View>
                <View style={styles.distanceItem}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text style={[styles.distanceValue, { color: colors.primaryDark }]}>{restaurantEtaMinutes} د</Text>
                  <Text style={[styles.distanceLabel, { color: colors.primaryDark }]}>الوقت المتوقع</Text>
                </View>
              </>
            ) : (
              <Text style={styles.distanceDenied}>فعّل صلاحية الموقع لمعرفة المسافة والوقت المتوقع.</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.storeMapButton} onPress={() => Linking.openURL(buildRestaurantDirectionsUrl(order) as string)}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.mapButtonText}>الذهاب إلى المتجر</Text>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard icon="person-outline" title="العميل">
        <InfoRow label="الاسم" value={order.customerName} />
        <View style={styles.phoneRow}>
          <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${order.phone}`)}>
            <Ionicons name="call" size={15} color={colors.success} />
          </TouchableOpacity>
          <Text style={styles.rowLabel}>الجوال</Text>
          <Text style={[styles.rowValue, { flex: 1 }]}>{order.phone}</Text>
        </View>
        <InfoRow label="المنطقة" value={order.area} />
        <InfoRow label="العنوان" value={order.address} />

        {(distanceKm !== null || locationDenied) && (
          <View style={styles.distanceRow}>
            {distanceKm !== null ? (
              <>
                <View style={styles.distanceItem}>
                  <Ionicons name="navigate-circle-outline" size={16} color={colors.accent} />
                  <Text style={styles.distanceValue}>{distanceKm.toFixed(1)} كم</Text>
                  <Text style={styles.distanceLabel}>المسافة</Text>
                </View>
                <View style={styles.distanceItem}>
                  <Ionicons name="time-outline" size={16} color={colors.accent} />
                  <Text style={styles.distanceValue}>{etaMinutes} د</Text>
                  <Text style={styles.distanceLabel}>الوقت المتوقع</Text>
                </View>
              </>
            ) : (
              <Text style={styles.distanceDenied}>فعّل صلاحية الموقع لمعرفة المسافة والوقت المتوقع.</Text>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.mapButton} onPress={() => Linking.openURL(buildCustomerDirectionsUrl(order) as string)}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.mapButtonText}>الذهاب إلى العنوان</Text>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard icon="cash-outline" title="الدفع">
        {order.settlementMode ? (
          <InfoRow label="طريقة التحصيل" value={SETTLEMENT_MODE_LABELS[order.settlementMode]} />
        ) : null}
        <InfoRow label="قيمة الوجبة" value={`${order.mealAmount} ر.س`} />
        <InfoRow label="عمولتك (رسوم التوصيل)" value={`${order.deliveryFee} ر.س`} />
        <View style={styles.totalRow}>
          <Text style={styles.totalValue}>{isPrepaid ? '0' : total.toFixed(0)} ر.س</Text>
          <Text style={styles.totalLabel}>{isPrepaid ? 'لا يوجد تحصيل مطلوب' : 'إجمالي التحصيل من العميل'}</Text>
        </View>
        {order.collectedAmount ? <InfoRow label="تم تحصيله فعليًا" value={`${order.collectedAmount} ر.س`} /> : null}
        {order.paymentMethodName ? <InfoRow label="طريقة الدفع" value={order.paymentMethodName} /> : null}
      </SectionCard>

      {(order.pickupProofUri || order.deliveryProofUri || order.deliveryFailureProofUri) && (
        <SectionCard icon="camera-outline" title="صور الإثبات">
          <View style={styles.proofRow}>
            {order.pickupProofUri ? (
              <View style={styles.proofItem}>
                <Image source={{ uri: order.pickupProofUri }} style={styles.proofImage} />
                <Text style={styles.proofLabel}>استلام من المتجر</Text>
              </View>
            ) : null}
            {order.deliveryProofUri ? (
              <View style={styles.proofItem}>
                <Image source={{ uri: order.deliveryProofUri }} style={styles.proofImage} />
                <Text style={styles.proofLabel}>تسليم للعميل</Text>
              </View>
            ) : null}
            {order.deliveryFailureProofUri ? (
              <View style={styles.proofItem}>
                <Image source={{ uri: order.deliveryFailureProofUri }} style={styles.proofImage} />
                <Text style={styles.proofLabel}>إثبات تعذّر التسليم</Text>
              </View>
            ) : null}
          </View>
        </SectionCard>
      )}

      {order.notes ? (
        <SectionCard icon="chatbox-ellipses-outline" title="ملاحظات المتجر">
          <Text style={styles.notesText}>{order.notes}</Text>
        </SectionCard>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {(canAcceptReject || canPickup || canGoOnTheWay || canComplete) && (
        <View style={styles.actions}>
          {canAcceptReject && (
            <>
              {acceptanceSecondsLeft !== null && (
                <View
                  style={[
                    styles.countdownBanner,
                    acceptanceSecondsLeft <= 10 ? styles.countdownBannerUrgent : null,
                  ]}
                >
                  <Ionicons
                    name="timer-outline"
                    size={16}
                    color={acceptanceSecondsLeft <= 10 ? colors.danger : colors.warning}
                  />
                  <Text
                    style={[
                      styles.countdownText,
                      acceptanceSecondsLeft <= 10 ? styles.countdownTextUrgent : null,
                    ]}
                  >
                    {acceptanceSecondsLeft > 0
                      ? `لديك ${acceptanceSecondsLeft} ثانية للقبول قبل تحويل الطلب لسائق آخر`
                      : 'انتهت مهلة القبول — قد يُحوَّل الطلب لسائق آخر في أي لحظة'}
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={handleAccept} disabled={acting}>
                {acting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.primaryButtonText}>قبول الطلب</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerButton} onPress={handleReject} disabled={acting}>
                <Ionicons name="close-circle-outline" size={17} color={colors.danger} />
                <Text style={styles.dangerButtonText}>رفض الطلب</Text>
              </TouchableOpacity>
            </>
          )}
          {canPickup && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => setPhotoPickerVisible('pickup')} disabled={acting}>
              {acting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="camera" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>استلمت الطلب من المتجر</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canGoOnTheWay && (
            <TouchableOpacity style={styles.primaryButton} onPress={handleOnTheWay} disabled={acting}>
              {acting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>بدء التوصيل — في الطريق</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canComplete && (
            <TouchableOpacity style={styles.primaryButton} onPress={() => setPhotoPickerVisible('complete')} disabled={acting}>
              {acting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="camera" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>تسليم الطلب للعميل</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canReportFailure && (
            <TouchableOpacity style={styles.dangerButton} onPress={() => setPhotoPickerVisible('failure')} disabled={acting}>
              <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
              <Text style={styles.dangerButtonText}>تعذّر التسليم / رفض العميل</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal visible={photoPickerVisible !== null} transparent animationType="fade" onRequestClose={() => setPhotoPickerVisible(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{photoPickerVisible === 'pickup' ? 'صوّر استلام الطلب من المتجر' : photoPickerVisible === 'complete' ? 'صوّر تسليم الطلب للعميل' : 'صوّر إثبات تعذّر التسليم'}</Text>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => (photoPickerVisible === 'pickup' ? handlePickPhotoForPickup('camera') : photoPickerVisible === 'complete' ? handlePickPhotoForComplete('camera') : handlePickPhotoForFailure('camera'))}
            >
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.pickerOptionText}>التقاط صورة</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => (photoPickerVisible === 'pickup' ? handlePickPhotoForPickup('library') : photoPickerVisible === 'complete' ? handlePickPhotoForComplete('library') : handlePickPhotoForFailure('library'))}
            >
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={styles.pickerOptionText}>اختيار من المعرض</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setPhotoPickerVisible(null)}>
              <Text style={styles.modalCancelText}>تراجع</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={completeVisible} transparent animationType="fade" onRequestClose={() => setCompleteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>تأكيد تسليم الطلب</Text>
            {capturedPhoto ? <Image source={{ uri: capturedPhoto }} style={styles.previewImage} /> : null}

            {isPrepaid ? (
              <View style={styles.settlementNote}>
                <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                <Text style={styles.settlementNoteText}>العميل دفع مسبقًا للمطعم — لا يوجد مبلغ عليك تحصيله، فقط أكّد التسليم.</Text>
              </View>
            ) : (
              <>
                {isAdvanced ? (
                  <View style={styles.settlementNote}>
                    <Ionicons name="swap-horizontal" size={15} color={colors.accent} />
                    <Text style={[styles.settlementNoteText, { color: colors.accentDark }]}>أنت سلّفت هذا المبلغ للمطعم مسبقًا — حصّله من العميل الآن.</Text>
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>المبلغ المُحصَّل من العميل (ر.س)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={collectedAmount}
                  onChangeText={setCollectedAmount}
                  keyboardType="numeric"
                  textAlign="right"
                />

                <Text style={styles.fieldLabel}>طريقة الدفع</Text>
                <View style={styles.paymentRow}>
                  <TouchableOpacity
                    style={[styles.paymentOption, paymentMethod === 'cash' ? styles.paymentOptionActive : null]}
                    onPress={() => setPaymentMethod('cash')}
                  >
                    <Text style={[styles.paymentOptionText, paymentMethod === 'cash' ? styles.paymentOptionTextActive : null]}>نقدي</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentOption, paymentMethod === 'pos' ? styles.paymentOptionActive : null]}
                    onPress={() => setPaymentMethod('pos')}
                  >
                    <Text style={[styles.paymentOptionText, paymentMethod === 'pos' ? styles.paymentOptionTextActive : null]}>شبكة</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelSmall} onPress={() => setCompleteVisible(false)} disabled={acting}>
                <Text style={styles.modalCancelText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSubmitComplete} disabled={acting}>
                {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>تأكيد التسليم</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={failureVisible} transparent animationType="fade" onRequestClose={() => setFailureVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>تسجيل تعذّر التسليم</Text>
            {failurePhoto ? <Image source={{ uri: failurePhoto }} style={styles.previewImage} /> : null}

            <Text style={styles.fieldLabel}>سبب تعذّر التسليم</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={failureReason}
              onChangeText={setFailureReason}
              placeholder="مثال: العميل رفض استلام الطلب عند الوصول"
              placeholderTextColor={colors.muted}
              multiline
              textAlign="right"
            />

            {error ? <Text style={styles.modalError}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelSmall} onPress={() => setFailureVisible(false)} disabled={acting}>
                <Text style={styles.modalCancelText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmDanger} onPress={handleSubmitFailure} disabled={acting}>
                {acting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>تأكيد تعذّر التسليم</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  backButton: { flexDirection: 'row-reverse', alignItems: 'center', width: 60 },
  backText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },

  heroCard: { alignItems: 'center', marginHorizontal: 20, backgroundColor: colors.card, borderRadius: radius.xl, paddingVertical: spacing.lg, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.05) },
  heroIconWrap: { width: 68, height: 68, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  heroStatus: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  heroOrderNumber: { fontSize: 13, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  heroTime: { fontSize: 11.5, fontWeight: '600', color: colors.subtext, marginTop: 4 },

  mapCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.sm + spacing.xs, marginHorizontal: 20, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.05) },
  mapCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, paddingHorizontal: 4 },
  mapCardTitle: { fontSize: 13, fontWeight: '900', color: colors.text },

  issueCard: { backgroundColor: colors.dangerBg, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dangerBorder },
  issueHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  issueTitle: { color: colors.danger, fontWeight: '900', fontSize: 14 },
  issueBody: { color: colors.danger, fontSize: 12.5, fontWeight: '600', textAlign: 'right', lineHeight: 19, opacity: 0.9 },

  journeyCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.04) },
  journeyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: spacing.sm + spacing.xs },
  timelineRow: { flexDirection: 'row-reverse' },
  timelineTrack: { alignItems: 'center', width: 34 },
  timelineDot: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.neutralTint, alignItems: 'center', justifyContent: 'center' },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineLine: { width: 2, flex: 1, minHeight: 24, backgroundColor: colors.neutralTint, marginVertical: 2 },
  timelineLineDone: { backgroundColor: colors.primary },
  timelineTextWrap: { flex: 1, paddingRight: spacing.sm, paddingBottom: spacing.md },
  timelineLabel: { fontSize: 13, fontWeight: '800', color: colors.muted, textAlign: 'right' },
  timelineLabelDone: { color: colors.text },
  timelineTime: { fontSize: 11, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 2 },

  section: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.04) },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  sectionIconWrap: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },

  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.neutralTint },
  rowLabel: { color: colors.subtext, fontSize: 13, fontWeight: '700' },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'left' },

  mapButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  mapButtonText: { color: '#fff', fontWeight: '900', fontSize: 13.5 },
  storeMapButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  distanceRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.sm },
  distanceItem: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: colors.accentTint, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.sm },
  distanceValue: { fontSize: 14, fontWeight: '900', color: colors.accentDark },
  distanceLabel: { fontSize: 10.5, fontWeight: '700', color: colors.accentDark, opacity: 0.75 },
  distanceDenied: { fontSize: 11, fontWeight: '700', color: colors.subtext, textAlign: 'right', marginTop: spacing.sm },

  phoneRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.neutralTint, gap: spacing.xs },
  callButton: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },

  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  totalLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  totalValue: { color: colors.primary, fontSize: 19, fontWeight: '900' },

  proofRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  proofItem: { flex: 1 },
  proofImage: { width: '100%', height: 120, borderRadius: radius.md, backgroundColor: colors.neutralTint },
  proofLabel: { fontSize: 10.5, fontWeight: '700', color: colors.subtext, textAlign: 'center', marginTop: 6 },

  notesText: { color: colors.text, fontSize: 13, fontWeight: '600', textAlign: 'right', lineHeight: 20 },

  errorText: { color: colors.danger, textAlign: 'center', marginTop: 4, marginBottom: spacing.sm, marginHorizontal: 20, fontWeight: '700', fontSize: 13 },
  actions: { marginHorizontal: 20, marginTop: spacing.xs, gap: 12 },
  primaryButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, ...tintedShadow(colors.primary, 0.3) },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  dangerButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.dangerBg, borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: colors.dangerBorder },
  dangerButtonText: { color: colors.danger, fontWeight: '900', fontSize: 15 },

  countdownBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: colors.warningBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.warningBorder },
  countdownBannerUrgent: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  countdownText: { flex: 1, color: colors.warning, fontWeight: '800', fontSize: 12.5, textAlign: 'right' },
  countdownTextUrgent: { color: colors.danger },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: 14 },
  pickerOption: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.neutralTint },
  pickerOptionText: { fontSize: 14, fontWeight: '800', color: colors.text },
  modalCancel: { marginTop: spacing.sm, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.neutralTint },
  modalCancelText: { color: colors.subtext, fontWeight: '800' },

  previewImage: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.neutralTint },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text, textAlign: 'right', marginBottom: 6, marginTop: spacing.xs },
  settlementNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.sm + 2, marginBottom: spacing.sm },
  settlementNoteText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.success, textAlign: 'right', lineHeight: 17 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  modalError: { color: colors.danger, fontSize: 11.5, fontWeight: '700', textAlign: 'right', marginTop: spacing.sm },
  paymentRow: { flexDirection: 'row-reverse', gap: 10 },
  paymentOption: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.card },
  paymentOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  paymentOptionText: { fontWeight: '800', color: colors.text, fontSize: 13 },
  paymentOptionTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row-reverse', gap: 12, marginTop: 16 },
  modalCancelSmall: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.neutralTint },
  modalConfirm: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.primary },
  modalConfirmDanger: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.danger },
  modalConfirmText: { color: '#fff', fontWeight: '800' },
});
