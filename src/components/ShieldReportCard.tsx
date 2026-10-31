import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKey, type ReportPeriod } from '../services/shieldReport';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import { AppCard } from './ui';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const shortDate = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function ShieldReportCard() {
  const c = useAppController();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const report = c.shieldReport(period, offset);
  const max = Math.max(1, ...report.days.map((day) => day.total));
  const today = dayKey(new Date());
  const chosen = report.days.find((day) => day.key === selected)
    ?? report.days.find((day) => day.key === today)
    ?? [...report.days].reverse().find((day) => !day.future)!;
  const title = period === 'month'
    ? report.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : `${shortDate(report.start)} – ${shortDate(report.end)}, ${report.end.getFullYear()}`;

  function changePeriod(value: ReportPeriod) {
    setPeriod(value); setOffset(0); setSelected(null);
  }

  return (
    <AppCard style={styles.card}>
      <View style={styles.heading}>
        <View><Text style={styles.eyebrow}>YOUR PROGRESS</Text><Text style={styles.title}>Shield Report</Text></View>
        <View style={styles.shield}><Text style={styles.shieldGlyph}>♢</Text></View>
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(['week', 'month'] as const).map((value) => (
          <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: period === value }}
            onPress={() => changePeriod(value)} style={[styles.tab, period === value && styles.activeTab]}>
            <Text style={[styles.tabText, period === value && styles.activeTabText]}>{value === 'week' ? 'Weekly' : 'Monthly'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.dateRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${period}`}
          onPress={() => { setOffset(offset - 1); setSelected(null); }} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.date}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${period}`} accessibilityState={{ disabled: offset === 0 }}
          disabled={offset === 0} onPress={() => { setOffset(offset + 1); setSelected(null); }}
          style={[styles.arrow, offset === 0 && styles.disabled]}><Text style={styles.arrowText}>›</Text></Pressable>
      </View>
      <View style={styles.metrics}>
        <View style={styles.mainMetric}><Text style={styles.total}>{report.recordedDays ? report.total : '—'}</Text>
          <Text style={styles.caption}>detected touches</Text></View>
        <View style={styles.secondaryMetrics}>
          <Text style={styles.metricValue}>{report.recordedDays}<Text style={styles.metricLabel}> tracking days</Text></Text>
          <Text style={styles.metricValue}>{report.average === null ? '—' : report.average.toFixed(1)}<Text style={styles.metricLabel}> / tracked day</Text></Text>
        </View>
      </View>

      {period === 'week' ? (
        <View style={styles.chart}>
          {report.days.map((day, i) => (
            <Pressable key={day.key} accessibilityRole="button" disabled={day.future}
              accessibilityLabel={`${shortDate(day.date)}, ${day.future ? 'upcoming' : day.recorded ? `${day.total} touches` : 'no tracking data'}`}
              accessibilityState={{ selected: chosen?.key === day.key, disabled: day.future }}
              onPress={() => setSelected(day.key)} style={styles.barColumn}>
              <Text style={styles.barCount}>{day.recorded ? day.total : '·'}</Text>
              <View style={styles.barTrack}><View style={[styles.bar, {
                height: day.recorded ? Math.max(6, day.total / max * 80) : 4,
                backgroundColor: day.recorded ? chosen?.key === day.key ? AppColors.greenDark : '#70b69a' : '#dfe7e2',
              }]} /></View>
              <Text style={[styles.weekLabel, day.key === today && styles.todayText]}>{WEEKDAYS[i]}</Text>
              <View style={[styles.selectedDot, { opacity: chosen?.key === day.key ? 1 : 0 }]} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.calendar}>
          {WEEKDAYS.map((label, index) => <View key={`label-${index}`} style={styles.cell}><Text style={styles.weekLabel}>{label}</Text></View>)}
          {Array.from({ length: (report.start.getDay() + 6) % 7 }, (_, index) => <View key={`blank-${index}`} style={styles.cell} />)}
          {report.days.map((day) => (
            <Pressable key={day.key} accessibilityRole="button" disabled={day.future}
              accessibilityLabel={`${shortDate(day.date)}, ${day.future ? 'upcoming' : day.recorded ? `${day.total} touches` : 'no tracking data'}`}
              accessibilityState={{ selected: chosen?.key === day.key, disabled: day.future }}
              onPress={() => setSelected(day.key)} style={styles.cell}>
              <View style={[styles.calendarDay,
                day.recorded && { backgroundColor: day.total === 0 ? '#d8eddd' : '#fde8d8' },
                chosen?.key === day.key && styles.selectedDay, day.future && styles.disabled]}>
                <Text style={[styles.dayNumber, day.key === today && styles.todayText]}>{day.date.getDate()}</Text>
                <Text style={styles.dayCount}>{day.recorded ? day.total : '·'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.detail}>
        <Text style={styles.detailDate}>{chosen ? shortDate(chosen.date) : 'No date selected'}</Text>
        <Text style={styles.detailText}>{chosen?.recorded ? `${chosen.total} touches recorded` : 'No tracking recorded'}</Text>
      </View>
      <Text style={styles.note}>{report.recordedDays ? 'Tap a day to explore. Blank days have no tracking data.' : 'Your report will grow as you track. Days without data stay blank.'}</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 24 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700', color: AppColors.sub },
  title: { fontSize: 23, fontWeight: '700', letterSpacing: -0.6, color: AppColors.ink, marginTop: 4 },
  shield: { width: 42, height: 42, borderRadius: 14, backgroundColor: AppColors.greenTintBg, alignItems: 'center', justifyContent: 'center' },
  shieldGlyph: { fontSize: 30, color: AppColors.greenDark },
  tabs: { flexDirection: 'row', backgroundColor: '#eef3f0', padding: 4, borderRadius: 14, marginTop: 20 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#fff', shadowColor: '#183c34', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '600', color: AppColors.sub },
  activeTabText: { color: AppColors.greenDark },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28, color: AppColors.greenDark },
  date: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: AppColors.ink },
  disabled: { opacity: 0.3 },
  metrics: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 4, marginBottom: 20 },
  mainMetric: { flexGrow: 1 },
  total: { fontSize: 52, fontWeight: '600', letterSpacing: -2, color: AppColors.greenDark, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 12, color: AppColors.sub },
  secondaryMetrics: { gap: 12, borderLeftWidth: 1, borderColor: '#e3ebe6', paddingLeft: 18 },
  metricValue: { fontSize: 17, fontWeight: '700', color: AppColors.ink },
  metricLabel: { fontSize: 11, fontWeight: '400', color: AppColors.sub },
  chart: { flexDirection: 'row', gap: 8 },
  barColumn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  barCount: { fontSize: 11, color: AppColors.sub, marginBottom: 8 },
  barTrack: { height: 88, width: '100%', maxWidth: 30, backgroundColor: '#f1f5f2', borderRadius: 9, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 9 },
  weekLabel: { fontSize: 11, color: AppColors.sub, marginTop: 10, fontWeight: '500' },
  todayText: { color: AppColors.greenDark, fontWeight: '800' },
  selectedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: AppColors.greenDark, marginTop: 5 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calendarDay: { width: '100%', minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: '#f3f6f4' },
  selectedDay: { borderColor: AppColors.greenDark },
  dayNumber: { fontSize: 12, color: AppColors.ink, fontWeight: '500' },
  dayCount: { fontSize: 9, color: AppColors.sub, marginTop: 2 },
  detail: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, padding: 12, backgroundColor: '#f3f7f5', borderRadius: 12, marginTop: 16 },
  detailDate: { fontSize: 12, fontWeight: '700', color: AppColors.ink },
  detailText: { fontSize: 12, color: AppColors.sub },
  note: { fontSize: 11, lineHeight: 17, color: AppColors.sub, marginTop: 10 },
});
