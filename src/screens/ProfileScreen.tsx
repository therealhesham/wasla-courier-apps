import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow } from '../theme';
import type { Courier } from '../api';

type Props = {
  courier: Courier;
  onLogout: () => void;
  onOpenViolations: () => void;
  onOpenSupport: () => void;
};

const WEEKDAY_LABELS: Record<string, string> = {
  sun: 'الأحد',
  mon: 'الإثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
  sat: 'السبت',
};

const WEEKDAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function formatDays(days: string[]) {
  if (days.length === 7) return 'كل أيام الأسبوع';
  return [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)).map((d) => WEEKDAY_LABELS[d] || d).join('، ');
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowValue}>{value}</Text>
      <View style={styles.rowLabelGroup}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Ionicons name={icon} size={14} color={colors.subtext} />
      </View>
    </View>
  );
}

function ShiftStatusBanner({ shiftStatus }: { shiftStatus: NonNullable<Courier['shiftStatus']> }) {
  let icon: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  let color = colors.success;
  let bg = colors.successBg;
  let border = colors.successBorder;
  let title = 'يمكنك استلام طلبات الآن';
  let subtitle = shiftStatus.activeShift ? `أنت داخل دوامك (${shiftStatus.activeShift.start} - ${shiftStatus.activeShift.end})` : undefined;

  if (shiftStatus.isOnBreak) {
    icon = 'cafe';
    color = colors.warning;
    bg = colors.warningBg;
    border = colors.warningBorder;
    title = 'أنت في بريك الآن';
    subtitle = shiftStatus.activeBreak
      ? `${shiftStatus.activeBreak.label} — حتى ${shiftStatus.activeBreak.end}${shiftStatus.activeBreak.isPaid ? ' (مدفوع)' : ''}`
      : 'لا يمكنك استلام طلبات جديدة حتى ينتهي البريك.';
  } else if (!shiftStatus.isWithinShift) {
    icon = 'moon';
    color = colors.muted;
    bg = colors.neutralTint;
    border = colors.border;
    title = 'أنت خارج أوقات دوامك الآن';
    subtitle = 'لا يمكنك استلام طلبات جديدة حتى يبدأ دوامك التالي.';
  }

  return (
    <View style={[styles.shiftBanner, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.shiftBannerIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.shiftBannerTitle, { color }]}>{title}</Text>
        {subtitle ? <Text style={styles.shiftBannerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export default function ProfileScreen({ courier, onLogout, onOpenViolations, onOpenSupport }: Props) {
  const shiftStatus = courier.shiftStatus;
  const workShifts = courier.workShifts ?? [];
  const noticesCount = (courier.warnings?.length ?? 0) + (courier.violations?.length ?? 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>حسابي</Text>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="person" size={32} color={colors.primary} />
        </View>
        <Text style={styles.heroName}>{courier.name}</Text>
        {courier.companyName ? <Text style={styles.heroCompany}>{courier.companyName}</Text> : <Text style={styles.heroCompany}>سائق مباشر (بدون شركة)</Text>}
      </View>

      {shiftStatus ? <ShiftStatusBanner shiftStatus={shiftStatus} /> : null}

      <TouchableOpacity style={styles.violationsCard} onPress={onOpenSupport} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={16} color={colors.subtext} />
        <View style={{ flex: 1 }}>
          <Text style={styles.violationsTitle}>الدعم الفني</Text>
          <Text style={styles.violationsSubtitle}>راسلنا لأي استفسار أو مشكلة</Text>
        </View>
        <View style={[styles.violationsIconWrap, { backgroundColor: colors.accentTint }]}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.accent} />
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.violationsCard} onPress={onOpenViolations} activeOpacity={0.8}>
        <Ionicons name="chevron-back" size={16} color={colors.subtext} />
        <View style={{ flex: 1 }}>
          <Text style={styles.violationsTitle}>المخالفات والإنذارات</Text>
          <Text style={styles.violationsSubtitle}>{noticesCount > 0 ? `لديك ${noticesCount} سجل، اضغط للمراجعة والتبرير` : 'سجلّك نظيف تمامًا'}</Text>
        </View>
        <View style={[styles.violationsIconWrap, noticesCount > 0 ? { backgroundColor: colors.dangerBg } : { backgroundColor: colors.successBg }]}>
          <Ionicons name="warning-outline" size={18} color={noticesCount > 0 ? colors.danger : colors.success} />
        </View>
      </TouchableOpacity>

      {workShifts.length ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>جدول الدوام</Text>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="time-outline" size={15} color={colors.primary} />
            </View>
          </View>
          {workShifts.map((shift) => (
            <View key={shift.id} style={styles.shiftBlock}>
              <View style={styles.shiftBlockHeader}>
                <View style={[styles.shiftActiveDot, { backgroundColor: shift.isActive ? colors.success : colors.muted }]} />
                <Text style={styles.shiftBlockTitle}>{shift.label}</Text>
              </View>
              <Text style={styles.shiftBlockTime}>{shift.start} - {shift.end}</Text>
              <Text style={styles.shiftBlockDays}>{formatDays(shift.days)}</Text>

              {shift.breaks.length ? (
                <View style={styles.breaksList}>
                  {shift.breaks.map((brk) => (
                    <View key={brk.id} style={styles.breakRow}>
                      <Ionicons name="cafe-outline" size={13} color={colors.subtext} />
                      <Text style={styles.breakText}>
                        {brk.label}: {brk.start} - {brk.end}{brk.isPaid ? ' (مدفوع)' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>معلومات التواصل</Text>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="call-outline" size={15} color={colors.primary} />
          </View>
        </View>
        <InfoRow icon="mail-outline" label="البريد الإلكتروني" value={courier.email} />
        {courier.phone ? <InfoRow icon="call-outline" label="الجوال" value={courier.phone} /> : null}
        <InfoRow icon="location-outline" label="المنطقة" value={courier.area} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المركبة</Text>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="bicycle-outline" size={15} color={colors.primary} />
          </View>
        </View>
        {courier.vehicleType ? <InfoRow icon="car-outline" label="النوع" value={courier.vehicleType} /> : null}
        {courier.vehicleModel ? <InfoRow icon="construct-outline" label="الموديل" value={courier.vehicleModel} /> : null}
        {courier.vehicleColor ? <InfoRow icon="color-palette-outline" label="اللون" value={courier.vehicleColor} /> : null}
        {courier.vehiclePlateNumber ? <InfoRow icon="card-outline" label="رقم اللوحة" value={courier.vehiclePlateNumber} /> : null}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.logoutText}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 40 },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'right' },

  heroCard: { alignItems: 'center', marginHorizontal: 20, backgroundColor: colors.card, borderRadius: radius.xl, paddingVertical: spacing.lg, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.05) },
  heroIconWrap: { width: 68, height: 68, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  heroName: { fontSize: 18, fontWeight: '900', color: colors.text, marginBottom: 4 },
  heroCompany: { fontSize: 12.5, fontWeight: '700', color: colors.subtext },

  section: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.04) },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  sectionIconWrap: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },

  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.neutralTint },
  rowLabelGroup: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  rowLabel: { color: colors.subtext, fontSize: 13, fontWeight: '700' },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1, textAlign: 'left', marginLeft: spacing.sm },

  logoutButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: 16, paddingVertical: 15, marginHorizontal: 20, borderWidth: 1, borderColor: colors.dangerBorder },
  logoutText: { color: colors.danger, fontWeight: '900', fontSize: 14 },

  violationsCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md, ...tintedShadow(colors.text, 0.04) },
  violationsIconWrap: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  violationsTitle: { fontSize: 13.5, fontWeight: '900', color: colors.text, textAlign: 'right' },
  violationsSubtitle: { fontSize: 11, fontWeight: '700', color: colors.subtext, textAlign: 'right', marginTop: 2 },

  shiftBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginHorizontal: 20, marginBottom: spacing.md },
  shiftBannerIconWrap: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  shiftBannerTitle: { fontSize: 14, fontWeight: '900', textAlign: 'right' },
  shiftBannerSubtitle: { fontSize: 12, fontWeight: '700', color: colors.subtext, textAlign: 'right', marginTop: 3 },

  shiftBlock: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.neutralTint },
  shiftBlockHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  shiftActiveDot: { width: 8, height: 8, borderRadius: 4 },
  shiftBlockTitle: { fontSize: 13.5, fontWeight: '900', color: colors.text },
  shiftBlockTime: { fontSize: 13, fontWeight: '800', color: colors.primary, textAlign: 'right', marginTop: 4, fontVariant: ['tabular-nums'] },
  shiftBlockDays: { fontSize: 11.5, fontWeight: '700', color: colors.subtext, textAlign: 'right', marginTop: 2 },
  breaksList: { marginTop: spacing.xs, gap: 4 },
  breakRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  breakText: { fontSize: 11.5, fontWeight: '700', color: colors.subtext, textAlign: 'right' },
});
