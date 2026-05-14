import { useState, useEffect } from 'react'
import GeneralTab from './tabs/GeneralTab'
import SkillsTab from './tabs/SkillsTab'
import MemoryTab from './tabs/MemoryTab'

type TabId = 'general' | 'skills' | 'memory'

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDarkMode(darkModeMediaQuery.matches)
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches)
    darkModeMediaQuery.addEventListener('change', handleChange)
    return () => darkModeMediaQuery.removeEventListener('change', handleChange)
  }, [])

  const bg = isDarkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900'
  const sidebarBg = isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
  const navItemBase = isDarkMode
    ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
  const navItemActive = isDarkMode
    ? 'bg-indigo-600/20 text-indigo-400 border-r-2 border-indigo-400'
    : 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600'

  return (
    <div className={`flex min-h-screen ${bg}`}>
      {/* Sidebar */}
      <nav className={`w-56 border-r ${sidebarBg} p-6`}>
        <h1 className="mb-8 text-2xl font-bold">Wander Settings</h1>
        <ul className="space-y-1">
          {TABS.map(tab => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === tab.id ? navItemActive : navItemBase
                }`}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-3xl">
          {activeTab === 'general' && <GeneralTab isDarkMode={isDarkMode} />}
          {activeTab === 'skills' && <SkillsTab isDarkMode={isDarkMode} />}
          {activeTab === 'memory' && <MemoryTab isDarkMode={isDarkMode} />}
        </div>
      </main>
    </div>
  )
}
