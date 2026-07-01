import { useState } from 'react'
import { dict } from '../i18n.js'
import Modal from './Modal.jsx'
import AnalysisResult from './AnalysisResult.jsx'
import ShareButton from './ShareButton.jsx'
import LikeButton from './LikeButton.jsx'

export default function HistoryTab({ data, onLike, onDelete }) {
  const [selected, setSelected] = useState(null) // 모달에 보여줄 기록
  const [query, setQuery] = useState('')         // 검색어
  const { status, items } = data

  // 분석 내용 + 날짜로 클라이언트 측 검색 필터
  const q = query.trim().toLowerCase()
  const filtered = !q ? items : items.filter((item) => {
    const text = (item.analysis ?? '').toLowerCase()
    const date = new Date(item.created_at).toLocaleDateString().toLowerCase()
    return text.includes(q) || date.includes(q)
  })

  let body
  if (status === 'loading') {
    body = <div className="empty-state">{dict.listLoading}</div>
  } else if (status === 'error') {
    body = <div className="empty-state">{dict.listError}</div>
  } else if (!items || items.length === 0) {
    body = <div className="empty-state">{dict.emptyHistory}</div>
  } else if (filtered.length === 0) {
    body = <div className="empty-state">{dict.noSearchResult}</div>
  } else {
    body = (
      <div>
        {filtered.map((item) => (
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
              <LikeButton
                className="like-btn"
                liked={item.liked}
                likes={item.likes}
                onClick={() => onLike(item.id)}
              />
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

      {/* 기록이 있을 때만 검색창 노출 */}
      {status === 'done' && items.length > 0 && (
        <input
          className="history-search"
          type="search"
          placeholder={dict.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {body}

      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <img className="modal-img" src={selected.image_path} alt="" />
          <div className="modal-date">
            {new Date(selected.created_at).toLocaleString()}
          </div>
          <h4 className="modal-title">{dict.resultLabel}</h4>
          <AnalysisResult text={selected.analysis} />
          <ShareButton text={selected.analysis} />
        </Modal>
      )}
    </div>
  )
}
