# Appointment patient-details fix

Hospital appointments now display patient name, Health ID and phone. Open an appointment to see date of birth and sex, including after completion or cancellation. Access is restricted to the booking patient, receiving hospital and assigned clinician; this does not grant hospital administrators access to clinical history.

The backend migration has already been applied to your connected project.

To update locally: stop the running development server with Ctrl+C; extract this ZIP into a new folder; open nationalcare; run npm ci and npm run dev; open http://localhost:5173/#workspace/hospital/appointments and sign in. Existing bookings and accounts remain in Supabase.

Database authorization tests and production build passed.
