import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../theme';
import type { Courier } from '../api';

type Props = {
  courier: Courier;
};

export default function ComplianceBanner({ courier }: Props) {
  const suspended = Boolean(courier.complianceSuspended);
  const expiringItems = (courier.documents || []).filter(
    (item) => item.requiresExpiry && item.status === 'expiring_soon',
  );

  if (!suspended && !expiringItems.length) return null;

  if (suspended) {
    return (
      <View style={[styles.banner, styles.dangerBanner]}>
        <Ionicons name="alert-circle" size={20} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dangerTitle}>حسابك موقوف مؤقتًا</Text>
          <Text style={styles.dangerText}>
            {courier.complianceSuspensionReason || 'يوجد مستند إلزامي منتهي الصلاحية. تواصل مع الدعم لتحديثه.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.warningBanner]}>
      <Ionicons name="time-outline" size={20} color={colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={styles.warningTitle}>مستندات تقترب من الانتهاء</Text>
        <Text style={styles.warningText}>
          {expiringItems.map((item) => `${item.label} (${item.daysLeft} يوم)`).join(' • ')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dangerBanner: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  dangerTitle: { color: colors.danger, fontWeight: '900', fontSize: 13.5, textAlign: 'right' },
  dangerText: { color: colors.danger, fontWeight: '700', fontSize: 12, marginTop: 3, textAlign: 'right', lineHeight: 18 },
  warningBanner: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  warningTitle: { color: colors.warning, fontWeight: '900', fontSize: 13.5, textAlign: 'right' },
  warningText: { color: colors.warning, fontWeight: '700', fontSize: 12, marginTop: 3, textAlign: 'right', lineHeight: 18 },
});
