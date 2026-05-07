import ChatPanel from './components/ChatPanel'

export default function App() {
  function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', background: '#fff', padding: '0 12px' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Wander</span>
        <button
          onClick={openSettings}
          title="Settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, color: '#6b7280', fontSize: 16, lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          ⚙
        </button>
      </nav>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ChatPanel />
      </div>
    </div>
  )
}
