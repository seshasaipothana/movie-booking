import { useState, useEffect } from 'react'
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
  total_price: number
  status: string
  seats: { id: number; row: string; number: number }[]
}

export default function MyBookings({ onBack }: { onBack: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/bookings/my-bookings')
      .then(r => setBookings(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <h1 className="text-2xl font-light tracking-tight text-gray-900">
            My Bookings
          </h1>
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Back
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-50 p-8 rounded-2xl animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/4 mb-3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">No bookings yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map(booking => (
              <div
                key={booking.id}
                className="bg-gray-50 p-8 rounded-2xl"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-xl font-light tracking-tight text-gray-900 mb-3">
                      Booking #{booking.id}
                    </h3>
                    <div className="space-y-1 text-sm text-gray-500">
                      <p>Showtime #{booking.showtime_id} · {booking.seats.length} seat{booking.seats.length > 1 ? 's' : ''}</p>
                      <p>Seats: {booking.seats.map(s => `${s.row}${s.number}`).join(', ')}</p>
                    </div>
                  </div>
                  <div className="text-right ml-8">
                    <div className="text-2xl font-light text-gray-900 mb-2">
                      ₹{booking.total_price}
                    </div>
                    <div className="inline-block px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium">
                      {booking.status}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}