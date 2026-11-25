import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, tintedShadow } from '../theme';
import { reportEmergency } from '../api';
import type { EmergencyType } from '../api';

const EMERGENCY_OPTIONS: { type: EmergencyType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'traffic_accident', label: 'حادث مروري', icon: 'car-sport-outline' },
  { type: 'vehicle_breakdown', label: 'عطل بالمركبة', icon: 'construct-outline' },
  { type: 'fuel_out', label: 'نفاذ الوقود', icon: 'water-outline' },
  { type: 'phone_malfunction', label: 'تعطل الجوال', icon: 'phone-portrait-outline' },
  { type: 'medical_emergency', label: 'حالة صحية طارئة', icon: 'medkit-outline' },
  { type: 'security_issue', label: 'مشكلة أمنية', icon: 'shield-outline' },
  { type: 'other', label: 'أخرى', icon: 'ellipsis-horizontal-circle-outline' },
];

type Props = {
  visible: boolean;
  token: string;
  onClose: () => void;
  onReported?: () => void;
};

export default function EmergencyReportModal({ visible, token, onClose, onReported }: Props) {
  const [selected, setSelected] = useState<EmergencyType | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = () => {
    setSelected(null);
    setNote('');
    setError('');
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      await reportEmergency(token, selected, note.trim() || undefined);
      setDone(true);
      onReported?.();
    } catch (err: any) {
      setError(err?.message || 'تعذر إرسال البلاغ، حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {done ? (
            <View style={styles.doneWrap}>
              <View style={styles.doneIcon}>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              </View>
              <Text style={styles.doneTitle}>تم إرسال البلاغ</Text>
              <Text style={styles.doneText}>
                وصل بلاغك للإدارة، وأي طلب كان معك تم تحويله لأقرب سائق متاح. اعتنِ بنفسك.
              </Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleClose}>
                <Text style={styles.primaryButtonText}>تم</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.headerIcon}>
                  <Ionicons name="warning" size={22} color={colors.danger} />
                </View>
                <Text style={styles.title}>الإبلاغ عن ظرف طارئ</Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={colors.subtext} />
                </TouchableOpacity>
              </View>
              <Text style={styles.subtitle}>اختر نوع الحالة — سيتم تحويل أي طلب معك فورًا لسائق آخر.</Text>

              <View style={styles.grid}>
                {EMERGENCY_OPTIONS.map((option) => {
                  const active = selected === option.type;
                  return (
                    <TouchableOpacity
                      key={option.type}
                      style={[styles.option, active ? styles.optionActive : null]}
                      onPress={() => setSelected(option.type)}
                    >
                      <Ionicons name={option.icon} size={22} color={active ? colors.danger : colors.text} />
                      <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={styles.noteInput}
                placeholder="تفاصيل إضافية (اختياري)"
                placeholderTextColor={colors.subtext}
                value={note}
                onChangeText={setNote}
                multiline
                textAlign="right"
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.submitButton, !selected ? styles.submitButtonDisabled : null]}
                onPress={handleSubmit}
                disabled={!selected || submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>إرسال البلاغ</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.lg, ...tintedShadow('#000', 0.2) },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: spacing.xs },
  headerIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '900', color: colors.text, textAlign: 'right' },
  closeButton: { padding: 4 },
  subtitle: { color: colors.subtext, fontSize: 12.5, fontWeight: '600', textAlign: 'right', marginBottom: spacing.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: spacing.md },
  option: {
    width: '31%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.neutralTint,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionActive: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  optionLabel: { fontSize: 11.5, fontWeight: '800', color: colors.text, textAlign: 'center' },
  optionLabelActive: { color: colors.danger },

  noteInput: {
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.neutralTint,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },

  errorText: { color: colors.danger, textAlign: 'center', marginBottom: spacing.sm, fontWeight: '700', fontSize: 12.5 },

  submitButton: { backgroundColor: colors.danger, borderRadius: 16, paddingVertical: 15, alignItems: 'center', ...tintedShadow(colors.danger, 0.3) },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  doneWrap: { alignItems: 'center', paddingVertical: spacing.sm },
  doneIcon: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  doneTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 6 },
  doneText: { color: colors.subtext, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 20, marginBottom: spacing.md },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32 },
  primaryButtonText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
