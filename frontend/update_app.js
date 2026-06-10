const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');

// Add Chat import
const withImport = content.replace(
  "import MyBookings from './MyBookings'",
  "import MyBookings from './MyBookings'\nimport Chat from './Chat'"
);

// Add chat state
const withState = withImport.replace(
  "const [showAuthModal, setShowAuthModal] = useState(false)",
  "const [showAuthModal, setShowAuthModal] = useState(false)\n  const [showChat, setShowChat] = useState(false)"
);

// Add chat button to header
const withButton = withState.replace(
  `<div className="flex gap-3">`,
  `<div className="flex gap-3">
            <button
              onClick={() => setShowChat(!showChat)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              💬 Ask AI
            </button>`
);

// Add Chat component before closing div
const withChat = withButton.replace(
  '</style>\n    </div>\n  )\n}',
  `</style>
      {showChat && <Chat onClose={() => setShowChat(false)} />}
    </div>
  )
}`
);

fs.writeFileSync('src/App.tsx', withChat);
console.log('✅ Updated App.tsx with Chat component');
