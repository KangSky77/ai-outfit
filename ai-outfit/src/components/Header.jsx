import { dict } from '../i18n.js'
import ThemeToggle from './ThemeToggle.jsx'

const TABS = ['history', 'upload', 'gallery']

export default function Header({ tab, onSwitch, user }) {
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
      {user ? (
        <button className="logout-btn" onClick={() => { window.location.href = '/logout' }} aria-label="logout">
          <span className="material-symbols-outlined">logout</span>
        </button>
      ) : (
        <button className="logout-btn" onClick={() => { window.location.href = '/auth/google' }} aria-label="login">
          <span className="material-symbols-outlined">login</span>
        </button>
      )}
    </header>
  )
}
