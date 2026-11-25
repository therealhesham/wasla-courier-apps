import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow } from '../theme';
import { fetchPendingSettlement, fetchSettlementHistory, fetchStatement } from '../api';
import type { PendingSettlement, SettlementRecord, Statement } from '../api';

type Props = {
  token: string;
  onBack: () => void;
};

const RANGE_OPTIONS = [
  { label: '7 أيام', days: 7 },
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
];

const ENTRY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; positive: boolean }> = {
  cash_collected: { icon: 'cash-outline', positive: true },
  commission: { icon: 'bicycle-outline', positive: false },
  tip: { icon: 'gift-outline', positive: false },
  penalty: { icon: 'alert-circle-outline', positive: true },
  settlement_payment: { icon: 'checkmark-done-outline', positive: false },
};

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

export default function StatementScreen({ token, onBack }: Props) {
  const [rangeDays, setRangeDays] = useState(30);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [pending, setPending] = useState<PendingSettlement | null>(null);
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async (days: number, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [statementResult, pendingResult, historyResult] = await Promise.all([
        fetchStatement(token, days),
        fetchPendingSettlement(token),
        fetchSettlementHistory(token),
      ]);
      setStatement(statementResult);
      setPending(pendingResult);
      setHistory(historyResult);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل كشف الحساب.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load(rangeDays);
  }, [rangeDays, load]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.title}>كشف الحساب</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(rangeDays, true)} />}
      >
        {pending ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingLabel}>المبلغ المستحق عليك تسليمه الآن</Text>
            <Text style={styles.pendingValue}>{pending.totalCollected.toFixed(0)} ر.س</Text>
            <View style={styles.pendingRow}>
              <View style={styles.pendingItem}>
                <Text style={styles.pendingItemValue}>{pending.ordersCount}</Text>
                <Text style={styles.pendingItemLabel}>طلبات غير مسواة</Text>
              </View>
              <View style={styles.pendingItem}>
                <Text style={[styles.pendingItemValue, { color: colors.success }]}>{pending.netOwedToCourier.toFixed(0)} ر.س</Text>
                <Text style={styles.pendingItemLabel}>أرباحك المستحقة</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.days}
              style={[styles.rangeChip, rangeDays === option.days ? styles.rangeChipActive : null]}
              onPress={() => setRangeDays(option.days)}
            >
              <Text style={[styles.rangeChipText, rangeDays === option.days ? styles.rangeChipTextActive : null]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : statement && statement.entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد حركات في هذه الفترة</Text>
          </View>
        ) : statement ? (
          <>
            <Text style={styles.sectionTitle}>سجل الحركات</Text>
            {statement.entries.slice().reverse().map((entry, index) => {
              const meta = ENTRY_META[entry.type] || { icon: 'ellipse-outline', positive: entry.amount >= 0 };
              return (
                <View key={`${entry.orderId ?? 'settlement'}-${entry.type}-${index}`} style={styles.card}>
                  <View style={styles.cardIconWrap}>
                    <Ionicons name={meta.icon} size={16} color={meta.positive ? colors.danger : colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{entry.label}{entry.orderNumber ? ` · ${entry.orderNumber}` : ''}</Text>
                    <Text style={styles.cardDesc}>{entry.description}</Text>
                    <Text style={styles.cardDate}>{formatDateTime(entry.date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.cardAmount, { color: meta.positive ? colors.danger : colors.success }]}>
                      {entry.amount >= 0 ? '+' : '-'}{Math.abs(entry.amount).toFixed(0)} ر.س
                    </Text>
                    <Text style={styles.cardRunning}>الرصيد: {entry.runningBalance.toFixed(0)} ر.س</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        <TouchableOpacity style={styles.historyToggle} onPress={() => setShowHistory((v) => !v)} activeOpacity={0.8}>
          <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
          <Text style={styles.historyToggleText}>سجل التسويات السابقة ({history.length})</Text>
        </TouchableOpacity>

        {showHistory ? (
          history.length === 0 ? (
            <Text style={styles.emptyBody}>لا توجد تسويات سابقة بعد.</Text>
          ) : (
            history.map((settlement) => (
              <View key={settlement.id} style={styles.settlementCard}>
                <View style={styles.cardTop}>
                  <Text style={styles.settlementAmount}>{settlement.amountHandedOver.toFixed(0)} ر.س</Text>
                  <Text style={styles.cardDate}>{formatDateTime(settlement.createdAt)}</Text>
                </View>
                <Text style={styles.cardDesc}>{settlement.ordersCount} طلب · بواسطة {settlement.settledBy || '—'}</Text>
                {settlement.notes ? <Text style={styles.cardDesc}>{settlement.notes}</Text> : null}
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  backButton: { flexDirection: 'row-reverse', alignItems: 'center', width: 60 },
  backText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },

  list: { paddingHorizontal: 20, paddingBottom: 40 },

  pendingCard: { backgroundColor: colors.primaryTint, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primaryGlow },
  pendingLabel: { color: colors.primaryDark, fontSize: 12.5, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  pendingValue: { color: colors.primaryDark, fontSize: 30, fontWeight: '900' },
  pendingRow: { flexDirection: 'row-reverse', gap: spacing.md, marginTop: spacing.md, width: '100%' },
  pendingItem: { flex: 1, alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 10 },
  pendingItemValue: { fontSize: 15, fontWeight: '900', color: colors.text },
  pendingItemLabel: { fontSize: 10.5, fontWeight: '700', color: colors.subtext, marginTop: 3 },

  rangeRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginBottom: spacing.md },
  rangeChip: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rangeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeChipText: { fontSize: 12, fontWeight: '800', color: colors.subtext },
  rangeChipTextActive: { color: '#fff' },

  sectionTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: spacing.sm },
  errorText: { color: colors.danger, fontWeight: '700', textAlign: 'center', marginTop: 20 },
  emptyWrap: { alignItems: 'center', marginTop: 20, paddingHorizontal: spacing.lg },
  emptyIconWrap: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  emptyBody: { fontSize: 12.5, color: colors.subtext, textAlign: 'center', lineHeight: 18, marginTop: spacing.sm },

  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...tintedShadow(colors.text, 0.05) },
  cardIconWrap: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.neutralTint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text, textAlign: 'right' },
  cardDesc: { fontSize: 11, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 2 },
  cardDate: { fontSize: 10, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 2 },
  cardAmount: { fontSize: 13, fontWeight: '900' },
  cardRunning: { fontSize: 9.5, fontWeight: '700', color: colors.subtext, marginTop: 2 },

  historyToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 12, marginTop: spacing.sm },
  historyToggleText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  settlementCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...tintedShadow(colors.text, 0.04) },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  settlementAmount: { fontSize: 15, fontWeight: '900', color: colors.text },
});
