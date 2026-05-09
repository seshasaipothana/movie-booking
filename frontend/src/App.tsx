import { useState, useEffect } from 'react'
import axios from 'axios'
import MyBookings from './MyBookings'

const api = axios.create({ 
  baseURL: 'https://movie-booking-backend-8r8x.onrender.com'
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

type Movie = { id: number; title: string; duration_minutes: number }
type Showtime = { id: number; movie_id: number; start_time: string; price: number; screen_id: number }
type Seat = { id: number; row: string; number: number }

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [movies, setMovies] = useState<Movie[]>([])
  const [showtimes, setShowtimes] = useState<Showtime[]>([])
  const [seats, setSeats] = useState<Seat[]>([])
  const [bookedSeatIds, setBookedSeatIds] = useState<number[]>([])
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(false)
  const [showMyBookings, setShowMyBookings] = useState(false)

  useEffect(() => {
    if (token) {
      api.get('/api/movies').then(r => setMovies(r.data))
      api.get('/api/showtimes').then(r => setShowtimes(r.data))
    }
  }, [token])

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleAuth() {
    setLoading(true)
    try {
      const url = isLogin ? '/api/auth/login' : '/api/auth/signup'
      const body = isLogin ? { email, password } : { email, password, name }
      const r = await api.post(url, body)
      localStorage.setItem('token', r.data.access_token)
      setToken(r.data.access_token)
    } catch {
      showMsg(isLogin ? 'Invalid email or password.' : 'Signup failed. Try a different email.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadSeats(showtime: Showtime) {
    setSelectedShowtime(showtime)
    setSelectedSeats([])
    setMessage('')
    const [seatsRes, bookedRes] = await Promise.all([
      api.get(`/api/showtimes/${showtime.id}/seats`),
      api.get(`/api/showtimes/${showtime.id}/booked-seats`),
    ])
    setSeats(seatsRes.data)
    setBookedSeatIds(bookedRes.data)
  }

  function toggleSeat(id: number) {
    if (bookedSeatIds.includes(id)) return
    setSelectedSeats(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function book() {
    if (!selectedShowtime || selectedSeats.length === 0) return
    setLoading(true)
    try {
      await api.post('/api/bookings', {
        showtime_id: selectedShowtime.id,
        seat_ids: selectedSeats,
      })
      showMsg(`✅ Booked ${selectedSeats.length} seat(s)! Total: ₹${selectedSeats.length * selectedShowtime.price}`)
      const bookedRes = await api.get(`/api/showtimes/${selectedShowtime.id}/booked-seats`)
      setBookedSeatIds(bookedRes.data)
      setSelectedSeats([])
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showMsg(msg || 'Booking failed.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    setToken('')
    setMovies([])
    setShowtimes([])
    setSelectedShowtime(null)
    setShowMyBookings(false)
  }

  function getMovie(id: number) {
    return movies.find(m => m.id === id)
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (!token) return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl w-full max-w-sm shadow-2xl">
        <h1 className="text-2xl font-bold mb-1 text-center">🎬 Movie Booking</h1>
        <p className="text-center text-gray-400 text-sm mb-6">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </p>
        {!isLogin && (
          <input
            className="w-full mb-3 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        )}
        <input
          className="w-full mb-3 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="w-full mb-4 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
        />
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-3 rounded-lg font-semibold text-sm mb-4 transition-colors"
        >
          {loading ? 'Please wait...' : isLogin ? 'Login' : 'Sign Up'}
        </button>
        <p
          className="text-center text-sm text-gray-400 cursor-pointer hover:text-white transition-colors"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
        </p>
        {message && (
          <p className={`mt-4 text-center text-sm font-medium ${messageType === 'error' ? 'text-red-400' : 'text-green-400'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  )

  if (showMyBookings) return <MyBookings onBack={() => setShowMyBookings(false)} />

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex justify-between items-center">
        <h1
          className="text-xl font-bold cursor-pointer"
          onClick={() => { setSelectedShowtime(null); setMessage('') }}
        >
          🎬 Movie Booking
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowMyBookings(true)}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
          >
            My Bookings
          </button>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-4 py-2 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded-xl text-center font-medium text-sm ${
            messageType === 'error'
              ? 'bg-red-900/50 border border-red-700 text-red-300'
              : 'bg-green-900/50 border border-green-700 text-green-300'
          }`}>
            {message}
          </div>
        )}

        {!selectedShowtime && (
          <>
            <h2 className="text-lg font-semibold mb-4 text-gray-200">Now Showing</h2>
            <div className="grid gap-3">
              {showtimes.map(s => {
                const movie = getMovie(s.movie_id)
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSeats(s)}
                    className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 cursor-pointer p-4 rounded-xl flex justify-between items-center transition-all"
                  >
                    <div>
                      <p className="font-semibold text-white">{movie?.title}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        {formatTime(s.start_time)} &nbsp;·&nbsp; Screen {s.screen_id} &nbsp;·&nbsp; {movie?.duration_minutes} min
                      </p>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <p className="text-green-400 font-bold">₹{s.price}</p>
                      <p className="text-gray-500 text-xs mt-1">per seat</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {selectedShowtime && (
          <>
            <button
              onClick={() => { setSelectedShowtime(null); setMessage('') }}
              className="mb-6 text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition-colors"
            >
              ← Back to showtimes
            </button>
            <div className="mb-6">
              <h2 className="text-2xl font-bold">{getMovie(selectedShowtime.movie_id)?.title}</h2>
              <p className="text-gray-400 mt-1 text-sm">
                {formatTime(selectedShowtime.start_time)} &nbsp;·&nbsp; Screen {selectedShowtime.screen_id} &nbsp;·&nbsp; ₹{selectedShowtime.price}/seat
              </p>
            </div>
            <div className="mb-6 py-2 px-4 bg-gray-800 border border-gray-700 rounded-lg text-center text-xs text-gray-400 tracking-widest uppercase">
              ── Screen ──
            </div>
            <div className="flex gap-4 mb-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-gray-700 inline-block" /> Available
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-blue-600 inline-block" /> Selected
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-gray-600 opacity-40 inline-block" /> Booked
              </span>
            </div>
            <div className="grid grid-cols-10 gap-2 mb-8">
              {seats.map(seat => {
                const isBooked = bookedSeatIds.includes(seat.id)
                const isSelected = selectedSeats.includes(seat.id)
                return (
                  <button
                    key={seat.id}
                    onClick={() => toggleSeat(seat.id)}
                    disabled={isBooked}
                    className={`py-2 rounded text-xs font-semibold transition-colors ${
                      isBooked
                        ? 'bg-gray-700 text-gray-600 cursor-not-allowed opacity-40'
                        : isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {seat.row}{seat.number}
                  </button>
                )
              })}
            </div>
            {selectedSeats.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 p-5 rounded-xl">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-sm text-gray-400">{selectedSeats.length} seat(s) selected</p>
                    <p className="text-xl font-bold text-white mt-1">
                      ₹{selectedSeats.length * selectedShowtime.price}
                    </p>
                  </div>
                  <button
                    onClick={book}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-3 rounded-xl font-bold transition-colors"
                  >
                    {loading ? 'Booking...' : 'Confirm Booking'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}