import { useState, useEffect } from 'react'
import axios from 'axios'

const api = axios.create({ 
  baseURL: 'https://movie-booking-sesh.duckdns.org'
})
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type Booking = {
  id: number
  showtime_id: number
  total_amount: number
  status: string
  seat_ids: number[]
}
type Showtime = { id: number; movie_id: number; start_time: string; screen_id: number; price: number }
type Movie = { id: number; title: string; poster_url: string | null }
type Seat = { id: number; row: string; number: number }

export default function MyBookings({ onBack }: { onBack: () => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [showtimes, setShowtimes] = useState<Showtime[]>([])
  const [movies, setMovies] = useState<Movie[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/bookings/my'),
      api.get('/api/showtimes'),
      api.get('/api/movies'),
    ]).then(async ([bookingsRes, showtimesRes, moviesRes]) => {
      setBookings(bookingsRes.data)
      setShowtimes(showtimesRes.data)
      setMovies(moviesRes.data)

      // Fetch seats for each unique showtime in bookings
      const showtimeIds = [...new Set(bookingsRes.data.map((b: Booking) => b.showtime_id))]
      const allSeats: Seat[] = []
      await Promise.all(
        showtimeIds.map(async (id) => {
          const r = await api.get(`/api/showtimes/${id}/seats`)
          allSeats.push(...r.data)
        })
      )
      setSeats(allSeats)
      setLoading(false)
    })
  }, [])

  function getShowtime(id: number) { return showtimes.find(s => s.id === id) }
  function getMovie(id: number) { return movies.find(m => m.id === id) }
  function getSeat(id: number) { return seats.find(s => s.id === id) }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <h1 className="text-2xl font-light tracking-tight text-gray-900">My Bookings</h1>
          <button onClick={onBack} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
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
          <div className="space-y-4">
            {bookings.map(booking => {
              const showtime = getShowtime(booking.showtime_id)
              const movie = showtime ? getMovie(showtime.movie_id) : null
              const seatLabels = booking.seat_ids.map(id => {
                const s = getSeat(id)
                return s ? `${s.row}${s.number}` : `#${id}`
              })
              return (
                <div key={booking.id} className="bg-gray-50 p-8 rounded-2xl flex gap-6">
                  {movie?.poster_url && (
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="w-16 h-24 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-light tracking-tight text-gray-900 mb-1">
                          {movie?.title ?? `Booking #${booking.id}`}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3">
                          {showtime ? formatTime(showtime.start_time) : ''} · Screen {showtime?.screen_id}
                        </p>
                        <p className="text-sm text-gray-600">
                          Seats: <span className="font-medium">{seatLabels.join(', ')}</span>
                        </p>
                      </div>
                      <div className="text-right ml-8">
                        <div className="text-2xl font-light text-gray-900 mb-2">₹{booking.total_amount}</div>
                        <div className="inline-block px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-medium">
                          {booking.status}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}