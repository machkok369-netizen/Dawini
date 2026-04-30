import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal,
  RefreshControl
} from 'react-native';
import {
  collection, query, where, getDocs, updateDoc, doc,
  getDoc, deleteDoc, writeBatch, addDoc, serverTimestamp, setDoc
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const SUPER_ADMIN_UIDS = process.env.EXPO_PUBLIC_SUPER_ADMIN_UIDS
  ? process.env.EXPO_PUBLIC_SUPER_ADMIN_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean)
  : [];

export default function AdminScreen({ navigation }) {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState({
    totalDoctors: 0,
    totalPatients: 0,
    totalAppointments: 0,
    pendingVerification: 0,
    activeAppointmentsToday: 0,
    totalRatings: 0,
  });

  const [doctors, setDoctors] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [patients, setPatients] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [disputes, setDisputes] = useState([]);

  React.useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          navigation.goBack();
          return;
        }
        const userSnap = await getDoc(doc(db, 'users', uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const superAdmin = SUPER_ADMIN_UIDS.includes(uid) || userData.adminRole === 'super_admin';
        const admin = superAdmin || userData.role === 'admin' || userData.isAdmin === true;
        if (!admin) {
          Alert.alert('Access Denied', 'You are not an admin');
          navigation.goBack();
          return;
        }
        setIsSuperAdmin(superAdmin);
        loadDashboardData();
      } catch (e) {
        Alert.alert('Error', 'Could not verify admin access');
        navigation.goBack();
      }
    };
    checkAdminAccess();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const doctorsSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'doctor'))
      );
      const allDoctors = doctorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const pendingSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'doctor'), where('isVerified', '==', false))
      );

      const patientsSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'patient'))
      );

      const appointmentsSnap = await getDocs(collection(db, 'reservations'));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayApptsSnap = await getDocs(
        query(
          collection(db, 'reservations'),
          where('date', '>=', today),
          where('date', '<', tomorrow),
          where('status', 'in', ['pending', 'confirmed'])
        )
      );

      const ratingsSnap = await getDocs(collection(db, 'ratings'));
      const suggestionSnap = await getDocs(query(collection(db, 'suggestions')));

      setStats({
        totalDoctors: allDoctors.length,
        totalPatients: patientsSnap.size,
        totalAppointments: appointmentsSnap.size,
        pendingVerification: pendingSnap.size,
        activeAppointmentsToday: todayApptsSnap.size,
        totalRatings: ratingsSnap.size,
      });

      setDoctors(allDoctors);
      setPendingDoctors(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatients(patientsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSuggestions(suggestionSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const disputeSnap = await getDocs(collection(db, 'reports'));
      setDisputes(disputeSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (e) {
      console.log('Load dashboard error:', e);
      Alert.alert('Error', 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const verifyDoctor = async () => {
    if (!selectedDoctor) return;
    if (!isSuperAdmin) {
      Alert.alert('Approval Required', 'Verification request sent to super admin.');
      setVerifyModalVisible(false);
      return;
    }

    try {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 365);

      await updateDoc(doc(db, "users", selectedDoctor.id), {
        isVerified: true,
        subscriptionActive: true,
        subscriptionStart: new Date(),
        subscriptionEnd: endDate,
        verifiedAt: new Date(),
      });

      Alert.alert('✅ Success', `Dr. ${selectedDoctor.fullName} has been verified!\n1 year free trial activated`);
      setVerifyModalVisible(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', 'Failed to verify doctor: ' + e.message);
    }
  };

  const renderDashboard = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>👨‍⚕️</Text>
          <Text style={styles.statValue}>{stats.totalDoctors}</Text>
          <Text style={styles.statLabel}>Total Doctors</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>👥</Text>
          <Text style={styles.statValue}>{stats.totalPatients}</Text>
          <Text style={styles.statLabel}>Total Patients</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📅</Text>
          <Text style={styles.statValue}>{stats.totalAppointments}</Text>
          <Text style={styles.statLabel}>Appointments</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⏳</Text>
          <Text style={styles.statValue}>{stats.pendingVerification}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🟢</Text>
          <Text style={styles.statValue}>{stats.activeAppointmentsToday}</Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⭐</Text>
          <Text style={styles.statValue}>{stats.totalRatings}</Text>
          <Text style={styles.statLabel}>Ratings</Text>
        </View>
      </View>
    </ScrollView>
  );

  const renderDoctors = () => (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏳ Pending Verification ({pendingDoctors.length})</Text>
        {pendingDoctors.length === 0 ? (
          <Text style={styles.emptyText}>No pending doctors</Text>
        ) : (
          pendingDoctors.map(doctor => (
            <View key={doctor.id} style={styles.doctorCard}>
              <View style={styles.doctorInfo}>
                <Text style={styles.doctorName}>Dr. {doctor.fullName}</Text>
                <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
              </View>
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => {
                  setSelectedDoctor(doctor);
                  setVerifyModalVisible(true);
                }}
              >
                <Text style={styles.verifyBtnText}>✅ Verify</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  if (loading && currentTab === 'dashboard') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ Admin Panel</Text>
        <Text style={styles.headerSubtitle}>{isSuperAdmin ? 'Super admin control center' : 'Admin panel'}</Text>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'dashboard' && styles.tabActive]}
          onPress={() => setCurrentTab('dashboard')}
        >
          <Text style={[styles.tabText, currentTab === 'dashboard' && styles.tabTextActive]}>Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, currentTab === 'doctors' && styles.tabActive]}
          onPress={() => setCurrentTab('doctors')}
        >
          <Text style={[styles.tabText, currentTab === 'doctors' && styles.tabTextActive]}>Doctors</Text>
          {stats.pendingVerification > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{stats.pendingVerification}</Text></View>}
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {currentTab === 'dashboard' && renderDashboard()}
        {currentTab === 'doctors' && renderDoctors()}
      </View>

      <Modal visible={verifyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Verify Doctor</Text>
            {selectedDoctor && (
              <>
                <Text style={styles.modalInfo}>Dr. {selectedDoctor.fullName}</Text>
                <Text style={styles.modalDesc}>{selectedDoctor.specialty}</Text>
                <Text style={styles.modalNote}>Grant 1 year free trial?</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVerifyModalVisible(false)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalVerifyBtn} onPress={verifyDoctor}>
                    <Text style={styles.modalVerifyText}>✅ Verify & Activate</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', paddingVertical: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#dc2626' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  tabsContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 8 },
  tab: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', position: 'relative' },
  tabActive: { borderBottomColor: '#dc2626' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#dc2626' },
  badge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#dc2626', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard: { width: '48%', backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  statIcon: { fontSize: 32, marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'center' },
  section: { backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 10, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  doctorCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  doctorInfo: { flex: 1 },
  doctorName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  doctorSpecialty: { fontSize: 12, color: '#64748b', marginTop: 2 },
  verifyBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  verifyBtnText: { color: '#059669', fontSize: 11, fontWeight: '700' },
  emptyText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  modalInfo: { fontSize: 16, fontWeight: '700', color: '#334155' },
  modalDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  modalNote: { fontSize: 13, color: '#059669', marginTop: 16, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  modalVerifyBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center' },
  modalVerifyText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
