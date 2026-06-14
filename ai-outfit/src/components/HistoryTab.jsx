import { dict } from '../i18n.js'

export default function HistoryTab({ items, onLike, onDelete }) {
  return (
    <div className="tab-content">
      <div className="section-title">{dict.historyTitle}</div>
      {(!items || items.length === 0) ? (
        <div className="empty-state">{dict.emptyHistory}</div>
      ) : (
        <div>
          {items.map((item) => (
            <div className="history-list-item" key={item.id}>
              <img src={item.image_path} alt="" />
              <div>
                <div className="history-title">{dict.historyItemTitle}</div>
                <div className="history-date">
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="item-actions">
                <button className="like-btn" onClick={() => onLike(item.id)}>
                  ❤️ <span>{item.likes ?? 0}</span>
                </button>
                <button
                  className="delete-btn"
                  aria-label="delete"
                  onClick={() => onDelete(item.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
