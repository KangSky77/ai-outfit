import { dict } from '../i18n.js'
import ThemeToggle from './ThemeToggle.jsx'

const TABS = ['history', 'upload', 'gallery']

export default function Header({ tab, onSwitch }) {
  return (
    <header>
      <ThemeToggle />
      <h2>{dict.headerTitle}</h2>
      <nav className="desktop-nav">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? 'active' : ''}
            onClick={() => onSwitch(t)}
          >
            {dict[t === 'history' ? 'navHistory' : t === 'upload' ? 'navUpload' : 'navGallery']}
          </button>
        ))}
      </nav>
      <button className="logout-btn" onClick={() => { window.location.href = '/logout' }}>
        <span className="material-symbols-outlined">logout</span>
      </button>
    </header>
  )
}
