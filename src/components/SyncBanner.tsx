import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../theme';

type Props = {
  pendingCount: number;
};

export default function SyncBanner({ pendingCount }: Props) {
  if (pendingCount <= 0) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.subtext} />
      <Text style={styles.text}>
        {pendingCount === 1
          ? 'تغيير واحد بانتظار عودة الاتصال ليُرسل تلقائيًا'
          : `${pendingCount} تغييرات بانتظار عودة الاتصال لتُرسل تلقائيًا`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutralTint,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  text: { flex: 1, fontSize: 11.5, fontWeight: '700', color: colors.subtext, textAlign: 'right' },
});
