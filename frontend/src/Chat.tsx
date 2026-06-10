import { useState, useRef, useEffect } from 'react'
import axios from 'axios'

const api = axios.create({ 
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000'
})

type Message = { id: string; type: 'user' | 'bot'; text: string }

export default function Chat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', type: 'bot', text: 'Hi! I can help you find movies. What would you like to watch?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim()) return
    const userMsg: Message = { id: Date.now().toString(), type: 'user', text: input }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await api.post('/api/chat', { message: input, user_id: 1 })
      const botMsg: Message = { id: (Date.now() + 1).toString(), type: 'bot', text: res.data.response }
      setMessages(prev => [...prev, botMsg])
    } catch (error) {
      const errMsg: Message = { id: (Date.now() + 1).toString(), type: 'bot', text: 'Sorry, error occurred.' }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-40 flex flex-col h-[600px]">
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <h3 className="font-medium text-gray-900">Movie Assistant</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-900">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs px-4 py-2 rounded-lg text-sm ${msg.type === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>{msg.text}</div>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="bg-gray-100 px-4 py-2 rounded-lg text-sm">Thinking...</div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage()} placeholder="Ask about movies..." className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
          <button onClick={sendMessage} disabled={loading || !input.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Send</button>
        </div>
      </div>
    </div>
  )
}
