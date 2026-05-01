import { useState } from 'react'
import ChatPanel from './components/ChatPanel'
import SkillsPage from './pages/SkillsPage'
import MemoryPage from './pages/MemoryPage'
import SettingsPage from './pages/SettingsPage'

type Tab = 'chat' | 'skills' | 'memory' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        {(['chat', 'skills', 'memory', 'settings'] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === tab ? 700 : 400, fontSize: 13, textTransform: 'capitalize',
            borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === tab ? '#6366f1' : '#6b7280',
          }}>
            {tab}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', height: '100%', flexDirection: 'column' }}>
          <ChatPanel />
        </div>
        {activeTab === 'skills' && <SkillsPage />}
        {activeTab === 'memory' && <MemoryPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>
    </div>
  )
}
