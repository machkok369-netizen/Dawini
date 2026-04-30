import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './LanguageContext';
import i18n from './i18n';

export default function PatientProfileScreen({ navigation }) {
  const { t } = useTranslation('screens');
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('');
  const [relativeAge, setRelativeAge] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setFullName(data.fullName || '');
          setAge(data.age ? String(data.age) : '');
          setRelativeName(data.relativeProfile?.name || '');
          setRelativeRelation(data.relativeProfile?.relation || '');
          setRelativeAge(data.relativeProfile?.age ? String(data.relativeProfile.age) : '');
        }
      } catch (e) {
        Alert.alert(i18n.t('screens:patientProfile.loadErrorTitle'), i18n.t('screens:patientProfile.loadErrorMsg'));
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const saveProfile = async () => {
    const parsedAge = parseInt(age, 10);
    const parsedRelativeAge = relativeAge.trim() ? parseInt(relativeAge, 10) : null;
    if (!fullName.trim()) {
      Alert.alert(i18n.t('screens:patientProfile.missingNameTitle'), i18n.t('screens:patientProfile.missingNameMsg'));
      return;
    }
    if (!age.trim() || Number.isNaN(parsedAge) || parsedAge < 1) {
      Alert.alert(i18n.t('screens:patientProfile.invalidAgeTitle'), i18n.t('screens:patientProfile.invalidAgeMsg'));
      return;
    }
    if (relativeAge.trim() && Number.isNaN(parsedRelativeAge)) {
      Alert.alert(i18n.t('screens:patientProfile.invalidRelAgeTitle'), i18n.t('screens:patientProfile.invalidRelAgeMsg'));
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        fullName: fullName.trim(),
        age: parsedAge,
        relativeProfile: {
          name: relativeName.trim(),
          relation: relativeRelation.trim(),
          age: parsedRelativeAge,
        },
        profileUpdatedAt: new Date(),
      });
      Alert.alert(i18n.t('screens:patientProfile.savedTitle'), i18n.t('screens:patientProfile.savedMsg'));
      navigation.goBack();
    } catch (e) {
      Alert.alert(i18n.t('common:error'), i18n.t('screens:patientProfile.saveErrorMsg'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { direction: isRTL ? 'rtl' : 'ltr' }]} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('patientProfile.title')}</Text>

      <Text style={styles.label}>{t('patientProfile.nameLabel')}</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

      <Text style={styles.label}>{t('patientProfile.ageLabel')}</Text>
      <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" />

      <Text style={styles.section}>{t('patientProfile.relativeSection')}</Text>
      <Text style={styles.label}>{t('patientProfile.relativeNameLabel')}</Text>
      <TextInput style={styles.input} value={relativeName} onChangeText={setRelativeName} />

      <Text style={styles.label}>{t('patientProfile.relativeRelationLabel')}</Text>
      <TextInput style={styles.input} value={relativeRelation} onChangeText={setRelativeRelation} />

      <Text style={styles.label}>{t('patientProfile.relativeAgeLabel')}</Text>
      <TextInput style={styles.input} value={relativeAge} onChangeText={setRelativeAge} keyboardType="number-pad" />

      <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('patientProfile.saveBtn')}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 20 },
  section: { fontSize: 16, fontWeight: '700', color: '#16a34a', marginTop: 10, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
