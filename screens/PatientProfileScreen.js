import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
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
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('');
  const [relativeAge, setRelativeAge] = useState('');
  const [recentAppointments, setRecentAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  useEffect(() => {
    loadProfileAndAppointments();
  }, []);

  const loadProfileAndAppointments = async () => {
    try {
      // Load patient profile
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setFullName(data.fullName || '');
        setAge(data.age ? String(data.age) : '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setRelativeName(data.relativeProfile?.name || '');
        setRelativeRelation(data.relativeProfile?.relation || '');
        setRelativeAge(data.relativeProfile?.age ? String(data.relativeProfile.age) : '');
      }

      // Load recent appointments (last 7 days)
      setLoadingAppointments(true);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const appointmentsRef = collection(db, 'reservations');
      const q = query(
        appointmentsRef,
        where('patientId', '==', auth.currentUser.uid),
        where('createdAt', '>=', sevenDaysAgo),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const querySnapshot = await getDocs(q);
      const appointments = [];

      for (const docSnap of querySnapshot.docs) {
        const apptData = docSnap.data();
        
        // Fetch doctor details
        let doctorName = 'Unknown Doctor';
        let cabinetName = '';
        try {
          const doctorSnap = await getDoc(doc(db, 'users', apptData.doctorId));
          if (doctorSnap.exists()) {
            doctorName = doctorSnap.data().fullName || 'Unknown Doctor';
            cabinetName = doctorSnap.data().cabinetName || '';
          }
        } catch (e) {
          console.log('Error fetching doctor:', e);
        }

        appointments.push({
          id: docSnap.id,
          doctorName,
          cabinetName,
          date: apptData.date,
          time: apptData.time,
          status: apptData.status,
          createdAt: apptData.createdAt?.toDate?.() || new Date(apptData.createdAt),
        });
      }

      setRecentAppointments(appointments);
    } catch (e) {
      console.log('Error loading data:', e);
      Alert.alert(i18n.t('screens:patientProfile.loadErrorTitle'), i18n.t('screens:patientProfile.loadErrorMsg'));
    } finally {
      setLoading(false);
      setLoadingAppointments(false);
    }
  };

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
        phone: phone.trim(),
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'completed':
        return '#3b82f6';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>{fullName || 'Patient'}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
        </View>
      </View>

      {/* Personal Information */}
      <Text style={styles.title}>{t('patientProfile.title')}</Text>

      <Text style={styles.label}>👤 {t('patientProfile.nameLabel')}</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Enter your full name" />

      <Text style={styles.label}>🎂 {t('patientProfile.ageLabel')}</Text>
      <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Enter your age" />

      <Text style={styles.label}>📱 Phone Number</Text>
      <TextInput 
        style={styles.input} 
        value={phone} 
        onChangeText={setPhone} 
        keyboardType="phone-pad" 
        placeholder="05XX XXX XXX"
      />

      <Text style={styles.label}>📧 Email</Text>
      <TextInput 
        style={[styles.input, styles.disabledInput]} 
        value={email} 
        editable={false}
      />

      {/* Relative Information */}
      <Text style={styles.section}>{t('patientProfile.relativeSection')}</Text>
      <Text style={styles.label}>👨‍👩‍👧 {t('patientProfile.relativeNameLabel')}</Text>
      <TextInput style={styles.input} value={relativeName} onChangeText={setRelativeName} placeholder="e.g. Mother / Father name" />

      <Text style={styles.label}>🔗 {t('patientProfile.relativeRelationLabel')}</Text>
      <TextInput style={styles.input} value={relativeRelation} onChangeText={setRelativeRelation} placeholder="e.g. Mother, Father, Child" />

      <Text style={styles.label}>🎂 {t('patientProfile.relativeAgeLabel')}</Text>
      <TextInput style={styles.input} value={relativeAge} onChangeText={setRelativeAge} keyboardType="number-pad" placeholder="Enter relative age" />

      <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('patientProfile.saveBtn')}</Text>}
      </TouchableOpacity>

      {/* Recent Appointments Section */}
      <Text style={[styles.section, { marginTop: 30 }]}>📅 Recent Appointments (Last 7 Days)</Text>

      {loadingAppointments ? (
        <ActivityIndicator size="small" color="#16a34a" style={{ marginTop: 10 }} />
      ) : recentAppointments.length === 0 ? (
        <Text style={styles.noAppointmentsText}>No appointments in the last 7 days</Text>
      ) : (
        <View style={styles.appointmentsList}>
          {recentAppointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.appointmentHeader}>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.doctorName}>👨‍⚕️ {appointment.doctorName}</Text>
                  {appointment.cabinetName && (
                    <Text style={styles.cabinetName}>{appointment.cabinetName}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(appointment.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{appointment.status}</Text>
                </View>
              </View>
              <View style={styles.appointmentDetails}>
                <Text style={styles.appointmentDate}>
                  📅 {formatDate(appointment.createdAt)}
                </Text>
                <Text style={styles.appointmentDate}>
                  ⏰ {appointment.date} {appointment.time}
                </Text>
              </View>
              <View style={styles.appointmentActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rescheduleBtn]}
                  onPress={() =>
                    navigation.navigate('Appointments', {
                      appointmentId: appointment.id,
                      action: 'reschedule',
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>Reschedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={() =>
                    navigation.navigate('Appointments', {
                      appointmentId: appointment.id,
                      action: 'cancel',
                    })
                  }
                >
                  <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 30 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Profile Header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    fontSize: 32,
  },
  profileHeaderText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },

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
  disabledInput: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Recent Appointments Styles
  noAppointmentsText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  appointmentsList: {
    marginTop: 10,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  appointmentInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cabinetName: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginLeft: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  appointmentDetails: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  appointmentDate: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
  },
  appointmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rescheduleBtn: {
    backgroundColor: '#16a34a',
  },
  cancelBtn: {
    backgroundColor: '#fee2e2',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
