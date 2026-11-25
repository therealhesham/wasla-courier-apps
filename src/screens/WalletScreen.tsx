import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow } from '../theme';
import type { Courier, WalletTransaction } from '../api';

type Props = {
  courier: Courier;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenStatement: () => void;
};

const TYPE_META: Record<WalletTransaction['type'], { label: string; icon: keyof typeof Ionicons.glyphMap; positive: boolean }> = {
  deposit: { label: 'إيداع', icon: 'arrow-down-circle', positive: true },
  withdrawal: { label: 'سحب', icon: 'arrow-up-circle', positive: false },
  order_advance: { label: 'سلفة طلب', icon: 'bag-handle-outline', positive: false },
  order_collection: { label: 'تحصيل طلب', icon: 'cash-outline', positive: true },
  adjustment: { label: 'تسوية', icon: 'construct-outline', positive: true },
};

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

export default function WalletScreen({ courier, refreshing, onRefresh, onOpenStatement }: Props) {
  const transactions = [...(courier.walletTransactions ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const balance = courier.walletBalance ?? 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>المحفظة</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.balanceCard}>
          <Ionicons name="wallet" size={26} color={colors.success} style={{ marginBottom: 6 }} />
          <Text style={styles.balanceLabel}>رصيد المحفظة الحالي</Text>
          <Text style={styles.balanceValue}>{balance.toFixed(0)} ر.س</Text>
        </View>

        <TouchableOpacity style={styles.statementButton} onPress={onOpenStatement} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={16} color={colors.subtext} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statementTitle}>كشف الحساب التفصيلي</Text>
            <Text style={styles.statementSubtitle}>حركات التحصيل والعمولات والتسويات</Text>
          </View>
          <View style={styles.statementIconWrap}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>سجل الحركات</Text>
        {transactions.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>لا توجد حركات بعد</Text>
            <Text style={styles.emptyBody}>ستظهر هنا كل عملية إيداع، سلفة، أو تحصيل مرتبطة بمحفظتك.</Text>
          </View>
        ) : (
          transactions.map((txn) => {
            const meta = TYPE_META[txn.type];
            return (
              <View key={txn.id} style={styles.card}>
                <View style={styles.cardIconWrap}>
                  <Ionicons name={meta.icon} size={17} color={meta.positive ? colors.success : colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{meta.label}{txn.orderNumber ? ` · ${txn.orderNumber}` : ''}</Text>
                  <Text style={styles.cardDate}>{formatDateTime(txn.createdAt)}</Text>
                  {txn.note ? <Text style={styles.cardNote}>{txn.note}</Text> : null}
                </View>
                <Text style={[styles.cardAmount, { color: meta.positive ? colors.success : colors.danger }]}>
                  {meta.positive ? '+' : '-'}{Math.abs(txn.amount).toFixed(0)} ر.س
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'right' },
  list: { paddingHorizontal: 20, paddingBottom: 30 },
  balanceCard: { backgroundColor: colors.successBg, borderRadius: 20, padding: 22, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.successBorder },
  balanceLabel: { color: colors.success, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  balanceValue: { color: colors.success, fontSize: 32, fontWeight: '900' },
  statementButton: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginBottom: 20, ...tintedShadow(colors.text, 0.04) },
  statementIconWrap: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  statementTitle: { fontSize: 13.5, fontWeight: '900', color: colors.text, textAlign: 'right' },
  statementSubtitle: { fontSize: 11, fontWeight: '700', color: colors.subtext, textAlign: 'right', marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: 12 },
  emptyWrap: { alignItems: 'center', marginTop: 10, paddingHorizontal: spacing.lg },
  emptyIconWrap: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 4 },
  emptyBody: { fontSize: 12.5, color: colors.subtext, textAlign: 'center', lineHeight: 18 },
  card: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 10, ...tintedShadow(colors.text, 0.05) },
  cardIconWrap: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.neutralTint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.text, textAlign: 'right' },
  cardDate: { fontSize: 10.5, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 2 },
  cardNote: { fontSize: 10.5, fontWeight: '600', color: colors.textSoft, textAlign: 'right', marginTop: 2 },
  cardAmount: { fontSize: 13, fontWeight: '900' },
});
