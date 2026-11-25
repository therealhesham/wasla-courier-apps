import React, { useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow } from '../theme';
import { submitNoticeJustification } from '../api';
import type { Courier, CourierNotice } from '../api';

type Props = {
  courier: Courier;
  token: string;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
};

type NoticeType = 'warnings' | 'violations';

const JUSTIFICATION_STATUS_META: Record<'pending' | 'approved' | 'rejected', { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'التبرير قيد المراجعة', color: colors.warning, bg: colors.warningBg, icon: 'time-outline' },
  approved: { label: 'تم قبول التبرير', color: colors.success, bg: colors.successBg, icon: 'checkmark-circle' },
  rejected: { label: 'تم رفض التبرير', color: colors.danger, bg: colors.dangerBg, icon: 'close-circle' },
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

export default function ViolationsScreen({ courier, token, refreshing, onRefresh, onBack }: Props) {
  const items: (CourierNotice & { noticeType: NoticeType })[] = [
    ...(courier.violations ?? []).map((item) => ({ ...item, noticeType: 'violations' as const })),
    ...(courier.warnings ?? []).map((item) => ({ ...item, noticeType: 'warnings' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [modalNotice, setModalNotice] = useState<{ id: string; noticeType: NoticeType } | null>(null);
  const [justificationText, setJustificationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const openJustificationModal = (id: string, noticeType: NoticeType) => {
    setModalNotice({ id, noticeType });
    setJustificationText('');
    setError('');
  };

  const handleSubmitJustification = async () => {
    if (!modalNotice) return;
    if (justificationText.trim().length < 5) {
      setError('يرجى كتابة تبرير لا يقل عن 5 أحرف.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitNoticeJustification(token, modalNotice.noticeType, modalNotice.id, justificationText.trim());
      setModalNotice(null);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'تعذر إرسال التبرير.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backText}>رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.title}>المخالفات والإنذارات</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={34} color={colors.success} />
            </View>
            <Text style={styles.emptyTitle}>سجلّك نظيف تمامًا</Text>
            <Text style={styles.emptyBody}>لا توجد أي مخالفات أو إنذارات مسجّلة عليك حتى الآن.</Text>
          </View>
        ) : (
          items.map((notice) => {
            const statusMeta = notice.justificationStatus ? JUSTIFICATION_STATUS_META[notice.justificationStatus] : null;
            const canJustify = Boolean(notice.id) && (!notice.justificationStatus || notice.justificationStatus === 'rejected');
            const isViolation = notice.noticeType === 'violations';
            return (
              <View key={`${notice.noticeType}-${notice.id ?? notice.createdAt}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.noticeTitle}>{notice.title}</Text>
                  <View style={[styles.badge, isViolation ? styles.badgeViolation : styles.badgeWarning]}>
                    <Text style={[styles.badgeText, isViolation ? styles.badgeTextViolation : styles.badgeTextWarning]}>
                      {isViolation ? 'مخالفة' : 'إنذار'}
                    </Text>
                  </View>
                </View>
                {notice.category ? <Text style={styles.noticeCategory}>{notice.category}</Text> : null}
                {notice.note ? <Text style={styles.noticeNote}>{notice.note}</Text> : null}
                {notice.relatedOrderLabel ? (
                  <View style={styles.orderRow}>
                    <Ionicons name="receipt-outline" size={12} color={colors.subtext} />
                    <Text style={styles.orderRowText}>{notice.relatedOrderLabel}</Text>
                  </View>
                ) : null}
                <Text style={styles.noticeDate}>{formatDate(notice.createdAt)}</Text>

                {statusMeta ? (
                  <View style={[styles.statusBox, { backgroundColor: statusMeta.bg }]}>
                    <View style={styles.statusHeader}>
                      <Ionicons name={statusMeta.icon} size={14} color={statusMeta.color} />
                      <Text style={[styles.statusLabel, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                    {notice.justification ? <Text style={styles.statusJustification}>{notice.justification}</Text> : null}
                    {notice.justificationDecisionNote ? (
                      <Text style={styles.statusDecisionNote}>ملاحظة الإدارة: {notice.justificationDecisionNote}</Text>
                    ) : null}
                  </View>
                ) : null}

                {canJustify ? (
                  <TouchableOpacity
                    style={styles.justifyButton}
                    onPress={() => openJustificationModal(notice.id as string, notice.noticeType)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.primary} />
                    <Text style={styles.justifyButtonText}>{notice.justificationStatus === 'rejected' ? 'إعادة تقديم تبرير' : 'تقديم تبرير'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalNotice !== null} transparent animationType="fade" onRequestClose={() => setModalNotice(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>تقديم تبرير</Text>
            <Text style={styles.modalSubtitle}>سيصل تبريرك مباشرة لمسؤول المنصة الذي سيراجعه ويقرر بشأنه.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="اشرح سبب اعتراضك..."
              placeholderTextColor={colors.muted}
              value={justificationText}
              onChangeText={setJustificationText}
              multiline
              textAlign="right"
            />
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setModalNotice(null)} disabled={submitting}>
                <Text style={styles.modalCancelText}>تراجع</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleSubmitJustification} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>إرسال التبرير</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  backButton: { flexDirection: 'row-reverse', alignItems: 'center', width: 60 },
  backText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },

  list: { paddingHorizontal: 20, paddingBottom: 30 },
  emptyWrap: { alignItems: 'center', marginTop: 50, paddingHorizontal: spacing.lg },
  emptyIconWrap: { width: 76, height: 76, borderRadius: radius.pill, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  emptyBody: { fontSize: 13, color: colors.subtext, textAlign: 'center', lineHeight: 20 },

  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12, ...tintedShadow(colors.text, 0.05) },
  cardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  noticeTitle: { fontWeight: '900', color: colors.text, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeViolation: { backgroundColor: colors.dangerBg },
  badgeWarning: { backgroundColor: colors.warningBg },
  badgeText: { fontSize: 11, fontWeight: '800' },
  badgeTextViolation: { color: colors.danger },
  badgeTextWarning: { color: colors.warning },
  noticeCategory: { color: colors.subtext, fontSize: 11.5, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  noticeNote: { color: colors.text, fontSize: 12.5, fontWeight: '600', textAlign: 'right', lineHeight: 19, marginBottom: 6 },
  orderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginBottom: 4 },
  orderRowText: { color: colors.subtext, fontSize: 11, fontWeight: '700' },
  noticeDate: { color: colors.subtext, fontSize: 11, fontWeight: '600', textAlign: 'right' },

  statusBox: { marginTop: spacing.sm + 2, borderRadius: radius.md, padding: spacing.sm + 2 },
  statusHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginBottom: 4 },
  statusLabel: { fontSize: 12, fontWeight: '800' },
  statusJustification: { fontSize: 11.5, fontWeight: '600', color: colors.text, textAlign: 'right', lineHeight: 17 },
  statusDecisionNote: { fontSize: 10.5, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginTop: 4 },

  justifyButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.sm + 2, backgroundColor: colors.primaryTint, borderRadius: radius.md, paddingVertical: 10 },
  justifyButtonText: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.card, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, textAlign: 'right', marginBottom: 6 },
  modalSubtitle: { fontSize: 12, fontWeight: '600', color: colors.subtext, textAlign: 'right', marginBottom: spacing.sm + 2, lineHeight: 17 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, minHeight: 100, textAlignVertical: 'top', color: colors.text, fontSize: 14 },
  modalError: { color: colors.danger, fontSize: 11.5, fontWeight: '700', textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row-reverse', gap: 12, marginTop: 16 },
  modalCancel: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.neutralTint },
  modalCancelText: { color: colors.subtext, fontWeight: '800' },
  modalConfirm: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: colors.primary },
  modalConfirmText: { color: '#fff', fontWeight: '800' },
});
