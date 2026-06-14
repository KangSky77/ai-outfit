import { useState } from 'react'
import { dict } from '../i18n.js'
import Modal from './Modal.jsx'
import AnalysisResult from './AnalysisResult.jsx'

export default function HistoryTab({ items, onLike, onDelete }) {
  const [selected, setSelected] = useState(null) // 모달에 보여줄 기록

  return (
    <div className="tab-content">
      <div className="section-title">{dict.historyTitle}</div>

      {(!items || items.length === 0) ? (
        <div className="empty-state">{dict.emptyHistory}</div>
      ) : (
        <div>
          {items.map((item) => (
            <div className="history-list-item" key={item.id}>
              {/* 이미지+제목 영역 클릭 → 상세 모달 */}
              <div className="history-main" onClick={() => setSelected(item)}>
                <img src={item.image_path} alt="" />
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
      )}

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
