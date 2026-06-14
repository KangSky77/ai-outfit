import { dict } from '../i18n.js'

const ITEMS = [
  { tab: 'history', icon: 'history', label: 'navHistory' },
  { tab: 'upload', icon: 'add_circle', label: 'navUpload' },
  { tab: 'gallery', icon: 'grid_view', label: 'navGallery' },
]

export default function BottomNav({ tab, onSwitch }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          key={item.tab}
          className={`nav-item ${tab === item.tab ? 'active' : ''}`}
          onClick={() => onSwitch(item.tab)}
        >
          <span className="material-symbols-outlined">{item.icon}</span>
          <span className="nav-label">{dict[item.label]}</span>
        </button>
      ))}
    </nav>
  )
}
