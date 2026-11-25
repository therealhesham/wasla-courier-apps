import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow, getStatusMeta } from '../theme';
import type { Order } from '../api';

type Props = {
  orders: Order[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenOrder: (order: Order) => void;
};

const TERMINAL = ['delivered', 'closed', 'cancelled', 'deliveryFailed', 'returned'];
const COMPLETED_LIKE = ['delivered', 'closed'];
const CANCELLED_LIKE = ['cancelled', 'deliveryFailed', 'returned'];

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'الكل', icon: 'apps-outline' },
  { key: 'active', label: 'نشطة', icon: 'flash-outline' },
  { key: 'completed', label: 'مكتملة', icon: 'checkmark-done-outline' },
  { key: 'cancelled', label: 'ملغاة', icon: 'close-circle-outline' },
];

function matchesFilter(status: string, filter: FilterKey) {
  if (filter === 'all') return true;
  if (filter === 'active') return !TERMINAL.includes(status);
  if (filter === 'completed') return COMPLETED_LIKE.includes(status);
  return CANCELLED_LIKE.includes(status);
}

type DateFilterKey = 'all' | 'today' | 'yesterday' | 'week' | 'month';

const DATE_FILTERS: { key: DateFilterKey; label: string }[] = [
  { key: 'all', label: 'كل الوقت' },
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
];

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function matchesDateFilter(createdAt: string, filter: DateFilterKey) {
  if (filter === 'all') return true;
  const created = new Date(createdAt);
  const now = new Date();
  const todayStart = startOfDay(now);

  if (filter === 'today') return created >= todayStart;

  if (filter === 'yesterday') {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    return created >= yesterdayStart && created < todayStart;
  }

  if (filter === 'week') {
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return created >= weekStart;
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return created >= monthStart;
}

export default function OrdersListScreen({ orders, refreshing, onRefresh, onOpenOrder }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');

  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = { all: orders.length, active: 0, completed: 0, cancelled: 0 };
    for (const order of orders) {
      if (matchesFilter(order.status, 'active')) counts.active += 1;
      if (matchesFilter(order.status, 'completed')) counts.completed += 1;
      if (matchesFilter(order.status, 'cancelled')) counts.cancelled += 1;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (!matchesFilter(order.status, filter)) return false;
      if (!matchesDateFilter(order.createdAt, dateFilter)) return false;
      if (!q) return true;
      return order.customerName.toLowerCase().includes(q) || order.phone.toLowerCase().includes(q) || (order.orderNumber ?? order.id).toLowerCase().includes(q) || order.restaurantName.toLowerCase().includes(q);
    });
  }, [orders, query, filter, dateFilter]);

  const hasActiveFilters = Boolean(query) || filter !== 'all' || dateFilter !== 'all';

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>الطلبات</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={colors.subtext} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث بالاسم، المتجر، أو رقم الجوال..."
          placeholderTextColor={colors.muted}
          textAlign="right"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={17} color={colors.muted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((item) => {
          const active = item.key === filter;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, active ? styles.filterChipActive : null]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.75}
            >
              <Ionicons name={item.icon} size={13} color={active ? '#fff' : colors.subtext} />
              <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
                {item.label} · {filterCounts[item.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterRow}>
        {DATE_FILTERS.map((item) => {
          const active = item.key === dateFilter;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.dateChip, active ? styles.dateChipActive : null]}
              onPress={() => setDateFilter(item.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.dateChipText, active ? styles.dateChipTextActive : null]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name={hasActiveFilters ? 'search-outline' : 'cube-outline'} size={34} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{hasActiveFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات بعد'}</Text>
            <Text style={styles.emptyBody}>
              {hasActiveFilters ? 'جرّب كلمة بحث أخرى أو غيّر الفلاتر المحددة.' : 'ستظهر هنا كل الطلبات التي تُسند إليك.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = getStatusMeta(item.status);
          return (
            <TouchableOpacity style={styles.card} onPress={() => onOpenOrder(item)} activeOpacity={0.8}>
              <View style={styles.cardTop}>
                <Text style={styles.orderNumber}>{item.orderNumber || item.id}</Text>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>

              <View style={styles.customerRow}>
                <Ionicons name="storefront-outline" size={13} color={colors.subtext} />
                <Text style={styles.customer}>{item.restaurantName}</Text>
              </View>
              <View style={styles.customerRow}>
                <Ionicons name="person-outline" size={13} color={colors.subtext} />
                <Text style={styles.address}>{item.customerName} • {item.phone}</Text>
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.amount}>عمولتك: {item.deliveryFee} ر.س</Text>
                <Text style={styles.area}>{item.area}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'right' },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginHorizontal: 20,
    marginBottom: spacing.sm + spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  filterRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: spacing.xs + 2,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '800', color: colors.subtext },
  filterChipTextActive: { color: '#fff' },
  dateChip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dateChipText: { fontSize: 11.5, fontWeight: '800', color: colors.subtext },
  dateChipTextActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: spacing.xs },
  emptyWrap: { alignItems: 'center', marginTop: 50, paddingHorizontal: spacing.lg },
  emptyIconWrap: { width: 76, height: 76, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  emptyBody: { fontSize: 13, color: colors.subtext, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12, ...tintedShadow(colors.text, 0.05) },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  orderNumber: { fontWeight: '900', color: colors.text, fontSize: 14 },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  customerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 5 },
  customer: { color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'right', flexShrink: 1 },
  address: { color: colors.subtext, fontSize: 12, textAlign: 'right', flexShrink: 1 },
  cardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  amount: { fontWeight: '900', color: colors.primary, fontSize: 13 },
  area: { color: colors.subtext, fontSize: 11, fontWeight: '700' },
});
