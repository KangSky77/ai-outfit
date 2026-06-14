import { dict } from '../i18n.js'

export default function GalleryTab({ data, onLike }) {
  const { status, items } = data

  let body
  if (status === 'loading') {
    body = <div className="empty-state">{dict.listLoading}</div>
  } else if (status === 'error') {
    body = <div className="empty-state">{dict.listError}</div>
  } else if (!items || items.length === 0) {
    body = <div className="empty-state">{dict.emptyGallery}</div>
  } else {
    body = (
      <div className="masonry-grid">
        {items.map((item) => (
          <div className="grid-item" key={item.id}>
            <img src={item.image_path} alt="" loading="lazy" />
            <button
              className={`like-overlay ${item.liked ? 'liked' : ''}`}
              onClick={() => onLike(item.id)}
            >
              {item.liked ? '❤️' : '🤍'} <span>{item.likes ?? 0}</span>
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="tab-content">
      <div className="section-title">{dict.galleryTitle}</div>
      {body}
    </div>
  )
}
