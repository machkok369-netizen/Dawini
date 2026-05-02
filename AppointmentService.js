import {
  collection, addDoc, updateDoc, doc, getDocs, query, where,
  serverTimestamp, increment, getDoc, orderBy, writeBatch, deleteDoc, limit
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import NotificationService from './NotificationService';

export class AppointmentService {

  // ✅ GET NEXT AVAILABLE TIME SLOT FOR A DOCTOR ON A SPECIFIC DATE
  static async getNextAvailableTimeSlot(doctorId, date) {
    try {
      const doctorDoc = await getDoc(doc(db, "users", doctorId));
      const doctorData = doctorDoc.data();
      
      // Get doctor's max daily appointments (default 10)
      const maxAppointments = doctorData?.maxDailyAppointments || 10;
      
      // Get all appointments for this doctor on this date
      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        where('date', '>=', dateStart),
        where('date', '<', dateEnd),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('time', 'asc')
      );

      const snapshot = await getDocs(q);
      const existingAppointments = snapshot.docs.length;

      // If max slots reached, no availability
      if (existingAppointments >= maxAppointments) {
        return null;
      }

      // Generate slots starting from 8:00 AM, every 30 minutes
      const slots = [];
      for (let hour = 8; hour <= 17; hour++) {
        for (let minutes of [0, 30]) {
          const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          slots.push(timeStr);
        }
      }

      // Get booked times for this date
      const bookedTimes = snapshot.docs.map(doc => doc.data().time);

      // Find first available slot
      for (const slot of slots) {
        if (!bookedTimes.includes(slot)) {
          return slot;
        }
      }

      // If all slots are full
      return null;
    } catch (error) {
      console.log("Get available slot error:", error);
      return null;
    }
  }

  // ✅ CREATE APPOINTMENT (Patient picks ONLY date, system assigns time)
  static async createAppointment(appointmentData) {
    try {
      const { doctorId, patientId, date, note } = appointmentData;

      const doctorDoc = await getDoc(doc(db, "users", doctorId));
      const doctorData = doctorDoc.data();

      const patientDoc = await getDoc(doc(db, "users", patientId));
      const patientData = patientDoc.data();

      // Get next available time slot
      const autoAssignedTime = await this.getNextAvailableTimeSlot(doctorId, date);

      if (!autoAssignedTime) {
        return {
          success: false,
          error: 'No available slots for this date. Please choose another day.',
        };
      }

      const dateKey = new Date(date).toISOString().split('T')[0];
      const acceptMode = doctorData.acceptMode || 'manual';

      const appointment = {
        doctorId,
        patientId,
        doctorName: doctorData?.fullName || 'Doctor',
        patientName: patientData?.fullName || 'Patient',
        patientPhone: patientData?.phone || '',
        patientAge: patientData?.age || null,
        date: new Date(date),
        time: autoAssignedTime, // ✅ Auto-assigned by system
        note,
        status: acceptMode === 'auto' ? 'confirmed' : 'pending',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'reservations'), appointment);

      // Increment booked slots
      try {
        await updateDoc(doc(db, 'slots', `${doctorId}_${dateKey}`), {
          booked: increment(1)
        });
      } catch (e) {
        // Slot doc doesn't exist yet, create it
        await addDoc(collection(db, 'slots'), {
          doctorId,
          date: dateKey,
          booked: 1,
          max: doctorData?.maxDailyAppointments || 10,
        });
      }

      // Send notification
      await NotificationService.notifyAppointmentConfirmed({
        ...appointment,
        id: docRef.id,
      });

      return {
        success: true,
        appointmentId: docRef.id,
        status: appointment.status,
        assignedTime: autoAssignedTime, // ✅ Return assigned time to show patient
      };
    } catch (error) {
      console.log("Create appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ CANCEL APPOINTMENT
  static async cancelAppointment(appointmentId, cancelledBy = 'patient', reason = '') {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentDoc = await getDoc(appointmentRef);
      const appointmentData = appointmentDoc.data();

      if (!appointmentData) {
        throw new Error('Appointment not found');
      }

      await updateDoc(appointmentRef, {
        status: 'cancelled',
        cancelledBy,
        cancelledAt: serverTimestamp(),
        ...(reason ? { cancellationReason: reason } : {}),
      });

      const dateKey = appointmentData.date.toDate
        ? appointmentData.date.toDate().toISOString().split('T')[0]
        : appointmentData.date.split('T')[0];

      try {
        await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${dateKey}`), {
          booked: increment(-1)
        });
      } catch (e) {}

      await NotificationService.notifyAppointmentCancelled(appointmentData, cancelledBy);

      return { success: true };
    } catch (error) {
      console.log("Cancel appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ RESCHEDULE APPOINTMENT (Only date changes, time is re-assigned)
  static async rescheduleAppointment(appointmentId, newDate) {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentDoc = await getDoc(appointmentRef);
      const appointmentData = appointmentDoc.data();

      const oldDateKey = appointmentData.date.toDate
        ? appointmentData.date.toDate().toISOString().split('T')[0]
        : appointmentData.date.split('T')[0];

      const newDateKey = new Date(newDate).toISOString().split('T')[0];

      // Get new time slot for new date
      const newTimeSlot = await this.getNextAvailableTimeSlot(appointmentData.doctorId, newDate);

      if (!newTimeSlot) {
        return {
          success: false,
          error: 'No available slots on the new date. Please choose another day.',
        };
      }

      await updateDoc(appointmentRef, {
        date: new Date(newDate),
        time: newTimeSlot, // ✅ Re-assign time for new date
        rescheduledAt: serverTimestamp(),
      });

      if (oldDateKey !== newDateKey) {
        try {
          await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${oldDateKey}`), {
            booked: increment(-1)
          });

          await updateDoc(doc(db, 'slots', `${appointmentData.doctorId}_${newDateKey}`), {
            booked: increment(1)
          });
        } catch (e) {}
      }

      return { success: true, newTime: newTimeSlot };
    } catch (error) {
      console.log("Reschedule error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ GET PATIENT APPOINTMENT HISTORY
  static async getPatientAppointmentHistory(patientId) {
    try {
      const q = query(
        collection(db, 'reservations'),
        where('patientId', '==', patientId),
        orderBy('date', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get history error:", e);
      return [];
    }
  }

  // ✅ GET DOCTOR APPOINTMENT HISTORY
  static async getDoctorAppointmentHistory(doctorId) {
    try {
      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        orderBy('date', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get history error:", e);
      return [];
    }
  }

  // ✅ COMPLETE APPOINTMENT
  static async completeAppointment(appointmentId) {
    try {
      const appointmentRef = doc(db, 'reservations', appointmentId);
      const appointmentSnap = await getDoc(appointmentRef);
      const appointmentData = appointmentSnap.exists() ? appointmentSnap.data() : null;

      // Idempotency guard — if already completed, return early.
      if (appointmentData?.status === 'completed') {
        return { success: true };
      }

      await updateDoc(appointmentRef, {
        status: 'completed',
        completedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.log("Complete appointment error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ MARK NO-SHOW
  static async markNoShow(appointmentId) {
    try {
      await updateDoc(doc(db, 'reservations', appointmentId), {
        status: 'no_show',
        noShowAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.log("No show error:", error);
      return { success: false, error: error.message };
    }
  }

  // ✅ GET TODAY'S APPOINTMENTS FOR DOCTOR
  static async getTodayAppointments(doctorId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const q = query(
        collection(db, 'reservations'),
        where('doctorId', '==', doctorId),
        where('date', '>=', today),
        where('date', '<', tomorrow),
        where('status', 'in', ['pending', 'confirmed']),
        orderBy('time', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
      }));
    } catch (e) {
      console.log("Get today error:", e);
      return [];
    }
  }
}

export default AppointmentService;
