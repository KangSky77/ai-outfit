import { useState } from 'react'
import { dict } from '../i18n.js'
import Modal from './Modal.jsx'
import AnalysisResult from './AnalysisResult.jsx'

export default function HistoryTab({ data, onLike, onDelete }) {
  const [selected, setSelected] = useState(null) // 모달에 보여줄 기록
  const { status, items } = data

  let body
  if (status === 'loading') {
    body = <div className="empty-state">{dict.listLoading}</div>
  } else if (status === 'error') {
    body = <div className="empty-state">{dict.listError}</div>
  } else if (!items || items.length === 0) {
    body = <div className="empty-state">{dict.emptyHistory}</div>
  } else {
    body = (
      <div>
        {items.map((item) => (
          <div className="history-list-item" key={item.id}>
            {/* 이미지+제목 영역 클릭 → 상세 모달 */}
            <div className="history-main" onClick={() => setSelected(item)}>
              <img src={item.image_path} alt="" loading="lazy" />
              <div>
                <div className="history-title">{dict.historyItemTitle}</div>
                <div className="history-date">
                  {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="item-actions">
              <button
                className={`like-btn ${item.liked ? 'liked' : ''}`}
                onClick={() => onLike(item.id)}
              >
                {item.liked ? '❤️' : '🤍'} <span>{item.likes ?? 0}</span>
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
    )
  }

  return (
    <div className="tab-content">
      <div className="section-title">{dict.historyTitle}</div>
      {body}

      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <img className="modal-img" src={selected.image_path} alt="" />
          <div className="modal-date">
            {new Date(selected.created_at).toLocaleString()}
          </div>
          <h4 className="modal-title">{dict.resultLabel}</h4>
          <AnalysisResult text={selected.analysis} />
        </Modal>
      )}
    </div>
  )
}
