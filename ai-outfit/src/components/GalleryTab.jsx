import { dict } from '../i18n.js'

export default function GalleryTab({ items, onLike }) {
  return (
    <div className="tab-content">
      <div className="section-title">{dict.galleryTitle}</div>
      {(!items || items.length === 0) ? (
        <div className="empty-state">{dict.emptyGallery}</div>
      ) : (
        <div className="masonry-grid">
          {items.map((item) => (
            <div className="grid-item" key={item.id}>
              <img src={item.image_path} alt="" />
              <button
                className={`like-overlay ${item.liked ? 'liked' : ''}`}
                onClick={() => onLike(item.id)}
              >
                {item.liked ? '❤️' : '🤍'} <span>{item.likes ?? 0}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
