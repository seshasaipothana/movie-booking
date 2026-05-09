import { useEffect, useState } from 'react'
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://movie-booking-backend-8r8x.onrender.com'
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type Booking = {
  id: number
  showtime_id: number
  status: string
  total_amount: number
  seat_ids: number[]
}

export default function MyBookings({ onBack }: { onBack: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/bookings/my')
      .then(r => setBookings(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🎬 My Bookings</h1>
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-white border border-gray-700 px-4 py-2 rounded-lg"
        >
          ← Back
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {loading && <p className="text-gray-400">Loading...</p>}

        {!loading && bookings.length === 0 && (
          <p className="text-gray-400">No bookings yet.</p>
        )}

        <div className="grid gap-4">
          {bookings.map(b => (
            <div key={b.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-white">Booking #{b.id}</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Showtime #{b.showtime_id} &nbsp;·&nbsp; {b.seat_ids.length} seat(s)
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    Seats: {b.seat_ids.join(', ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold">₹{b.total_amount}</p>
                  <span className={`text-xs px-2 py-1 rounded mt-2 inline-block ${
                    b.status === 'confirmed'
                      ? 'bg-green-900 text-green-300'
                      : b.status === 'cancelled'
                      ? 'bg-red-900 text-red-300'
                      : 'bg-yellow-900 text-yellow-300'
                  }`}>
                    {b.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}