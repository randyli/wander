export default function SettingsPage() {
  function openSettings() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') })
  }

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="mb-2 text-lg font-semibold">Settings</h2>
      <p className="mb-6 text-center text-sm text-gray-500">
        Open the settings page to configure API keys, providers, and general options.
      </p>
      <button
        onClick={openSettings}
        className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Open Settings
      </button>
    </div>
  )
}
