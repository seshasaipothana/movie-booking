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

  // WebSocket connection for real-time seat updates
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

  // Unlock all selected seats when leaving the showtime page
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
      showMsg(isLogin ? 'Invalid email or password.' : 'Signup failed. Try a different email.', 'error')
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
      showMsg('Seat is temporarily held by another user', 'error')
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
      showMsg(msg || 'Failed to select seat', 'error')
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
      showMsg(`🎉 Booking confirmed! ${selectedSeats.length} seat(s) • ₹${selectedSeats.length * selectedShowtime.price}`)
      
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      
      <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 p-8 rounded-3xl w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎬</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            CineBook
          </h1>
          <p className="text-gray-300 text-sm mt-2">
            {isLogin ? 'Welcome back to the show' : 'Join us for the premiere'}
          </p>
        </div>

        {!isLogin && (
          <input
            className="w-full mb-4 px-5 py-4 rounded-2xl bg-white/5 border border-white/10 focus:outline-none focus:border-purple-400 focus:bg-white/10 text-white placeholder-gray-400 transition-all"
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        )}
        <input
          className="w-full mb-4 px-5 py-4 rounded-2xl bg-white/5 border border-white/10 focus:outline-none focus:border-purple-400 focus:bg-white/10 text-white placeholder-gray-400 transition-all"
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="w-full mb-6 px-5 py-4 rounded-2xl bg-white/5 border border-white/10 focus:outline-none focus:border-purple-400 focus:bg-white/10 text-white placeholder-gray-400 transition-all"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
        />
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 py-4 rounded-2xl font-bold text-white shadow-lg hover:shadow-purple-500/50 transition-all transform hover:scale-[1.02] disabled:hover:scale-100"
        >
          {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
        </button>
        <p
          className="text-center text-sm text-gray-300 mt-6 cursor-pointer hover:text-white transition-colors"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "New here? Create an account" : 'Already have an account? Sign in'}
        </p>
        {message && (
          <div className={`mt-6 p-4 rounded-2xl text-center text-sm font-medium backdrop-blur-sm ${
            messageType === 'error' 
              ? 'bg-red-500/20 border border-red-500/30 text-red-200' 
              : 'bg-green-500/20 border border-green-500/30 text-green-200'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )

  if (showMyBookings) return <MyBookings onBack={() => setShowMyBookings(false)} />

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white">
      {/* Glassmorphic header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1
            className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent cursor-pointer flex items-center gap-2"
            onClick={() => { setSelectedShowtime(null); setMessage('') }}
          >
            <span className="text-3xl">🎬</span> CineBook
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowMyBookings(true)}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all font-medium"
            >
              My Bookings
            </button>
            <button
              onClick={logout}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Toast notification */}
      {message && (
        <div className="fixed top-24 right-6 z-50 animate-slide-in-right">
          <div className={`backdrop-blur-xl rounded-2xl p-4 shadow-2xl border max-w-md ${
            messageType === 'error'
              ? 'bg-red-500/20 border-red-500/30 text-red-100'
              : 'bg-green-500/20 border-green-500/30 text-green-100'
          }`}>
            <p className="font-medium">{message}</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-12">
        {!selectedShowtime && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">Now Showing</h2>
              <p className="text-gray-400">Pick your perfect show</p>
            </div>

            {dataLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="backdrop-blur-xl bg-white/5 border border-white/10 p-6 rounded-3xl animate-pulse">
                    <div className="h-6 bg-white/10 rounded w-1/3 mb-3"></div>
                    <div className="h-4 bg-white/10 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : showtimes.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🎭</div>
                <p className="text-gray-400 text-lg">No showtimes available</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {showtimes.map(s => {
                  const movie = getMovie(s.movie_id)
                  return (
                    <div
                      key={s.id}
                      onClick={() => loadSeats(s)}
                      className="group cursor-pointer backdrop-blur-xl bg-gradient-to-r from-white/5 to-white/10 hover:from-white/10 hover:to-white/15 border border-white/10 hover:border-white/20 p-6 rounded-3xl transition-all transform hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/20"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <h3 className="text-2xl font-bold mb-2 group-hover:text-purple-300 transition-colors">
                            {movie?.title}
                          </h3>
                          <div className="flex items-center gap-4 text-gray-300 text-sm">
                            <span className="flex items-center gap-1">
                              <span className="text-purple-400">📅</span> {formatTime(s.start_time)}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-purple-400">🎞️</span> Screen {s.screen_id}
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-purple-400">⏱️</span> {movie?.duration_minutes} min
                            </span>
                          </div>
                        </div>
                        <div className="text-right ml-6">
                          <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                            ₹{s.price}
                          </div>
                          <p className="text-gray-400 text-sm mt-1">per seat</p>
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
              className="mb-8 flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors group"
            >
              <span className="transform group-hover:-translate-x-1 transition-transform">←</span>
              <span>Back to showtimes</span>
            </button>

            <div className="backdrop-blur-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-8 rounded-3xl mb-8">
              <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">
                {getMovie(selectedShowtime.movie_id)?.title}
              </h2>
              <div className="flex items-center gap-4 text-gray-300">
                <span className="flex items-center gap-2">
                  <span className="text-purple-400">📅</span> {formatTime(selectedShowtime.start_time)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-purple-400">🎞️</span> Screen {selectedShowtime.screen_id}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-purple-400">💰</span> ₹{selectedShowtime.price}/seat
                </span>
              </div>
            </div>

            {/* Screen indicator */}
            <div className="mb-8 py-4 px-6 backdrop-blur-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-white/20 rounded-2xl text-center">
              <div className="text-xs text-gray-300 tracking-[0.3em] uppercase font-semibold">
                ── Screen ──
              </div>
            </div>

            {/* Seat legend */}
            <div className="flex flex-wrap gap-6 mb-8 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-white/10 border border-white/20"></div>
                <span className="text-gray-300">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/50"></div>
                <span className="text-gray-300">Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 shadow-lg shadow-yellow-500/50"></div>
                <span className="text-gray-300">Held</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-gray-600/40 opacity-60"></div>
                <span className="text-gray-300">Booked</span>
              </div>
            </div>

            {/* Seat counter */}
            {selectedSeats.length > 0 && (
              <div className="mb-6 backdrop-blur-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 p-4 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-purple-200">
                    {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm text-gray-300">
                    {selectedSeats.length}/{seats.length} seats
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 rounded-full"
                    style={{ width: `${(selectedSeats.length / seats.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Seats grid */}
            {dataLoading ? (
              <div className="grid grid-cols-10 gap-3 mb-8">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-white/5 animate-pulse"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-10 gap-3 mb-10">
                {seats.map(seat => {
                  const isBooked = bookedSeatIds.includes(seat.id)
                  const isSelected = selectedSeats.includes(seat.id)
                  const isLocked = lockedSeatIds.includes(seat.id) && !isSelected
                  return (
                    <button
                      key={seat.id}
                      onClick={() => toggleSeat(seat.id)}
                      disabled={isBooked || isLocked}
                      title={isBooked ? 'Booked' : isLocked ? 'Held by another user' : isSelected ? 'Selected' : 'Available'}
                      className={`aspect-square rounded-xl text-sm font-bold transition-all transform ${
                        isBooked
                          ? 'bg-gray-600/30 text-gray-500 cursor-not-allowed opacity-50'
                          : isLocked
                          ? 'bg-gradient-to-br from-yellow-500/80 to-orange-500/80 text-yellow-100 cursor-not-allowed shadow-lg shadow-yellow-500/30 scale-95'
                          : isSelected
                          ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50 scale-110'
                          : 'bg-white/10 hover:bg-white/20 text-gray-200 border border-white/20 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      {seat.row}{seat.number}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Booking panel */}
            {selectedSeats.length > 0 && (
              <div className="sticky bottom-6 backdrop-blur-2xl bg-gradient-to-r from-purple-900/80 to-pink-900/80 border border-white/20 p-6 rounded-3xl shadow-2xl">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-gray-300 text-sm mb-1">
                      {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''} selected
                    </p>
                    <p className="text-4xl font-bold bg-gradient-to-r from-green-300 to-emerald-300 bg-clip-text text-transparent">
                      ₹{selectedSeats.length * selectedShowtime.price}
                    </p>
                  </div>
                  <button
                    onClick={book}
                    disabled={loading}
                    className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 rounded-2xl font-bold text-white shadow-2xl shadow-green-500/50 transition-all transform hover:scale-105 disabled:hover:scale-100"
                  >
                    {loading ? 'Processing...' : 'Confirm Booking'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
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