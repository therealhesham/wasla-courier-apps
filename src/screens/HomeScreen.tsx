import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, getStatusMeta, radius, spacing, tintedShadow } from '../theme';
import type { Courier, Order } from '../api';
import type { TabKey } from '../components/TabBar';
import EmergencyReportModal from '../components/EmergencyReportModal';
import ComplianceBanner from '../components/ComplianceBanner';
import SyncBanner from '../components/SyncBanner';

const TERMINAL = ['delivered', 'closed', 'cancelled', 'deliveryFailed', 'returned'];

function isToday(dateString?: string) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 17) return 'مساء الخير مبكرًا';
  return 'مساء الخير';
}

type Props = {
  courier: Courier;
  token: string;
  orders: Order[];
  availableOrders: Order[];
  onNavigate: (tab: TabKey) => void;
  onOpenOrder: (order: Order) => void;
  onToggleAvailability: (next: boolean) => Promise<void>;
  onClaimOrder: (orderId: string) => Promise<void>;
  onLogout: () => void;
  onEmergencyReported?: () => void;
  pendingSyncCount?: number;
};

export default function HomeScreen({ courier, token, orders, availableOrders, onNavigate, onOpenOrder, onToggleAvailability, onClaimOrder, onLogout, onEmergencyReported, pendingSyncCount = 0 }: Props) {
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');
  const [emergencyVisible, setEmergencyVisible] = useState(false);
  const isOnline = courier.operationalStatus !== 'offline' && courier.operationalStatus !== 'suspended';

  const stats = useMemo(() => {
    const deliveredToday = orders.filter((o) => TERMINAL.includes(o.status) && (isToday(o.deliveredAt) || isToday(o.closedAt)));
    const earningsToday = deliveredToday.reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const activeOrders = orders.filter((o) => !TERMINAL.includes(o.status));
    return { deliveredCount: deliveredToday.length, earningsToday, activeCount: activeOrders.length };
  }, [orders]);

  const activeOrders = useMemo(
    () => orders.filter((o) => !TERMINAL.includes(o.status)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders],
  );

  const handleToggle = async (value: boolean) => {
    setTogglingAvailability(true);
    try {
      await onToggleAvailability(value);
    } finally {
      setTogglingAvailability(false);
    }
  };

  const handleClaim = async (orderId: string) => {
    setClaimingId(orderId);
    setClaimError('');
    try {
      await onClaimOrder(orderId);
    } catch (err: any) {
      setClaimError(err?.message || 'تعذر استلام الطلب، ربما استلمه سائق آخر.');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greetingForNow()} 👋</Text>
          <Text style={styles.name}>{courier.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setEmergencyVisible(true)} style={styles.emergencyButton}>
          <Ionicons name="warning" size={18} color={colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <EmergencyReportModal
        visible={emergencyVisible}
        token={token}
        onClose={() => setEmergencyVisible(false)}
        onReported={onEmergencyReported}
      />

      <ComplianceBanner courier={courier} />
      <SyncBanner pendingCount={pendingSyncCount} />

      <View style={[styles.availabilityCard, isOnline ? styles.availabilityCardOn : styles.availabilityCardOff]}>
        <View style={styles.availabilityLeft}>
          {togglingAvailability ? (
            <ActivityIndicator color={isOnline ? colors.success : colors.subtext} />
          ) : (
            <Switch
              value={isOnline}
              onValueChange={handleToggle}
              trackColor={{ true: colors.success, false: colors.border }}
              thumbColor="#fff"
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.availabilityTitle, { color: isOnline ? colors.success : colors.subtext }]}>
            {isOnline ? 'متصل — جاهز لاستلام الطلبات' : 'غير متصل الآن'}
          </Text>
          <Text style={styles.availabilitySubtitle}>{isOnline ? 'سيتم إسناد الطلبات القريبة إليك' : 'لن تصلك طلبات جديدة حتى تتصل'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{stats.deliveredCount}</Text>
          <Text style={styles.statLabel}>طلبات اليوم</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <Ionicons name="cash-outline" size={16} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{stats.earningsToday.toFixed(0)} ر.س</Text>
          <Text style={styles.statLabel}>أرباح اليوم</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <Ionicons name="flash-outline" size={16} color={colors.primary} />
          </View>
          <Text style={styles.statValue}>{stats.activeCount}</Text>
          <Text style={styles.statLabel}>طلبات نشطة</Text>
        </View>
      </View>

      <View style={styles.shortcutsRow}>
        <TouchableOpacity style={styles.shortcutCard} onPress={() => onNavigate('orders')} activeOpacity={0.75}>
          <View style={[styles.shortcutIconWrap, { backgroundColor: colors.accentTint }]}>
            <Ionicons name="cube-outline" size={19} color={colors.accent} />
          </View>
          <Text style={styles.shortcutLabel}>كل الطلبات</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shortcutCard} onPress={() => onNavigate('wallet')} activeOpacity={0.75}>
          <View style={[styles.shortcutIconWrap, { backgroundColor: colors.successBg }]}>
            <Ionicons name="wallet-outline" size={19} color={colors.success} />
          </View>
          <Text style={styles.shortcutLabel}>المحفظة</Text>
        </TouchableOpacity>
      </View>

      {availableOrders.length > 0 && (
        <>
          <View style={styles.nearbyHeaderRow}>
            <Text style={styles.sectionTitle}>طلبات قريبة منك</Text>
            <View style={styles.nearbyCountBadge}>
              <Text style={styles.nearbyCountText}>{availableOrders.length}</Text>
            </View>
          </View>
          {claimError ? <Text style={styles.claimErrorText}>{claimError}</Text> : null}
          {availableOrders.map((order) => (
            <View key={order.id} style={styles.nearbyCard}>
              <View style={styles.orderCardTop}>
                <Text style={styles.orderNumber}>{order.orderNumber || order.id}</Text>
                {typeof order.courierDistanceKm === 'number' ? (
                  <View style={styles.distanceBadge}>
                    <Ionicons name="navigate-outline" size={11} color={colors.accent} />
                    <Text style={styles.distanceBadgeText}>
                      {order.courierDistanceKm.toFixed(1)} كم
                      {typeof order.estimatedCourierArrivalMinutes === 'number' ? ` • ${order.estimatedCourierArrivalMinutes} د` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.orderRow}>
                <Ionicons name="storefront-outline" size={13} color={colors.subtext} />
                <Text style={styles.orderText}>{order.restaurantName}</Text>
              </View>
              <View style={styles.orderRow}>
                <Ionicons name="location-outline" size={13} color={colors.subtext} />
                <Text style={styles.orderText} numberOfLines={1}>{order.area} — {order.address}</Text>
              </View>
              <View style={styles.orderCardBottom}>
                <Text style={styles.orderAmount}>{(order.mealAmount + order.deliveryFee).toFixed(0)} ر.س</Text>
                <Text style={styles.orderFee}>عمولتك: {order.deliveryFee} ر.س</Text>
              </View>
              <TouchableOpacity
                style={styles.claimButton}
                onPress={() => handleClaim(order.id)}
                disabled={claimingId === order.id}
                activeOpacity={0.85}
              >
                {claimingId === order.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={17} color="#fff" />
                    <Text style={styles.claimButtonText}>استلم هذا الطلب</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>طلباتي النشطة</Text>
      {activeOrders.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cafe-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد طلبات نشطة الآن</Text>
          <Text style={styles.emptyBody}>{isOnline ? 'ستصلك الطلبات الجديدة تلقائيًا هنا.' : 'اتصل بالشبكة لتبدأ باستلام الطلبات.'}</Text>
        </View>
      ) : (
        activeOrders.map((order) => {
          const meta = getStatusMeta(order.status);
          return (
            <TouchableOpacity key={order.id} style={styles.orderCard} onPress={() => onOpenOrder(order)} activeOpacity={0.8}>
              <View style={styles.orderCardTop}>
                <Text style={styles.orderNumber}>{order.orderNumber || order.id}</Text>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <View style={styles.orderRow}>
                <Ionicons name="storefront-outline" size={13} color={colors.subtext} />
                <Text style={styles.orderText}>{order.restaurantName}</Text>
              </View>
              <View style={styles.orderRow}>
                <Ionicons name="location-outline" size={13} color={colors.subtext} />
                <Text style={styles.orderText} numberOfLines={1}>{order.area} — {order.address}</Text>
              </View>
              <View style={styles.orderCardBottom}>
                <Text style={styles.orderAmount}>{(order.mealAmount + order.deliveryFee).toFixed(0)} ر.س</Text>
                <Text style={styles.orderFee}>عمولتك: {order.deliveryFee} ر.س</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingTop: 60, paddingBottom: spacing.xl },
  header: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: spacing.lg },
  greeting: { fontSize: 13, color: colors.subtext, textAlign: 'right', fontWeight: '600' },
  name: { fontSize: 25, fontWeight: '900', color: colors.text, textAlign: 'right', marginTop: 2 },
  logoutButton: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  emergencyButton: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },

  availabilityCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1 },
  availabilityCardOn: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  availabilityCardOff: { backgroundColor: colors.neutralTint, borderColor: colors.border },
  availabilityLeft: { width: 44, alignItems: 'center' },
  availabilityTitle: { fontSize: 13.5, fontWeight: '900', textAlign: 'right' },
  availabilitySubtitle: { fontSize: 11, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 2 },

  statsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, alignItems: 'center', ...tintedShadow(colors.text, 0.06) },
  statIconWrap: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  statValue: { fontSize: 17, fontWeight: '900', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 10.5, color: colors.subtext, marginTop: 4, fontWeight: '700' },

  shortcutsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.lg },
  shortcutCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.sm + spacing.xs, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  shortcutIconWrap: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  shortcutLabel: { fontSize: 11.5, fontWeight: '800', color: colors.text },

  sectionTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: spacing.sm + spacing.xs },
  emptyWrap: { alignItems: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg },
  emptyIconWrap: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 4 },
  emptyBody: { fontSize: 12.5, color: colors.subtext, textAlign: 'center', lineHeight: 18 },

  nearbyHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: spacing.sm + spacing.xs },
  nearbyCountBadge: { backgroundColor: colors.accent, borderRadius: radius.pill, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  nearbyCountText: { color: '#fff', fontWeight: '900', fontSize: 11.5 },
  claimErrorText: { color: colors.danger, fontWeight: '700', fontSize: 12, textAlign: 'right', marginBottom: spacing.sm },
  nearbyCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.accentTint, ...tintedShadow(colors.accent, 0.08) },
  distanceBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: colors.accentTint, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  distanceBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.accentDark },
  claimButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 11, marginTop: spacing.sm },
  claimButtonText: { color: '#fff', fontWeight: '900', fontSize: 13 },

  orderCard: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12, ...tintedShadow(colors.text, 0.05) },
  orderCardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  orderNumber: { fontWeight: '900', color: colors.text, fontSize: 14 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  orderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 5 },
  orderText: { color: colors.text, fontWeight: '700', fontSize: 12.5, textAlign: 'right', flexShrink: 1 },
  orderCardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  orderAmount: { fontWeight: '900', color: colors.primary, fontSize: 14 },
  orderFee: { color: colors.subtext, fontSize: 11, fontWeight: '700' },
});
