import { useState, useEffect } from 'react'
import axios from 'axios'

const api = axios.create({ baseURL: '/' })

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
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null)
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (token) {
      api.get('/api/movies').then(r => setMovies(r.data))
      api.get('/api/showtimes').then(r => setShowtimes(r.data))
    }
  }, [token])

  async function handleAuth() {
    try {
      const url = isLogin ? '/api/auth/login' : '/api/auth/signup'
      const body = isLogin ? { email, password } : { email, password, name }
      const r = await api.post(url, body)
      localStorage.setItem('token', r.data.access_token)
      setToken(r.data.access_token)
      setMessage('Logged in!')
    } catch {
      setMessage('Auth failed. Check your details.')
    }
  }

  async function loadSeats(showtime: Showtime) {
    setSelectedShowtime(showtime)
    setSelectedSeats([])
    const r = await api.get(`/api/showtimes/${showtime.id}/seats`)
    setSeats(r.data)
  }

  function toggleSeat(id: number) {
    setSelectedSeats(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function book() {
    if (!selectedShowtime || selectedSeats.length === 0) return
    try {
      await api.post('/api/bookings', {
        showtime_id: selectedShowtime.id,
        seat_ids: selectedSeats,
      })
      setMessage(`Booked ${selectedSeats.length} seat(s)!`)
      setSelectedSeats([])
      setSelectedShowtime(null)
    } catch (e) {
      setMessage(e.response?.data?.detail || 'Booking failed')
    }
  }

  function logout() {
    localStorage.removeItem('token')
    setToken('')
    setMovies([])
    setShowtimes([])
  }

  function getMovieTitle(id: number) {
    return movies.find(m => m.id === id)?.title || 'Unknown'
  }

  if (!token) return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl w-96">
        <h1 className="text-2xl font-bold mb-6 text-center">🎬 Movie Booking</h1>
        {!isLogin && (
          <input className="w-full mb-3 p-2 rounded bg-gray-700" placeholder="Name"
            value={name} onChange={e => setName(e.target.value)} />
        )}
        <input className="w-full mb-3 p-2 rounded bg-gray-700" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)} />
        <input className="w-full mb-3 p-2 rounded bg-gray-700" type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)} />
        <button onClick={handleAuth}
          className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold mb-3">
          {isLogin ? 'Login' : 'Sign Up'}
        </button>
        <p className="text-center text-sm text-gray-400 cursor-pointer" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "No account? Sign up" : "Have an account? Login"}
        </p>
        {message && <p className="mt-3 text-center text-yellow-400">{message}</p>}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">🎬 Movie Booking</h1>
          <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
            Logout
          </button>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-yellow-600 rounded text-center font-semibold">
            {message}
          </div>
        )}

        {!selectedShowtime ? (
          <>
            <h2 className="text-xl font-semibold mb-4">Upcoming Showtimes</h2>
            <div className="grid gap-3">
              {showtimes.map(s => (
                <div key={s.id}
                  onClick={() => loadSeats(s)}
                  className="bg-gray-800 hover:bg-gray-700 cursor-pointer p-4 rounded-lg flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{getMovieTitle(s.movie_id)}</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(s.start_time).toLocaleString()} · Screen {s.screen_id}
                    </p>
                  </div>
                  <p className="text-green-400 font-bold">₹{s.price}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setSelectedShowtime(null)}
              className="mb-4 text-blue-400 hover:underline">
              ← Back to showtimes
            </button>
            <h2 className="text-xl font-semibold mb-2">
              {getMovieTitle(selectedShowtime.movie_id)}
            </h2>
            <p className="text-gray-400 mb-6">
              {new Date(selectedShowtime.start_time).toLocaleString()} · ₹{selectedShowtime.price}/seat
            </p>

            <div className="mb-4 p-3 bg-gray-800 rounded text-center text-sm text-gray-400">
              Screen 🎦
            </div>

            <div className="grid grid-cols-10 gap-2 mb-6">
              {seats.map(seat => (
                <button
                  key={seat.id}
                  onClick={() => toggleSeat(seat.id)}
                  className={`p-2 rounded text-xs font-semibold transition-colors ${
                    selectedSeats.includes(seat.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  {seat.row}{seat.number}
                </button>
              ))}
            </div>

            {selectedSeats.length > 0 && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <p className="mb-3">
                  {selectedSeats.length} seat(s) · Total: ₹{selectedSeats.length * selectedShowtime.price}
                </p>
                <button onClick={book}
                  className="w-full bg-green-600 hover:bg-green-700 py-3 rounded font-bold">
                  Confirm Booking
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}