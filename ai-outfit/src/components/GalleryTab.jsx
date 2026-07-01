import { dict } from '../i18n.js'
import LikeButton from './LikeButton.jsx'

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
            <LikeButton
              className="like-overlay"
              liked={item.liked}
              likes={item.likes}
              onClick={() => onLike(item.id)}
            />
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
