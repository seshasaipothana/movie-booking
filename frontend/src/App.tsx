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
  const [lockedSeatIds, setLockedSeatIds] = useState<number[]>([])
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [loading, setLoading] = useState(false)
  const [showMyBookings, setShowMyBookings] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)

  useEffect(() => {
    if (token) {
      setDataLoading(true)
      Promise.all([
        api.get('/api/movies'),
        api.get('/api/showtimes')
      ]).then(([moviesRes, showtimesRes]) => {
        setMovies(moviesRes.data)
        setShowtimes(showtimesRes.data)
        setDataLoading(false)
      })
    }
  }, [token])

  useEffect(() => {
    if (!selectedShowtime) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//movie-booking-backend-8r8x.onrender.com/ws/showtimes/${selectedShowtime.id}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      
      if (message.type === 'seat_locked') {
        setLockedSeatIds(prev => [...prev, message.seat_id])
      } else if (message.type === 'seat_unlocked') {
        setLockedSeatIds(prev => prev.filter(id => id !== message.seat_id))
      } else if (message.type === 'seat_booked') {
        setBookedSeatIds(prev => [...prev, message.seat_id])
        setLockedSeatIds(prev => prev.filter(id => id !== message.seat_id))
      }
    }

    return () => {
      ws.close()
    }
  }, [selectedShowtime])

  useEffect(() => {
    return () => {
      if (selectedShowtime && selectedSeats.length > 0) {
        selectedSeats.forEach(seatId => {
          api.post(`/api/seat-locks/${selectedShowtime.id}/${seatId}/unlock`).catch(() => {})
        })
      }
    }
  }, [selectedShowtime, selectedSeats])

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setMessage(text)
    setMessageType(type)
    setTimeout(() => setMessage(''), 5000)
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
      showMsg(isLogin ? 'Invalid credentials' : 'Sign up failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadSeats(showtime: Showtime) {
    setSelectedShowtime(showtime)
    setSelectedSeats([])
    setMessage('')
    setDataLoading(true)
    const [seatsRes, bookedRes, lockedRes] = await Promise.all([
      api.get(`/api/showtimes/${showtime.id}/seats`),
      api.get(`/api/showtimes/${showtime.id}/booked-seats`),
      api.get(`/api/seat-locks/${showtime.id}/locked-seats`),
    ])
    setSeats(seatsRes.data)
    setBookedSeatIds(bookedRes.data)
    setLockedSeatIds(lockedRes.data)
    setDataLoading(false)
  }

  function broadcastSeatUpdate(message: { type: string; seat_id: number }) {
    if (!selectedShowtime) return
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//movie-booking-backend-8r8x.onrender.com/ws/showtimes/${selectedShowtime.id}`
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      ws.send(JSON.stringify(message))
      ws.close()
    }
  }

  async function toggleSeat(id: number) {
    if (bookedSeatIds.includes(id)) return
    if (lockedSeatIds.includes(id) && !selectedSeats.includes(id)) {
      showMsg('Seat temporarily unavailable', 'error')
      return
    }

    const isCurrentlySelected = selectedSeats.includes(id)
    
    if (!selectedShowtime) return

    try {
      if (isCurrentlySelected) {
        await api.post(`/api/seat-locks/${selectedShowtime.id}/${id}/unlock`)
        setSelectedSeats(prev => prev.filter(s => s !== id))
        setLockedSeatIds(prev => prev.filter(s => s !== id))
        broadcastSeatUpdate({ type: 'seat_unlocked', seat_id: id })
      } else {
        await api.post(`/api/seat-locks/${selectedShowtime.id}/${id}/lock`)
        setSelectedSeats(prev => [...prev, id])
        setLockedSeatIds(prev => [...prev, id])
        broadcastSeatUpdate({ type: 'seat_locked', seat_id: id })
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showMsg(msg || 'Action failed', 'error')
    }
  }

  async function book() {
    if (!selectedShowtime || selectedSeats.length === 0) return
    setLoading(true)
    try {
      await api.post('/api/bookings', {
        showtime_id: selectedShowtime.id,
        seat_ids: selectedSeats,
      })
      showMsg(`Booking confirmed for ${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''}`)
      
      await Promise.all(
        selectedSeats.map(seatId => {
          broadcastSeatUpdate({ type: 'seat_booked', seat_id: seatId })
          return api.post(`/api/seat-locks/${selectedShowtime.id}/${seatId}/unlock`)
        })
      )
      
      const [bookedRes, lockedRes] = await Promise.all([
        api.get(`/api/showtimes/${selectedShowtime.id}/booked-seats`),
        api.get(`/api/seat-locks/${selectedShowtime.id}/locked-seats`),
      ])
      setBookedSeatIds(bookedRes.data)
      setLockedSeatIds(lockedRes.data)
      setSelectedSeats([])
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showMsg(msg || 'Booking failed', 'error')
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
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (!token) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-light tracking-tight text-gray-900 mb-2">
            Cinema
          </h1>
          <p className="text-sm text-gray-500">
            {isLogin ? 'Sign in to continue' : 'Create your account'}
          </p>
        </div>

        <div className="space-y-4">
          {!isLogin && (
            <input
              className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder-gray-400 transition-all"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          )}
          <input
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder-gray-400 transition-all"
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-gray-900 placeholder-gray-400 transition-all"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />
          <button
            onClick={handleAuth}
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-3.5 rounded-xl font-medium transition-all"
          >
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <p
          className="text-center text-sm text-gray-500 mt-8 cursor-pointer hover:text-gray-900 transition-colors"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
        </p>

        {message && (
          <div className={`mt-6 p-3 rounded-xl text-center text-sm ${
            messageType === 'error' 
              ? 'bg-red-50 text-red-600' 
              : 'bg-gray-50 text-gray-900'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )

  if (showMyBookings) return <MyBookings onBack={() => setShowMyBookings(false)} />

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <h1
            className="text-2xl font-light tracking-tight text-gray-900 cursor-pointer"
            onClick={() => { setSelectedShowtime(null); setMessage('') }}
          >
            Cinema
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowMyBookings(true)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              My Bookings
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div className="fixed top-24 right-6 z-50 animate-slide-in-right">
          <div className={`px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            messageType === 'error'
              ? 'bg-red-50 text-red-600 border border-red-100'
              : 'bg-gray-900 text-white'
          }`}>
            {message}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-16">
        {!selectedShowtime && (
          <>
            <div className="mb-12">
              <h2 className="text-3xl font-light tracking-tight text-gray-900 mb-2">
                Now Showing
              </h2>
              <p className="text-gray-500">Select a showtime</p>
            </div>

            {dataLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-gray-50 p-8 rounded-2xl animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : showtimes.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-gray-400 text-lg">No showtimes available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {showtimes.map(s => {
                  const movie = getMovie(s.movie_id)
                  return (
                    <div
                      key={s.id}
                      onClick={() => loadSeats(s)}
                      className="group cursor-pointer bg-gray-50 hover:bg-gray-100 p-8 rounded-2xl transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-2xl font-light tracking-tight text-gray-900 mb-3">
                            {movie?.title}
                          </h3>
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            <span>{formatTime(s.start_time)}</span>
                            <span>Screen {s.screen_id}</span>
                            <span>{movie?.duration_minutes} min</span>
                          </div>
                        </div>
                        <div className="text-right ml-8">
                          <div className="text-3xl font-light text-gray-900">
                            ₹{s.price}
                          </div>
                          <p className="text-sm text-gray-400 mt-1">per seat</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {selectedShowtime && (
          <>
            <button
              onClick={() => { setSelectedShowtime(null); setMessage('') }}
              className="mb-12 flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors group"
            >
              <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
              <span className="text-sm">Back</span>
            </button>

            <div className="mb-16">
              <h2 className="text-4xl font-light tracking-tight text-gray-900 mb-3">
                {getMovie(selectedShowtime.movie_id)?.title}
              </h2>
              <div className="flex items-center gap-6 text-gray-500">
                <span>{formatTime(selectedShowtime.start_time)}</span>
                <span>Screen {selectedShowtime.screen_id}</span>
                <span>₹{selectedShowtime.price} per seat</span>
              </div>
            </div>

            <div className="mb-12 py-6 border-y border-gray-200 text-center">
              <div className="text-xs text-gray-400 tracking-widest uppercase">
                Screen
              </div>
            </div>

            <div className="flex items-center gap-8 mb-10 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-900"></div>
                <span>Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500"></div>
                <span>Held</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-300"></div>
                <span>Booked</span>
              </div>
            </div>

            {selectedSeats.length > 0 && (
              <div className="mb-8 bg-gray-50 p-5 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">
                    {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''} selected
                  </span>
                  <span className="text-xs text-gray-400">
                    {selectedSeats.length} / {seats.length}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gray-900 transition-all duration-300 rounded-full"
                    style={{ width: `${(selectedSeats.length / seats.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {dataLoading ? (
              <div className="grid grid-cols-10 gap-2.5 mb-12">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-gray-100 animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-10 gap-2.5 mb-12">
                {seats.map(seat => {
                  const isBooked = bookedSeatIds.includes(seat.id)
                  const isSelected = selectedSeats.includes(seat.id)
                  const isLocked = lockedSeatIds.includes(seat.id) && !isSelected
                  return (
                    <button
                      key={seat.id}
                      onClick={() => toggleSeat(seat.id)}
                      disabled={isBooked || isLocked}
                      title={isBooked ? 'Booked' : isLocked ? 'Held' : isSelected ? 'Selected' : 'Available'}
                      className={`aspect-square rounded-lg text-xs font-medium transition-all ${
                        isBooked
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : isLocked
                          ? 'bg-orange-500 text-white cursor-not-allowed'
                          : isSelected
                          ? 'bg-gray-900 text-white scale-110'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {seat.row}{seat.number}
                    </button>
                  )
                })}
              </div>
            )}

            {selectedSeats.length > 0 && (
              <div className="sticky bottom-6 bg-white border border-gray-200 p-6 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">
                      {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-3xl font-light text-gray-900">
                      ₹{selectedSeats.length * selectedShowtime.price}
                    </p>
                  </div>
                  <button
                    onClick={book}
                    disabled={loading}
                    className="px-8 py-3.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-xl font-medium transition-all"
                  >
                    {loading ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}